/* ModDeck store — canonical canvas state, element CRUD, undo/redo, change bus.
   Exposed as window.MD.store. No build step; plain globals. */
(function () {
  window.MD = window.MD || {};
  window.MD.VERSION = "0.30.1";
  const CANVAS_W = 1920, CANVAS_H = 1080;

  // ---- defaults per widget type (used when spawning) ----
  const DEFAULTS = {
    text:  { w: 520, h: 120, props: { text: "Double-click to edit", size: 64, color: "#ffffff",
             weight: 800, align: "left", font: "Inter", bg: "transparent", stroke: 0, strokeColor: "#000000" } },
    image: { w: 480, h: 320, props: { url: "", slides: "", interval: 5, fit: "contain", radius: 12, opacity: 1 } },
    video: { w: 640, h: 360, props: { url: "", loop: true, muted: true, autoplay: true, radius: 12 } },
    timer: { w: 360, h: 150, props: { mode: "countdown", seconds: 600, label: "UNTIL BREAK",
             size: 72, color: "#ffffff", accent: "#0fb5a8", running: false } },
    shape: { w: 320, h: 200, props: { kind: "rect", fill: "#5b5bf0", radius: 14, opacity: .9,
             border: 0, borderColor: "#ffffff" } },
    chat:  { w: 380, h: 460, props: { title: "KICK CHAT", accent: "#0fb5a8", bg: "rgba(10,12,22,.72)",
             text: "#e6e9f5", max: 8, showPlatform: true, sources: { kick: "", twitch: "", youtube: "" } } },
    progress: { w: 480, h: 96, props: { label: "⭐ Sub Goal", current: 340, target: 500, accent: "#5b5bf0",
             bg: "rgba(10,12,22,.72)", color: "#ffffff", showPercent: true } },
    ticker: { w: 1000, h: 64, props: { text: "Welcome to the stream!  •  Follow for more  •  New video Friday",
             speed: 70, bg: "rgba(10,12,22,.85)", color: "#ffffff", size: 30 } },
    todo:  { w: 360, h: 340, props: { title: "TO-DO", accent: "#0fb5a8", bg: "rgba(10,12,22,.72)", color: "#e6e9f5",
             items: [{ text: "Warm up", done: true }, { text: "Ranked grind", done: false }, { text: "Viewer games", done: false }] } },
    tally: { w: 300, h: 180, props: { label: "DEATHS", count: 7, accent: "#e5484d", color: "#ffffff", bg: "rgba(10,12,22,.72)" } },
    poll:  { w: 480, h: 340, props: { question: "Next game?", accent: "#5b5bf0", bg: "rgba(10,12,22,.72)", color: "#e6e9f5",
             options: [{ label: "Valorant", votes: 42 }, { label: "Minecraft", votes: 31 }, { label: "Just Chatting", votes: 18 }] } },
    alertbox: { w: 560, h: 124, props: { accent: "#5b5bf0", bg: "rgba(10,12,22,.86)", color: "#ffffff", triggerSeq: 0,
             events: {
               follow: { on: true, icon: "👋", text: "{user} just followed", sound: "", gif: "" },
               sub:    { on: true, icon: "⭐", text: "{user} just subscribed", sound: "", gif: "" },
               resub:  { on: true, icon: "🌟", text: "{user} resubscribed · {months} mo", sound: "", gif: "" },
               gift:   { on: true, icon: "🎁", text: "{user} gifted {amount} subs", sound: "", gif: "" },
               kicks:  { on: true, icon: "💚", text: "{user} sent {amount} Kicks", sound: "", gif: "" },
             } } },
    qr:    { w: 240, h: 240, props: { data: "https://moddeck.bookhockeys.com", color: "#000000", bg: "#ffffff", label: "" } },
    mediashare: { w: 640, h: 392, props: { showInfo: true, accent: "#53fc18", radius: 12 } },
    eventlist: { w: 360, h: 340, props: { title: "RECENT EVENTS", accent: "#0fb5a8", bg: "rgba(10,12,22,.72)", color: "#e6e9f5", max: 8,
             events: [{ icon: "⭐", text: "kayJ subscribed" }, { icon: "🎉", text: "new follower: leoo" }, { icon: "💜", text: "grindset gifted 5 subs" }] } },
    browser: { w: 640, h: 360, props: { url: "", radius: 8, interactive: false } },
    customcode: { w: 480, h: 300, props: { html: "<div class=\"mdc\">Custom HTML widget</div>",
             css: ".mdc{display:grid;place-items:center;height:100%;color:#fff;font:800 30px Inter,sans-serif}", js: "" } },
    draw:  { w: 1920, h: 1080, props: { strokes: [] } },   // telestrator layer (created by the pen tool)
    emojicombo: { w: 460, h: 120, props: { comboTimeout: 5000, startAt: 3, max: 5, clipAt: 0,
             bg: "rgba(10,12,22,.72)", color: "#ffffff", accent: "#0fb5a8" } },
    discord: { w: 520, h: 150, props: { title: "⭐ STARRED IN DISCORD", accent: "#5865F2",
             bg: "rgba(15,16,24,.85)", color: "#ffffff", showAvatar: true, clearAfter: 0 } },
    powerchat: { w: 480, h: 220, props: { url: "" } },   // powerchat.live TTS/media donation overlay embed
    viewers: { w: 240, h: 110, props: { count: 0, label: "VIEWERS", icon: "👁", accent: "#53fc18",
             color: "#ffffff", bg: "rgba(10,12,22,.72)" } },
    wheel: { w: 440, h: 500, props: { segments: "Nitro\n100 bits\nShoutout\nNothing\nFollow\nSub gift",
             winner: 0, spinSeq: 0, accent: "#5b5bf0", color: "#ffffff" } },
  };
  const LABELS = { text:"Text", image:"Image", video:"Video", timer:"Timer", shape:"Shape", chat:"Kick Chat",
             progress:"Progress Goal", ticker:"Ticker", todo:"To-Do List", tally:"Tally", poll:"Live Poll", alertbox:"Alert Box",
             qr:"QR Code", eventlist:"Event List", browser:"Browser", customcode:"Custom Code", draw:"Drawing", wheel:"Prize Wheel",
             emojicombo:"Emoji Combo", discord:"Discord Highlights", powerchat:"PowerChat", viewers:"Viewer Count", mediashare:"Media Share" };
  const ICONS  = { text:"📝", image:"🖼️", video:"🎬", timer:"⏱️", shape:"⬛", chat:"💬",
             progress:"🎯", ticker:"📰", todo:"✅", tally:"🔢", poll:"📊", alertbox:"🔔",
             qr:"🔳", eventlist:"📋", browser:"🌐", customcode:"💻", wheel:"🎡", emojicombo:"🔥", discord:"⭐",
             powerchat:"💸", viewers:"👁", mediashare:"📺" };

  // ---- state ----
  // a "board" = { order:[ids], els:{id:el} }. We keep staging (editable) + live (broadcast).
  function emptyBoard() { return { order: [], els: {} }; }
  const state = {
    meta: { resolution: { w: CANVAS_W, h: CANVAS_H }, name: "My Overlay" },
    staging: emptyBoard(),
    live: emptyBoard(),
    selection: [],          // selected element ids (in staging)
    isLive: false,          // has anything been pushed live this session
  };

  // ---- change bus ----
  const listeners = { change: [], select: [], live: [] };
  function on(evt, fn) { (listeners[evt] || (listeners[evt] = [])).push(fn); return () => off(evt, fn); }
  function off(evt, fn) { const a = listeners[evt]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  function emit(evt, payload) { (listeners[evt] || []).forEach(fn => { try { fn(payload); } catch (e) { console.error(e); } }); }

  // ---- history (snapshots of staging) ----
  const undoStack = [], redoStack = [];
  const MAX_HISTORY = 60;
  function snapshot() { return JSON.stringify(state.staging); }
  function pushHistory() {
    undoStack.push(snapshot());
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    state.staging = JSON.parse(undoStack.pop());
    pruneSelection(); emit("change", { reason: "undo" }); emit("select");
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    state.staging = JSON.parse(redoStack.pop());
    pruneSelection(); emit("change", { reason: "redo" }); emit("select");
  }
  function canUndo() { return undoStack.length > 0; }
  function canRedo() { return redoStack.length > 0; }

  // ---- ids ----
  let _seq = 0;
  function uid(type) { _seq++; return type + "_" + Date.now().toString(36) + _seq.toString(36); }

  // ---- element ops (all operate on staging) ----
  function addElement(type, at) {
    const d = DEFAULTS[type]; if (!d) return null;
    const id = uid(type);
    const w = d.w, h = d.h;
    const x = at ? Math.round(at.x - w / 2) : Math.round((CANVAS_W - w) / 2);
    const y = at ? Math.round(at.y - h / 2) : Math.round((CANVAS_H - h) / 2);
    const el = { id, type, x, y, w, h, locked: false, hidden: false,
                 opacity: 1, rotation: 0, fx: { blur: 0, brightness: 1, saturate: 1, hue: 0 },
                 schedule: { enabled: false, showSec: 10, hideSec: 60 },
                 props: JSON.parse(JSON.stringify(d.props)) };
    pushHistory();
    state.staging.els[id] = el; state.staging.order.push(id);
    state.selection = [id];
    emit("change", { reason: "add", id }); emit("select");
    return el;
  }
  function getEl(id) { return state.staging.els[id]; }
  function eachSelected(fn) { state.selection.forEach(id => { const e = getEl(id); if (e) fn(e); }); }

  // live-drag/resize: update without spamming history; call commit() once at gesture end
  function updateEl(id, patch, opts) {
    const el = state.staging.els[id]; if (!el) return;
    Object.assign(el, patch);
    if (el.x !== undefined) { /* clamp loosely so things never fully vanish off-world */ }
    if (!opts || !opts.silent) emit("change", { reason: "update", id });
  }
  function updateProps(id, patch) {
    const el = state.staging.els[id]; if (!el) return;
    Object.assign(el.props, patch);
    emit("change", { reason: "props", id });
  }
  function beginGesture() { pushHistory(); }   // call once before a drag/resize
  function commit(reason) { emit("change", { reason: reason || "commit" }); }

  function removeSelected() {
    if (!state.selection.length) return;
    pushHistory();
    state.selection.forEach(id => {
      delete state.staging.els[id];
      const i = state.staging.order.indexOf(id); if (i >= 0) state.staging.order.splice(i, 1);
    });
    state.selection = [];
    emit("change", { reason: "remove" }); emit("select");
  }
  function duplicateSelected() {
    if (!state.selection.length) return;
    pushHistory();
    const newIds = [];
    state.selection.forEach(id => {
      const el = state.staging.els[id]; if (!el) return;
      const c = JSON.parse(JSON.stringify(el));
      c.id = uid(el.type); c.x += 28; c.y += 28;
      state.staging.els[c.id] = c; state.staging.order.push(c.id); newIds.push(c.id);
    });
    state.selection = newIds;
    emit("change", { reason: "duplicate" }); emit("select");
  }
  function reorder(id, dir) { // 'front' | 'back' | 'up' | 'down'
    const ord = state.staging.order; const i = ord.indexOf(id); if (i < 0) return;
    pushHistory(); ord.splice(i, 1);
    if (dir === "front") ord.push(id);
    else if (dir === "back") ord.unshift(id);
    else if (dir === "up") ord.splice(Math.min(ord.length, i + 1), 0, id);
    else ord.splice(Math.max(0, i - 1), 0, id);
    emit("change", { reason: "reorder", id });
  }

  // ---- selection ----
  function select(ids, additive) {
    ids = Array.isArray(ids) ? ids : (ids ? [ids] : []);
    if (additive) {
      ids.forEach(id => { const i = state.selection.indexOf(id); if (i >= 0) state.selection.splice(i, 1); else state.selection.push(id); });
    } else state.selection = ids.slice();
    emit("select");
  }
  function clearSelection() { if (state.selection.length) { state.selection = []; emit("select"); } }
  function pruneSelection() { state.selection = state.selection.filter(id => state.staging.els[id]); }

  // ---- staging <-> live ----
  function pushToLive() {
    state.live = JSON.parse(JSON.stringify(state.staging));
    state.isLive = true;
    emit("live", state.live); emit("change", { reason: "push" });
  }
  function swap() {
    const tmp = state.staging; state.staging = state.live; state.live = tmp;
    state.isLive = true; pruneSelection();
    emit("live", state.live); emit("change", { reason: "swap" }); emit("select");
  }

  // ---- scenes / presets (full-staging snapshots) ----
  function exportBoard(board) { return JSON.parse(JSON.stringify(board || state.staging)); }
  function loadIntoStaging(board) {
    pushHistory();
    state.staging = JSON.parse(JSON.stringify(board));
    state.selection = []; pruneSelection();
    emit("change", { reason: "load" }); emit("select");
  }

  window.MD.store = {
    CANVAS_W, CANVAS_H, DEFAULTS, LABELS, ICONS,
    state, on, off,
    addElement, getEl, eachSelected, updateEl, updateProps, beginGesture, commit,
    removeSelected, duplicateSelected, reorder,
    select, clearSelection,
    undo, redo, canUndo, canRedo,
    pushToLive, swap, exportBoard, loadIntoStaging,
  };
})();
