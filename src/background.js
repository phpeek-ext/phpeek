// PHPeek — passive PHP2Shell exposure check.
// Reads only the response headers the browser already receives.
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

  // CMS hints from the page HTML.
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg?.type !== "cms-hints" || !sender.tab) return;
    const tabId = sender.tab.id;
    getState(tabId).then((state) => {
      if (!state) return;
      state.cms = [...new Set([...state.cms, ...(msg.cms || [])])];
      state.generator = msg.generator || state.generator;
      if (state.cms.length) state.usesPhp = true;
      setState(tabId, state);
    });
  });

  chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(key(tabId)));
}

// Exported for Node tests.
if (typeof module !== "undefined") module.exports = { assessPhp, analyseHeaders, badgeFor };
