/* =====================================================================
   LIVE SAVE — Save button on every page + safe saving for several users
   ---------------------------------------------------------------------
   All business data lives in one shared record (app_meta / app_state),
   and every save writes the whole record. On its own that means when two
   people work at the same time, whoever saves last silently overwrites
   the other person's changes. This layer fixes that:

   - Before each save it re-reads the shared record. If someone else has
     saved since this device last synced, their changes and ours are
     merged record-by-record (by id) instead of ours replacing theirs.
   - Every save is stamped with a revision, who saved it and when.
   - A Save button (and Ctrl+S) on every page sends everything now and
     confirms it reached the shared database.
   - Other users' saves are picked up live (realtime), with a fallback
     check every 15 seconds and whenever the window regains focus.
   ===================================================================== */
(function(){
  const BASE_KEY = 'flame_erp_base_v1';
  const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const isObj = o => o !== null && typeof o === 'object' && !Array.isArray(o);
  const isMetaKey = k => k === '_rev' || k === '_savedBy' || k === '_savedAt';
  const newRev = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const hasIds = a => Array.isArray(a) && a.length > 0 && a.every(x => isObj(x) && x.id != null);

  // "base" = the last version this device knows is in the shared database.
  // It's what lets a save tell "I changed this" apart from "they changed this".
  let base = null;
  try { const raw = localStorage.getItem(BASE_KEY); if (raw) base = JSON.parse(raw); } catch (e) {}
  let lastSavedRev = null;
  function setBase(v){
    base = clone(v);
    try { localStorage.setItem(BASE_KEY, JSON.stringify(v)); } catch (e) {}
  }

  /* ---------------- three-way merge ---------------- */
  function merge3(b, o, t){
    if (same(o, t)) return o;
    if (same(o, b)) return clone(t);   // only they changed it
    if (same(t, b)) return o;          // only we changed it
    if (Array.isArray(o) && Array.isArray(t)){
      if (hasIds(o) || hasIds(t) || hasIds(b)) return mergeById(Array.isArray(b) ? b : [], o, t);
      if (o.every(x => !isObj(x) && !Array.isArray(x)) && t.every(x => !isObj(x) && !Array.isArray(x))) {
        // simple lists (names, categories): keep ours, add what they added, drop what they removed
        const bb = Array.isArray(b) ? b : [];
        const out = o.filter(x => !(bb.includes(x) && !t.includes(x)));
        t.forEach(x => { if (!bb.includes(x) && !out.includes(x)) out.push(x); });
        return out;
      }
      return o;
    }
    if (isObj(o) && isObj(t)){
      const bb = isObj(b) ? b : {};
      const out = {};
      new Set([...Object.keys(o), ...Object.keys(t)]).forEach(k => {
        if (isMetaKey(k)) { out[k] = o[k]; return; }
        const inO = k in o, inT = k in t, inB = k in bb;
        if (inO && inT) out[k] = merge3(bb[k], o[k], t[k]);
        else if (inO) { if (!(inB && same(o[k], bb[k]))) out[k] = o[k]; }   // they removed it; keep only if we edited it
        else          { if (!(inB && same(t[k], bb[k]))) out[k] = t[k]; }   // we removed it; keep only if they edited it
      });
      return out;
    }
    return o;   // same single value changed on both sides: the newest save wins
  }
  function mergeById(b, o, t){
    const index = a => new Map(a.filter(x => isObj(x) && x.id != null).map(x => [x.id, x]));
    const B = index(b), O = index(o), T = index(t);
    const pick = id => {
      const inB = B.has(id), inO = O.has(id), inT = T.has(id);
      if (inO && inT) return merge3(B.get(id), O.get(id), T.get(id));
      if (inO) return (inB && same(O.get(id), B.get(id))) ? undefined : O.get(id);
      return (inB && same(T.get(id), B.get(id))) ? undefined : T.get(id);
    };
    const out = [], seen = new Set();
    o.forEach(x => {
      if (!(isObj(x) && x.id != null)) { out.push(x); return; }
      seen.add(x.id); const v = pick(x.id); if (v !== undefined) out.push(v);
    });
    // records only they added: put them where they put them (top or bottom)
    const theirsNew = t.filter(x => isObj(x) && x.id != null && !seen.has(x.id) && !B.has(x.id));
    const theirsKept = t.filter(x => isObj(x) && x.id != null && !seen.has(x.id) && B.has(x.id));
    theirsKept.forEach(x => { const v = pick(x.id); if (v !== undefined) out.push(v); });
    if (theirsNew.length){
      const firstOld = t.findIndex(x => isObj(x) && B.has(x.id));
      const atTop = firstOld !== -1 && t.indexOf(theirsNew[0]) < firstOld;
      if (atTop) out.unshift(...theirsNew); else out.push(...theirsNew);
    }
    return out;
  }
  window.__flameMerge3 = merge3;

  /* ---------------- safer load / save ---------------- */
  const origLoad = Store.loadRemote.bind(Store);
  Store.loadRemote = async function(){
    const v = await origLoad();
    if (v) setBase(v);
    return v;
  };
  Store.saveRemote = async function(data){
    const sent = JSON.stringify(data);
    const who = (typeof MY_PROFILE !== 'undefined' && MY_PROFILE && MY_PROFILE.name) || '';
    let out, theirs, mergedIn = false, ours = data;
    for (let attempt = 0; ; attempt++){
      const { data: row, error } = await sb.from('app_meta').select('value').eq('key', 'app_state').maybeSingle();
      if (error) throw error;
      theirs = row ? row.value : null;
      out = ours;
      if (theirs && !same(theirs, base)) {
        // Someone else saved since we last synced: combine instead of overwrite.
        out = merge3(base || {}, ours, theirs);
        mergedIn = mergedIn || !same(out, ours);
      }
      out._rev = newRev(); out._savedBy = who; out._savedAt = new Date().toISOString();
      lastSavedRev = out._rev;
      if (!theirs) {
        const { error: upErr } = await sb.from('app_meta').upsert({ key: 'app_state', value: out });
        if (upErr) throw upErr;
        break;
      }
      // Only write if the record is still exactly what we just read. If
      // someone saved in the meantime, nothing is written and we go round
      // again, merging their newer save in first.
      let q = sb.from('app_meta').update({ value: out }).eq('key', 'app_state');
      q = theirs._rev ? q.eq('value->>_rev', theirs._rev) : q.is('value->>_rev', null);
      const { data: rows, error: upErr } = await q.select('key');
      if (upErr) throw upErr;
      if (rows && rows.length) break;
      if (attempt >= 5) throw new Error('The shared data kept changing while saving. Please press Save again.');
      setBase(theirs); ours = out;
      await new Promise(r => setTimeout(r, 150 + Math.random() * 400));
    }
    setBase(out);
    if (data === S && out !== data) {
      // If edits were made while this save was in flight, keep them too.
      S = JSON.stringify(S) === sent ? out
        : Object.assign(merge3(JSON.parse(sent), S, out), {_rev: out._rev, _savedBy: out._savedBy, _savedAt: out._savedAt});
      Store.cacheWrite(S);
    }
    if (data === S || out === S) {
      if (mergedIn && MY_PROFILE) { render(); toast('Combined with changes ' + (theirs && theirs._savedBy || 'another user') + ' saved.'); }
    }
    refreshBar();
  };

  /* ---------------- picking up other people's saves ---------------- */
  function adoptRemote(v){
    if (!v || savePending) return;
    if (v._rev && v._rev === lastSavedRev && S && S._rev === v._rev) return;   // our own save echoing back
    if (same(v, S)) { setBase(v); return; }
    setBase(v);
    S = v;
    Store.cacheWrite(S);
    if (MY_PROFILE) render();
    if (v._savedBy) toast('Updated live — ' + v._savedBy + ' saved changes.');
    refreshBar();
  }
  let liveChan = null;
  function listen(){
    if (liveChan || !window.sb) return;
    liveChan = sb.channel('flame-live-save')
      .on('postgres_changes', {event:'*', schema:'public', table:'app_meta', filter:'key=eq.app_state'}, p => {
        if (p.new && p.new.value) adoptRemote(p.new.value);
      })
      .subscribe();
  }
  let checking = false;
  async function checkForUpdates(){
    if (checking || !S || savePending || !MY_PROFILE) return;
    checking = true;
    try{
      const { data, error } = await sb.from('app_meta').select('rev:value->>_rev').eq('key', 'app_state').maybeSingle();
      if (!error && data && data.rev && data.rev !== S._rev) {
        const v = await origLoad();
        adoptRemote(v);
      }
    }catch(e){}
    checking = false;
  }
  setInterval(checkForUpdates, 15000);
  window.addEventListener('focus', checkForUpdates);

  /* ---------------- Save button ---------------- */
  const bar = document.createElement('div');
  bar.id = 'fx-savebar';
  bar.innerHTML = '<span id="fx-status"></span><span id="fx-last"></span>' +
    '<button type="button" class="btn fire fx-save" title="Save and send to everyone (Ctrl+S)">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>Save</button>';
  const app = document.getElementById('app');
  app.insertBefore(bar, document.getElementById('main'));
  const mBtn = document.createElement('button');
  mBtn.type = 'button';
  mBtn.className = 'btn fire sm fx-save fx-save-m';
  mBtn.textContent = 'Save';
  const topbar = document.getElementById('topbar');
  topbar.insertBefore(mBtn, document.getElementById('burger'));

  function timeAgo(iso){
    const d = new Date(iso); if (isNaN(d)) return '';
    const s = (Date.now() - d) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (d.toDateString() === new Date().toDateString()) return 'today ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    return d.toLocaleString([], {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
  }
  let saving = false;
  function refreshBar(){
    const st = document.getElementById('fx-status'), last = document.getElementById('fx-last');
    if (!st) return;
    if (saving || (savePending && Store.online !== false)) { st.textContent = '● Saving…'; st.className = 'busy'; }
    else if (savePending) { st.textContent = '⚠ Not saved to server yet — kept on this PC'; st.className = 'bad'; }
    else { st.textContent = '✓ All changes saved · live'; st.className = 'ok'; }
    last.textContent = S && S._savedAt ? 'Last saved ' + timeAgo(S._savedAt) + (S._savedBy ? ' by ' + S._savedBy : '') : '';
    document.querySelectorAll('.fx-save').forEach(b => { b.disabled = saving; });
  }
  setInterval(refreshBar, 30000);
  const origBadge = setConnBadge;
  setConnBadge = function(ok){ origBadge(ok); refreshBar(); };

  async function finalSave(){
    if (saving || !S || !MY_PROFILE) return;
    saving = true; refreshBar();
    clearTimeout(saveTimer);
    savePending = true;
    try { await queueSave(); } catch (e) {}
    saving = false;
    if (!savePending) {
      // Read it back to be sure the shared database holds exactly this save.
      let confirmed = false;
      try{
        const { data } = await sb.from('app_meta').select('rev:value->>_rev').eq('key', 'app_state').maybeSingle();
        confirmed = !!(data && data.rev && S && data.rev === S._rev);
      }catch(e){}
      if (confirmed) toast('Saved. Everyone using Flame CTS now has this update.');
      else toast('Saved, but the server could not be re-checked. Press Save again to confirm.', true);
    } else {
      toast('Could not reach the server. Your changes are kept on this PC and will be sent as soon as the connection is back.', true);
    }
    refreshBar();
  }
  document.querySelectorAll('.fx-save').forEach(b => b.addEventListener('click', finalSave));
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
      if (document.getElementById('app').style.display !== 'none') { e.preventDefault(); finalSave(); }
    }
  });

  listen();
  refreshBar();
})();
