/* ModDeck dashboard — wires the control panel to the store/canvas/sync.
   Palette · broadcast control · presets/scenes · properties · toolbar · OBS link. */
(function () {
  const S = window.MD.store, C = window.MD.canvas, SY = window.MD.sync;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
  let viewport, channelId;

  // ---------- toast ----------
  function toast(msg, kind) {
    let wrap = $(".toast-wrap"); if (!wrap) { wrap = el("div", "toast-wrap"); document.body.appendChild(wrap); }
    const t = el("div", "toast " + (kind || ""), msg); wrap.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; setTimeout(() => t.remove(), 300); }, 2600);
  }

  // ---------- palette ----------
  const PALETTE = [
    ["chat", "💬", "Combined Chat"], ["alertbox", "🔔", "Alert Box"], ["timer", "⏱️", "Timer"],
    ["progress", "🎯", "Goal Bar"], ["poll", "📊", "Live Poll"], ["todo", "✅", "To-Do"],
    ["tally", "🔢", "Tally"], ["ticker", "📰", "Ticker"], ["eventlist", "📋", "Event List"],
    ["text", "📝", "Text"], ["image", "🖼️", "Image"], ["video", "🎬", "Video"],
    ["shape", "⬛", "Shape"], ["qr", "🔳", "QR Code"], ["browser", "🌐", "Browser"],
    ["customcode", "💻", "Custom Code"],
  ];
  function buildPalette() {
    const g = $("#palette"); g.innerHTML = "";
    PALETTE.forEach(([type, icon, label]) => {
      const b = el("button", "wbtn", `<span class="i">${icon}</span>${label}`);
      b.onclick = () => {
        const c = C.s2w(viewport.clientWidth / 2, viewport.clientHeight / 2);
        S.addElement(type, c); toast(`Added ${label}`);
      };
      g.appendChild(b);
    });
  }

  // ---------- broadcast ----------
  function publishLive() { SY.publishLive(S.exportBoard(S.state.live)); }
  function wireBroadcast() {
    $("#pushLive").onclick = () => { S.pushToLive(); toast("Pushed to Live ⬆", "ok"); };
    $("#swap").onclick = () => { S.swap(); toast("Swapped Live / Stage"); };
    S.on("live", () => { publishLive(); C.setLiveFlag(true); updateLivePill(true); });
  }
  function updateLivePill(on) {
    const p = $("#livePill"); p.classList.toggle("on", on);
    p.innerHTML = `<i></i>${on ? "LIVE" : "OFFLINE"}`;
  }

  // ---------- presets & scenes (localStorage, per channel) ----------
  const keyOf = (kind) => `moddeck:${channelId}:${kind}`;
  function listStore(kind) { try { return JSON.parse(localStorage.getItem(keyOf(kind)) || "[]"); } catch { return []; } }
  function saveStore(kind, arr) { localStorage.setItem(keyOf(kind), JSON.stringify(arr)); }
  function renderLists() {
    ["presets", "scenes"].forEach(kind => {
      const host = $("#" + kind + "List"); const items = listStore(kind); host.innerHTML = "";
      if (!items.length) { host.appendChild(el("div", "list-empty", kind === "presets" ? "No presets yet" : "No scenes yet")); return; }
      items.forEach((it, idx) => {
        const row = el("div", "list-item", `<span style="cursor:pointer;flex:1">📂 ${it.name}</span><span class="x">✕</span>`);
        row.firstChild.onclick = () => { S.loadIntoStaging(it.board); toast(`Loaded "${it.name}"`); };
        row.querySelector(".x").onclick = () => { items.splice(idx, 1); saveStore(kind, items); renderLists(); };
        host.appendChild(row);
      });
    });
  }
  function wirePresets() {
    $("#savePreset").onclick = () => {
      const name = ($("#presetName").value || "").trim() || ("Preset " + (listStore("presets").length + 1));
      const items = listStore("presets"); items.push({ name, board: S.exportBoard(S.state.staging) });
      saveStore("presets", items); $("#presetName").value = ""; renderLists(); toast(`Saved preset "${name}"`, "ok");
    };
    $("#saveScene").onclick = () => {
      const name = ($("#sceneName").value || "").trim() || ("Scene " + (listStore("scenes").length + 1));
      const items = listStore("scenes"); items.push({ name, board: S.exportBoard(S.state.staging) });
      saveStore("scenes", items); $("#sceneName").value = ""; renderLists(); toast(`Saved scene "${name}"`, "ok");
    };
  }

  // ---------- toolbar ----------
  function wireToolbar() {
    $("#undo").onclick = () => S.undo();
    $("#redo").onclick = () => S.redo();
    $("#frameBtn").onclick = () => C.resetZoom();
    $("#zoomIn").onclick = () => C.zoomIn();
    $("#zoomOut").onclick = () => C.zoomOut();
    const snapBtn = $("#snap");
    snapBtn.onclick = () => { const v = !C.getSnap(); C.setSnap(v); snapBtn.classList.toggle("on", v); };
    // telestrator pen / eraser
    const pen = $("#pen"), eraser = $("#eraser"), penColor = $("#penColor");
    pen.onclick = () => { const on = C.getPen() !== "pen"; C.setPen(on ? "pen" : null, { color: penColor.value, width: 6 }); pen.classList.toggle("on", on); eraser.classList.remove("on"); };
    eraser.onclick = () => { const on = C.getPen() !== "eraser"; C.setPen(on ? "eraser" : null, { color: penColor.value, width: 6 }); eraser.classList.toggle("on", on); pen.classList.remove("on"); };
    penColor.oninput = () => { if (C.getPen() === "pen") C.setPen("pen", { color: penColor.value }); };
    $("#penClear").onclick = () => { C.clearDraw(); toast("Cleared drawing"); };
    S.on("change", refreshUndo); refreshUndo();
  }
  function refreshUndo() { $("#undo").disabled = !S.canUndo(); $("#redo").disabled = !S.canRedo(); }

  // ---------- OBS link modal ----------
  function overlayUrl() {
    const base = location.href.replace(/dashboard\.html.*$/, "").replace(/\/$/, "");
    return `${base}/overlay.html?c=${encodeURIComponent(channelId)}`;
  }
  function wireObs() {
    $("#getLink").onclick = $("#getLink2").onclick = () => {
      const url = overlayUrl();
      const back = el("div", "modal-back");
      back.innerHTML = `<div class="modal">
        <h3>🔗 OBS Browser Source</h3>
        <p>In OBS add a <b>Browser</b> source, paste this URL, set width <b>1920</b> and height <b>1080</b>, and check <i>“Shutdown source when not visible”</i> off. Your overlay updates live whenever you Push to Live.</p>
        <div class="obs-url">${url}</div>
        <div class="mrow"><button id="mClose">Close</button><button class="primary" id="mCopy">Copy URL</button></div>
      </div>`;
      document.body.appendChild(back);
      back.onclick = (e) => { if (e.target === back) back.remove(); };
      $("#mClose", back).onclick = () => back.remove();
      $("#mCopy", back).onclick = () => { navigator.clipboard.writeText(url).then(() => toast("Overlay URL copied", "ok")); back.remove(); };
    };
  }

  // ---------- soundboard ----------
  function sounds() { try { return JSON.parse(localStorage.getItem(keyOf("sounds")) || "[]"); } catch { return []; } }
  function saveSounds(a) { localStorage.setItem(keyOf("sounds"), JSON.stringify(a)); }
  function wireSoundboard() {
    $("#sbBtn").onclick = () => {
      const back = el("div", "modal-back");
      back.innerHTML = `<div class="modal" style="max-width:520px">
        <h3>🔊 Remote Soundboard</h3>
        <p>Trigger sound effects on the live overlay (plays through your OBS browser source). Your mods get the same buttons.</p>
        <div id="sbList" style="display:flex;flex-direction:column;gap:7px;margin-bottom:12px;max-height:300px;overflow:auto"></div>
        <div style="display:flex;gap:7px;margin-bottom:12px">
          <input id="sbName" placeholder="name" style="flex:1;background:#fff;border:1px solid var(--line2);border-radius:8px;padding:8px 10px;font-size:12px">
          <input id="sbUrl" placeholder="https://…mp3 / wav" style="flex:2;background:#fff;border:1px solid var(--line2);border-radius:8px;padding:8px 10px;font-size:12px">
          <button class="primary" id="sbAdd" style="border:none;background:var(--accent);color:#fff;border-radius:8px;padding:0 14px;font-weight:700">Add</button>
        </div>
        <div class="mrow"><button id="sbStop" style="color:var(--danger)">⏹ Stop All</button><button id="sbClose">Close</button></div>
      </div>`;
      document.body.appendChild(back);
      back.onclick = (e) => { if (e.target === back) back.remove(); };
      const render = () => {
        const host = $("#sbList", back); const arr = sounds(); host.innerHTML = "";
        if (!arr.length) { host.appendChild(el("div", "list-empty", "No sounds yet — add one above.")); return; }
        arr.forEach((s, i) => {
          const row = el("div"); row.style.cssText = "display:flex;gap:8px;align-items:center;background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:7px 10px";
          row.innerHTML = `<span style="flex:1;font-size:12.5px;font-weight:600">${s.name}</span>`;
          const play = el("button", null, "▶ Play"); play.style.cssText = "border:none;background:var(--accent);color:#fff;border-radius:7px;padding:6px 12px;font-weight:700;font-size:11px";
          play.onclick = () => { SY.publishSound({ url: s.url }); toast(`Played ${s.name}`); };
          const del = el("button", null, "✕"); del.style.cssText = "border:1px solid var(--line2);background:#fff;color:var(--ink-faint);border-radius:7px;padding:6px 9px";
          del.onclick = () => { const a = sounds(); a.splice(i, 1); saveSounds(a); render(); };
          row.appendChild(play); row.appendChild(del); host.appendChild(row);
        });
      };
      render();
      $("#sbAdd", back).onclick = () => { const n = $("#sbName", back).value.trim(), u = $("#sbUrl", back).value.trim(); if (!u) return; const a = sounds(); a.push({ name: n || ("Sound " + (a.length + 1)), url: u }); saveSounds(a); $("#sbName", back).value = ""; $("#sbUrl", back).value = ""; render(); };
      $("#sbStop", back).onclick = () => { SY.publishSound({ stop: true }); toast("Stopped all audio"); };
      $("#sbClose", back).onclick = () => back.remove();
    };
  }

  // ---------- properties ----------
  function field(label, inner) { const f = el("div", "field"); f.appendChild(el("label", null, label)); const w = el("div"); w.innerHTML = inner; f.appendChild(w.firstElementChild || w); return f; }
  function numInput(val, on) { const i = el("input"); i.type = "number"; i.value = Math.round(val); i.oninput = () => on(parseFloat(i.value) || 0); return i; }
  function swatchRow(colors, current, on) {
    const r = el("div", "swatches");
    colors.forEach(c => { const s = el("div", "sw" + (c === current ? " on" : "")); s.style.background = c; s.onclick = () => on(c); r.appendChild(s); });
    const pick = el("input"); pick.type = "color"; pick.value = (current && current[0] === "#") ? current : "#ffffff";
    pick.style.cssText = "width:24px;height:22px;padding:0;border:1px solid var(--line2);border-radius:6px;background:none";
    pick.oninput = () => on(pick.value); r.appendChild(pick); return r;
  }
  const SWATCHES = ["#ffffff", "#5b5bf0", "#0fb5a8", "#f59e0b", "#e5484d", "#1a1d29"];

  function renderProps() {
    const host = $("#props"); host.innerHTML = "";
    const sel = S.state.selection;
    if (!sel.length) {
      host.appendChild(el("div", "prop-empty", "Select an element on the canvas to edit it.<br><br>Tip: <b>space-drag</b> to pan · <b>scroll</b> to zoom · <b>Frame</b> to recenter."));
      return;
    }
    if (sel.length > 1) {
      const box = el("div", "prop"); box.innerHTML = `<h4><span class="dot"></span>${sel.length} selected</h4>`;
      const row = el("div"); row.style.cssText = "display:flex;gap:8px";
      const dup = el("button", "row2".replace("row2", "") + "tool", "Duplicate"); dup.style.cssText = "flex:1;padding:8px;border:1px solid var(--line2);border-radius:8px;background:#fff;font-weight:600;color:var(--ink-dim)"; dup.onclick = () => S.duplicateSelected();
      const del = el("button", null, "Delete"); del.style.cssText = "flex:1;padding:8px;border:1px solid var(--line2);border-radius:8px;background:#fff;font-weight:600;color:var(--danger)"; del.onclick = () => S.removeSelected();
      row.appendChild(dup); row.appendChild(del); box.appendChild(row); host.appendChild(box); return;
    }
    const elx = S.getEl(sel[0]); if (!elx) return;
    const up = (patch) => S.updateEl(elx.id, patch);
    const upp = (patch) => S.updateProps(elx.id, patch);

    // position & size
    const pos = el("div", "prop"); pos.innerHTML = `<h4><span class="dot"></span>${S.LABELS[elx.type]} — Position & Size</h4>`;
    const fxy = el("div", "field"); fxy.appendChild(el("label", null, "X / Y")); const xy = el("div", "xy");
    xy.appendChild(numInput(elx.x, v => up({ x: v }))); xy.appendChild(numInput(elx.y, v => up({ y: v }))); fxy.appendChild(xy); pos.appendChild(fxy);
    const fwh = el("div", "field"); fwh.appendChild(el("label", null, "W / H")); const wh = el("div", "xy");
    wh.appendChild(numInput(elx.w, v => up({ w: v }))); wh.appendChild(numInput(elx.h, v => up({ h: v }))); fwh.appendChild(wh); pos.appendChild(fwh);
    const fill = el("button", null, "⛶ Fill Live Area");
    fill.style.cssText = "width:100%;margin-top:4px;padding:8px;border:1px solid var(--line2);border-radius:8px;background:#fff;font-weight:600;color:var(--ink-dim);font-size:11px";
    fill.onclick = () => up({ x: 0, y: 0, w: S.CANVAS_W, h: S.CANVAS_H });
    pos.appendChild(fill);
    host.appendChild(pos);

    // universal Transform & FX (opacity, rotation, blur/brightness/saturate/hue)
    const fxBox = el("div", "prop"); fxBox.innerHTML = `<h4><span class="dot"></span>Transform &amp; FX</h4>`;
    const rng = (label, val, min, max, step, on) => {
      const f = el("div", "field"); const l = el("label", null, label + ` <b style="color:var(--ink-dim)">${(+val).toFixed(step < 1 ? 2 : 0)}</b>`);
      const i = el("input"); i.type = "range"; i.min = min; i.max = max; i.step = step; i.value = val;
      i.oninput = () => { l.querySelector("b").textContent = (+i.value).toFixed(step < 1 ? 2 : 0); on(parseFloat(i.value)); };
      f.appendChild(l); f.appendChild(i); return f;
    };
    const fx = elx.fx || { blur: 0, brightness: 1, saturate: 1, hue: 0 };
    fxBox.appendChild(rng("Opacity", elx.opacity == null ? 1 : elx.opacity, 0, 1, .05, v => up({ opacity: v })));
    fxBox.appendChild(rng("Rotation°", elx.rotation || 0, -180, 180, 1, v => up({ rotation: v })));
    fxBox.appendChild(rng("Blur", fx.blur || 0, 0, 20, .5, v => up({ fx: Object.assign({}, elx.fx, { blur: v }) })));
    fxBox.appendChild(rng("Brightness", fx.brightness == null ? 1 : fx.brightness, 0, 2, .05, v => up({ fx: Object.assign({}, elx.fx, { brightness: v }) })));
    fxBox.appendChild(rng("Saturation", fx.saturate == null ? 1 : fx.saturate, 0, 2, .05, v => up({ fx: Object.assign({}, elx.fx, { saturate: v }) })));
    fxBox.appendChild(rng("Hue°", fx.hue || 0, 0, 360, 1, v => up({ fx: Object.assign({}, elx.fx, { hue: v }) })));
    host.appendChild(fxBox);

    // type-specific
    const tp = el("div", "prop"); tp.innerHTML = `<h4><span class="dot"></span>Content</h4>`;
    buildTypeFields(elx, tp, up, upp);
    host.appendChild(tp);

    buildScheduler(elx, host);

    // actions
    const act = el("div", "prop"); act.innerHTML = `<h4><span class="dot"></span>Arrange</h4>`;
    const grid = el("div"); grid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:7px";
    const mkBtn = (label, fn, danger) => { const b = el("button", null, label); b.style.cssText = `padding:8px;border:1px solid var(--line2);border-radius:8px;background:#fff;font-weight:600;color:${danger ? "var(--danger)" : "var(--ink-dim)"};font-size:11px`; b.onclick = fn; return b; };
    grid.appendChild(mkBtn("Bring Front", () => S.reorder(elx.id, "front")));
    grid.appendChild(mkBtn("Send Back", () => S.reorder(elx.id, "back")));
    grid.appendChild(mkBtn(elx.locked ? "Unlock" : "Lock", () => up({ locked: !elx.locked })));
    grid.appendChild(mkBtn(elx.hidden ? "Show" : "Hide", () => up({ hidden: !elx.hidden })));
    grid.appendChild(mkBtn("Duplicate", () => S.duplicateSelected()));
    grid.appendChild(mkBtn("Delete", () => S.removeSelected(), true));
    act.appendChild(grid); host.appendChild(act);
  }

  function buildTypeFields(elx, host, up, upp) {
    const p = elx.props;
    const add = (f) => host.appendChild(f);
    const labeled = (label, node) => { const f = el("div", "field"); f.appendChild(el("label", null, label)); f.appendChild(node); return f; };
    const txt = (val, on, ph) => { const i = el("input"); i.type = "text"; i.value = val || ""; if (ph) i.placeholder = ph; i.oninput = () => on(i.value); return i; };
    const url = (val, on) => { const i = el("input"); i.type = "url"; i.value = val || ""; i.placeholder = "https://…"; i.oninput = () => on(i.value); return i; };
    const range = (val, min, max, step, on) => { const i = el("input"); i.type = "range"; i.min = min; i.max = max; i.step = step || 1; i.value = val; i.oninput = () => on(parseFloat(i.value)); return i; };
    const sel = (val, opts, on) => { const s = el("select"); opts.forEach(o => { const op = el("option"); op.value = o[0]; op.textContent = o[1]; if (o[0] === val) op.selected = true; s.appendChild(op); }); s.onchange = () => on(s.value); return s; };

    if (elx.type === "text") {
      const ta = el("textarea"); ta.value = p.text; ta.oninput = () => upp({ text: ta.value }); add(labeled("Text", ta));
      add(labeled("Size", range(p.size, 16, 220, 1, v => upp({ size: v }))));
      add(labeled("Weight", sel(String(p.weight), [["400", "Regular"], ["600", "Semibold"], ["800", "Bold"], ["900", "Black"]], v => upp({ weight: +v }))));
      add(labeled("Align", sel(p.align, [["left", "Left"], ["center", "Center"], ["right", "Right"]], v => upp({ align: v }))));
      add(labeled("Color", swatchRow(SWATCHES, p.color, c => upp({ color: c }))));
    } else if (elx.type === "image") {
      add(labeled("Image URL", url(p.url, v => upp({ url: v }))));
      const ta = el("textarea"); ta.placeholder = "one URL per line for a slideshow"; ta.value = p.slides || "";
      ta.oninput = () => upp({ slides: ta.value }); add(labeled("Slideshow URLs (optional)", ta));
      add(labeled("Slide interval (s)", range(p.interval || 5, 1, 30, 1, v => upp({ interval: v }))));
      add(labeled("Fit", sel(p.fit, [["contain", "Contain"], ["cover", "Cover"], ["100% 100%", "Stretch"]], v => upp({ fit: v }))));
      add(labeled("Corner radius", range(p.radius, 0, 60, 1, v => upp({ radius: v }))));
    } else if (elx.type === "video") {
      add(labeled("Video URL (mp4/webm)", url(p.url, v => upp({ url: v }))));
      add(labeled("Corner radius", range(p.radius, 0, 60, 1, v => upp({ radius: v }))));
      const opts = el("div"); opts.style.cssText = "display:flex;gap:14px;font-size:11px;color:var(--ink-dim)";
      [["loop", "Loop"], ["muted", "Muted"], ["autoplay", "Autoplay"]].forEach(([k, lbl]) => {
        const w = el("label"); w.style.cssText = "display:flex;gap:5px;align-items:center;cursor:pointer";
        const cb = el("input"); cb.type = "checkbox"; cb.checked = p[k]; cb.onchange = () => upp({ [k]: cb.checked });
        w.appendChild(cb); w.appendChild(document.createTextNode(lbl)); opts.appendChild(w);
      });
      add(labeled("Options", opts));
    } else if (elx.type === "timer") {
      add(labeled("Label", txt(p.label, v => upp({ label: v }))));
      add(labeled("Mode", sel(p.mode, [["countdown", "Countdown"], ["countup", "Count up"]], v => upp({ mode: v, running: false }))));
      add(labeled("Duration (seconds)", numInput(p.seconds, v => upp({ seconds: v }))));
      const ctl = el("div"); ctl.style.cssText = "display:flex;gap:7px";
      const startBtn = el("button", null, p.running ? "⏸ Pause" : "▶ Start");
      startBtn.style.cssText = "flex:1;padding:8px;border:1px solid var(--line2);border-radius:8px;background:var(--accent);color:#fff;font-weight:700;border:none";
      startBtn.onclick = () => { if (p.running) upp({ running: false }); else upp({ running: true, endsAt: Date.now() + p.seconds * 1000, startedAt: Date.now() }); };
      const reset = el("button", null, "↺ Reset"); reset.style.cssText = "flex:1;padding:8px;border:1px solid var(--line2);border-radius:8px;background:#fff;font-weight:600;color:var(--ink-dim)";
      reset.onclick = () => upp({ running: false });
      ctl.appendChild(startBtn); ctl.appendChild(reset); add(labeled("Control", ctl));
      add(labeled("Size", range(p.size, 24, 160, 1, v => upp({ size: v }))));
      add(labeled("Number color", swatchRow(SWATCHES, p.color, c => upp({ color: c }))));
      add(labeled("Accent", swatchRow(SWATCHES, p.accent, c => upp({ accent: c }))));
    } else if (elx.type === "shape") {
      add(labeled("Shape", sel(p.kind, [["rect", "Rectangle"], ["circle", "Circle / Ellipse"], ["pill", "Pill"]], v => upp({ kind: v }))));
      add(labeled("Fill", swatchRow(SWATCHES, p.fill, c => upp({ fill: c }))));
      add(labeled("Corner radius", range(p.radius, 0, 100, 1, v => upp({ radius: v }))));
      add(labeled("Opacity", range(p.opacity, .1, 1, .05, v => upp({ opacity: v }))));
    } else if (elx.type === "chat") {
      add(labeled("Title", txt(p.title, v => upp({ title: v }))));
      add(labeled("Max messages", range(p.max, 3, 16, 1, v => upp({ max: v }))));
      add(labeled("Accent / names", swatchRow(SWATCHES, p.accent, c => upp({ accent: c }))));
      const note = el("div"); note.style.cssText = "font-size:10.5px;color:var(--ink-faint);line-height:1.5;margin-top:4px";
      note.innerHTML = "Showing a <b>sample feed</b>. Live Kick / Twitch / YouTube chat connects in a later phase.";
      add(note);
    } else if (elx.type === "progress") {
      add(labeled("Label", txt(p.label, v => upp({ label: v }))));
      const cur = el("div", "field"); cur.appendChild(el("label", null, "Current / Target")); const xy = el("div", "xy");
      xy.appendChild(numInput(p.current, v => upp({ current: v }))); xy.appendChild(numInput(p.target, v => upp({ target: v }))); cur.appendChild(xy); add(cur);
      add(labeled("Accent", swatchRow(SWATCHES, p.accent, c => upp({ accent: c }))));
    } else if (elx.type === "ticker") {
      const ta = el("textarea"); ta.value = p.text; ta.oninput = () => upp({ text: ta.value }); add(labeled("Ticker text", ta));
      add(labeled("Speed", range(p.speed, 20, 200, 5, v => upp({ speed: v }))));
      add(labeled("Font size", range(p.size, 14, 64, 1, v => upp({ size: v }))));
      add(labeled("Color", swatchRow(SWATCHES, p.color, c => upp({ color: c }))));
    } else if (elx.type === "todo") {
      add(labeled("Title", txt(p.title, v => upp({ title: v }))));
      const ta = el("textarea"); ta.style.minHeight = "90px";
      ta.value = (p.items || []).map(i => (i.done ? "x " : "") + i.text).join("\n");
      ta.oninput = () => upp({ items: ta.value.split("\n").filter(l => l.trim()).map(l => { const d = /^x\s+/i.test(l); return { text: l.replace(/^x\s+/i, ""), done: d }; }) });
      add(labeled("Items (prefix 'x ' = done)", ta));
      add(labeled("Accent", swatchRow(SWATCHES, p.accent, c => upp({ accent: c }))));
    } else if (elx.type === "tally") {
      add(labeled("Label", txt(p.label, v => upp({ label: v }))));
      const ctl = el("div"); ctl.style.cssText = "display:flex;gap:7px;align-items:center";
      const minus = el("button", null, "−"); const plus = el("button", null, "+");
      [minus, plus].forEach(b => b.style.cssText = "width:34px;padding:7px;border:1px solid var(--line2);border-radius:8px;background:#fff;font-weight:800;color:var(--ink-dim)");
      const numWrap = el("div"); numWrap.style.flex = "1"; numWrap.appendChild(numInput(p.count, v => upp({ count: v })));
      minus.onclick = () => upp({ count: (S.getEl(elx.id).props.count || 0) - 1 });
      plus.onclick = () => upp({ count: (S.getEl(elx.id).props.count || 0) + 1 });
      ctl.appendChild(minus); ctl.appendChild(numWrap); ctl.appendChild(plus); add(labeled("Count", ctl));
      add(labeled("Number color", swatchRow(SWATCHES, p.color, c => upp({ color: c }))));
      add(labeled("Accent", swatchRow(SWATCHES, p.accent, c => upp({ accent: c }))));
    } else if (elx.type === "poll") {
      add(labeled("Question", txt(p.question, v => upp({ question: v }))));
      const ta = el("textarea"); ta.style.minHeight = "90px";
      ta.value = (p.options || []).map(o => o.label + ", " + (o.votes || 0)).join("\n");
      ta.oninput = () => upp({ options: ta.value.split("\n").filter(l => l.trim()).map(l => { const m = l.split(","); return { label: (m[0] || "").trim(), votes: parseInt(m[1]) || 0 }; }) });
      add(labeled("Options (Label, votes)", ta));
      add(labeled("Accent", swatchRow(SWATCHES, p.accent, c => upp({ accent: c }))));
    } else if (elx.type === "alertbox") {
      add(labeled("Headline", txt(p.headline, v => upp({ headline: v }))));
      add(labeled("Subtext", txt(p.sub, v => upp({ sub: v }))));
      add(labeled("Icon (emoji)", txt(p.icon, v => upp({ icon: v }))));
      add(labeled("Accent", swatchRow(SWATCHES, p.accent, c => upp({ accent: c }))));
      const trig = el("button", null, "▶ Trigger Test Alert");
      trig.style.cssText = "width:100%;margin-top:4px;padding:9px;border:none;border-radius:8px;background:var(--accent);color:#fff;font-weight:700";
      trig.onclick = () => { upp({ triggerSeq: (S.getEl(elx.id).props.triggerSeq || 0) + 1 }); toast("Alert triggered"); };
      add(labeled("", trig));
      const note = el("div"); note.style.cssText = "font-size:10.5px;color:var(--ink-faint);line-height:1.5;margin-top:4px";
      note.innerHTML = "Real Sub/Follow/Raid/Bits events auto-fire this in a later phase.";
      add(note);
    } else if (elx.type === "qr") {
      add(labeled("Data / URL", txt(p.data, v => upp({ data: v }))));
      add(labeled("Caption (optional)", txt(p.label, v => upp({ label: v }))));
      add(labeled("Modules", swatchRow(["#000000", "#5b5bf0", "#0fb5a8", "#ffffff"], p.color, c => upp({ color: c }))));
      add(labeled("Background", swatchRow(["#ffffff", "#000000", "#11131c"], p.bg, c => upp({ bg: c }))));
    } else if (elx.type === "eventlist") {
      add(labeled("Title", txt(p.title, v => upp({ title: v }))));
      const ta = el("textarea"); ta.style.minHeight = "90px";
      ta.value = (p.events || []).map(e => (e.icon || "") + " " + e.text).join("\n");
      ta.oninput = () => upp({ events: ta.value.split("\n").filter(l => l.trim()).map(l => { const m = l.trim().match(/^(\p{Emoji}|\S)?\s*(.*)$/u); return { icon: (m && m[1]) || "•", text: (m && m[2]) || l.trim() }; }) });
      add(labeled("Events (icon + text per line)", ta));
      add(labeled("Accent", swatchRow(SWATCHES, p.accent, c => upp({ accent: c }))));
    } else if (elx.type === "browser") {
      add(labeled("Website URL", url(p.url, v => upp({ url: v }))));
      add(labeled("Corner radius", range(p.radius, 0, 40, 1, v => upp({ radius: v }))));
      const w = el("label"); w.style.cssText = "display:flex;gap:6px;align-items:center;font-size:11px;color:var(--ink-dim);cursor:pointer";
      const cb = el("input"); cb.type = "checkbox"; cb.checked = p.interactive; cb.onchange = () => upp({ interactive: cb.checked });
      w.appendChild(cb); w.appendChild(document.createTextNode("Interactive (allow clicks)")); add(labeled("", w));
    } else if (elx.type === "customcode") {
      const mk = (lab, key, ph) => { const t = el("textarea"); t.style.minHeight = "70px"; t.style.fontFamily = "var(--mono)"; t.style.fontSize = "11px"; t.placeholder = ph; t.value = p[key] || ""; t.oninput = () => upp({ [key]: t.value }); return labeled(lab, t); };
      add(mk("HTML", "html", "<div>…</div>"));
      add(mk("CSS", "css", "div{color:#fff}"));
      add(mk("JS", "js", "// runs in a sandboxed iframe"));
      const note = el("div"); note.style.cssText = "font-size:10.5px;color:var(--ink-faint);line-height:1.5;margin-top:4px";
      note.innerHTML = "Runs in a <b>sandboxed</b> iframe (allow-scripts). Great for custom animations &amp; data tickers.";
      add(note);
    }
  }

  // universal auto-scheduler section (loops element visibility on the live overlay)
  function buildScheduler(elx, host) {
    const sc = elx.schedule || { enabled: false, showSec: 10, hideSec: 60 };
    const box = el("div", "prop"); box.innerHTML = `<h4><span class="dot"></span>Auto-Scheduler</h4>`;
    const toggle = el("label"); toggle.style.cssText = "display:flex;gap:7px;align-items:center;font-size:11.5px;color:var(--ink-dim);cursor:pointer;margin-bottom:8px";
    const cb = el("input"); cb.type = "checkbox"; cb.checked = sc.enabled;
    cb.onchange = () => S.updateEl(elx.id, { schedule: Object.assign({}, S.getEl(elx.id).schedule, { enabled: cb.checked }) });
    toggle.appendChild(cb); toggle.appendChild(document.createTextNode("Loop visibility on a timer"));
    box.appendChild(toggle);
    const xy = el("div", "xy");
    const mk = (label, key, val) => { const f = el("div"); f.style.flex = "1"; f.appendChild(el("label", null, label)); f.firstChild.style.cssText = "font-size:10px;color:var(--ink-faint);display:block;margin-bottom:4px;font-weight:600"; f.appendChild(numInput(val, v => S.updateEl(elx.id, { schedule: Object.assign({}, S.getEl(elx.id).schedule, { [key]: v }) }))); return f; };
    xy.appendChild(mk("Show (s)", "showSec", sc.showSec)); xy.appendChild(mk("Hide (s)", "hideSec", sc.hideSec));
    box.appendChild(xy);
    const note = el("div"); note.style.cssText = "font-size:10px;color:var(--ink-faint);line-height:1.4;margin-top:7px";
    note.textContent = "Fades the element in/out over time on the live overlay (great for rotating logos/watermarks). Stays visible here while editing.";
    box.appendChild(note); host.appendChild(box);
  }

  // ---------- account header (sample until Phase 2 auth) ----------
  function renderAccount() {
    $("#acctName").textContent = "bookhockeys";
    $("#badges").innerHTML = `<span class="pf k">KICK</span><span class="pf t">TWITCH</span><span class="pf y">YT</span>`;
  }

  // ---------- boot ----------
  function init() {
    viewport = $("#viewport"); channelId = "dev-local";
    SY.init({ channelId });
    C.init({
      viewport, world: $("#world"), frame: $("#frame"), frameLabel: $("#frameLabel"),
      content: $("#content"), ui: $("#ui"), dots: $("#dots"),
      onViewChange: (s) => { $("#zoomVal").textContent = Math.round(s * 100) + "%"; },
    });
    buildPalette(); wireBroadcast(); wirePresets(); wireToolbar(); wireObs(); wireSoundboard();
    renderAccount(); renderLists(); updateLivePill(false);
    S.on("select", renderProps); renderProps();
    // seed a friendly starter so the canvas isn't empty on first load
    if (!S.state.staging.order.length) seed();
  }
  function seed() {
    S.addElement("chat", { x: 300, y: 620 });
    S.addElement("timer", { x: 1560, y: 180 });
    S.addElement("text", { x: 960, y: 160 });
    const ids = S.state.staging.order;
    const t = S.getEl(ids[ids.length - 1]); if (t) S.updateProps(t.id, { text: "LIVE NOW", size: 96, align: "center", color: "#ffffff" });
    S.clearSelection();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
