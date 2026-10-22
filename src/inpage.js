// PHPeek in-page relay (page's own JS world, document_start, before any page script runs).
//
// This file decides nothing. It snapshots wallet requests and clipboard writes and hands them to
// guard.js in the extension's isolated world, where the page can't tamper with anything.
// Every built-in it relies on is copied here before the page exists, and it avoids prototype
// methods on anything the page can reach (no .every/.includes/for-of on page arrays), so a page
// that later overrides RegExp/String/Array/Map/dispatchEvent/JSON can't steer it.
// It never reads keys, never signs anything, and never talks to the network.
(() => {
  "use strict";

  // ---- pristine built-ins (captured before any page script) -------------------------
  const apply = Reflect.apply;
  const getOwnDesc = Object.getOwnPropertyDescriptor;
  const defineProp = Object.defineProperty;
  const getProto = Object.getPrototypeOf;
  const hasOwn = Object.prototype.hasOwnProperty;
  const objCreate = Object.create;
  const isArray = Array.isArray;
  const stringify = JSON.stringify;
  const parse = JSON.parse;
  const clone = structuredClone;
  const toStr = String;
  const CE = CustomEvent;
  const PromiseC = Promise;
  const WeakSetC = WeakSet;
  const wsHas = WeakSet.prototype.has, wsAdd = WeakSet.prototype.add;
  const dispatch = EventTarget.prototype.dispatchEvent;
  const listen = EventTarget.prototype.addEventListener;
  const unlisten = EventTarget.prototype.removeEventListener;
  const detailOf = getOwnDesc(CustomEvent.prototype, "detail").get;
  const targetOf = getOwnDesc(Event.prototype, "target").get;
  const preventDefault = Event.prototype.preventDefault;
  const stopImmediate = Event.prototype.stopImmediatePropagation;
  const getter = (C, p) => { try { return getOwnDesc(C.prototype, p).get; } catch { return null; } };
  const clipboardDataOf = getter(typeof ClipboardEvent !== "undefined" ? ClipboardEvent : Object, "clipboardData");
  const querySel = Document.prototype.querySelector;
  const doc = document;
  const win = window;
  const timeout = setTimeout;
  const OBJ_PROTO = Object.prototype;
  const PROTOS = [Object.prototype, Array.prototype, String.prototype, Number.prototype, Boolean.prototype];

  const wsHasV = (s, v) => apply(wsHas, s, [v]);
  const wsAddV = (s, v) => apply(wsAdd, s, [v]);

  // JSON.stringify consults toJSON on prototypes; if a page planted one, refuse to relay (→ cancel).
  const jsonTampered = () => {
    for (let i = 0; i < PROTOS.length; i++) if (apply(hasOwn, PROTOS[i], ["toJSON"])) return true;
    return false;
  };

  // ---- private channel to guard.js ---------------------------------------------------
  let chan = null;
  let sync = null;                       // synchronous reply slot (guard answers inside dispatch)
  const waiting = objCreate(null);       // id -> resolve; null prototype, nothing to hook
  let seq = 0;

  let armed = false;                     // Card Guard: set once a card number has been typed on this page
  let armHook = null;
  function onReply(e) {
    let d; try { d = parse(apply(detailOf, e, [])); } catch { return; }
    if (!d) return;
    if (d.type === "arm") { armed = true; if (armHook) armHook(); }
    if (d.type === "sync") sync = d;
    if (d.type === "res" && waiting[d.id]) { const r = waiting[d.id]; waiting[d.id] = undefined; r(d.allow === true); }
  }

  function adopt(el) {
    if (chan || !el) return;
    chan = el;
    apply(listen, chan, ["phpeek:to-page", onReply]);
    apply(dispatch, chan, [new CE("phpeek:hello")]);
  }
  const ready = apply(querySel, doc, ["phpeek-channel"]);
  if (ready) adopt(ready);
  else apply(listen, win, ["phpeek:channel", (e) => adopt(apply(targetOf, e, [])), { capture: true, once: true }]);

  // Ask guard.js; it answers synchronously ({type:"sync"}) while the event is being dispatched.
  function call(payload) {
    if (!chan || jsonTampered()) return null;
    sync = null;
    try { apply(dispatch, chan, [new CE("phpeek:to-ext", { detail: stringify(payload) })]); } catch { return null; }
    const r = sync; sync = null;
    return r;
  }

  const rejection = () => { const e = new Error("PHPeek: request cancelled by the user"); e.code = 4001; return e; };

  // ---- wallet requests ---------------------------------------------------------------
  // Snapshot once (structuredClone runs any getters exactly once), let guard.js decide on the
  // snapshot, and send the *same* snapshot to the wallet. No check-then-swap tricks.

  // Returns { snap, state: "ok" | "deny" | "ask", id }.
  function gate(method, params) {
    let snap;
    try { snap = clone({ method, params }); } catch { return { state: "deny" }; }
    const id = `${++seq}`;
    const r = call({ type: "sig", id, method: snap.method, params: snap.params });
    if (!r || r.id !== id) return { state: "deny", snap };                // can't verify → cancel
    return { state: r.verdict === "allow" ? "ok" : "ask", snap, id };
  }

  // Wait for the user's decision with a plain callback. No await/then on promises here:
  // a page can override Promise.prototype.then/constructor and answer for us.
  function whenDecided(g, cont) {
    if (g.state === "ok") return cont(true);
    if (g.state === "deny") return cont(false);
    waiting[g.id] = cont;
  }

  const wrappedFns = new WeakSetC();
  const wrappedObjs = new WeakSetC();

  function makeRequest(inner) {
    const fn = function (args) {
      const self = this;
      const g = gate(args && args.method, args && args.params);
      return new PromiseC((resolve, reject) => {
        whenDecided(g, (allow) => {
          if (!allow) return reject(rejection());
          try { resolve(apply(inner.current, self, [g.snap])); } catch (err) { reject(err); }
        });
      });
    };
    wsAddV(wrappedFns, fn);
    return fn;
  }

  function makeLegacy(inner) {
    const fn = function (payload, cb) {
      // Snapshot the batch into our own array by index (page arrays can lie through iterators).
      const items = [];
      if (isArray(payload)) { const n = payload.length; for (let i = 0; i < n; i++) items[i] = payload[i]; }
      else items[0] = typeof payload === "string" ? { method: payload, params: cb } : payload;
      const gates = [];
      let allOk = true;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        gates[i] = gate(it && it.method, it && it.params);
        if (gates[i].state !== "ok") allOk = false;
      }
      // Forward the snapshots, never the page's original objects.
      let first;
      if (isArray(payload)) {
        first = [];
        for (let i = 0; i < gates.length; i++) first[i] = { ...(items[i] || {}), ...(gates[i].snap || {}) };
      } else {
        first = typeof payload === "object" && payload ? { ...payload, ...(gates[0].snap || {}) } : payload;
      }
      const args = [first, cb];
      const self = this;
      if (allOk) return apply(inner.current, self, args);
      const run = new PromiseC((resolve, reject) => {
        let i = 0;
        const next = (allow) => {
          if (!allow) return reject(rejection());
          if (++i >= gates.length) { try { resolve(apply(inner.current, self, args)); } catch (err) { reject(err); } return; }
          whenDecided(gates[i], next);
        };
        whenDecided(gates[0], next);
      });
      if (typeof cb === "function" && typeof payload === "object") {
        run.catch((err) => cb(err, null));
        return undefined;
      }
      return run;
    };
    wsAddV(wrappedFns, fn);
    return fn;
  }

  // An accessor instead of a locked value: libraries that re-assign provider.request still work
  // (whatever they assign is guarded too), and the page can't delete or redefine the guard.
  function guardProp(owner, name, make) {
    const d = getOwnDesc(owner, name);
    if (!d || typeof d.value !== "function" || wsHasV(wrappedFns, d.value) || !d.configurable) return;
    const inner = { current: d.value };
    const wrapper = make(inner);
    try {
      defineProp(owner, name, {
        configurable: false,
        enumerable: d.enumerable,
        get: () => wrapper,
        set: (v) => { if (typeof v === "function" && !wsHasV(wrappedFns, v)) inner.current = v; },
      });
    } catch { /* leave it */ }
  }

  const METHODS = [["request", makeRequest], ["send", makeLegacy], ["sendAsync", makeLegacy]];

  function wrapProvider(p) {
    if (!p || typeof p !== "object" || wsHasV(wrappedObjs, p)) return;
    wsAddV(wrappedObjs, p);
    for (let m = 0; m < METHODS.length; m++) {
      for (let o = p; o && o !== OBJ_PROTO; o = getProto(o)) {
        if (apply(hasOwn, o, [METHODS[m][0]])) guardProp(o, METHODS[m][0], METHODS[m][1]);
      }
    }
    try {
      const list = p.providers;
      if (isArray(list)) for (let i = 0; i < list.length; i++) wrapProvider(list[i]);
    } catch { /* ignore */ }
  }

  const check = () => { try { wrapProvider(win.ethereum); } catch { /* ignore */ } };
  check();
  apply(listen, doc, ["DOMContentLoaded", check]);
  apply(listen, win, ["load", check]);
  timeout(check, 1000);
  timeout(check, 3000);
  apply(listen, win, ["eip6963:announceProvider", (e) => {
    try { const d = apply(detailOf, e, []); wrapProvider(d && d.provider); } catch { /* ignore */ }
  }, true]);

  // ---- clipboard (ClickFix) -----------------------------------------------------------

  const SAFE = "⚠️ PHPeek blocked a suspicious command from this website. Do NOT run anything a website asks you to paste into Run, Terminal or PowerShell.";

  // guard.js decides synchronously (and checks whether the text is shown in a visible code block).
  // If guard.js can't be reached, we let the copy through rather than break every copy button.
  const decideClip = (payload) => {
    if (payload.text === SAFE) return false;
    const r = call(payload);
    return !!(r && r.block === true);
  };

  function lockMethod(proto, name, make) {
    const d = getOwnDesc(proto, name);
    if (!d || typeof d.value !== "function") return;
    try { defineProp(proto, name, { value: make(d.value), configurable: false, writable: false, enumerable: d.enumerable }); } catch { /* ignore */ }
  }

  try {
    lockMethod(Clipboard.prototype, "writeText", (orig) => function (text) {
      const s = toStr(text);                                 // convert once: no toString switcheroo
      return apply(orig, this, [decideClip({ type: "clip", via: "writeText", text: s }) ? SAFE : s]);
    });
    if (typeof ClipboardItem !== "undefined") {
      const CI = ClipboardItem, BlobC = Blob;
      const typesOf = getter(ClipboardItem, "types");
      const getType = ClipboardItem.prototype.getType;
      const blobText = Blob.prototype.text;
      lockMethod(Clipboard.prototype, "write", (orig) => async function (items) {
        const list = [];
        const n = (items && items.length) | 0;
        for (let i = 0; i < n; i++) list[i] = items[i];
        for (let i = 0; i < list.length; i++) {
          let types; try { types = apply(typesOf, list[i], []); } catch { continue; }
          let hasText = false;
          for (let j = 0; j < types.length; j++) if (types[j] === "text/plain") hasText = true;
          if (!hasText) continue;
          const text = toStr(await apply(blobText, await apply(getType, list[i], ["text/plain"]), []));
          // Write our own item built from the text we checked, never the page's object.
          const out = decideClip({ type: "clip", via: "write", text }) ? SAFE : text;
          return apply(orig, this, [[new CI({ "text/plain": new BlobC([out], { type: "text/plain" }) })]]);
        }
        return apply(orig, this, [list]);
      });
    }
  } catch { /* clipboard API unavailable (insecure context) */ }

  try {
    const origSetData = DataTransfer.prototype.setData;
    lockMethod(Document.prototype, "execCommand", (orig) => function (cmd, ...rest) {
      const c = toStr(cmd);
      // guard.js reads the selection itself (isolated world) and tells us whether to swap it.
      if (decideClip({ type: "clip", via: "execCommand", cmd: c, text: "" })) {
        const swap = (e) => {
          const cd = clipboardDataOf ? apply(clipboardDataOf, e, []) : null;
          if (cd) apply(origSetData, cd, ["text/plain", SAFE]);
          apply(preventDefault, e, []);
          apply(stopImmediate, e, []);
        };
        apply(listen, doc, ["copy", swap, { capture: true, once: true }]);
        try { return apply(orig, this, [c, ...rest]); } finally { apply(unlisten, doc, ["copy", swap, true]); }
      }
      return apply(orig, this, [c, ...rest]);
    });
    lockMethod(DataTransfer.prototype, "setData", (orig) => function (format, data) {
      const f = toStr(format), s = toStr(data);
      return apply(orig, this, [f, decideClip({ type: "clip", via: "setData", format: f, text: s }) ? SAFE : s]);
    });
  } catch { /* ignore */ }

  // ---- Card Guard: anti-skimmer ---------------------------------------------------------
  // Nothing here runs until guard.js sees a real card number typed on this page ("arm"). Then the
  // ways a script can send data out (fetch, XHR, beacons, WebSockets, EventSource, image/script/
  // frame URLs, HTML injection, forms, window.open) are shown to guard.js first; requests carrying
  // your card to a site that's neither this store nor a payment provider fail like a network error.
  // fetch is wrapped up front (scripts often keep a reference to it); everything else is looked up
  // at call time, so it's wrapped only once armed and pages without a card are left untouched.
  // Wrappers stay writable so libraries that patch fetch/XHR (Sentry, Zone.js…) keep working.
  const USPC = typeof URLSearchParams !== "undefined" ? URLSearchParams : null;
  const USPtoString = USPC ? URLSearchParams.prototype.toString : null;
  const FormDataC = typeof FormData !== "undefined" ? FormData : null;
  const fdEntries = FormDataC ? FormData.prototype.entries : null;
  const fdIterNext = FormDataC ? getProto(apply(fdEntries, new FormDataC(), [])).next : null;
  const decoder = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;
  const decode = decoder ? TextDecoder.prototype.decode : null;
  const ABview = ArrayBuffer.isView;
  const ABC = ArrayBuffer, U8 = Uint8Array, u8slice = Uint8Array.prototype.subarray;
  const BlobC = typeof Blob !== "undefined" ? Blob : null;
  const blobText = BlobC ? Blob.prototype.text : null;
  const RequestC = typeof Request !== "undefined" ? Request : null;
  const requestUrl = RequestC ? getter(Request, "url") : null;
  const requestClone = RequestC ? Request.prototype.clone : null;
  const requestText = RequestC ? Request.prototype.text : null;
  const PE = typeof ProgressEvent !== "undefined" ? ProgressEvent : Event;
  const queue = typeof queueMicrotask === "function" ? queueMicrotask : (f) => timeout(f, 0);
  const reflectConstruct = Reflect.construct;
  const promThen = Promise.prototype.then;
  const setProto = Object.setPrototypeOf;   // keeps WebSocket.OPEN & co. on the wrapper
  const matchAll = (re, str) => { const out = []; let m; re.lastIndex = 0; while ((m = re.exec(str)) && out.length < 50) out[out.length] = m[1]; return out; };
  const instOf = (x, C) => { try { return !!C && x instanceof C; } catch { return false; } };
  const LIMIT = 200000;

  function bodyText(b) {
    try {
      if (b == null) return "";
      if (typeof b === "string") return b.length > LIMIT ? b.slice(0, LIMIT) : b;
      if (USPC && instOf(b, USPC)) return apply(USPtoString, b, []);
      if (FormDataC && instOf(b, FormDataC)) {
        const it = apply(fdEntries, b, []); let out = "";
        for (let i = 0; i < 500; i++) {
          const r = apply(fdIterNext, it, []);
          if (r.done) break;
          if (typeof r.value[1] === "string") out += r.value[0] + "=" + r.value[1] + "&";
        }
        return out;
      }
      if (decode && (instOf(b, ABC) || ABview(b))) {
        const u = instOf(b, ABC) ? new U8(b) : new U8(b.buffer, b.byteOffset, b.byteLength);
        return apply(decode, decoder, [apply(u8slice, u, [0, LIMIT])]);
      }
    } catch { /* unreadable body: judge by URL only */ }
    return "";
  }
  const urlOf = (x) => { try { return typeof x === "string" ? x : (RequestC && instOf(x, RequestC) ? apply(requestUrl, x, []) : toStr(x)); } catch { return ""; } };

  // true = block.
  function skim(url, body) {
    if (!armed) return false;
    const r = call({ type: "net", url: urlOf(url), data: typeof body === "string" ? body : bodyText(body) });
    return !!(r && r.block === true);
  }
  const ATTR_URL = /(?:src|href|action|srcset|poster|data|formaction|background)\s*=\s*["']?([^"'\s>]+)/gi;
  const CSS_URL = /url\(\s*["']?([^"')]+)/gi;
  function skimHtml(html) {
    if (!armed) return false;
    const h = toStr(html);
    const urls = matchAll(ATTR_URL, h);
    const css = matchAll(CSS_URL, h);
    for (let i = 0; i < css.length; i++) urls[urls.length] = css[i];
    // The whole snippet is the payload: the card can sit anywhere in it (even with spaces in a quoted URL).
    const body = h.length > LIMIT ? h.slice(0, LIMIT) : h;
    for (let i = 0; i < urls.length; i++) if (skim(urls[i], body)) return true;
    return false;
  }

  const keepShape = (fn, orig) => {
    try { defineProp(fn, "name", { value: orig.name }); defineProp(fn, "length", { value: orig.length }); } catch { /* ignore */ }
    return fn;
  };
  function wrapOwn(owner, name, make) {
    const d = getOwnDesc(owner, name);
    if (!d || typeof d.value !== "function") return;
    try { defineProp(owner, name, { value: keepShape(make(d.value), d.value), writable: true, configurable: true, enumerable: d.enumerable }); } catch { /* ignore */ }
  }
  function wrapSetter(proto, name, check) {
    const d = getOwnDesc(proto, name);
    if (!d || typeof d.set !== "function") return;
    const set = d.set;
    try {
      defineProp(proto, name, { get: d.get, set: keepShape(function (v) { if (check(v)) return; return apply(set, this, [v]); }, set),
        configurable: true, enumerable: d.enumerable });
    } catch { /* ignore */ }
  }

  // fetch: wrapped from the start. Blob / Request bodies are read before deciding (fetch is async anyway).
  try {
    const netError = () => PromiseC.reject(new TypeError("Failed to fetch"));
    wrapOwn(win, "fetch", (orig) => function (input, init) {
      if (!armed) return apply(orig, this, [input, init]);
      const self = this;
      let body = null; try { body = init && init.body; } catch { body = null; }
      const isBlob = BlobC && instOf(body, BlobC);
      const isReq = RequestC && instOf(input, RequestC) && body == null;
      if (!isBlob && !isReq) return skim(input, body) ? netError() : apply(orig, self, [input, init]);
      return new PromiseC((resolve, reject) => {
        let p;
        try { p = isBlob ? apply(blobText, body, []) : apply(requestText, apply(requestClone, input, []), []); } catch { p = null; }
        const go = (text) => {
          if (skim(input, typeof text === "string" ? text.slice(0, LIMIT) : "")) return reject(new TypeError("Failed to fetch"));
          try { resolve(apply(orig, self, [input, init])); } catch (err) { reject(err); }
        };
        if (!p) return go("");
        apply(promThen, p, [go, () => go("")]);
      });
    });
  } catch { /* ignore */ }

  // XHR.open is wrapped up front too, so a request opened before you typed your card and sent
  // after is still checked against the right destination.
  const xhrUrl = new WeakMap(), wmSet = WeakMap.prototype.set, wmGet = WeakMap.prototype.get;
  try {
    wrapOwn(XMLHttpRequest.prototype, "open", (orig) => function (...args) {
      try { apply(wmSet, xhrUrl, [this, toStr(args[1])]); } catch { /* ignore */ }
      return apply(orig, this, args);
    });
  } catch { /* ignore */ }

  let installed = false;
  function installRest() {
    if (installed) return;
    installed = true;
    try {
      wrapOwn(XMLHttpRequest.prototype, "send", (orig) => function (...args) {
        if (skim(apply(wmGet, xhrUrl, [this]) || "", args[0])) {
          // Fail the way a dead network does, so the page's error handling runs instead of hanging.
          const x = this;
          queue(() => { try { apply(dispatch, x, [new PE("error")]); apply(dispatch, x, [new PE("loadend")]); } catch { /* ignore */ } });
          return undefined;
        }
        return apply(orig, this, args);
      });
      if (typeof Navigator !== "undefined") wrapOwn(Navigator.prototype, "sendBeacon", (orig) => function (...args) {
        const self = this;
        if (BlobC && instOf(args[1], BlobC)) {
          // A Blob can only be read asynchronously: say "queued", read it, then send it if clean.
          let p; try { p = apply(blobText, args[1], []); } catch { p = null; }
          if (!p) return apply(orig, self, args);
          apply(promThen, p, [(text) => { if (!skim(args[0], toStr(text).slice(0, LIMIT))) apply(orig, self, args); }, () => apply(orig, self, args)]);
          return true;
        }
        if (skim(args[0], args[1])) return false;
        return apply(orig, self, args);
      });
      if (typeof WebSocket !== "undefined") {
        const wsUrl = getter(WebSocket, "url");
        wrapOwn(WebSocket.prototype, "send", (orig) => function (...args) {
          let u = ""; try { u = apply(wsUrl, this, []); } catch { /* ignore */ }
          if (skim(u, args[0])) return undefined;
          return apply(orig, this, args);
        });
      }
      const CTORS = ["WebSocket", "EventSource"];
      for (let ci = 0; ci < CTORS.length; ci++) {
        const C = CTORS[ci];
        const Orig = win[C];
        if (typeof Orig !== "function") continue;
        const W = keepShape(function (...args) {
          if (skim(urlOf(args[0]), "")) throw new DOMException("Failed to construct", "SecurityError");
          return reflectConstruct(Orig, args, new.target || Orig);
        }, Orig);
        try { W.prototype = Orig.prototype; setProto(W, Orig); defineProp(win, C, { value: W, writable: true, configurable: true }); } catch { /* ignore */ }
      }
      const urlCheck = (v) => skim(toStr(v), "");
      wrapSetter(HTMLImageElement.prototype, "src", urlCheck);
      wrapSetter(HTMLImageElement.prototype, "srcset", urlCheck);
      wrapSetter(HTMLScriptElement.prototype, "src", urlCheck);
      wrapSetter(HTMLIFrameElement.prototype, "src", urlCheck);
      wrapSetter(HTMLLinkElement.prototype, "href", urlCheck);
      wrapSetter(HTMLFormElement.prototype, "action", urlCheck);
      wrapSetter(Element.prototype, "innerHTML", skimHtml);
      wrapSetter(Element.prototype, "outerHTML", skimHtml);
      const URLISH = { src: 1, href: 1, action: 1, data: 1, srcset: 1, ping: 1, formaction: 1, poster: 1, background: 1, style: 1 };
      wrapOwn(Element.prototype, "setAttribute", (orig) => function (...args) {
        if (args.length >= 2) {
          const n = toStr(args[0]).toLowerCase();
          if (URLISH[n] === 1 && (n === "style" ? skimHtml(toStr(args[1])) : skim(toStr(args[1]), ""))) return undefined;
        }
        return apply(orig, this, args);
      });
      wrapOwn(Element.prototype, "insertAdjacentHTML", (orig) => function (...args) {
        if (skimHtml(args[1])) return undefined;
        return apply(orig, this, args);
      });
      wrapOwn(Document.prototype, "write", (orig) => function (...args) {
        for (let i = 0; i < args.length; i++) if (skimHtml(args[i])) return undefined;
        return apply(orig, this, args);
      });
      const formAction = getter(HTMLFormElement, "action");
      wrapOwn(HTMLFormElement.prototype, "submit", (orig) => function () {
        if (FormDataC) {
          let act = ""; try { act = apply(formAction, this, []); } catch { /* ignore */ }
          let fd = null; try { fd = new FormDataC(this); } catch { /* ignore */ }
          if (skim(act, fd)) return undefined;
        }
        return apply(orig, this, []);
      });
      wrapOwn(win, "open", (orig) => function (...args) {
        if (args.length && skim(toStr(args[0]), "")) return null;
        return apply(orig, this, args);
      });
    } catch { /* ignore */ }
  }
  armHook = installRest;
})();
