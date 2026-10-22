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

  // A seed being typed. Two ways to trip:
  //  • the whole field is BIP39 words, `min`+ of them (6 by default; 3 in seed-looking fields);
  //  • the text ENDS in a run of BIP39 words (what's being typed right now), even after other
  //    text like "here is my seed:" — 8+ words in a normal field, `min`+ in a seed-looking one.
  // Everyday text almost always contains non-BIP39 words ("the", "and", "is", "to"…), and 8+ in a
  // row at the end of what you're typing is very rare outside a seed phrase.
  function trailingRun(t) {
    let n = 0;
    for (let i = t.length - 1; i >= 0 && BIP39.has(t[i]); i--) n++;
    return n;
  }
  function looksLikeTypedSeed(text, min = 6) {
    const raw = String(text || "").trim();
    if (!raw || raw.length > 2000) return false;
    const t = tokens(raw);
    const clean = !/[^a-zA-Z0-9\s.,:;()]/.test(raw);
    if (clean && t.length >= min && t.every((w) => BIP39.has(w))) return true;
    return trailingRun(t) >= Math.max(min, min <= 3 ? 3 : 8);
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
  let tripped = [];   // fields we cleared; kept clear while the warning is open

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
    tripped = fields;
    const res = await reportSeed();
    tripped = [];
    if (res && res.allow) {
      bypassUntil = Date.now() + 5000;
      saved.forEach(([el, v]) => setVal(el, v));
    }
    saved.length = 0;
    busy = false;
  }

  const isSingleSeedWord = (v) => { v = String(v || "").trim().toLowerCase(); return /^[a-z]{3,8}$/.test(v) && BIP39.has(v); };

  function scan(target) {
    // While you're deciding, anything else typed into a cleared field is cleared too.
    if (busy) { if (tripped.includes(target) && getVal(target)) setVal(target, ""); return; }
    if (Date.now() < bypassUntil || !isEditable(target)) return;
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
