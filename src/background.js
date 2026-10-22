// PHPeek background.
// - Passive PHP2Shell check from the response headers the browser already received.
// - Opens PHPeek's own warning window when a guard trips, and relays your decision.
// Makes no network requests of its own and collects no data.

// First fixed release on each supported branch (CVE-2026-109618 / CVE-2026-109619).
const PATCHED = { "8.5": 12, "8.4": 27, "8.3": 36, "8.2": 35 };

function assessPhp(version) {
  if (!version) return { status: "unknown" };
  const m = version.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return { status: "unknown" };
  const major = +m[1], minor = +m[2];
  const patch = m[3] !== undefined ? +m[3] : null;
  const branch = `${major}.${minor}`;

  // 8.1 and older: no official fix.
  if (major < 8 || (major === 8 && minor <= 1)) {
    return { status: "eol", branch };
  }
  if (PATCHED[branch] !== undefined) {
    const needed = `${branch}.${PATCHED[branch]}`;
    if (patch === null) return { status: "unknown", branch, needed };
    return patch >= PATCHED[branch]
      ? { status: "patched", needed }
      : { status: "vulnerable", needed };
  }
  // Newer branch than the ones listed.
  return { status: "patched" };
}

function analyseHeaders(headers) {
  const get = (name) =>
    headers.filter((h) => h.name.toLowerCase() === name).map((h) => h.value || "");

  const powered = get("x-powered-by").join(" ");
  const server = get("server").join(" ");
  const cookies = get("set-cookie").join(" ");
  const link = get("link").join(" ");

  const phpMatch = `${powered} ${server}`.match(/PHP\/([\d.]+)/i);
  const phpVersion = phpMatch ? phpMatch[1] : null;
  const usesPhp =
    !!phpVersion || /php/i.test(powered) || /PHPSESSID/i.test(cookies);

  const cms = new Set();
  if (/api\.w\.org/i.test(link) || get("x-pingback").length) cms.add("WordPress");
  if (headers.some((h) => /^x-magento-/i.test(h.name))) cms.add("Magento");
  if (/wordpress/i.test(powered)) cms.add("WordPress");

  return { phpVersion, usesPhp, cms: [...cms] };
}

function badgeFor(state) {
  const usesPhp = state.usesPhp || state.cms.length > 0;
  const s = state.assessment.status;
  if (s === "vulnerable" || s === "eol") return { text: "!", color: "#D93025" };
  if (s === "patched") return { text: "OK", color: "#188038" };
  if (usesPhp) return { text: "?", color: "#E37400" };
  return { text: "", color: "#888888" };
}


// ---- warning text ------------------------------------------------------------------
// Every word shown in a PHPeek window comes from here. The page only supplies a code and
// raw values, which are validated (addresses must be 0x + 40 hex, names plain and short).

const fmtAddr = (a) => (typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : "an unknown address");
const fmtName = (s) => (typeof s === "string" && /^[\w .\-]{1,32}$/.test(s) ? s : "an unknown contract");
const EXPOSED_NOTE = "This site shows signs of an unpatched PHP2Shell server. It may be compromised.";

