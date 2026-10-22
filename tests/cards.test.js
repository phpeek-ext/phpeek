// Run with: node tests/cards.test.js
const assert = require("node:assert");
const C = require("../src/cards.js");
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

// --- card numbers (public test numbers)
for (const c of ["4242424242424242", "4111 1111 1111 1111", "5555-5555-5555-4444", "2223003122003222", "378282246310005",
  "6011111111111117", "3530111333300000", "30569309025904", "6200000000000005"]) ok(C.cardFrom(c), `card recognised: ${c}`);
for (const x of ["4242424242424241", "1700000000000", "1696423145123", "12345678901234", "0000000000000000",
  "+351 912 345 678", "4242 4242 4242 424a", "", "4242424242424242424242"]) ok(!C.cardFrom(x), `not a card: ${x}`);

// --- sites
ok(C.siteOf("www.shop.example.co.uk") === "example.co.uk" && C.siteOf("checkout.shop.com") === "shop.com", "registrable domain");
ok(C.sameSite("api.shop.com", "www.shop.com") && !C.sameSite("shop.com.evil.io", "shop.com"), "same-site check");
ok(C.isPaymentHost("api.stripe.com") && C.isPaymentHost("www.paypal.com") && !C.isPaymentHost("stripe.com.evil.io") && !C.isPaymentHost("notstripe.com"), "payment providers");

// --- skimmer decisions
const cards = ["4111111111111111"];
const page = "www.shop.example";
ok(C.skimDecision("evil-cdn.io", page, '{"cc":"4111111111111111","exp":"12/29"}', cards), "plain JSON to foreign site → block");
ok(C.skimDecision("evil-cdn.io", page, "https://evil-cdn.io/i.gif?d=4111%201111%201111%201111", cards), "URL-encoded in query → block");
ok(C.skimDecision("evil-cdn.io", page, "x=" + Buffer.from("cc=4111 1111 1111 1111;cvv=123").toString("base64"), cards), "base64 → block");
ok(C.skimDecision("evil-cdn.io", page, "p=" + Buffer.from(encodeURIComponent('{"n":"4111111111111111"}')).toString("base64"), cards), "base64(urlencoded) → block");
ok(C.skimDecision("evil-cdn.io", page, "d=1111111111111114", cards), "reversed → block");
ok(!C.skimDecision("api.shop.example", page, "cc=4111111111111111", cards), "store's own backend → allowed");
ok(!C.skimDecision("api.stripe.com", page, "card[number]=4111111111111111", cards), "Stripe → allowed");
ok(!C.skimDecision("evil-cdn.io", page, "cc=4111111111111111", []), "no card typed → never blocks");
ok(!C.skimDecision("www.google-analytics.com", page, "v=2&cid=1696423145.1700000000&t=1700000000123", cards), "analytics without the card → allowed");
ok(!C.skimDecision("evil-cdn.io", page, "cc=4242424242424242", cards), "a different number than the one typed → allowed");

// --- v1.2 review fixes
ok(!C.cardFrom("6035710012345674", true) && !C.cardFrom("4006381333931", true) && C.cardFrom("4111111111111111", true), "strict mode: gift cards / barcodes don't count, real cards do");
ok(C.isPaymentHost("api.mercadopago.com.br") && C.isPaymentHost("secure.payu.in") && C.isPaymentHost("core.spreedly.com"), "more gateways + country domains");
ok(C.skimDecision("evil.io", page, "https://evil.io/collect/" + Buffer.from(JSON.stringify({ n: "4111111111111111" })).toString("base64"), cards), "base64 in a URL path → block");
ok(C.skimDecision("evil.io", page, "d=x" + Buffer.from("cc=4111111111111111").toString("base64"), cards), "base64 with a stray prefix → block");
ok(C.skimDecision("evil.io", page, "d=" + Buffer.from(Buffer.from("4111111111111111").toString("base64")).toString("base64"), cards), "double base64 → block");
ok(C.skimDecision("evil.io", page, "p=411111111111111", cards), "first 15 digits (checksum digit dropped) → block");
ok(!C.isCardField({ tagName: "INPUT", type: "text", name: "country", placeholder: "Japan", getAttribute: () => "" }), "'Japan' isn't a card field");

console.log(`cards: ${n} checks passed`);
