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

  function onReply(e) {
    let d; try { d = parse(apply(detailOf, e, [])); } catch { return; }
    if (!d) return;
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
})();
