/* ModDeck widgets — shared content renderers used by BOTH the dashboard canvas and the
   OBS overlay, guaranteeing staging preview == live output.
   Each renderer: create(el) -> { node, update(el), destroy() }.
   Time-based widgets (timer) and the sample chat feed are driven by one shared ticker so
   they update in place without re-rendering the whole board.
   Exposed as window.MD.widgets. */
(function () {
  window.MD = window.MD || {};
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---- shared ticker (1Hz + on-demand) ----
  const tickers = new Set();
  setInterval(() => tickers.forEach(fn => { try { fn(); } catch {} }), 250);

  // ---- sample chat feed (until real adapters land in Phase 5) ----
  const SAMPLE = [
    { p: "kick", u: "ninjafan_", m: "let's gooo 🔥" },
    { p: "twitch", u: "kayJ", m: "poggers" },
    { p: "youtube", u: "mariaP", m: "first time catching live!" },
    { p: "kick", u: "m0d_alex", m: "cleaned up chat 🧹", mod: true },
    { p: "twitch", u: "grindset", m: "W stream" },
    { p: "youtube", u: "leoo", m: "what game is this?" },
    { p: "kick", u: "streamer", m: "ty for the raid!", mod: true },
    { p: "twitch", u: "z3ke", m: "LETSGO" },
  ];
  const PCOLOR = { kick: "#53fc18", twitch: "#a970ff", youtube: "#ff4d4d" };

  // =========================================================================
  const R = {};

  R.text = function (el) {
    const n = document.createElement("div");
    n.style.cssText = "width:100%;height:100%;display:flex;overflow:hidden;line-height:1.15";
    function update(el) {
      const p = el.props;
      n.style.alignItems = "center";
      n.style.justifyContent = p.align === "center" ? "center" : p.align === "right" ? "flex-end" : "flex-start";
      n.style.textAlign = p.align;
      n.style.background = p.bg || "transparent";
      n.style.borderRadius = "6px";
      n.innerHTML = "";
      const span = document.createElement("div");
      span.textContent = p.text || "";
      span.style.cssText = `font-family:${p.font || "Inter"},sans-serif;font-size:${p.size}px;font-weight:${p.weight};color:${p.color};width:100%`;
      if (p.stroke > 0) span.style.webkitTextStroke = `${p.stroke}px ${p.strokeColor}`;
      n.appendChild(span);
    }
    update(el); return { node: n, update };
  };

  R.image = function (el) {
    const n = document.createElement("div");
    n.style.cssText = "width:100%;height:100%;overflow:hidden";
    const img = document.createElement("div");
    img.style.cssText = "width:100%;height:100%;background-repeat:no-repeat;background-position:center";
    const ph = document.createElement("div");
    ph.style.cssText = "width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#5b6173;font-size:13px;background:#1c2030;border:1.5px dashed #3a4055;border-radius:inherit";
    ph.textContent = "🖼️ image URL";
    function update(el) {
      const p = el.props;
      n.style.borderRadius = p.radius + "px"; n.style.opacity = p.opacity;
      n.innerHTML = "";
      if (p.url) { img.style.backgroundImage = `url("${p.url}")`; img.style.backgroundSize = p.fit; img.style.borderRadius = p.radius + "px"; n.appendChild(img); }
      else n.appendChild(ph);
    }
    update(el); return { node: n, update };
  };

  R.video = function (el) {
    const n = document.createElement("div");
    n.style.cssText = "width:100%;height:100%;overflow:hidden";
    let cur = "";
    function update(el) {
      const p = el.props; n.style.borderRadius = p.radius + "px";
      if (p.url && p.url !== cur) {
        cur = p.url; n.innerHTML = "";
        const v = document.createElement("video");
        v.src = p.url; v.loop = p.loop; v.muted = p.muted; v.autoplay = p.autoplay; v.playsInline = true;
        v.style.cssText = `width:100%;height:100%;object-fit:cover;border-radius:${p.radius}px`;
        n.appendChild(v); v.play && v.play().catch(() => {});
      } else if (!p.url) {
        cur = ""; n.innerHTML = "";
        const ph = document.createElement("div");
        ph.style.cssText = "width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#5b6173;font-size:13px;background:#1c2030;border:1.5px dashed #3a4055;border-radius:inherit";
        ph.textContent = "🎬 video URL"; n.appendChild(ph);
      }
    }
    update(el); return { node: n, update };
  };

  R.timer = function (el) {
    const n = document.createElement("div");
    n.style.cssText = "width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px";
    const t = document.createElement("div"), lab = document.createElement("div");
    t.style.cssText = "font-weight:800;font-variant-numeric:tabular-nums;line-height:1";
    lab.style.cssText = "font-weight:700;letter-spacing:3px;text-transform:uppercase";
    n.appendChild(t); n.appendChild(lab);
    let cur = el;
    function fmt(s) { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
      return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(ss).padStart(2, "0"); }
    function paint() {
      const p = cur.props; let secs = p.seconds;
      if (p.mode === "countdown" && p.running && p.endsAt) secs = (p.endsAt - Date.now()) / 1000;
      else if (p.mode === "countup" && p.running && p.startedAt) secs = (Date.now() - p.startedAt) / 1000;
      t.textContent = fmt(secs);
      t.style.fontSize = p.size + "px"; t.style.color = p.color;
      lab.style.color = p.accent; lab.style.fontSize = Math.max(10, p.size * .18) + "px";
      lab.textContent = p.label || "";
    }
    function update(el) { cur = el; paint(); }
    tickers.add(paint); update(el);
    return { node: n, update, destroy() { tickers.delete(paint); } };
  };

  R.shape = function (el) {
    const n = document.createElement("div"); n.style.cssText = "width:100%;height:100%";
    function update(el) {
      const p = el.props; n.style.opacity = p.opacity;
      n.style.background = p.fill;
      n.style.border = p.border > 0 ? `${p.border}px solid ${p.borderColor}` : "none";
      if (p.kind === "circle") n.style.borderRadius = "50%";
      else if (p.kind === "pill") n.style.borderRadius = "999px";
      else n.style.borderRadius = p.radius + "px";
    }
    update(el); return { node: n, update };
  };

  R.chat = function (el) {
    const n = document.createElement("div");
    n.style.cssText = "width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden;border-radius:12px;backdrop-filter:blur(6px)";
    const hd = document.createElement("div");
    hd.style.cssText = "font-size:11px;font-weight:800;letter-spacing:1.5px;padding:9px 11px 6px;flex:none";
    const list = document.createElement("div");
    list.style.cssText = "flex:1;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;gap:5px;padding:4px 11px 10px";
    n.appendChild(hd); n.appendChild(list);
    let cur = el, feed = [], i = 0;
    function row(msg, p) {
      const r = document.createElement("div");
      r.style.cssText = "font-size:14px;line-height:1.3;color:" + p.text;
      const dot = p.showPlatform ? `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${PCOLOR[msg.p]};margin-right:6px;vertical-align:middle"></span>` : "";
      const modb = msg.mod ? `<span style="color:${p.accent};font-weight:800;margin-right:4px">⚔</span>` : "";
      r.innerHTML = `${dot}${modb}<b style="color:${p.accent};font-weight:700">${esc(msg.u)}</b><span style="opacity:.6">:</span> ${esc(msg.m)}`;
      return r;
    }
    function paint() {
      const p = cur.props; n.style.background = p.bg;
      hd.textContent = p.title; hd.style.color = p.accent;
      while (list.children.length > (p.max || 8)) list.removeChild(list.firstChild);
      feed.forEach(() => {});
      list.innerHTML = "";
      feed.slice(-(p.max || 8)).forEach(m => list.appendChild(row(m, p)));
    }
    // sample feed grows over time so the overlay looks alive in Phase 1
    let last = 0;
    function tick() {
      if (Date.now() - last > 2600) { last = Date.now(); feed.push(SAMPLE[i % SAMPLE.length]); i++; if (feed.length > 12) feed.shift(); paint(); }
    }
    function update(el) { cur = el; paint(); }
    feed = SAMPLE.slice(0, 4); tickers.add(tick); update(el);
    return { node: n, update, destroy() { tickers.delete(tick); } };
  };

  // =========================================================================
  function create(el) {
    const f = R[el.type]; if (!f) { const d = document.createElement("div"); d.textContent = el.type; return { node: d, update() {}, destroy() {} }; }
    return f(el);
  }

  // A WidgetLayer diffs a board {order, els} onto a container, reusing instances by id.
  // wrapEl(id) optionally returns a wrapper element to place content into (dashboard uses
  // this to add selection handles); overlay passes none and we create plain positioned divs.
  function Layer(container, makeWrapper) {
    const insts = new Map(); // id -> { wrap, inst }
    function render(board) {
      const seen = new Set();
      board.order.forEach((id, idx) => {
        const el = board.els[id]; if (!el) return; seen.add(id);
        let rec = insts.get(id);
        if (!rec) {
          const inst = create(el);
          const wrap = makeWrapper ? makeWrapper(el) : document.createElement("div");
          if (!makeWrapper) wrap.style.position = "absolute";
          wrap.appendChild(inst.node);
          rec = { wrap, inst, type: el.type }; insts.set(id, rec); container.appendChild(wrap);
        } else if (rec.type !== el.type) {           // type changed -> rebuild
          rec.inst.destroy && rec.inst.destroy(); rec.wrap.remove();
          const inst = create(el); const wrap = makeWrapper ? makeWrapper(el) : document.createElement("div");
          if (!makeWrapper) wrap.style.position = "absolute"; wrap.appendChild(inst.node);
          rec = { wrap, inst, type: el.type }; insts.set(id, rec); container.appendChild(wrap);
        }
        // position the wrapper (overlay path; dashboard supplies its own via makeWrapper update)
        if (!makeWrapper) {
          rec.wrap.style.left = el.x + "px"; rec.wrap.style.top = el.y + "px";
          rec.wrap.style.width = el.w + "px"; rec.wrap.style.height = el.h + "px";
          rec.wrap.style.zIndex = idx; rec.wrap.style.display = el.hidden ? "none" : "block";
        }
        rec.inst.update(el);
      });
      // remove gone
      insts.forEach((rec, id) => { if (!seen.has(id)) { rec.inst.destroy && rec.inst.destroy(); rec.wrap.remove(); insts.delete(id); } });
    }
    return { render, instances: insts };
  }

  window.MD.widgets = { create, Layer, LABELS: { text:"Text", image:"Image", video:"Video", timer:"Timer", shape:"Shape", chat:"Combined Chat" } };
})();
