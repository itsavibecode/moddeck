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

  // ---- shared keyframes (injected once) ----
  (function injectCss() {
    const s = document.createElement("style");
    s.textContent = "@keyframes md-marquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}" +
      "@keyframes md-alert-in{0%{transform:translateY(18px) scale(.92);opacity:0}60%{transform:translateY(-3px) scale(1.02);opacity:1}100%{transform:translateY(0) scale(1);opacity:1}}";
    document.head.appendChild(s);
  })();

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
    n.style.cssText = "width:100%;height:100%;overflow:hidden;position:relative";
    const img = document.createElement("div");
    img.style.cssText = "width:100%;height:100%;background-repeat:no-repeat;background-position:center;transition:opacity .5s";
    const ph = document.createElement("div");
    ph.style.cssText = "width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#5b6173;font-size:13px;background:#1c2030;border:1.5px dashed #3a4055;border-radius:inherit";
    ph.textContent = "🖼️ image URL";
    let slides = [], idx = 0, lastSwap = 0, cur = el;
    function paint() {
      const p = cur.props; n.style.borderRadius = p.radius + "px"; n.style.opacity = p.opacity;
      slides = (p.slides ? p.slides.split(/[\n,]/).map(s => s.trim()).filter(Boolean) : []);
      if (!slides.length && p.url) slides = [p.url];
      n.innerHTML = "";
      if (slides.length) {
        if (idx >= slides.length) idx = 0;
        img.style.backgroundImage = `url("${slides[idx]}")`; img.style.backgroundSize = p.fit; img.style.borderRadius = p.radius + "px";
        n.appendChild(img);
      } else n.appendChild(ph);
    }
    function tick() {
      const p = cur.props; if (slides.length > 1 && Date.now() - lastSwap > (p.interval || 5) * 1000) { lastSwap = Date.now(); idx = (idx + 1) % slides.length; paint(); }
    }
    function update(el) { cur = el; paint(); }
    tickers.add(tick); update(el);
    return { node: n, update, destroy() { tickers.delete(tick); } };
  };

  R.qr = function (el) {
    const n = document.createElement("div");
    n.style.cssText = "width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:8px;box-sizing:border-box;border-radius:10px";
    const box = document.createElement("div"); box.style.cssText = "flex:1;width:100%;display:flex;align-items:center;justify-content:center;min-height:0";
    const lab = document.createElement("div"); lab.style.cssText = "font-size:14px;font-weight:700;flex:none";
    n.appendChild(box); n.appendChild(lab);
    let cur = "";
    function update(el) {
      const p = el.props; n.style.background = p.bg; lab.textContent = p.label || ""; lab.style.color = p.color;
      lab.style.display = p.label ? "block" : "none";
      const key = p.data + p.color + p.bg;
      if (key === cur) return; cur = key;
      box.innerHTML = "";
      if (typeof window.qrcode === "function" && p.data) {
        try {
          const qr = window.qrcode(0, "M"); qr.addData(p.data); qr.make();
          box.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 1, scalable: true });
          const svg = box.querySelector("svg");
          if (svg) { svg.style.cssText = "width:100%;height:100%;max-width:100%;max-height:100%"; svg.querySelectorAll("path,rect").forEach((s, i) => { if (i > 0 || s.tagName === "path") s.setAttribute("fill", p.color); }); const bg0 = svg.querySelector("rect"); if (bg0) bg0.setAttribute("fill", p.bg); }
        } catch (e) { box.textContent = "QR error"; }
      } else { box.style.cssText += ";color:#5b6173;font-size:12px;text-align:center;word-break:break-all"; box.textContent = p.data || "QR data"; }
    }
    update(el); return { node: n, update };
  };

  R.eventlist = function (el) {
    const n = document.createElement("div");
    n.style.cssText = "width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden;border-radius:12px;padding:11px 14px;box-sizing:border-box";
    const hd = document.createElement("div"); hd.style.cssText = "font-size:13px;font-weight:800;letter-spacing:1.5px;margin-bottom:8px";
    const list = document.createElement("div"); list.style.cssText = "display:flex;flex-direction:column;gap:7px;overflow:hidden";
    n.appendChild(hd); n.appendChild(list);
    function update(el) {
      const p = el.props; n.style.background = p.bg; hd.textContent = p.title; hd.style.color = p.accent;
      list.innerHTML = "";
      (p.events || []).slice(0, p.max || 8).forEach(ev => {
        const r = document.createElement("div"); r.style.cssText = `font-size:15px;color:${p.color};display:flex;gap:9px;align-items:center`;
        r.innerHTML = `<span style="flex:none">${esc(ev.icon || "•")}</span><span>${esc(ev.text)}</span>`;
        list.appendChild(r);
      });
    }
    update(el); return { node: n, update };
  };

  R.browser = function (el) {
    const n = document.createElement("div"); n.style.cssText = "width:100%;height:100%;overflow:hidden";
    let cur = null;
    function update(el) {
      const p = el.props; n.style.borderRadius = p.radius + "px";
      if (p.url !== cur) {
        cur = p.url; n.innerHTML = "";
        if (p.url) {
          const f = document.createElement("iframe"); f.src = p.url;
          f.style.cssText = `width:100%;height:100%;border:0;border-radius:${p.radius}px;pointer-events:${p.interactive ? "auto" : "none"}`;
          n.appendChild(f);
        } else {
          const ph = document.createElement("div"); ph.style.cssText = "width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#5b6173;font-size:13px;background:#1c2030;border:1.5px dashed #3a4055;border-radius:inherit"; ph.textContent = "🌐 website URL"; n.appendChild(ph);
        }
      }
      const f = n.querySelector("iframe"); if (f) f.style.pointerEvents = p.interactive ? "auto" : "none";
    }
    update(el); return { node: n, update };
  };

  R.customcode = function (el) {
    const n = document.createElement("div"); n.style.cssText = "width:100%;height:100%;overflow:hidden";
    const f = document.createElement("iframe"); f.setAttribute("sandbox", "allow-scripts");
    f.style.cssText = "width:100%;height:100%;border:0;background:transparent"; n.appendChild(f);
    let cur = "";
    function update(el) {
      const p = el.props; const key = p.html + "||" + p.css + "||" + p.js;
      if (key === cur) return; cur = key;
      f.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}${p.css || ""}</style></head><body>${p.html || ""}<script>try{${p.js || ""}}catch(e){}<\/script></body></html>`;
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

  R.progress = function (el) {
    const n = document.createElement("div");
    n.style.cssText = "width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;gap:8px;padding:12px 16px;border-radius:12px;box-sizing:border-box";
    const lab = document.createElement("div"), barWrap = document.createElement("div"), fill = document.createElement("div");
    lab.style.cssText = "font-size:16px;font-weight:700;display:flex;justify-content:space-between;gap:10px";
    barWrap.style.cssText = "height:14px;border-radius:9px;overflow:hidden;background:rgba(255,255,255,.14)";
    fill.style.cssText = "height:100%;border-radius:9px;transition:width .5s cubic-bezier(.4,0,.2,1)";
    barWrap.appendChild(fill); n.appendChild(lab); n.appendChild(barWrap);
    function update(el) {
      const p = el.props; n.style.background = p.bg; lab.style.color = p.color;
      const pct = p.target > 0 ? Math.min(100, Math.round((p.current / p.target) * 100)) : 0;
      lab.innerHTML = `<span>${esc(p.label)}</span><span style="color:${p.accent}">${p.current}/${p.target}${p.showPercent ? " · " + pct + "%" : ""}</span>`;
      fill.style.width = pct + "%"; fill.style.background = `linear-gradient(90deg, ${p.accent}, ${p.accent}cc)`;
    }
    update(el); return { node: n, update };
  };

  R.ticker = function (el) {
    const n = document.createElement("div");
    n.style.cssText = "width:100%;height:100%;display:flex;align-items:center;overflow:hidden;border-radius:10px";
    const track = document.createElement("div");
    track.style.cssText = "display:flex;white-space:nowrap;will-change:transform";
    const a = document.createElement("span"), b = document.createElement("span");
    a.style.paddingRight = b.style.paddingRight = "60px"; track.appendChild(a); track.appendChild(b); n.appendChild(track);
    let cur = "";
    function update(el) {
      const p = el.props; n.style.background = p.bg;
      a.textContent = b.textContent = p.text;
      a.style.cssText = b.style.cssText = `padding-right:60px;font-size:${p.size}px;font-weight:700;color:${p.color}`;
      const dur = Math.max(6, (p.text.length * 0.9) * (60 / Math.max(10, p.speed)));
      if (cur !== p.text + p.speed) { cur = p.text + p.speed; track.style.animation = "none"; void track.offsetWidth; track.style.animation = `md-marquee ${dur}s linear infinite`; }
    }
    update(el); return { node: n, update };
  };

  R.todo = function (el) {
    const n = document.createElement("div");
    n.style.cssText = "width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden;border-radius:12px;padding:11px 14px;box-sizing:border-box";
    const hd = document.createElement("div"); hd.style.cssText = "font-size:13px;font-weight:800;letter-spacing:1.5px;margin-bottom:8px";
    const list = document.createElement("div"); list.style.cssText = "display:flex;flex-direction:column;gap:7px;overflow:hidden";
    n.appendChild(hd); n.appendChild(list);
    function update(el) {
      const p = el.props; n.style.background = p.bg; hd.textContent = p.title; hd.style.color = p.accent;
      list.innerHTML = "";
      (p.items || []).forEach(it => {
        const r = document.createElement("div"); r.style.cssText = `font-size:16px;color:${p.color};display:flex;gap:9px;align-items:center;${it.done ? "opacity:.55" : ""}`;
        r.innerHTML = `<span style="color:${p.accent};font-weight:800">${it.done ? "☑" : "☐"}</span><span style="${it.done ? "text-decoration:line-through" : ""}">${esc(it.text)}</span>`;
        list.appendChild(r);
      });
    }
    update(el); return { node: n, update };
  };

  R.tally = function (el) {
    const n = document.createElement("div");
    n.style.cssText = "width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border-radius:12px";
    const c = document.createElement("div"), lab = document.createElement("div");
    c.style.cssText = "font-weight:800;line-height:1;font-variant-numeric:tabular-nums";
    lab.style.cssText = "font-weight:700;letter-spacing:3px;text-transform:uppercase";
    n.appendChild(c); n.appendChild(lab);
    function update(el) {
      const p = el.props; n.style.background = p.bg;
      c.textContent = p.count; c.style.color = p.color; c.style.fontSize = Math.min(el.h * .5, el.w * .4) + "px";
      lab.textContent = p.label; lab.style.color = p.accent; lab.style.fontSize = "14px";
    }
    update(el); return { node: n, update };
  };

  R.poll = function (el) {
    const n = document.createElement("div");
    n.style.cssText = "width:100%;height:100%;display:flex;flex-direction:column;gap:9px;overflow:hidden;border-radius:12px;padding:13px 16px;box-sizing:border-box";
    const q = document.createElement("div"); q.style.cssText = "font-size:18px;font-weight:800";
    const opts = document.createElement("div"); opts.style.cssText = "display:flex;flex-direction:column;gap:8px";
    n.appendChild(q); n.appendChild(opts);
    function update(el) {
      const p = el.props; n.style.background = p.bg; q.textContent = p.question; q.style.color = p.color;
      const total = (p.options || []).reduce((s, o) => s + (+o.votes || 0), 0) || 1;
      opts.innerHTML = "";
      (p.options || []).forEach(o => {
        const pct = Math.round((+o.votes || 0) / total * 100);
        const row = document.createElement("div"); row.style.cssText = "position:relative;border-radius:8px;overflow:hidden;background:rgba(255,255,255,.1);padding:7px 11px";
        const bar = document.createElement("div"); bar.style.cssText = `position:absolute;left:0;top:0;bottom:0;width:${pct}%;background:${p.accent};opacity:.55;transition:width .5s`;
        const txt = document.createElement("div"); txt.style.cssText = `position:relative;display:flex;justify-content:space-between;font-size:15px;font-weight:600;color:${p.color}`;
        txt.innerHTML = `<span>${esc(o.label)}</span><span>${pct}%</span>`;
        row.appendChild(bar); row.appendChild(txt); opts.appendChild(row);
      });
    }
    update(el); return { node: n, update };
  };

  R.alertbox = function (el) {
    const n = document.createElement("div");
    n.style.cssText = "width:100%;height:100%;display:flex;align-items:center;gap:16px;border-radius:14px;padding:0 22px;box-sizing:border-box;overflow:hidden";
    const ic = document.createElement("div"); ic.style.cssText = "font-size:48px;line-height:1;flex:none";
    const txt = document.createElement("div"); txt.style.cssText = "display:flex;flex-direction:column;gap:4px;min-width:0";
    const hl = document.createElement("div"), sub = document.createElement("div");
    hl.style.cssText = "font-size:30px;font-weight:800;line-height:1.05";
    sub.style.cssText = "font-size:18px;opacity:.85";
    txt.appendChild(hl); txt.appendChild(sub); n.appendChild(ic); n.appendChild(txt);
    let lastSeq = null;
    function update(el) {
      const p = el.props; n.style.background = p.bg; n.style.borderLeft = `5px solid ${p.accent}`;
      ic.textContent = p.icon || "🎉"; hl.textContent = p.headline; hl.style.color = p.color;
      sub.textContent = p.sub; sub.style.color = p.accent;
      if (p.triggerSeq !== lastSeq) { lastSeq = p.triggerSeq; n.style.animation = "none"; void n.offsetWidth; n.style.animation = "md-alert-in .6s cubic-bezier(.2,.8,.2,1)"; }
    }
    update(el); return { node: n, update };
  };

  // =========================================================================
  function create(el) {
    const f = R[el.type]; if (!f) { const d = document.createElement("div"); d.textContent = el.type; return { node: d, update() {}, destroy() {} }; }
    return f(el);
  }

  // apply universal element box: geometry + z + opacity + rotation + FX filters.
  // Used by BOTH the overlay layer and the dashboard canvas so they render identically.
  function applyBox(wrap, el, idx) {
    wrap.style.left = el.x + "px"; wrap.style.top = el.y + "px";
    wrap.style.width = el.w + "px"; wrap.style.height = el.h + "px";
    if (idx != null) wrap.style.zIndex = idx;
    wrap.style.display = el.hidden ? "none" : "block";
    wrap.style.opacity = (el.opacity == null ? 1 : el.opacity);
    const rot = el.rotation || 0;
    wrap.style.transform = rot ? `rotate(${rot}deg)` : "";
    const fx = el.fx;
    if (fx) {
      const f = [];
      if (fx.blur) f.push(`blur(${fx.blur}px)`);
      if (fx.brightness != null && fx.brightness !== 1) f.push(`brightness(${fx.brightness})`);
      if (fx.saturate != null && fx.saturate !== 1) f.push(`saturate(${fx.saturate})`);
      if (fx.hue) f.push(`hue-rotate(${fx.hue}deg)`);
      wrap.style.filter = f.join(" ");
    } else wrap.style.filter = "";
    // auto-scheduler: tag so the overlay's scheduler loop can toggle visibility over time
    if (el.schedule && el.schedule.enabled) wrap.dataset.sched = (el.schedule.showSec || 10) + "," + (el.schedule.hideSec || 60);
    else delete wrap.dataset.sched;
  }

  // overlay-only: loop visibility of scheduled elements (dashboard keeps them visible for editing)
  let schedOn = false;
  function enableScheduler() {
    if (schedOn) return; schedOn = true;
    setInterval(() => {
      document.querySelectorAll("[data-sched]").forEach(w => {
        const parts = w.dataset.sched.split(",").map(Number), cyc = (parts[0] + parts[1]) * 1000;
        if (cyc <= 0) return;
        w.style.display = (Date.now() % cyc) < parts[0] * 1000 ? "block" : "none";
      });
    }, 400);
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
        if (!makeWrapper) applyBox(rec.wrap, el, idx);
        rec.inst.update(el);
      });
      // remove gone
      insts.forEach((rec, id) => { if (!seen.has(id)) { rec.inst.destroy && rec.inst.destroy(); rec.wrap.remove(); insts.delete(id); } });
    }
    return { render, instances: insts };
  }

  window.MD.widgets = { create, Layer, applyBox, enableScheduler };
})();
