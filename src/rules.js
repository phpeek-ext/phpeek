// PHPeek rules: what counts as a risky wallet request or clipboard write.
// Loaded in the extension's isolated world (where pages can't tamper with JavaScript built-ins)
// and in Node for tests. Pure functions, no DOM, no network.
(() => {
  "use strict";

  const HUGE = 1n << 128n; // anything this large is "unlimited" in practice

  const SEL = {
    approve: "0x095ea7b3",            // approve(address,uint256)
    setApprovalForAll: "0xa22cb465",  // setApprovalForAll(address,bool)
    increaseAllowance: "0x39509351",  // increaseAllowance(address,uint256)
    permit2Approve: "0x87517c45",     // Permit2.approve(address,address,uint160,uint48)
  };

  // Everything shown in PHPeek's window is built from fixed text plus values that pass these checks,
  // so a page can't smuggle its own wording into a PHPeek-branded window.
  const safeAddr = (a) => (typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : "an unknown address");
  const safeName = (s) => (typeof s === "string" && /^[\w .\-]{1,32}$/.test(s) ? s : "an unknown contract");
  const word = (data, i) => data.slice(10 + i * 64, 10 + (i + 1) * 64);
  const addr = (w) => "0x" + (w || "").slice(24);
  const big = (w) => { try { return BigInt("0x" + (w || "0")); } catch { return 0n; } };
  const amountLabel = (v) => (v >= HUGE ? "UNLIMITED" : "a set amount");

  // ---- classification (pure, unit-tested) -------------------------------------------

  function classifyCall(tx) {
    if (!tx || typeof tx !== "object") return null;
    const data = [tx.data, tx.input].find((d) => typeof d === "string" && d.length >= 10) || "";
    const sel = data.slice(0, 10).toLowerCase();
    if (sel === SEL.approve) {
      const v = big(word(data, 1));
      return {
        f: { who: addr(word(data, 0)), token: tx.to },
        level: v >= HUGE ? "high" : "medium",
        code: v >= HUGE ? "approve-unlimited" : "approve",
        title: v >= HUGE ? "Unlimited token approval" : "Token approval",
        reasons: [
          `Lets ${safeAddr(addr(word(data, 0)))} spend ${amountLabel(v)} of token ${safeAddr(tx.to)} from your wallet, at any time.`,
          "Drainers use approvals to empty wallets later, without asking again.",
        ],
      };
    }
    if (sel === SEL.increaseAllowance) {
      const v = big(word(data, 1));
      return {
        f: { who: addr(word(data, 0)), token: tx.to, unlimited: v >= HUGE },
        level: v >= HUGE ? "high" : "medium",
        code: "allowance",
        title: "Token allowance increase",
        reasons: [`Lets ${safeAddr(addr(word(data, 0)))} spend ${amountLabel(v)} more of token ${safeAddr(tx.to)}.`],
      };
    }
    if (sel === SEL.setApprovalForAll && big(word(data, 1)) !== 0n) {
      return {
        f: { who: addr(word(data, 0)), token: tx.to },
        level: "high",
        code: "approval-for-all",
        title: "Approval for ALL your NFTs",
        reasons: [
          `Gives ${safeAddr(addr(word(data, 0)))} control of every NFT you hold in collection ${safeAddr(tx.to)}.`,
          "This is the #1 trick NFT drainers use.",
        ],
      };
    }
    if (sel === SEL.permit2Approve) {
      const v = big(word(data, 2));
      return {
        f: { who: addr(word(data, 1)), token: addr(word(data, 0)), unlimited: v >= HUGE },
        level: "high",
        code: "permit2-approve",
        title: "Permit2 approval",
        reasons: [`Lets ${safeAddr(addr(word(data, 1)))} move ${amountLabel(v)} of token ${safeAddr(addr(word(data, 0)))} via Permit2.`],
      };
    }
    return null;
  }

  function classifyTypedData(raw) {
    let td = raw;
    try { if (typeof raw === "string") td = JSON.parse(raw); } catch { return null; }
    if (!td || typeof td !== "object") return null;
    const pt = String(td.primaryType || "");
    const msg = td.message || {};
    const rawDomain = (td.domain && td.domain.name) || "";
    const domain = safeName(rawDomain);
    if (/permit/i.test(pt)) {
      const spender = msg.spender || (msg.details && msg.details.spender);
      return {
        f: { who: spender, domain: rawDomain },
        level: "high",
        code: "permit",
        title: "Permit signature (gasless approval)",
        reasons: [
          `Signing lets ${safeAddr(spender)} move your tokens (${domain}) without any further transaction.`,
          "Costs no gas and looks harmless, which is exactly why drainers love it.",
        ],
      };
    }
    if (pt === "OrderComponents" || /seaport|blur/i.test(rawDomain) || (pt === "Root" && /blur/i.test(rawDomain))) {
      return {
        f: { domain: rawDomain },
        level: "high",
        code: "market-order",
        title: "Marketplace order signature",
        reasons: [
          `This signs a ${domain} order. A malicious one can "sell" your NFTs or tokens to the attacker for nearly nothing.`,
          "Only sign if you are knowingly listing something for sale, on the real marketplace.",
        ],
      };
    }
    if (/delegat|authoriz/i.test(pt)) {
      return {
        level: "high",
        code: "delegation",
        title: "Delegation / authorization signature",
        reasons: ["Signing a delegation can hand control of your account or funds to another contract."],
      };
    }
    return null;
  }

  const WALLET_ACTION = /^(eth_sendTransaction|eth_signTransaction|eth_sign|personal_sign|eth_signTypedData(_v3|_v4)?|wallet_sendCalls)$/;

  function classify(method, params, ctx) {
    const risky = !!(ctx && ctx.risky);
    const p = Array.isArray(params) ? params : [params];
    let r = null;
    switch (method) {
      case "eth_sendTransaction":
      case "eth_signTransaction":
        r = classifyCall(p[0]);
        break;
      case "wallet_sendCalls": {
        const calls = (p[0] && Array.isArray(p[0].calls) && p[0].calls) || [];
        for (const c of calls) {
          const x = classifyCall(c);
          if (x && (!r || x.level === "high")) r = x;
        }
        break;
      }
      case "eth_signTypedData":
      case "eth_signTypedData_v3":
      case "eth_signTypedData_v4": {
        const data = typeof p[1] === "object" || (typeof p[1] === "string" && p[1].trim().startsWith("{")) ? p[1] : p[0];
        r = classifyTypedData(data);
        break;
      }
      case "eth_sign":
        r = {
          level: "high",
          code: "eth-sign",
          title: "Blind signature (eth_sign)",
          reasons: ["eth_sign signs a raw hash you can't read. It can authorize almost anything, including draining your wallet."],
        };
        break;
      case "personal_sign": {
        const m = [p[0], p[1]].find((x) => typeof x === "string" && /^0x[0-9a-f]{64}$/i.test(x));
        if (m) r = {
          level: "high",
          code: "blind-hash",
          title: "Blind hash signature",
          reasons: ["You're asked to sign a 32-byte hash, not readable text. You can't tell what it authorizes."],
        };
        break;
      }
    }
    if (r && risky) r.risky = true;
    if (risky && WALLET_ACTION.test(method)) {
      const note = "This site shows signs of an unpatched PHP2Shell server. It may be compromised.";
      if (r) r.reasons.unshift(note);
      else r = { risky: true, level: "medium", code: "exposed-site", title: "Wallet request on an exposed site", reasons: [note, "Double-check every detail in your wallet before approving."] };
    }
    return r;
  }

  // ClickFix detection. Obfuscation (^ ` and quotes) is stripped first: p^o^w^e^r^s^h^e^l^l → powershell.
  // "critical": almost never legit to copy from a website → always blocked.
  // "install": also used by real install docs (rustup, scoop) → blocked unless shown in a visible code block.
  const CRITICAL = new RegExp([
    "\\bmshta\\b", "rundll32", "regsvr32", "bitsadmin", "certutil", "\\bwscript\\b", "\\bcscript\\b",
    "-e(nc(odedcommand)?)?\\s+[A-Za-z0-9+/=]{20,}", "base64\\s+(-d|-D|--decode)", "\\$\\([^)]*base64",
    "osascript\\s+-e", "\\bnc\\s+-e\\b", "/dev/tcp/", "\\bfinger\\s+\\S+@\\S+", "\\|\\s*cmd\\b", "-w(indowstyle)?\\s+h(idden)?\\b",
  ].join("|"), "i");
  const INSTALL = new RegExp([
    "powershell", "pwsh", "invoke-expression", "\\biex\\b", "start-process", "invoke-webrequest", "\\birm\\b",
    "cmd(\\.exe)?(\\s+/[a-z]:?\\S*)*\\s+/[ck]\\b", "(curl|wget)[^\\n|]*\\|\\s*(sudo\\s+)?(ba|z)?sh", "\\$\\(\\s*(curl|wget)\\b",
  ].join("|"), "i");

  const normalise = (text) => String(text).replace(/[\^`"']/g, "");

  // Returns null, "install" or "critical".
  function clipboardTier(text) {
    if (typeof text !== "string" || text.length < 6) return null;
    const t = normalise(text);
    if (CRITICAL.test(t)) return "critical";
    if (INSTALL.test(t)) return "install";
    return null;
  }

  function classifyClipboard(text) {
    return clipboardTier(text) ? {
      level: "high",
      code: "clickfix",
      title: "A website tried to put a command in your clipboard",
      reasons: [
        "This is the \"ClickFix\" trick: a fake \"verify you're human\" or \"fix this error\" page asks you to paste a command into Run, Terminal or PowerShell.",
        "PHPeek replaced it with a harmless warning. Never paste commands a website gives you.",
      ],
    } : null;
  }

  const api = { classify, classifyCall, classifyTypedData, classifyClipboard, clipboardTier, WALLET_ACTION, HUGE };
  if (typeof module !== "undefined") module.exports = api;
  else globalThis.PHPEEK_RULES = api;
})();
