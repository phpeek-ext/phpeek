(async () => {
  const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;
  const $ = (id) => document.getElementById(id);
  $("footer").textContent = t("footer");
  $("guardsTitle").textContent = t("guardsTitle");
  for (const [id, key] of [["gSeed", "guardSeed"], ["gSig", "guardSig"], ["gClip", "guardClip"], ["gCard", "guardCard"], ["gPass", "guardPass"]]) $(id).textContent = t(key);
  $("status").textContent = t("loading");

  // The exact PHP version is deliberately never shown: visitors only need the verdict.
  function verdict(s) {
    const usesPhp = s.usesPhp || (s.cms && s.cms.length > 0);
    const a = s.assessment || {};
    if (a.status === "vulnerable") return { cls: "vulnerable", text: t("vulnTitle"), note: t("vulnNote"), label: t("statusExposed") };
    if (a.status === "eol") return { cls: "eol", text: t("eolTitle"), note: t("eolNote"), label: t("statusEol") };
    if (a.status === "patched") return { cls: "patched", text: t("patchedTitle"), note: "", label: t("statusPatched") };
    if (usesPhp) return { cls: "unknown", text: t("hiddenTitle"), note: t("hiddenNote"), label: t("statusHidden") };
    return { cls: "none", text: t("notPhp"), note: "", label: "—" };
  }

  // ---- Check any site ----------------------------------------------------------------
  $("checkTitle").textContent = t("checkTitle");
  $("curl").placeholder = t("checkPlaceholder");
  $("cbtn").textContent = t("checkBtn");
  $("cform").onsubmit = async (e) => {
    e.preventDefault();
    const url = $("curl").value.trim();
    if (!url) return;
    const out = $("cres"); out.textContent = "";
    $("cbtn").disabled = true; $("cbtn").textContent = t("checking");
    const r = await new Promise((res) => chrome.runtime.sendMessage({ type: "check", url }, (x) => res(chrome.runtime.lastError ? null : x)));
    $("cbtn").disabled = false; $("cbtn").textContent = t("checkBtn");
    const box = document.createElement("div");
    if (!r || r.error) {
      box.className = "status none";
      box.textContent = r && r.error === "bad" ? t("checkBad") : t("checkFail");
      out.append(box);
      return;
    }
    const v = verdict(r);
    box.className = `status ${v.cls}`;
    box.textContent = `${r.host} · ${v.text}`;
    out.append(box);
    if (v.note) { const p = document.createElement("p"); p.textContent = v.note; out.append(p); }
  };

  // ---- this tab ------------------------------------------------------------------------
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const data = tab ? await chrome.storage.session.get(`tab_${tab.id}`) : {};
  const s = tab ? data[`tab_${tab.id}`] : null;

  if (!s) {
    $("status").textContent = t("noData");
    return;
  }

  const { cls, text, note, label } = verdict(s);
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
