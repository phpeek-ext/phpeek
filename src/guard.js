// PHPeek guard (isolated world, document_start, all frames).
// 1) Opens a private channel to inpage.js and relays its requests to the extension,
//    which asks you in a window the page can't touch.
// 2) Seed Shield: spots BIP39 seed phrases being pasted or typed into a website.
// Nothing here is stored or sent anywhere. Seed words are only held in memory
// for the few seconds it takes you to answer, so they can be restored if it was a false alarm.
(() => {
  "use strict";
  const BIP39 = globalThis.PHPEEK_BIP39;

  // ---- seed phrase detection (pure, unit-tested) -------------------------------------

  function tokens(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/\b\d{1,2}[.):]/g, " ")      // "1." "2)" "3:" numbering
      .split(/[^a-z]+/)
      .filter(Boolean);
  }

  // A full seed being pasted: 12+ words, nearly all from the BIP39 list.
  function looksLikePastedSeed(text) {
    const t = tokens(text);
    if (t.length < 12 || t.length > 30) return false;
    const hits = t.filter((w) => BIP39.has(w)).length;
    return hits >= 12 && hits / t.length >= 0.9;
  }

  // A seed being typed: `min`+ words and every single one is a BIP39 word.
  // Everyday text almost always contains non-BIP39 words ("the", "and", "is", "to"…).
  // Default 6 keeps product searches like "fresh fish market open today" quiet, while
  // 6 leaked words still leave the rest of a 12-word seed far beyond brute force.
  function looksLikeTypedSeed(text, min = 6) {
    const raw = String(text || "").trim();
    if (!raw || raw.length > 400 || /[^a-zA-Z0-9\s.,:;()]/.test(raw)) return false;
    const t = tokens(raw);
    return t.length >= min && t.every((w) => BIP39.has(w));
  }

  // "seed": the field itself asks for a recovery phrase → trip at 3 words.
  // "password": passphrases like "river-pilot-ocean" are legit → only full pastes count.
  // "search": product searches → skipped.
  function fieldHint(el) {
    const attr = (n) => (el.getAttribute && el.getAttribute(n)) || "";
    const bits = [el.name, el.id, el.placeholder, attr("aria-label"), attr("autocomplete"),
      el.labels && [...el.labels].map((l) => l.textContent).join(" ")].filter(Boolean).join(" ").toLowerCase();
    if (/seed|mnemonic|recovery|secret ?phrase|private ?key|12 ?words|24 ?words|backup phrase/.test(bits)) return "seed";
    if (el.type === "password") return "password";
    if (el.type === "search" || /search|query|keyword|\bq\b/.test(bits) ||
        (el.closest && el.closest("[role=search],form[action*=search]"))) return "search";
    return "normal";
  }

  if (typeof module !== "undefined") {
    module.exports = { tokens, looksLikePastedSeed, looksLikeTypedSeed, fieldHint };
    return;
  }
  if (!BIP39 || !globalThis.PHPEEK_RULES) return;

  const send = (msg) => new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        if (chrome.runtime.lastError) return resolve(null);
        resolve(res);
      });
    } catch { resolve(null); }
  });

  // ---- private channel to inpage.js ----------------------------------------------------
  // A detached element both scripts hold before any page script runs. The page never sees it.

  const chan = document.createElement("phpeek-channel");
  const toPage = (obj) => chan.dispatchEvent(new CustomEvent("phpeek:to-page", { detail: JSON.stringify(obj) }));
  chan.addEventListener("phpeek:hello", () => chan.remove(), { once: true });

  const RULES = globalThis.PHPEEK_RULES;
  let risky = false;
  const reply = (obj) => toPage({ type: "sync", ...obj });

  // Only a code and a few raw values go to the background, which rebuilds every word you see
  // from its own templates. Nothing the page controls is ever shown as text.
  const str = (x) => (typeof x === "string" ? x.slice(0, 64) : "");
  const toBackground = (kind, v, extra) => send({
    type: "risk", kind,
    extra: { method: str(extra && extra.method) },
    verdict: { code: str(v.code), risky: !!v.risky, f: { who: str(v.f && v.f.who), token: str(v.f && v.f.token), domain: str(v.f && v.f.domain), unlimited: !!(v.f && v.f.unlimited) } },
    frame: location.hostname,
  });

  // Legit docs (rustup, scoop…) show their install command in a visible code block. ClickFix hides it.
  function shownInCode(text) {
    const snippet = String(text).trim().slice(0, 60);
    if (!snippet || !document.body) return false;
    for (const el of document.querySelectorAll("pre, code, kbd, samp")) {
      if (!el.textContent.includes(snippet)) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width > 4 && r.height > 4 && r.right > 0 && r.bottom > 0 && cs.visibility !== "hidden" && Number(cs.opacity) > 0.1) return true;
    }
    return false;
  }

  function selectedText() {
    const a = document.activeElement;
    if (a && (a.tagName === "TEXTAREA" || a.tagName === "INPUT") && typeof a.selectionStart === "number") {
      return a.value.slice(a.selectionStart, a.selectionEnd);
    }
    const sel = window.getSelection && window.getSelection();
    return sel ? sel.toString() : "";
  }

  function clipDecision(d) {
    let text = typeof d.text === "string" ? d.text : "";
    if (d.via === "execCommand") {
      if (String(d.cmd).toLowerCase() !== "copy") return false;
      text = selectedText();
    }
    if (d.via === "setData") {
      const ev = window.event;
      if (!/^text(\/plain)?$/i.test(String(d.format))) return false;
      if (ev && ev.type !== "copy" && ev.type !== "cut") return false;   // leave drag-and-drop alone
    }
    const tier = RULES.clipboardTier(text);
    if (!tier) return false;
    if (tier === "install" && !risky && shownInCode(text)) return false;
    toBackground("clipboard", RULES.classifyClipboard(text));            // heads-up window, no waiting
    return true;
  }

  chan.addEventListener("phpeek:to-ext", (e) => {
    let d; try { d = JSON.parse(e.detail); } catch { return; }
    if (!d || typeof d.type !== "string") return;

    if (d.type === "clip") return reply({ block: clipDecision(d) });

    if (d.type === "sig" && typeof d.id === "string") {
      let v = null;
      try { v = RULES.classify(String(d.method), d.params, { risky }); } catch { v = { code: "", f: {} }; }
      if (!v) return reply({ id: d.id, verdict: "allow" });
      reply({ id: d.id, verdict: "ask" });
      toBackground("signature", v, { method: d.method }).then((res) => {
        // Fail safe: no answer (extension restarting, window closed) means "cancel".
        toPage({ type: "res", id: d.id, allow: !!(res && res.allow) });
      });
    }
  });

  (document.documentElement || document).appendChild(chan);
  chan.dispatchEvent(new CustomEvent("phpeek:channel", { bubbles: true }));
  setTimeout(() => chan.remove(), 0); // never leave it in the DOM, even if the handshake didn't happen

  send({ type: "status?" }).then((st) => { if (st) risky = !!st.risky; });

  // ---- Seed Shield ---------------------------------------------------------------------

  const SEED_VERDICT = { code: "seed", f: {} };
  const reportSeed = () => toBackground("seed", SEED_VERDICT);

  let busy = false;
  let bypassUntil = 0;

  const isEditable = (el) =>
    el && (el.isContentEditable || el.tagName === "TEXTAREA" ||
      (el.tagName === "INPUT" && /^(text|password|search|email|tel|url|)$/i.test(el.type || "")));

  const getVal = (el) => (el.isContentEditable ? el.innerText : el.value);
  const setVal = (el, v) => {
    if (el.isContentEditable) el.innerText = v;
    else {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };

  // All editable fields, including ones inside open shadow roots.
  function allFields(root = document, out = []) {
    for (const el of root.querySelectorAll("*")) {
      if ((el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el.isContentEditable && el.childElementCount === 0)) && isEditable(el)) out.push(el);
      if (el.shadowRoot) allFields(el.shadowRoot, out);
    }
    return out;
  }

  async function trip(fields) {
    if (busy) return;
    busy = true;
    const saved = fields.map((el) => [el, getVal(el)]);
    saved.forEach(([el]) => setVal(el, ""));
    const res = await reportSeed();
    if (res && res.allow) {
      bypassUntil = Date.now() + 5000;
      saved.forEach(([el, v]) => setVal(el, v));
    }
    saved.length = 0;
    busy = false;
  }

  const isSingleSeedWord = (v) => { v = String(v || "").trim().toLowerCase(); return /^[a-z]{3,8}$/.test(v) && BIP39.has(v); };

  function scan(target) {
    if (busy || Date.now() < bypassUntil || !isEditable(target)) return;
    const value = getVal(target);
    const hint = target.isContentEditable ? "normal" : fieldHint(target);
    const min = hint === "seed" ? 3 : hint === "password" ? 12 : 6;   // passphrases are fine, a whole seed isn't
    if (hint !== "search" && looksLikeTypedSeed(value, min)) return trip([target]);
    // Seed split across many single-word boxes ("enter word #1…#12"), wherever they live.
    if (isSingleSeedWord(value)) {
      const singles = allFields().filter((el) => isSingleSeedWord(getVal(el)));
      if (singles.length >= 6) trip(singles);
    }
  }

  // composedPath()[0] reaches inputs inside shadow DOM (event.target would be the host).
  const realTarget = (e) => (e.composedPath && e.composedPath()[0]) || e.target;

  window.addEventListener("input", (e) => scan(realTarget(e)), true);

  window.addEventListener("paste", (e) => {
    const target = realTarget(e);
    if (busy || Date.now() < bypassUntil || !isEditable(target)) return;
    const text = e.clipboardData && e.clipboardData.getData("text");
    if (!looksLikePastedSeed(text)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    busy = true;
    reportSeed().then((res) => {
      busy = false;
      if (res && res.allow) {
        bypassUntil = Date.now() + 5000;
        target.focus();
        document.execCommand("insertText", false, text);
      }
    });
  }, true);
})();
