/* ModDeck canvas — infinite pan/zoom editor over the 1920x1080 live frame.
   - world layer (CSS matrix) holds the frame + widget content (scaled)
   - a separate UNSCALED ui layer draws selection outlines/handles/marquee/guides
     so handles stay crisp at any zoom and all hit-math is in screen space.
   Pan: space-drag or middle-mouse. Zoom: wheel at cursor / pinch. Frame: fit live area.
   Exposed as window.MD.canvas. */
(function () {
  window.MD = window.MD || {};
  const S = () => window.MD.store;

  let viewport, world, frame, frameLabel, contentEl, uiEl, dotsEl;
  let layer;                          // widgets layer (makeWrapper)
  const view = { x: 0, y: 0, scale: 0.4 };
  const MINS = 0.06, MAXS = 4;
  let spaceDown = false, snap = false;
  let penMode = null, penColor = "#ff3d3d", penWidth = 6, drawId = null, curStroke = null;
  let onViewChange = () => {};

  // ---- transforms ----
  const s2w = (sx, sy) => ({ x: (sx - view.x) / view.scale, y: (sy - view.y) / view.scale });
  const w2s = (wx, wy) => ({ x: wx * view.scale + view.x, y: wy * view.scale + view.y });

  function applyView() {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    // keep the frame label readable (counter-scale) and pinned above the frame
    const lblScale = 1 / view.scale;
    frameLabel.style.transform = `scale(${lblScale})`;
    frameLabel.style.top = (-26 * lblScale) + "px";
    renderUI();
    onViewChange(view.scale);
  }

  function frameLiveArea(animate) {
    const W = S().CANVAS_W, H = S().CANVAS_H;
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    const pad = 90;
    const scale = Math.min((vw - pad * 2) / W, (vh - pad * 2) / H);
    view.scale = Math.max(MINS, Math.min(MAXS, scale));
    view.x = (vw - W * view.scale) / 2;
    view.y = (vh - H * view.scale) / 2;
    if (animate) { world.style.transition = "transform .28s cubic-bezier(.4,0,.2,1)"; setTimeout(() => world.style.transition = "", 300); }
    applyView();
  }

  function zoomAt(sx, sy, factor) {
    const ns = Math.max(MINS, Math.min(MAXS, view.scale * factor));
    const wx = (sx - view.x) / view.scale, wy = (sy - view.y) / view.scale;
    view.scale = ns; view.x = sx - wx * ns; view.y = sy - wy * ns;
    applyView();
  }
  function zoomTo(mult) {
    const r = viewport.getBoundingClientRect();
    zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, mult);
  }

  // ---- world / widget rendering ----
  function makeWrapper(el) {
    const w = document.createElement("div"); w.className = "elwrap"; w.dataset.id = el.id;
    w.style.position = "absolute"; return w;
  }
  function renderWorld() {
    const board = S().state.staging;
    layer.render(board);
    board.order.forEach((id, idx) => {
      const rec = layer.instances.get(id); if (!rec) return; const el = board.els[id];
      const w = rec.wrap;
      window.MD.widgets.applyBox(w, el, idx);
      w.style.pointerEvents = (el.locked || el.type === "draw") ? "none" : "auto";
      w.classList.toggle("locked", !!el.locked);
    });
  }

  // ---- selection UI (unscaled overlay) ----
  let guides = [];
  function renderUI() {
    uiEl.innerHTML = "";
    const st = S().state; const sel = st.selection;
    sel.forEach(id => {
      const el = st.staging.els[id]; if (!el || el.hidden) return;
      const a = w2s(el.x, el.y), b = w2s(el.x + el.w, el.y + el.h);
      const box = document.createElement("div");
      box.className = "elwrap sel"; box.style.position = "absolute";
      box.style.left = a.x + "px"; box.style.top = a.y + "px";
      box.style.width = (b.x - a.x) + "px"; box.style.height = (b.y - a.y) + "px";
      box.style.pointerEvents = "none";
      const tag = document.createElement("div"); tag.className = "eltag";
      tag.textContent = (window.MD.store.LABELS[el.type] || el.type) + (el.locked ? " 🔒" : "");
      box.appendChild(tag);
      if (sel.length === 1 && !el.locked) {
        ["nw", "ne", "sw", "se"].forEach(h => {
          const hd = document.createElement("div"); hd.className = "handle " + h;
          hd.dataset.handle = h; hd.dataset.id = id; hd.style.pointerEvents = "auto";
          box.appendChild(hd);
        });
      }
      uiEl.appendChild(box);
    });
    guides.forEach(g => uiEl.appendChild(g));
  }
  function showGuides(lines) { // lines in world coords {x?} or {y?}
    guides = lines.map(L => {
      const d = document.createElement("div"); d.style.position = "absolute"; d.style.background = "#5b5bf0"; d.style.pointerEvents = "none"; d.style.zIndex = 60;
      if (L.x != null) { const p = w2s(L.x, 0); d.style.left = p.x + "px"; d.style.top = "0"; d.style.width = "1px"; d.style.height = "100%"; }
      else { const p = w2s(0, L.y); d.style.top = p.y + "px"; d.style.left = "0"; d.style.height = "1px"; d.style.width = "100%"; }
      return d;
    });
    renderUI();
  }
  function clearGuides() { if (guides.length) { guides = []; renderUI(); } }

  // ---- snapping ----
  function snapMove(el, nx, ny) {
    if (!snap) return { x: nx, y: ny, guides: [] };
    const W = S().CANVAS_W, H = S().CANVAS_H, TH = 8 / view.scale;
    const gx = [0, W / 2, W], gy = [0, H / 2, H];
    const lines = []; let x = nx, y = ny;
    const ex = [nx, nx + el.w / 2, nx + el.w], ey = [ny, ny + el.h / 2, ny + el.h];
    gx.forEach(g => ex.forEach((e, i) => { if (Math.abs(e - g) < TH) { x = g - [0, el.w / 2, el.w][i]; lines.push({ x: g }); } }));
    gy.forEach(g => ey.forEach((e, i) => { if (Math.abs(e - g) < TH) { y = g - [0, el.h / 2, el.h][i]; lines.push({ y: g }); } }));
    return { x, y, guides: lines };
  }

  // ---- telestrator (pen / eraser) ----
  function ensureDraw() {
    const ord = S().state.staging.order;
    for (const id of ord) if (S().getEl(id).type === "draw") return id;
    const el = S().addElement("draw"); S().updateEl(el.id, { x: 0, y: 0, locked: true }, { silent: true });
    S().clearSelection(); return el.id;
  }
  function worldPt(e) { const r = viewport.getBoundingClientRect(); return s2w(e.clientX - r.left, e.clientY - r.top); }
  function eraseAt(p) {
    const el = S().getEl(drawId); if (!el) return;
    const th = penWidth + 14;
    const keep = (el.props.strokes || []).filter(s => !s.pts.some(pt => Math.hypot(pt[0] - p.x, pt[1] - p.y) < th));
    if (keep.length !== el.props.strokes.length) S().updateProps(drawId, { strokes: keep });
  }
  function startDraw(e) {
    drawId = ensureDraw(); S().beginGesture(); mode = "draw";
    const p = worldPt(e);
    if (penMode === "eraser") eraseAt(p);
    else { const strokes = (S().getEl(drawId).props.strokes || []).slice(); curStroke = { color: penColor, width: penWidth, pts: [[Math.round(p.x), Math.round(p.y)]] }; strokes.push(curStroke); S().updateProps(drawId, { strokes }); }
    capture(e);
  }

  // ---- pointer interaction ----
  let mode = null;  // 'pan' | 'drag' | 'resize' | 'marquee' | 'draw'
  let start = null, marqueeEl = null, dragData = null;

  function onDown(e) {
    if (e.button === 1 || (e.button === 0 && spaceDown)) {           // pan (space overrides pen)
      mode = "pan"; start = { mx: e.clientX, my: e.clientY, vx: view.x, vy: view.y };
      viewport.classList.add("panning"); e.preventDefault(); capture(e); return;
    }
    if (penMode && e.button === 0) { startDraw(e); e.preventDefault(); return; }   // telestrator
    if (e.button !== 0) return;
    const handle = e.target.closest("[data-handle]");
    if (handle) {                                                     // resize
      const id = handle.dataset.id, el = S().getEl(id); if (!el) return;
      S().beginGesture();
      mode = "resize"; dragData = { id, corner: handle.dataset.handle, ox: el.x, oy: el.y, ow: el.w, oh: el.h, mx: e.clientX, my: e.clientY };
      capture(e); return;
    }
    const wrap = e.target.closest(".elwrap[data-id]");
    if (wrap) {                                                       // select + drag
      const id = wrap.dataset.id; const st = S().state;
      if (e.shiftKey) S().select(id, true);
      else if (!st.selection.includes(id)) S().select(id);
      if (!S().state.selection.length) return;
      S().beginGesture();
      mode = "drag";
      dragData = { mx: e.clientX, my: e.clientY, items: S().state.selection.map(sid => { const el = S().getEl(sid); return { id: sid, ox: el.x, oy: el.y }; }) };
      capture(e); return;
    }
    // empty space -> marquee select
    if (!e.shiftKey) S().clearSelection();
    mode = "marquee"; const r = viewport.getBoundingClientRect();
    start = { mx: e.clientX - r.left, my: e.clientY - r.top, additive: e.shiftKey };
    marqueeEl = document.createElement("div"); marqueeEl.className = "marquee"; uiEl.appendChild(marqueeEl);
    capture(e);
  }

  function onMove(e) {
    if (!mode) {                                                      // hover cursor
      viewport.classList.toggle("pan-ready", spaceDown);
      return;
    }
    if (mode === "pan") {
      view.x = start.vx + (e.clientX - start.mx); view.y = start.vy + (e.clientY - start.my); applyView(); return;
    }
    if (mode === "draw") {
      const p = worldPt(e);
      if (penMode === "eraser") eraseAt(p);
      else if (curStroke) { curStroke.pts.push([Math.round(p.x), Math.round(p.y)]); S().updateProps(drawId, { strokes: S().getEl(drawId).props.strokes }); }
      return;
    }
    if (mode === "drag") {
      const dx = (e.clientX - dragData.mx) / view.scale, dy = (e.clientY - dragData.my) / view.scale;
      let snapDx = 0, snapDy = 0, lines = [];
      if (dragData.items.length === 1 && snap) {
        const el = S().getEl(dragData.items[0].id);
        const s = snapMove(el, dragData.items[0].ox + dx, dragData.items[0].oy + dy);
        snapDx = s.x - (dragData.items[0].ox + dx); snapDy = s.y - (dragData.items[0].oy + dy); lines = s.guides;
      }
      dragData.items.forEach(it => S().updateEl(it.id, { x: Math.round(it.ox + dx + snapDx), y: Math.round(it.oy + dy + snapDy) }));
      lines.length ? showGuides(lines) : clearGuides();
      return;
    }
    if (mode === "resize") {
      const d = dragData; const dx = (e.clientX - d.mx) / view.scale, dy = (e.clientY - d.my) / view.scale;
      let x = d.ox, y = d.oy, w = d.ow, h = d.oh; const MIN = 24;
      if (d.corner.includes("e")) w = Math.max(MIN, d.ow + dx);
      if (d.corner.includes("s")) h = Math.max(MIN, d.oh + dy);
      if (d.corner.includes("w")) { w = Math.max(MIN, d.ow - dx); x = d.ox + (d.ow - w); }
      if (d.corner.includes("n")) { h = Math.max(MIN, d.oh - dy); y = d.oy + (d.oh - h); }
      S().updateEl(d.id, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
      return;
    }
    if (mode === "marquee") {
      const r = viewport.getBoundingClientRect(); const cx = e.clientX - r.left, cy = e.clientY - r.top;
      const x = Math.min(cx, start.mx), y = Math.min(cy, start.my), w = Math.abs(cx - start.mx), h = Math.abs(cy - start.my);
      marqueeEl.style.left = x + "px"; marqueeEl.style.top = y + "px"; marqueeEl.style.width = w + "px"; marqueeEl.style.height = h + "px";
    }
  }

  function onUp(e) {
    if (mode === "marquee") {
      const r = viewport.getBoundingClientRect();
      const a = s2w(parseFloat(marqueeEl.style.left), parseFloat(marqueeEl.style.top));
      const b = s2w(parseFloat(marqueeEl.style.left) + parseFloat(marqueeEl.style.width), parseFloat(marqueeEl.style.top) + parseFloat(marqueeEl.style.height));
      const hits = [];
      S().state.staging.order.forEach(id => { const el = S().state.staging.els[id]; if (el.hidden || el.locked) return;
        if (el.x < b.x && el.x + el.w > a.x && el.y < b.y && el.y + el.h > a.y) hits.push(id); });
      marqueeEl.remove(); marqueeEl = null;
      if (hits.length) S().select(hits, start.additive);
    } else if (mode === "drag" || mode === "resize") {
      S().commit(mode); clearGuides();
    } else if (mode === "draw") {
      S().commit("draw"); curStroke = null;
    }
    mode = null; dragData = null; viewport.classList.remove("panning");
  }
  function capture(e) { viewport.setPointerCapture && viewport.setPointerCapture(e.pointerId); }

  function onWheel(e) {
    e.preventDefault();
    const r = viewport.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0 && !e.shiftKey) {
      const factor = Math.pow(1.0015, -e.deltaY);
      zoomAt(e.clientX - r.left, e.clientY - r.top, factor);
    } else { view.x -= e.deltaX; view.y -= e.deltaY; applyView(); }
  }

  // ---- keyboard ----
  function onKeyDown(e) {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || e.target.isContentEditable) return;
    if (e.code === "Space") { spaceDown = true; viewport.classList.add("pan-ready"); e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? S().redo() : S().undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); S().redo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); S().duplicateSelected(); return; }
    if (e.key === "Delete" || e.key === "Backspace") { if (S().state.selection.length) { e.preventDefault(); S().removeSelected(); } return; }
    if (e.key === "Escape") { S().clearSelection(); return; }
    const nudge = e.shiftKey ? 10 : 1;
    const moves = { ArrowLeft: [-nudge, 0], ArrowRight: [nudge, 0], ArrowUp: [0, -nudge], ArrowDown: [0, nudge] };
    if (moves[e.key] && S().state.selection.length) {
      e.preventDefault(); S().beginGesture();
      S().eachSelected(el => S().updateEl(el.id, { x: el.x + moves[e.key][0], y: el.y + moves[e.key][1] }));
      S().commit("nudge");
    }
  }
  function onKeyUp(e) { if (e.code === "Space") { spaceDown = false; viewport.classList.remove("pan-ready"); } }

  // ---- init ----
  function init(opts) {
    viewport = opts.viewport; world = opts.world; frame = opts.frame; frameLabel = opts.frameLabel;
    contentEl = opts.content; uiEl = opts.ui; dotsEl = opts.dots; onViewChange = opts.onViewChange || (() => {});
    // size the live frame
    frame.style.width = S().CANVAS_W + "px"; frame.style.height = S().CANVAS_H + "px";
    layer = window.MD.widgets.Layer(contentEl, makeWrapper);

    viewport.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    viewport.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", () => applyView());

    S().on("change", renderWorld);
    S().on("change", renderUI);
    S().on("select", renderUI);

    renderWorld(); frameLiveArea(false);
  }

  window.MD.canvas = {
    init, frameLiveArea, renderWorld, renderUI,
    zoomIn: () => zoomTo(1.2), zoomOut: () => zoomTo(1 / 1.2), resetZoom: () => frameLiveArea(true),
    setSnap: (v) => { snap = v; }, getSnap: () => snap,
    setPen: (m, opts) => { penMode = m; if (opts) { if (opts.color) penColor = opts.color; if (opts.width) penWidth = opts.width; } viewport.style.cursor = m ? "crosshair" : ""; },
    getPen: () => penMode,
    clearDraw: () => { const ord = S().state.staging.order; for (const id of ord) if (S().getEl(id).type === "draw") { S().updateProps(id, { strokes: [] }); return; } },
    getScale: () => view.scale,
    setLiveFlag: (on) => { frame.classList.toggle("is-live", on); frameLabel.classList.toggle("live", on); },
    s2w, w2s,
  };
})();
