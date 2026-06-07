/* ModDeck sync — transport between dashboard (writer) and overlay (reader).
   Pluggable backend. Phase 1 ships the 'local' backend (BroadcastChannel + localStorage)
   so the full dashboard->overlay loop works with zero infra. Phase 2 adds a 'firebase'
   backend (RTDB) implementing the SAME interface: publishLive() / onLive() / publishPresence().
   Exposed as window.MD.sync. */
(function () {
  window.MD = window.MD || {};

  // ---------- LOCAL backend (dev / demo / single-machine) ----------
  function localBackend(channelId) {
    const KEY = "moddeck:" + channelId + ":live";
    const SKEY = "moddeck:" + channelId + ":staging";
    const MQKEY = "moddeck:" + channelId + ":mq";
    const MNKEY = "moddeck:" + channelId + ":mn";
    const BOTKEY = "moddeck:" + channelId + ":botcfg";
    const MSKEY = "moddeck:" + channelId + ":msettings";
    const bc = ("BroadcastChannel" in window) ? new BroadcastChannel("moddeck:" + channelId) : null;
    const liveCbs = [], soundCbs = [], clipCbs = [], alertCbs = [], mqCbs = [], mnCbs = [], botCbs = [], msCbs = [];
    function readMQ() { try { return JSON.parse(localStorage.getItem(MQKEY) || "{}"); } catch { return {}; } }
    function writeMQ(o) { try { localStorage.setItem(MQKEY, JSON.stringify(o)); } catch {} mqCbs.forEach(cb => cb(o)); if (bc) bc.postMessage({ type: "mq", payload: o }); }
    function readJSON(k) { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch { return {}; } }
    function writeJSON(k, o, cbs, ev) { try { localStorage.setItem(k, JSON.stringify(o)); } catch {} cbs.forEach(cb => cb(o)); if (bc) bc.postMessage({ type: ev, payload: o }); }
    function readStored() {
      try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
    }
    if (bc) bc.onmessage = (e) => {
      if (!e.data) return;
      if (e.data.type === "live") liveCbs.forEach(cb => cb(e.data.payload));
      else if (e.data.type === "sound") soundCbs.forEach(cb => cb(e.data.payload));
      else if (e.data.type === "clip") clipCbs.forEach(cb => cb(e.data.payload));
      else if (e.data.type === "alert") alertCbs.forEach(cb => cb(e.data.payload));
      else if (e.data.type === "mq") mqCbs.forEach(cb => cb(e.data.payload));
      else if (e.data.type === "mn") mnCbs.forEach(cb => cb(e.data.payload));
      else if (e.data.type === "bot") botCbs.forEach(cb => cb(e.data.payload));
      else if (e.data.type === "ms") msCbs.forEach(cb => cb(e.data.payload));
    };
    window.addEventListener("storage", (e) => {
      if (e.key === KEY && e.newValue) { try { liveCbs.forEach(cb => cb(JSON.parse(e.newValue).payload)); } catch {} }
    });
    return {
      kind: "local",
      publishLive(payload) {
        const wrapped = { payload, t: Date.now() };
        try { localStorage.setItem(KEY, JSON.stringify(wrapped)); } catch {}
        if (bc) bc.postMessage({ type: "live", payload });
      },
      onLive(cb) {
        liveCbs.push(cb);
        const stored = readStored();
        if (stored && stored.payload) setTimeout(() => cb(stored.payload), 0);
      },
      publishSound(payload) { if (bc) bc.postMessage({ type: "sound", payload }); soundCbs.forEach(cb => cb(payload)); },
      onSound(cb) { soundCbs.push(cb); },
      publishClip(payload) { if (bc) bc.postMessage({ type: "clip", payload }); },
      onClip(cb) { clipCbs.push(cb); },
      publishAlert(payload) { const p = Object.assign({}, payload, { t: Date.now() }); if (bc) bc.postMessage({ type: "alert", payload: p }); alertCbs.forEach(cb => cb(p)); },
      onAlert(cb) { alertCbs.push(cb); },
      onMediaQueue(cb) { mqCbs.push(cb); setTimeout(() => cb(readMQ()), 0); },
      pushMedia(entry) { const o = readMQ(); const id = "m" + Date.now() + Math.floor(Math.random() * 1000); o[id] = Object.assign({}, entry, { t: Date.now() }); writeMQ(o); },
      updateMedia(id, patch) { const o = readMQ(); if (o[id]) { o[id] = Object.assign({}, o[id], patch); writeMQ(o); } },
      removeMedia(id) { const o = readMQ(); delete o[id]; writeMQ(o); },
      playMedia(entry) { const v = Object.assign({}, entry, { startedAt: Date.now() }); try { localStorage.setItem(MNKEY, JSON.stringify(v)); } catch {} mnCbs.forEach(cb => cb(v)); if (bc) bc.postMessage({ type: "mn", payload: v }); },
      stopMedia() { try { localStorage.removeItem(MNKEY); } catch {} mnCbs.forEach(cb => cb(null)); if (bc) bc.postMessage({ type: "mn", payload: null }); },
      onMediaNow(cb) { mnCbs.push(cb); try { const r = localStorage.getItem(MNKEY); setTimeout(() => cb(r ? JSON.parse(r) : null), 0); } catch { } },
      onBot(cb) { botCbs.push(cb); setTimeout(() => cb(readJSON(BOTKEY)), 0); },
      setBot(patch) { writeJSON(BOTKEY, Object.assign({}, readJSON(BOTKEY), patch), botCbs, "bot"); },
      onMediaSettings(cb) { msCbs.push(cb); setTimeout(() => cb(readJSON(MSKEY)), 0); },
      setMediaSettings(patch) { writeJSON(MSKEY, Object.assign({}, readJSON(MSKEY), patch), msCbs, "ms"); },
      publishMeta() {/* no-op locally */},
      loadMeta(cb) { cb(null); },
      publishStaging(payload) { try { localStorage.setItem(SKEY, JSON.stringify(payload)); } catch {} },
      loadStaging(cb) { try { const raw = localStorage.getItem(SKEY); cb(raw ? JSON.parse(raw) : null); } catch { cb(null); } },
      publishPresence() {/* no-op locally */},
      onPresence() {/* no-op locally */},
    };
  }

  // ---------- FIREBASE backend (Phase 2 — RTDB) ----------
  // Stub kept here so the wiring is obvious. Will use firebase.database():
  //   /channels/{id}/live   (writer set / reader on('value'))
  //   /channels/{id}/presence/{uid}
  function firebaseBackend(channelId, db) {
    const ref = db.ref("channels/" + channelId);
    return {
      kind: "firebase",
      publishLive(payload) { ref.child("live").set(payload); },
      onLive(cb) { ref.child("live").on("value", s => { const v = s.val(); if (v) cb(v); }); },
      publishSound(payload) { ref.child("soundCue").set(Object.assign({}, payload, { t: Date.now() })); },
      onSound(cb) { ref.child("soundCue").on("value", s => { const v = s.val(); if (v) cb(v); }); },
      publishClip(payload) { ref.child("clipCue").set(Object.assign({}, payload, { t: Date.now() })); },
      onClip(cb) { ref.child("clipCue").on("value", s => { const v = s.val(); if (v) cb(v); }); },
      publishAlert(payload) { ref.child("alertCue").set(Object.assign({}, payload, { t: Date.now() })); },
      onAlert(cb) { ref.child("alertCue").on("value", s => { const v = s.val(); if (v) cb(v); }); },
      onMediaQueue(cb) { ref.child("media/queue").on("value", s => cb(s.val() || {})); },
      pushMedia(entry) { ref.child("media/queue").push(Object.assign({}, entry, { t: Date.now() })); },
      updateMedia(id, patch) { ref.child("media/queue/" + id).update(patch); },
      removeMedia(id) { ref.child("media/queue/" + id).remove(); },
      playMedia(entry) { ref.child("media/now").set(Object.assign({}, entry, { startedAt: Date.now() })); },
      stopMedia() { ref.child("media/now").remove(); },
      onMediaNow(cb) { ref.child("media/now").on("value", s => cb(s.val())); },
      onBot(cb) { ref.child("bot").on("value", s => cb(s.val() || {})); },
      setBot(patch) { ref.child("bot").update(patch); },
      onMediaSettings(cb) { ref.child("media/settings").on("value", s => cb(s.val() || {})); },
      setMediaSettings(patch) { ref.child("media/settings").update(patch); },
      publishMeta(p) { ref.child("meta").update(p); },
      loadMeta(cb) { ref.child("meta").once("value", s => cb(s.val())); },
      publishStaging(payload) { ref.child("staging").set(payload); },
      loadStaging(cb) { ref.child("staging").once("value", s => cb(s.val())); },
      onStaging(cb) { ref.child("staging").on("value", s => { const v = s.val(); if (v) cb(v); }); },
      publishPresence(uid, p) { ref.child("presence/" + uid).set(p); },
      onPresence(cb) { ref.child("presence").on("value", s => cb(s.val() || {})); },
    };
  }

  let backend = null, channelId = null;
  function init(opts) {
    opts = opts || {};
    channelId = opts.channelId || "dev-local";
    if (opts.backend === "firebase" && opts.db) backend = firebaseBackend(channelId, opts.db);
    else backend = localBackend(channelId);
    return backend.kind;
  }

  window.MD.sync = {
    init,
    get channelId() { return channelId; },
    get kind() { return backend ? backend.kind : null; },
    publishLive(payload) { backend && backend.publishLive(payload); },
    onLive(cb) { backend && backend.onLive(cb); },
    publishSound(payload) { backend && backend.publishSound(payload); },
    onSound(cb) { backend && backend.onSound(cb); },
    publishClip(payload) { backend && backend.publishClip(payload); },
    onClip(cb) { if (backend && backend.onClip) backend.onClip(cb); },
    publishAlert(payload) { backend && backend.publishAlert && backend.publishAlert(payload); },
    onAlert(cb) { if (backend && backend.onAlert) backend.onAlert(cb); },
    onMediaQueue(cb) { if (backend && backend.onMediaQueue) backend.onMediaQueue(cb); else cb({}); },
    pushMedia(entry) { backend && backend.pushMedia && backend.pushMedia(entry); },
    updateMedia(id, patch) { backend && backend.updateMedia && backend.updateMedia(id, patch); },
    removeMedia(id) { backend && backend.removeMedia && backend.removeMedia(id); },
    playMedia(entry) { backend && backend.playMedia && backend.playMedia(entry); },
    stopMedia() { backend && backend.stopMedia && backend.stopMedia(); },
    onMediaNow(cb) { if (backend && backend.onMediaNow) backend.onMediaNow(cb); else cb(null); },
    onBot(cb) { if (backend && backend.onBot) backend.onBot(cb); else cb({}); },
    setBot(patch) { backend && backend.setBot && backend.setBot(patch); },
    onMediaSettings(cb) { if (backend && backend.onMediaSettings) backend.onMediaSettings(cb); else cb({}); },
    setMediaSettings(patch) { backend && backend.setMediaSettings && backend.setMediaSettings(patch); },
    publishMeta(p) { backend && backend.publishMeta && backend.publishMeta(p); },
    loadMeta(cb) { if (backend && backend.loadMeta) backend.loadMeta(cb); else cb(null); },
    publishStaging(payload) { backend && backend.publishStaging(payload); },
    loadStaging(cb) { if (backend && backend.loadStaging) backend.loadStaging(cb); else cb(null); },
    publishPresence(uid, p) { backend && backend.publishPresence(uid, p); },
    onPresence(cb) { backend && backend.onPresence(cb); },
  };
})();
