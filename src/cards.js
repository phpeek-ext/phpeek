// PHPeek Card Guard logic (pure; runs in the isolated content-script world and in Node tests).
// Nothing here stores or sends card numbers. A number you type stays in this page's memory only,
// so PHPeek can recognise it if a script tries to ship it somewhere it shouldn't go.
(() => {
  "use strict";

  function luhn(d) {
    let sum = 0, alt = false;
    for (let i = d.length - 1; i >= 0; i--) {
      let n = d.charCodeAt(i) - 48;
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n; alt = !alt;
    }
    return sum % 10 === 0;
  }

  // A real card brand prefix + length. Timestamps, order IDs and phone numbers don't pass this.
  // strict: for fields that don't say "card" — drop the loose ranges gift cards and barcodes hit.
  function brandOk(d, strict) {
    const n = d.length, p2 = +d.slice(0, 2), p3 = +d.slice(0, 3), p4 = +d.slice(0, 4);
    if (d[0] === "4") return n === 16 || (!strict && (n === 13 || n === 19));         // Visa
    if ((p2 >= 51 && p2 <= 55) || (p4 >= 2221 && p4 <= 2720)) return n === 16;         // Mastercard
    if (p2 === 34 || p2 === 37) return n === 15;                                       // Amex
    if (p4 === 6011 || p2 === 65 || (p3 >= 644 && p3 <= 649)) return n >= 16 && n <= 19; // Discover
    if (p4 >= 3528 && p4 <= 3589) return n >= 16 && n <= 19;                           // JCB
    if ((p3 >= 300 && p3 <= 305) || p2 === 36 || p2 === 38 || p2 === 39) return n >= 14 && n <= 19; // Diners
    if (p2 === 62) return strict ? n === 16 : n >= 16 && n <= 19;                      // UnionPay
    if (!strict && p2 >= 50 && p2 <= 69) return n >= 12 && n <= 19;                    // Maestro & co.
    return false;
  }

  // The digits of a card number typed into a field, or null.
  function cardFrom(value, strict) {
    const s = String(value == null ? "" : value).trim();
    if (!s || s.length > 32 || /[^\d\s-]/.test(s)) return null;
    const d = s.replace(/\D/g, "");
    return d.length >= 12 && d.length <= 19 && brandOk(d, strict) && luhn(d) ? d : null;
  }

  // Does this field ask for a card number?
  const CARD_HINT = /card.?(number|num|no\b)|cc.?(number|num|no\b)|ccnum|cardnum|credit.?card|debit.?card|card.?details|\bpan\b|n[uú]mero.{0,8}(cart[aã]o|tarjeta|carte)|num[eé]ro.{0,8}carte|kartennummer|numero.{0,6}carta/i;
  function isCardField(el) {
    if (!el || el.tagName !== "INPUT") return false;
    if (/^(password|hidden|checkbox|radio|submit|button|file|date|email|search)$/i.test(el.type || "")) return false;
    const attr = (n) => (el.getAttribute && el.getAttribute(n)) || "";
    if (/cc-number/i.test(attr("autocomplete")) || /cc-number/i.test(attr("x-autocompletetype"))) return true;
    const bits = [el.name, el.id, el.placeholder, attr("aria-label"), attr("data-elements-stable-field-name"),
      el.labels && Array.from(el.labels).map((l) => l.textContent).join(" ")].filter(Boolean).join(" ");
    return CARD_HINT.test(bits);
  }

  // Payment providers that legitimately receive card numbers.
  const PAYMENT = [
    "stripe.com", "stripe.network", "paypal.com", "paypalobjects.com", "braintreegateway.com", "braintree-api.com",
    "adyen.com", "adyenpayments.com", "checkout.com", "squareup.com", "square.com", "squarecdn.com", "authorize.net",
    "worldpay.com", "cybersource.com", "opayo.co.uk", "sagepay.com", "globalpay.com", "realexpayments.com",
    "mollie.com", "klarna.com", "payu.com", "razorpay.com", "mercadopago.com", "paddle.com", "chargebee.com",
    "recurly.com", "shopify.com", "shopifycs.com", "amazonpay.com", "bluesnap.com", "nmi.com", "ingenico.com",
    "worldline.com", "nexi.it", "redsys.es", "sumup.com", "2checkout.com", "verifone.cloud", "bambora.com",
    "elavon.com", "firstdata.com", "clover.com", "payeezy.com", "paysafe.com", "dlocal.com", "ebanx.com",
    "sibs.pt", "easypay.pt", "ifthenpay.com", "multisafepay.com", "buckaroo.nl", "payone.com", "computop.com",
    "unzer.com", "hipay.com", "lyra.com", "payzen.eu", "monei.com", "paygate.co.za", "payfast.co.za", "yoco.com",
    "flutterwave.com", "paystack.co", "xendit.co", "midtrans.com", "omise.co", "conekta.com", "openpay.mx",
    "cardinalcommerce.com", "3dsecure.io", "pay.google.com", "payments.google.com", "apple.com",
    "spreedly.com", "verygoodproxy.com", "verygoodvault.com", "ewaypayments.com", "eway.com.au", "bigcommerce.com",
    "pinpayments.com", "myhelcim.com", "helcim.com", "moneris.com", "windcave.com", "paymentexpress.com", "ogone.com",
    "epdq.co.uk", "convergepay.com", "vantivcnp.com", "worldpay.us", "shopifyinc.com", "pagador.com.br", "cielo.com.br",
    "iugu.com", "wompi.co", "vivapayments.com", "vivawallet.com", "networkmerchants.com", "transactiongateway.com",
    "secure-payment-gateway.com", "payway.com.au", "westpac.com.au", "tyro.com", "securepay.com.au", "fatzebra.com",
    "payeezy.com", "fiserv.com", "globalpaymentsinc.com", "heartlandportico.com", "tsys.com", "evo-pay.com",
    "paymentus.com", "bambora.co.nz", "payplug.com", "stancer.com", "paybox.com", "systempay.fr", "monext.fr",
    "payline.com", "przelewy24.pl", "dotpay.pl", "tpay.com", "paysera.com", "montonio.com", "everypay.gr",
    "vivapayments.gr", "iyzipay.com", "paytr.com", "payfort.com", "telr.com", "checkout.ae", "paymob.com",
    "ccavenue.com", "billdesk.com", "cashfree.com", "paytm.in", "instamojo.com", "paymongo.com", "2c2p.com",
    "omise.co", "gmo-pg.com", "veritrans.co.jp", "komoju.com", "tosspayments.com", "inicis.com", "kcp.co.kr",
    "pagseguro.com.br", "pagar.me", "getnet.com.br", "rede.com.br", "stone.com.br", "payulatam.com", "culqi.com",
    "niubiz.com.pe", "transbank.cl", "flow.cl", "kushki.com", "openpay.co", "epayco.com", "placetopay.com",
    "dlocalgo.com", "authorizenet.com", "usaepay.com", "bluepay.com", "chasepaymentech.com", "paymentech.net",
    "payjunction.com", "qualpay.com", "payroc.com", "paya.com", "nuvei.com", "safecharge.com", "trustly.com",
    "ecommpay.com", "payoneer.com", "checkout.payment", "hyperpay.com", "tap.company", "moyasar.com",
  ];
  // Providers that run on many country domains (mercadopago.com.br, payu.in, adyen.com.au…).
  const PAYMENT_BRANDS = /(^|\.)(mercadopago|mercadolibre|payu|adyen|paypal|klarna|worldpay|razorpay|ingenico|nexi|ebanx|dlocal|paysafe|nuvei)\.[a-z.]{2,7}$/;
  const SLD = /^(co|com|net|org|gov|ac|edu|ne|or|go)$/;
  function siteOf(host) {
    const parts = String(host || "").toLowerCase().replace(/\.$/, "").split(".");
    if (parts.length >= 3 && SLD.test(parts[parts.length - 2]) && parts[parts.length - 1].length === 2) return parts.slice(-3).join(".");
    return parts.slice(-2).join(".");
  }
  const sameSite = (a, b) => !!a && siteOf(a) === siteOf(b);
  const isPaymentHost = (host) => {
    const h = String(host || "").toLowerCase();
    for (const p of PAYMENT) if (h === p || h.endsWith("." + p)) return true;
    return PAYMENT_BRANDS.test(h);
  };

  // Text the payload could hide a card in: raw, URL-decoded, base64-decoded chunks, reversed.
  // base64 chunks: whole runs (which may contain "/"), the pieces between "/" (base64 in a URL
  // path), each tried at all 4 offsets so a stray prefix letter doesn't throw decoding off.
  function b64decodes(text, out, depth) {
    const runs = text.match(/[A-Za-z0-9+/_-]{16,}={0,2}/g) || [];
    const chunks = [];
    for (const r of runs) { chunks.push(r); if (r.includes("/")) for (const p of r.split("/")) if (p.length >= 16) chunks.push(p); }
    let budget = 400;
    for (const c of chunks) {
      const norm = c.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
      for (let off = 0; off < 4 && budget > 0; off++, budget--) {
        let s = norm.slice(off); s = s.slice(0, s.length - (s.length % 4));
        if (s.length < 16) continue;
        let dec; try { dec = atob(s); } catch { continue; }
        out.push(dec);
        try { out.push(decodeURIComponent(dec)); } catch { /* fine */ }
        if (depth < 1 && /[A-Za-z0-9+/]{16,}/.test(dec)) b64decodes(dec, out, depth + 1);   // double base64
      }
      if (budget <= 0) break;
    }
  }
  function variants(text) {
    const out = [text];
    try { out.push(decodeURIComponent(text.replace(/\+/g, " "))); } catch { /* not URL-encoded */ }
    b64decodes(text, out, 0);
    return out;
  }

  function payloadHasCard(text, cards) {
    if (!cards || !cards.length || !text) return false;
    const vs = variants(String(text).slice(0, 200000));
    for (const v of vs) {
      const flat = v.replace(/[\s\-.,"'\\]/g, "");
      for (const c of cards) {
        const head = c.slice(0, -1);   // the last digit can be recomputed from the checksum
        if (flat.includes(head) || flat.includes(c.split("").reverse().join(""))) return true;
      }
    }
    return false;
  }

  // Should a request carrying `payload` to `destHost`, made by a page on `pageHost`, be stopped?
  function skimDecision(destHost, pageHost, payload, cards) {
    if (!cards || !cards.length || !destHost) return false;
    if (sameSite(destHost, pageHost) || isPaymentHost(destHost)) return false;
    return payloadHasCard(payload, cards);
  }

  const api = { luhn, brandOk, cardFrom, isCardField, siteOf, sameSite, isPaymentHost, payloadHasCard, skimDecision };
  if (typeof module !== "undefined") module.exports = api;
  else globalThis.PHPEEK_CARDS = api;
})();
