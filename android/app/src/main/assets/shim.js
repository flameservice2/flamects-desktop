/* Flame CTS for Android: connects the page to the phone. Added to the page
   by the app before anything else runs. */
(function () {
  var A = window.FlameAndroid;
  if (!A) return;
  var cbs = {}, n = 0, readyCbs = [], readyVer = '';
  window.__flameCb = function (id, ok, val) {
    var c = cbs[id]; delete cbs[id];
    if (c) { if (ok) c.res(val); else c.rej(new Error(val || 'failed')); }
  };
  function call(fn) { return new Promise(function (res, rej) { var id = 'c' + (++n); cbs[id] = { res: res, rej: rej }; fn(id); }); }
  window.__flameUpdateReady = function (v) {
    readyVer = v;
    readyCbs.forEach(function (cb) { try { cb(v); } catch (e) {} });
  };
  function landscape() { var o = document.getElementById('print-orientation'); return !!(o && /landscape/.test(o.textContent)); }

  // Same names the PC app offers, so the page's Update bar and quotation
  // sharing work here too.
  window.flameDesktop = {
    android: true,
    checkForUpdates: function () { A.checkForUpdates(); return Promise.resolve(true); },
    restartToUpdate: function () { A.restartToUpdate(); return Promise.resolve(true); },
    onUpdateReady: function (cb) { readyCbs.push(cb); if (readyVer) cb(readyVer); },
    savePdf: function (name) { return call(function (id) { A.savePdf(String(name || 'document'), landscape(), id); }); },
    showFile: function () { return Promise.resolve(); },
    sharePdf: function (file, kind, to, subject, text) { A.sharePdf(String(file), String(kind), String(to || ''), String(subject || ''), String(text || '')); return Promise.resolve(true); },
    info: function () { try { return JSON.parse(A.info()); } catch (e) { return {}; } }
  };

  window.print = function () { A.print(document.title || 'Flame CTS', landscape()); };
  window.open = function (u) { if (u) A.openExternal(String(u)); return null; };

  // Downloads (Excel / PDF exports): the page makes a blob and clicks a
  // download link; hand the file to the phone instead.
  var blobs = {};
  var mk = URL.createObjectURL;
  URL.createObjectURL = function (o) {
    var u = mk.apply(URL, arguments);
    if (o instanceof Blob) blobs[u] = o;
    return u;
  };
  function send(blob, name) {
    var r = new FileReader();
    r.onload = function () { A.saveFile(name, blob.type || '', String(r.result).split(',')[1] || ''); };
    r.readAsDataURL(blob);
  }
  function grab(a) {
    var h = a.getAttribute('href') || '';
    if (!/^(blob|data):/.test(h)) return false;
    var name = a.getAttribute('download') || 'download';
    if (blobs[h]) send(blobs[h], name);
    else fetch(h).then(function (r) { return r.blob(); }).then(function (b) { send(b, name); });
    return true;
  }
  var click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (grab(this)) return; return click.apply(this, arguments); };
  var dispatch = EventTarget.prototype.dispatchEvent;
  HTMLAnchorElement.prototype.dispatchEvent = function (e) { if (e && e.type === 'click' && grab(this)) return false; return dispatch.apply(this, arguments); };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (a && grab(a)) e.preventDefault();
  }, true);

  // Phone Back button: close a dialog, then the menu, then go to the Dashboard.
  window.__flameBack = function () {
    var x = document.querySelector('.modal .x');
    if (x && x.offsetParent !== null) { x.click(); return true; }
    var sb = document.getElementById('sidebar'), scrim = document.getElementById('scrim');
    if (sb && sb.classList.contains('open')) { sb.classList.remove('open'); if (scrim) scrim.classList.remove('show'); return true; }
    var app = document.getElementById('app');
    if (app && app.style.display === 'block' && typeof nav === 'function' && typeof PAGE !== 'undefined' && PAGE !== 'dashboard') { nav('dashboard'); return true; }
    return false;
  };
})();
