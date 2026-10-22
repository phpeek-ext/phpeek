(async () => {
  const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;
  const $ = (id) => document.getElementById(id);
  $("footer").textContent = t("footer");
  $("guardsTitle").textContent = t("guardsTitle");
  for (const [id, key] of [["gSeed", "guardSeed"], ["gSig", "guardSig"], ["gClip", "guardClip"]]) $(id).textContent = t(key);
  $("status").textContent = t("loading");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const data = tab ? await chrome.storage.session.get(`tab_${tab.id}`) : {};
  const s = tab ? data[`tab_${tab.id}`] : null;

  if (!s) {
    $("status").textContent = t("noData");
    return;
  }

  const usesPhp = s.usesPhp || s.cms.length > 0;
  const a = s.assessment;
  let cls = "none", text = t("notPhp"), note = "", label = "—";

  // The exact PHP version is deliberately not shown: visitors only need the verdict.
  if (a.status === "vulnerable") {
    cls = "vulnerable"; text = t("vulnTitle"); note = t("vulnNote"); label = t("statusExposed");
  } else if (a.status === "eol") {
    cls = "eol"; text = t("eolTitle"); note = t("eolNote"); label = t("statusEol");
  } else if (a.status === "patched") {
    cls = "patched"; text = t("patchedTitle"); label = t("statusPatched");
  } else if (usesPhp) {
    cls = "unknown"; text = t("hiddenTitle"); note = t("hiddenNote"); label = t("statusHidden");
  }

  $("status").className = `status ${cls}`;
  $("status").textContent = text;

  const rows = [[t("rowSite"), s.host], [t("rowStatus"), label], [t("rowCms"), s.cms.length ? s.cms.join(", ") : "—"]];
  for (const [k, v] of rows) {
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd"); dd.textContent = v;
    $("details").append(dt, dd);
  }
  $("note").textContent = note;

  if (cls === "vulnerable" || cls === "eol") {
    const btn = $("tell");
    btn.hidden = false;
    btn.textContent = t("tellOwner");
    btn.onclick = () => {
      const subject = `Security: please update PHP on ${s.host} (PHP2Shell)`;
      const body = [
        "Hi,",
        "",
        `I'm a visitor of ${s.host}. Your server advertises a PHP version that appears to be affected by PHP2Shell (CVE-2026-109618 / CVE-2026-109619), critical flaws that allow unauthenticated remote code execution and are being exploited right now.`,
        "",
        "What to do:",
        "1. Update PHP to 8.5.12, 8.4.27, 8.3.36 or 8.2.35 (or newer). PHP 8.1 and older get no official fix: upgrade the branch.",
        "2. After updating, rotate admin passwords, database credentials and API keys (the flaw can leak memory).",
        "3. Check for unknown admin users and injected scripts, in case the site was hit before patching.",
        "4. Set expose_php = Off in php.ini so the version isn't advertised.",
        "",
        "If you've already patched (some Linux distros backport fixes without changing the version number), please ignore this.",
        "",
        "Thanks, and good luck!",
        "",
        "Sent via PHPeek, a free open-source browser extension.",
      ].join("\n");
      chrome.tabs.create({ url: `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` });
    };
  }
})();
