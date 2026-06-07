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
    const bc = ("BroadcastChannel" in window) ? new BroadcastChannel("moddeck:" + channelId) : null;
    const liveCbs = [], soundCbs = [], clipCbs = [];
    function readStored() {
      try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
    }
    if (bc) bc.onmessage = (e) => {
      if (!e.data) return;
      if (e.data.type === "live") liveCbs.forEach(cb => cb(e.data.payload));
      else if (e.data.type === "sound") soundCbs.forEach(cb => cb(e.data.payload));
      else if (e.data.type === "clip") clipCbs.forEach(cb => cb(e.data.payload));
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
    publishMeta(p) { backend && backend.publishMeta && backend.publishMeta(p); },
    loadMeta(cb) { if (backend && backend.loadMeta) backend.loadMeta(cb); else cb(null); },
    publishStaging(payload) { backend && backend.publishStaging(payload); },
    loadStaging(cb) { if (backend && backend.loadStaging) backend.loadStaging(cb); else cb(null); },
    publishPresence(uid, p) { backend && backend.publishPresence(uid, p); },
    onPresence(cb) { backend && backend.onPresence(cb); },
  };
})();
