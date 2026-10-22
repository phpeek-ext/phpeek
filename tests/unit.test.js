// Run with: node tests/unit.test.js
const assert = require("node:assert");
const { assessPhp, analyseHeaders, badgeFor } = require("../src/background.js");

const cases = [
  ["8.2.10", "vulnerable"], ["8.2.34", "vulnerable"], ["8.2.35", "patched"],
  ["8.3.35", "vulnerable"], ["8.3.36", "patched"], ["8.4.26", "vulnerable"],
  ["8.4.27", "patched"], ["8.5.11", "vulnerable"], ["8.5.12", "patched"],
  ["8.6.0", "patched"], ["8.1.31", "eol"], ["7.4.33", "eol"], ["5.6.40", "eol"],
  ["8.3", "unknown"], [null, "unknown"], ["garbage", "unknown"],
];
for (const [v, want] of cases) assert.strictEqual(assessPhp(v).status, want, `PHP ${v}`);

let h = analyseHeaders([{ name: "X-Powered-By", value: "PHP/8.2.10" }]);
assert.deepStrictEqual([h.phpVersion, h.usesPhp], ["8.2.10", true]);
h = analyseHeaders([{ name: "Server", value: "Apache/2.4.41 (Ubuntu) PHP/7.4.3 OpenSSL/1.1" }]);
assert.strictEqual(h.phpVersion, "7.4.3");
h = analyseHeaders([{ name: "Set-Cookie", value: "PHPSESSID=x" }, { name: "X-Magento-Tags", value: "a" }]);
assert.deepStrictEqual([h.phpVersion, h.usesPhp, h.cms], [null, true, ["Magento"]]);
h = analyseHeaders([{ name: "Link", value: '<https://a/wp-json/>; rel="https://api.w.org/"' }]);
assert.deepStrictEqual(h.cms, ["WordPress"]);
h = analyseHeaders([{ name: "Server", value: "nginx" }]);
assert.deepStrictEqual([h.phpVersion, h.usesPhp, h.cms], [null, false, []]);

const st = (status, extra = {}) => ({ usesPhp: false, cms: [], assessment: { status }, ...extra });
assert.strictEqual(badgeFor(st("vulnerable")).text, "!");
assert.strictEqual(badgeFor(st("eol")).text, "!");
assert.strictEqual(badgeFor(st("patched")).text, "");   // no green "OK": a header is not a guarantee
assert.strictEqual(badgeFor(st("unknown", { cms: ["WordPress"] })).text, "?");
assert.strictEqual(badgeFor(st("unknown")).text, "");
console.log(`unit tests passed (${cases.length} version cases + header/badge checks)`);