const TEMPLATES = {
  "approve-unlimited": (f) => ["high", "Unlimited token approval", [
    `Lets ${fmtAddr(f.who)} spend UNLIMITED amounts of token ${fmtAddr(f.token)} from your wallet, at any time.`,
    "Drainers use approvals to empty wallets later, without asking again."]],
  "approve": (f) => ["medium", "Token approval", [
    `Lets ${fmtAddr(f.who)} spend a set amount of token ${fmtAddr(f.token)} from your wallet.`,
    "Only approve contracts you know and trust."]],
  "allowance": (f) => [f.unlimited ? "high" : "medium", "Token allowance increase", [
    `Lets ${fmtAddr(f.who)} spend ${f.unlimited ? "UNLIMITED amounts" : "more"} of token ${fmtAddr(f.token)}.`]],
  "approval-for-all": (f) => ["high", "Approval for ALL your NFTs", [
    `Gives ${fmtAddr(f.who)} control of every NFT you hold in collection ${fmtAddr(f.token)}.`,
    "This is the #1 trick NFT drainers use."]],
  "permit2-approve": (f) => ["high", "Permit2 approval", [
    `Lets ${fmtAddr(f.who)} move ${f.unlimited ? "UNLIMITED amounts" : "a set amount"} of token ${fmtAddr(f.token)} via Permit2.`]],
  "permit": (f) => ["high", "Permit signature (gasless approval)", [
    `Signing lets ${fmtAddr(f.who)} move your tokens (${fmtName(f.domain)}) without any further transaction.`,
    "Costs no gas and looks harmless, which is exactly why drainers love it."]],
  "market-order": (f) => ["high", "Marketplace order signature", [
    `This signs a ${fmtName(f.domain)} order. A malicious one can "sell" your NFTs or tokens to the attacker for nearly nothing.`,
    "Only sign if you are knowingly listing something for sale, on the real marketplace."]],
  "delegation": () => ["high", "Delegation / authorization signature", [
    "Signing a delegation can hand control of your account or funds to another contract."]],
  "eth-sign": () => ["high", "Blind signature (eth_sign)", [
    "eth_sign signs a raw hash you can't read. It can authorize almost anything, including draining your wallet."]],
  "blind-hash": () => ["high", "Blind hash signature", [
    "You're asked to sign a 32-byte hash, not readable text. You can't tell what it authorizes."]],
  "exposed-site": () => ["medium", "Wallet request on an exposed site", [
    "Double-check every detail in your wallet before approving."]],
  "clickfix": () => ["high", "A website tried to put a command in your clipboard", [
    "This is the \"ClickFix\" trick: a fake \"verify you're human\" or \"fix this error\" page asks you to paste a command into Run, Terminal or PowerShell.",
    "PHPeek replaced it with a harmless warning. Never paste commands a website gives you."]],
  "seed": () => ["high", "This looks like a seed phrase", [
    "No real website, wallet, exchange or support team will EVER ask for your recovery phrase.",
    "Anyone who has it owns your funds, forever. PHPeek cleared the field.",
    "Already typed it somewhere? Move your funds to a brand-new wallet now."]],
};
const KIND_OF = { clickfix: "clipboard", seed: "seed" };

function render(verdict, siteRisky) {
  const tpl = verdict && Object.prototype.hasOwnProperty.call(TEMPLATES, verdict.code) && TEMPLATES[verdict.code];
  if (!tpl) return null;
  const [level, title, reasons] = tpl(verdict.f || {});
  const out = { level, title, reasons: [...reasons] };
  if ((siteRisky || verdict.risky) && !KIND_OF[verdict.code]) out.reasons.unshift(EXPOSED_NOTE);
  return out;
}

const isRisky = (state) => !!state && ["vulnerable", "eol"].includes(state.assessment.status);

