(async () => {
  const id = new URLSearchParams(location.search).get("id");
  const $ = (s) => document.getElementById(s);
  const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, (res) => r(chrome.runtime.lastError ? null : res)));

  const info = await send({ type: "pending?", id });
  if (!info) {
    $("title").textContent = "This request has already been handled.";
    $("stop").textContent = "Close";
    $("go").hidden = true;
    $("stop").onclick = () => window.close();
    return;
  }

  // Keep the background awake while you think.
  setInterval(() => send({ type: "ping" }), 10000);

  const v = info.verdict;
  $("band").className = `band ${v.level}`;
  $("title").textContent = v.title;
  const kicker = { signature: "Wallet request", seed: "Seed Shield", clipboard: "Clipboard Guard" }[info.kind] || "PHPeek";
  $("kicker").textContent = `PHPeek · ${kicker}`;
  document.title = `PHPeek: ${v.title}`;

  const site = document.createElement("span");
  site.append("On ");
  const b = document.createElement("b"); b.textContent = info.host || info.frame || "this site"; site.append(b);
  if (info.frame && info.frame !== info.host) site.append(` (inside a frame from ${info.frame})`);
  if (info.siteStatus === "vulnerable" || info.siteStatus === "eol") site.append(" · 🔴 exposed to PHP2Shell");
  if (info.method) site.append(` · ${info.method}`);
  $("site").append(site);

  for (const r of v.reasons) {
    const li = document.createElement("li"); li.textContent = r; $("reasons").append(li);
  }

  const decide = async (allow) => { await send({ type: "decide", id, allow }); window.close(); };

  if (info.notifyOnly) {
    $("stop").textContent = "Got it";
    $("go").hidden = true;
    $("stop").onclick = () => decide(false);
    return;
  }

  if (info.kind === "seed") {
    $("stop").textContent = "Keep it cleared (recommended)";
    $("go").textContent = "It's not a seed phrase, restore my text";
    $("stop").onclick = () => decide(false);
    $("go").onclick = () => decide(true);
    return;
  }

  $("stop").textContent = "Cancel request (recommended)";
  $("go").textContent = "Continue to my wallet anyway";
  $("stop").onclick = () => decide(false);
  $("go").onclick = () => decide(true);
  if (v.level === "high") {
    $("ack").hidden = false;
    $("acktext").textContent = "I trust this site and understand this can give it control of my funds.";
    $("go").disabled = true;
    $("ackbox").onchange = () => { $("go").disabled = !$("ackbox").checked; };
  }
  $("stop").focus();
})();
