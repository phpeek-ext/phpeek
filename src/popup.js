(async () => {
  const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;
  const statusEl = document.getElementById("status");
  const detailsEl = document.getElementById("details");
  const noteEl = document.getElementById("note");
  document.getElementById("footer").textContent = t("footer");
  statusEl.textContent = t("loading");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const data = tab ? await chrome.storage.session.get(`tab_${tab.id}`) : {};
  const s = tab ? data[`tab_${tab.id}`] : null;

  if (!s) {
    statusEl.textContent = t("noData");
    return;
  }

  const usesPhp = s.usesPhp || s.cms.length > 0;
  const a = s.assessment;
  let cls = "none", text = t("notPhp"), note = "";

  if (a.status === "vulnerable") {
    cls = "vulnerable";
    text = t("vulnTitle", [s.phpVersion]);
    note = t("vulnNote", [a.needed]);
  } else if (a.status === "eol") {
    cls = "eol";
    text = t("eolTitle", [s.phpVersion]);
    note = t("eolNote");
  } else if (a.status === "patched") {
    cls = "patched";
    text = t("patchedTitle", [s.phpVersion]);
  } else if (usesPhp) {
    cls = "unknown";
    text = t("hiddenTitle");
    note = t("hiddenNote");
  }

  statusEl.className = `status ${cls}`;
  statusEl.textContent = text;

  const rows = [
    [t("rowSite"), s.host],
    [t("rowPhp"), s.phpVersion || (usesPhp ? t("hiddenVersion") : "—")],
    [t("rowCms"), s.cms.length ? s.cms.join(", ") : "—"],
  ];
  if (s.generator) rows.push([t("rowGenerator"), s.generator]);
  for (const [k, v] of rows) {
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd"); dd.textContent = v;
    detailsEl.append(dt, dd);
  }
  noteEl.textContent = note;
})();