if (typeof chrome !== "undefined" && chrome.webRequest) {
  const key = (tabId) => `tab_${tabId}`;

  const getState = async (tabId) =>
    (await chrome.storage.session.get(key(tabId)))[key(tabId)] || null;

  const setState = async (tabId, state) => {
    await chrome.storage.session.set({ [key(tabId)]: state });
    const { text, color } = badgeFor(state);
    try {
      await chrome.action.setBadgeText({ tabId, text });
      await chrome.action.setBadgeBackgroundColor({ tabId, color });
    } catch (_) { /* tab closed */ }
  };

  const onHeaders = (details) => {
    if (details.tabId < 0) return;
    const info = analyseHeaders(details.responseHeaders || []);
    setState(details.tabId, {
      host: new URL(details.url).hostname,
      phpVersion: info.phpVersion,
      usesPhp: info.usesPhp,
      cms: info.cms,
      generator: null,
      assessment: assessPhp(info.phpVersion),
    });
  };

  const filter = { urls: ["<all_urls>"], types: ["main_frame"] };
  try {
    // Chromium needs "extraHeaders" to expose Set-Cookie.
    chrome.webRequest.onHeadersReceived.addListener(onHeaders, filter, ["responseHeaders", "extraHeaders"]);
  } catch (_) {
    // Firefox doesn't know "extraHeaders" and already exposes all headers.
    chrome.webRequest.onHeadersReceived.addListener(onHeaders, filter, ["responseHeaders"]);
  }

  // ---- guard decisions -------------------------------------------------------------
  // Each risky request gets its own PHPeek window. No answer = cancel.

  const pending = new Map(); // id -> { respond, info, windowId, done }
  let counter = 0;

  function finish(id, allow) {
    const p = pending.get(id);
    if (!p || p.done) return;
    p.done = true;
    try { p.respond({ allow: !!allow }); } catch (_) { /* tab gone */ }
    pending.delete(id);
    if (p.windowId != null) chrome.windows.remove(p.windowId).catch(() => {});
  }

  const recent = new Map(); // tabId -> timestamps of windows opened (rate limit)

  async function openWarning(msg, sender, respond) {
    const tabId = sender.tab && sender.tab.id;
    const state = tabId != null ? await getState(tabId) : null;
    const verdict = render(msg.verdict, isRisky(state));
    const kind = KIND_OF[msg.verdict && msg.verdict.code] || "signature";
    // Unknown code = something tampered with the request. Fail closed, no window.
    if (!verdict || kind !== (msg.kind === "signature" ? "signature" : msg.kind)) return respond({ allow: false });
    const notifyOnly = kind === "clipboard";
    // One PHPeek window per frame at a time, at most 6 a minute per frame: a page (or an ad
    // frame) can't spam you, and can't use up the budget of the dapp's own frame.
    const key = `${tabId}:${sender.frameId || 0}`;
    const now = Date.now();
    const times = (recent.get(key) || []).filter((t) => now - t < 60000);
    const busy = [...pending.values()].some((p) => p.key === key && !p.done);
    if (busy || times.length >= 6) return respond({ allow: false });
    times.push(now); recent.set(key, times);
    const id = `w${now.toString(36)}${++counter}`;
    pending.set(id, {
      key,
      respond: notifyOnly ? () => {} : respond,
      done: false,
      info: {
        kind,
        verdict,
        method: /^[a-z_A-Z0-9]{1,40}$/.test((msg.extra && msg.extra.method) || "") ? msg.extra.method : "",
        notifyOnly,
        host: (sender.tab && sender.tab.url && new URL(sender.tab.url).hostname) || msg.frame,
        frame: msg.frame,
        siteStatus: state ? state.assessment.status : "unknown",
      },
    });
    if (notifyOnly) respond({ allow: true });
    const win = await chrome.windows.create({
      url: chrome.runtime.getURL(`warning.html?id=${id}`),
      type: "popup", width: 460, height: 640, focused: true,
    });
    const p = pending.get(id);
    if (p) p.windowId = win.id;
    setTimeout(() => finish(id, false), 180000);
  }

  chrome.windows.onRemoved.addListener((windowId) => {
    for (const [id, p] of pending) if (p.windowId === windowId) finish(id, false);
  });

  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (!msg || typeof msg.type !== "string") return;
    // Extension pages (our warning window) have an extension URL; content scripts have the site's URL.
    const ownPage = typeof sender.url === "string" && sender.url.startsWith(chrome.runtime.getURL(""));
    const fromPage = !!sender.tab && !ownPage;

    if (msg.type === "status?" && fromPage) {
      getState(sender.tab.id).then((s) => respond({ risky: isRisky(s) }));
      return true;
    }
    if (msg.type === "risk" && fromPage && msg.verdict) {
      openWarning(msg, sender, respond);
      return true; // answered when the user decides
    }
    // Only PHPeek's own pages (no tab) may read or decide pending requests.
    if (msg.type === "pending?" && ownPage) {
      const p = pending.get(msg.id);
      respond(p ? p.info : null);
      return;
    }
    if (msg.type === "decide" && ownPage) {
      finish(msg.id, msg.allow === true);
      respond({ ok: true });
      return;
    }
    if (msg.type === "ping") { respond({ ok: true }); return; }

    // CMS hints from the page HTML.
    if (msg.type === "cms-hints" && fromPage) {
      const tabId = sender.tab.id;
      getState(tabId).then((state) => {
        if (!state) return;
        state.cms = [...new Set([...state.cms, ...(msg.cms || [])])];
        state.generator = msg.generator || state.generator;
        if (state.cms.length) state.usesPhp = true;
        setState(tabId, state);
      });
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.session.remove(key(tabId));
    for (const k of recent.keys()) if (k.startsWith(`${tabId}:`)) recent.delete(k);
  });
}

// Exported for Node tests.
if (typeof module !== "undefined") module.exports = { assessPhp, analyseHeaders, badgeFor, isRisky, render, TEMPLATES };
