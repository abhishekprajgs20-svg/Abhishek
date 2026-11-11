/* ABHISHEK: har tool ke liye alag storage + Android me file save/share */
(function () {
  if (window.__abhishekShim) return;
  window.__abhishekShim = true;

  var ns = window.__TOOL_NS || (function () {
    var m = location.pathname.match(/\/tools\/([^\/]+?)(?:\.html?)?$/i);
    return 't_' + (m ? m[1] : 'x') + ':';
  })();

  /* 1) localStorage: har tool ka apna hissa (tools ek-dusre ka data nahi todte) */
  try {
    var real = window.localStorage, P = ns;
    var keys = function () {
      var out = [];
      for (var i = 0; i < real.length; i++) {
        var k = real.key(i);
        if (k && k.indexOf(P) === 0) out.push(k.slice(P.length));
      }
      return out;
    };
    var api = {
      getItem: function (k) { return real.getItem(P + k); },
      setItem: function (k, v) { real.setItem(P + k, v); },
      removeItem: function (k) { real.removeItem(P + k); },
      clear: function () { keys().forEach(function (k) { real.removeItem(P + k); }); },
      key: function (i) { var ks = keys(); return i < ks.length ? ks[i] : null; }
    };
    var proxy = new Proxy(api, {
      get: function (t, p) {
        if (p === 'length') return keys().length;
        if (typeof p === 'symbol') return undefined;
        if (p in api) return api[p];
        var v = real.getItem(P + p);
        return v === null ? undefined : v;
      },
      set: function (t, p, v) { real.setItem(P + p, String(v)); return true; },
      deleteProperty: function (t, p) { real.removeItem(P + p); return true; },
      has: function (t, p) { return (p in api) || real.getItem(P + p) !== null; },
      ownKeys: function () { return keys(); },
      getOwnPropertyDescriptor: function (t, p) {
        if (typeof p === 'string' && real.getItem(P + p) !== null)
          return { value: real.getItem(P + p), writable: true, enumerable: true, configurable: true };
        return undefined;
      }
    });
    Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { return proxy; } });
  } catch (e) {}

  /* 2) IndexedDB: har tool ka apna database naam */
  try {
    var iopen = IDBFactory.prototype.open, idel = IDBFactory.prototype.deleteDatabase;
    IDBFactory.prototype.open = function (name, ver) {
      return arguments.length > 1 ? iopen.call(this, ns + name, ver) : iopen.call(this, ns + name);
    };
    IDBFactory.prototype.deleteDatabase = function (name) { return idel.call(this, ns + name); };
  } catch (e) {}

  /* 3) Android: download hone wali file ko save + share menu se do */
  var cap = null;
  try { cap = (window.parent && window.parent.Capacitor) || window.Capacitor; } catch (e) { cap = window.Capacitor; }
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;

  function toBase64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onloadend = function () { res(String(r.result).split(',')[1] || ''); };
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }
  async function saveAndShare(href, name) {
    try {
      var blob = await (await fetch(href)).blob();
      var data = await toBase64(blob);
      var fileName = (name || 'abhishek_file').replace(/[\\/:*?"<>|]/g, '_');
      var out = await cap.Plugins.Filesystem.writeFile({ path: fileName, data: data, directory: 'CACHE' });
      await cap.Plugins.Share.share({ title: fileName, url: out.uri, dialogTitle: 'Save / Share: ' + fileName });
    } catch (e) {
      if (e && /cancel/i.test(String(e.message || e))) return;
      alert('File save nahi ho payi: ' + (e && e.message ? e.message : e));
    }
  }
  function isDl(a) {
    return a instanceof HTMLAnchorElement && a.hasAttribute('download') && /^(blob:|data:)/.test(a.href);
  }
  var oc = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (isDl(this)) { saveAndShare(this.href, this.getAttribute('download')); return; }
    return oc.apply(this, arguments);
  };
  var od = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (ev) {
    if (ev && ev.type === 'click' && isDl(this)) { saveAndShare(this.href, this.getAttribute('download')); return true; }
    return od.apply(this, arguments);
  };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[download]');
    if (a && isDl(a)) { e.preventDefault(); saveAndShare(a.href, a.getAttribute('download')); }
  }, true);
})();
