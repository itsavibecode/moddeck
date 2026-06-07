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
    let cur = el, feed = [], i = 0, gotReal = false;
    function row(msg, p) {
      const r = document.createElement("div");
      r.style.cssText = "font-size:14px;line-height:1.3;color:" + p.text;
      const dot = p.showPlatform ? `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${PCOLOR[msg.p] || p.accent};margin-right:6px;vertical-align:middle"></span>` : "";
      const modb = msg.mod ? `<span style="color:${p.accent};font-weight:800;margin-right:4px">⚔</span>` : "";
      let body = esc(msg.m);
      (msg.emotes || []).forEach(e => { body = body.split(":" + e.name + ":").join(`<img src="https://files.kick.com/emotes/${e.id}/fullsize" alt="" style="height:1.25em;vertical-align:middle">`); });
      r.innerHTML = `${dot}${modb}<b style="color:${msg.color || p.accent};font-weight:700">${esc(msg.u)}</b><span style="opacity:.6">:</span> ${body}`;
      return r;
    }
    function paint() {
      const p = cur.props; n.style.background = p.bg;
      hd.textContent = p.title; hd.style.color = p.accent;
      list.innerHTML = "";
      feed.slice(-(p.max || 8)).forEach(m => list.appendChild(row(m, p)));
    }
    // demo sample feed — stands down the moment real Kick chat connects
    let last = 0;
    function tick() {
      if (window.MD.chatConnected) return;
      if (Date.now() - last > 2600) { last = Date.now(); feed.push(SAMPLE[i % SAMPLE.length]); i++; if (feed.length > 12) feed.shift(); paint(); }
    }
    // real Kick chat (when the adapter is connected)
    if (window.MD.chat && window.MD.chat.onMessage) window.MD.chat.onMessage(function (m) {
      if (!gotReal) { gotReal = true; feed = []; }
      feed.push({ p: m.platform, u: m.user, m: m.text, emotes: m.emotes, mod: m.mod, color: m.color });
      if (feed.length > 14) feed.shift(); paint();
    });
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
      // preview a representative event (Follow) using the per-event config
      const ev = (p.events && p.events.follow) || {};
      ic.textContent = ev.icon || "👋";
      hl.textContent = String(ev.text || "{user} just followed").replace(/\{user\}/g, "Username").replace(/\{amount\}/g, "5").replace(/\{months\}/g, "3");
      hl.style.color = p.color;
      sub.textContent = "Live alerts appear here"; sub.style.color = p.accent;
      if (p.triggerSeq !== lastSeq) { lastSeq = p.triggerSeq; n.style.animation = "none"; void n.offsetWidth; n.style.animation = "md-alert-in .6s cubic-bezier(.2,.8,.2,1)"; }
    }
    update(el); return { node: n, update };
  };

  R.draw = function (el) {
    const NS = "http://www.w3.org/2000/svg";
    const n = document.createElement("div"); n.style.cssText = "width:100%;height:100%;pointer-events:none";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 1920 1080"); svg.setAttribute("preserveAspectRatio", "none");
    svg.style.cssText = "width:100%;height:100%;overflow:visible"; n.appendChild(svg);
    function update(el) {
      const strokes = el.props.strokes || []; svg.innerHTML = "";
      strokes.forEach(s => {
        if (!s.pts || !s.pts.length) return;
        const pl = document.createElementNS(NS, "polyline");
        pl.setAttribute("points", s.pts.map(p => p[0] + "," + p[1]).join(" "));
        pl.setAttribute("fill", "none"); pl.setAttribute("stroke", s.color);
        pl.setAttribute("stroke-width", s.width); pl.setAttribute("stroke-linecap", "round"); pl.setAttribute("stroke-linejoin", "round");
        svg.appendChild(pl);
      });
    }
    update(el); return { node: n, update };
  };

  R.wheel = function (el) {
    const NS = "http://www.w3.org/2000/svg";
    const PAL = ["#5b5bf0", "#0fb5a8", "#f59e0b", "#e5484d", "#a970ff", "#16a34a", "#ec4899", "#06b6d4"];
    const n = document.createElement("div");
    n.style.cssText = "width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;position:relative";
    const wheelWrap = document.createElement("div"); wheelWrap.style.cssText = "position:relative;flex:1;aspect-ratio:1;max-height:84%;display:flex;align-items:center;justify-content:center";
    const ptr = document.createElement("div"); ptr.style.cssText = "position:absolute;top:-2px;left:50%;transform:translateX(-50%);z-index:3;width:0;height:0;border-left:13px solid transparent;border-right:13px solid transparent;border-top:22px solid #fff;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))";
    const svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "0 0 100 100"); svg.style.cssText = "width:100%;height:100%;max-width:100%;max-height:100%";
    const g = document.createElementNS(NS, "g"); g.style.transformOrigin = "50px 50px"; svg.appendChild(g);
    wheelWrap.appendChild(svg); wheelWrap.appendChild(ptr);
    const win = document.createElement("div"); win.style.cssText = "font-size:18px;font-weight:800;text-align:center;flex:none";
    n.appendChild(wheelWrap); n.appendChild(win);
    let segKey = "", baseRot = 0, lastSeq = null, N = 0;
    function pt(a, r) { const rad = (a - 90) * Math.PI / 180; return [50 + r * Math.cos(rad), 50 + r * Math.sin(rad)]; }
    function build(segs, color) {
      g.innerHTML = ""; N = segs.length; const seg = 360 / N;
      segs.forEach((label, i) => {
        const a0 = i * seg, a1 = (i + 1) * seg, [x0, y0] = pt(a0, 50), [x1, y1] = pt(a1, 50);
        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", `M50,50 L${x0.toFixed(2)},${y0.toFixed(2)} A50,50 0 0,1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`);
        path.setAttribute("fill", PAL[i % PAL.length]); path.setAttribute("stroke", "rgba(0,0,0,.25)"); path.setAttribute("stroke-width", ".5"); g.appendChild(path);
        const [tx, ty] = pt(a0 + seg / 2, 33); const t = document.createElementNS(NS, "text");
        t.setAttribute("x", tx.toFixed(2)); t.setAttribute("y", ty.toFixed(2)); t.setAttribute("fill", color || "#fff");
        t.setAttribute("font-size", Math.max(3.5, Math.min(6, 34 / N))); t.setAttribute("font-weight", "800"); t.setAttribute("text-anchor", "middle"); t.setAttribute("dominant-baseline", "middle");
        t.setAttribute("transform", `rotate(${a0 + seg / 2} ${tx.toFixed(2)} ${ty.toFixed(2)})`);
        t.textContent = label.length > 12 ? label.slice(0, 11) + "…" : label; g.appendChild(t);
      });
      const hub = document.createElementNS(NS, "circle"); hub.setAttribute("cx", 50); hub.setAttribute("cy", 50); hub.setAttribute("r", 6); hub.setAttribute("fill", "#fff"); g.appendChild(hub);
    }
    function update(el) {
      const p = el.props; const segs = (p.segments || "").split("\n").map(s => s.trim()).filter(Boolean); if (!segs.length) segs.push("—");
      const key = segs.join("|") + p.color;
      if (key !== segKey) { segKey = key; build(segs, p.color); }
      if (p.spinSeq !== lastSeq) {
        const firstRun = lastSeq === null; lastSeq = p.spinSeq;
        const seg = 360 / segs.length, winner = Math.max(0, Math.min(segs.length - 1, p.winner || 0));
        let need = (-((winner + 0.5) * seg)) % 360; if (need < 0) need += 360;
        if (firstRun) { baseRot = need; g.style.transition = "none"; g.style.transform = `rotate(${need}deg)`; }
        else { baseRot = Math.ceil((baseRot + 360 * 5) / 360) * 360 + need; g.style.transition = "transform 4.4s cubic-bezier(.16,.7,.13,1)"; g.style.transform = `rotate(${baseRot}deg)`; }
        win.style.color = p.accent;
        win.textContent = firstRun ? "" : "";
        clearTimeout(win._t);
        if (!firstRun) win._t = setTimeout(() => { win.textContent = "🏆 " + segs[winner]; }, 4400);
        else win.textContent = "";
      }
    }
    update(el); return { node: n, update, destroy() { clearTimeout(win._t); } };
  };

  // Emote combo counter — watches chat for repeated emotes and shows live "xN" combos.
  // Fed by the demo generator today; when real chat is wired, call MD.pushEmote(emoteKey, {img,url})
  // and set MD.chatConnected = true (the demo generator then stands down).
  window.MD.emoteSinks = window.MD.emoteSinks || new Set();
  window.MD.pushEmote = function (key, opts) { window.MD.emoteSinks.forEach(fn => { try { fn(key, opts); } catch {} }); };
  // auto-clip hook — overridden by the dashboard (and, in the bot phase, calls the platform clip API)
  window.MD.fireClip = window.MD.fireClip || function () {};
  R.emojicombo = function (el) {
    const POOL = ["🔥", "😂", "💀", "🎉", "👀", "🤣", "😭", "🗿", "💚", "❤️"];
    const n = document.createElement("div");
    n.style.cssText = "width:100%;height:100%;display:flex;align-items:center;justify-content:center;gap:16px;border-radius:12px;padding:8px 14px;box-sizing:border-box;overflow:hidden";
    let cur = el; const combos = new Map(), clipped = new Set(); let hot = POOL[0], lastSpawn = 0;
    function ingest(key, amt) { const c = combos.get(key) || { count: 0, last: 0 }; c.count += (amt || 1); c.last = Date.now(); combos.set(key, c); }
    window.MD.emoteSinks.add(ingest);
    function demo() {
      if (window.MD.chatConnected) return;                 // real chat takes over when connected
      const now = Date.now();
      if (now - lastSpawn > 350 + Math.random() * 420) {
        lastSpawn = now;
        if (Math.random() < 0.12) hot = POOL[Math.floor(Math.random() * POOL.length)];
        ingest(hot, 1 + Math.floor(Math.random() * 3));
        if (Math.random() < 0.4) ingest(POOL[Math.floor(Math.random() * POOL.length)], 1);
      }
    }
    function render() {
      const p = cur.props; n.style.background = p.bg;
      const now = Date.now(), to = p.comboTimeout || 5000;
      for (const [k, c] of combos) if (now - c.last > to) { combos.delete(k); clipped.delete(k); }
      const active = [...combos.entries()].filter(([, c]) => c.count >= (p.startAt || 3))
        .sort((a, b) => b[1].count - a[1].count).slice(0, p.max || 5);
      // auto-clip: fire once when an emote's combo crosses the threshold
      if (p.clipAt > 0) active.forEach(([k, c]) => { if (c.count >= p.clipAt && !clipped.has(k)) { clipped.add(k); try { window.MD.fireClip({ emote: k, count: c.count }); } catch (e) {} } });
      n.innerHTML = "";
      if (!active.length) return;
      const maxC = active[0][1].count;
      active.forEach(([k, c]) => {
        const lead = c.count === maxC;
        const chip = document.createElement("div");
        chip.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:2px;transition:transform .2s" + (lead ? ";transform:scale(1.18)" : "");
        const e = document.createElement("div");
        e.style.cssText = `font-size:${lead ? 46 : 34}px;line-height:1` + (lead ? `;filter:drop-shadow(0 0 10px ${p.accent})` : "");
        if (/^https?:/.test(k)) { e.innerHTML = `<img src="${k}" style="height:1em;width:auto;vertical-align:middle">`; } else e.textContent = k;
        const cnt = document.createElement("div"); cnt.textContent = "x" + c.count;
        cnt.style.cssText = `font-size:${lead ? 21 : 15}px;font-weight:800;color:${p.accent}`;
        chip.appendChild(e); chip.appendChild(cnt); n.appendChild(chip);
      });
    }
    function tick() { demo(); render(); }
    function update(el) { cur = el; render(); }
    tickers.add(tick); update(el);
    return { node: n, update, destroy() { tickers.delete(tick); window.MD.emoteSinks.delete(ingest); } };
  };

  // Discord Highlights — shows messages your Discord community "stars" onto the stream.
  // Demo-fed today; when the Discord bot is wired, call MD.pushHighlight({user, text, avatar, color})
  // and set MD.discordConnected = true (the demo generator stands down).
  window.MD.highlightSinks = window.MD.highlightSinks || new Set();
  window.MD.pushHighlight = function (h) { window.MD.highlightSinks.forEach(fn => { try { fn(h); } catch {} }); };
  R.discord = function (el) {
    const POOL = [
      { user: "Tylerm2s", text: "that clutch was actually insane 🔥", color: "#5865F2" },
      { user: "nina.gg", text: "GG WP everyone, see you tomorrow", color: "#eb459e" },
      { user: "void_", text: "pov: you just hit grandmaster", color: "#57f287" },
      { user: "k3vin", text: "chat is so unhinged today lmaooo", color: "#faa61a" },
    ];
    const n = document.createElement("div");
    n.style.cssText = "width:100%;height:100%;display:flex;align-items:center;border-radius:14px;padding:0;box-sizing:border-box;overflow:hidden;flex-direction:column";
    const hd = document.createElement("div");
    hd.style.cssText = "width:100%;font-size:12px;font-weight:800;letter-spacing:1.2px;padding:8px 16px 0;flex:none";
    const card = document.createElement("div");
    card.style.cssText = "flex:1;width:100%;display:flex;align-items:center;gap:14px;padding:8px 16px 14px;min-height:0";
    const av = document.createElement("div");
    av.style.cssText = "width:54px;height:54px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:24px;color:#fff;background-size:cover;background-position:center";
    const body = document.createElement("div"); body.style.cssText = "min-width:0;display:flex;flex-direction:column;gap:3px";
    const who = document.createElement("div"); who.style.cssText = "font-size:18px;font-weight:800";
    const msg = document.createElement("div"); msg.style.cssText = "font-size:16px;line-height:1.25;opacity:.95";
    body.appendChild(who); body.appendChild(msg); card.appendChild(av); card.appendChild(body);
    n.appendChild(hd); n.appendChild(card);
    let cur = el, current = null, lastAt = 0, i = 0, lastDemo = 0;
    function show(h) {
      current = h; lastAt = Date.now();
      const p = cur.props;
      av.style.display = p.showAvatar ? "flex" : "none";
      if (h.avatar) { av.style.backgroundImage = `url("${h.avatar}")`; av.textContent = ""; }
      else { av.style.backgroundImage = "none"; av.style.background = h.color || p.accent; av.textContent = (h.user || "?")[0].toUpperCase(); }
      who.textContent = h.user; who.style.color = h.color || p.accent;
      msg.textContent = h.text; msg.style.color = p.color;
      card.style.animation = "none"; void card.offsetWidth; card.style.animation = "md-alert-in .5s cubic-bezier(.2,.8,.2,1)";
    }
    function ingest(h) { show(h); }
    window.MD.highlightSinks.add(ingest);
    function tick() {
      const p = cur.props;
      if (!window.MD.discordConnected && Date.now() - lastDemo > 6000) { lastDemo = Date.now(); show(POOL[i++ % POOL.length]); }
      if (current && p.clearAfter > 0 && Date.now() - lastAt > p.clearAfter * 1000) { current = null; n.style.visibility = "hidden"; }
      else if (current) n.style.visibility = "visible";
    }
    function update(el) {
      cur = el; const p = el.props; n.style.background = p.bg;
      hd.textContent = p.title; hd.style.color = p.accent;
      if (current) show(current);
    }
    tickers.add(tick); update(el);
    return { node: n, update, destroy() { tickers.delete(tick); window.MD.highlightSinks.delete(ingest); } };
  };

  R.powerchat = function (el) {
    const n = document.createElement("div"); n.style.cssText = "width:100%;height:100%;overflow:hidden;border-radius:10px";
    let cur = null;
    function update(el) {
      const p = el.props;
      if (p.url !== cur) {
        cur = p.url; n.innerHTML = "";
        if (p.url) {
          const f = document.createElement("iframe"); f.src = p.url;
          f.setAttribute("allow", "autoplay; encrypted-media");
          f.style.cssText = "width:100%;height:100%;border:0;border-radius:10px;background:transparent;pointer-events:none";
          n.appendChild(f);
        } else {
          const ph = document.createElement("div");
          ph.style.cssText = "width:100%;height:100%;display:flex;flex-direction:column;gap:4px;align-items:center;justify-content:center;text-align:center;color:#9aa0c0;font-size:13px;background:rgba(20,18,40,.7);border:1.5px dashed #4d3f78;border-radius:inherit;padding:12px";
          ph.innerHTML = "💸 <b style='color:#cdb4ff'>PowerChat</b><span style='font-size:11px;opacity:.8'>paste your powerchat.live overlay URL</span>";
          n.appendChild(ph);
        }
      }
    }
    update(el); return { node: n, update };
  };

  // Live viewer count — animated. Demo-fed; real Kick count via MD.pushViewers(n) + MD.viewersConnected.
  window.MD.viewerSinks = window.MD.viewerSinks || new Set();
  window.MD.pushViewers = function (n) { window.MD.viewerSinks.forEach(fn => { try { fn(n); } catch {} }); };
  R.viewers = function (el) {
    const n = document.createElement("div");
    n.style.cssText = "width:100%;height:100%;display:flex;align-items:center;justify-content:center;gap:12px;border-radius:12px;box-sizing:border-box;padding:0 16px";
    const ic = document.createElement("div"); ic.style.cssText = "font-size:30px;line-height:1";
    const col = document.createElement("div"); col.style.cssText = "display:flex;flex-direction:column;line-height:1.05";
    const num = document.createElement("div"); num.style.cssText = "font-weight:800;font-variant-numeric:tabular-nums";
    const lab = document.createElement("div"); lab.style.cssText = "font-weight:700;letter-spacing:1.5px";
    col.appendChild(num); col.appendChild(lab); n.appendChild(ic); n.appendChild(col);
    let cur = el, target = el.props.count || 1240, shown = target, lastDemo = 0;
    function setTarget(v) { target = Math.max(0, Math.round(v)); }
    window.MD.viewerSinks.add(setTarget);
    function paint() {
      const p = cur.props; n.style.background = p.bg; ic.textContent = p.icon || "👁";
      num.textContent = shown.toLocaleString(); num.style.color = p.color; num.style.fontSize = Math.min(el.h * .42, 40) + "px";
      lab.textContent = p.label; lab.style.color = p.accent; lab.style.fontSize = "12px";
    }
    function tick() {
      if (!window.MD.viewersConnected && Date.now() - lastDemo > 3000) { lastDemo = Date.now(); setTarget(target + Math.round((Math.random() - 0.42) * 50)); }
      if (shown !== target) { shown += Math.sign(target - shown) * Math.max(1, Math.ceil(Math.abs(target - shown) / 8)); paint(); }
    }
    function update(el) { cur = el; if (el.props.count) target = el.props.count; paint(); }
    tickers.add(tick); update(el);
    return { node: n, update, destroy() { tickers.delete(tick); window.MD.viewerSinks.delete(setTarget); } };
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

  R.mediashare = function (el) {
    let cel = el;
    const n = document.createElement("div");
    n.style.cssText = "width:100%;height:100%;overflow:hidden;position:relative;background:#000;display:flex;align-items:center;justify-content:center";
    const ph = document.createElement("div");
    ph.style.cssText = "color:#9aa0b8;font:600 15px Inter,system-ui,sans-serif;text-align:center;padding:20px";
    ph.innerHTML = "📺 Media Share<br><span style='font-size:12px;opacity:.7'>Approved viewer videos play here</span>";
    const frameWrap = document.createElement("div"); frameWrap.style.cssText = "position:absolute;inset:0;display:none";
    const info = document.createElement("div"); info.style.cssText = "position:absolute;left:0;right:0;bottom:0;padding:9px 13px;background:linear-gradient(transparent,rgba(0,0,0,.82));color:#fff;font:700 14px Inter,system-ui,sans-serif;display:none";
    n.appendChild(ph); n.appendChild(frameWrap); n.appendChild(info);
    let curId = null, subbed = false;
    function showNow(now) {
      if (now && now.videoId) {
        if (now.videoId !== curId) {
          curId = now.videoId;
          frameWrap.innerHTML = '<iframe width="100%" height="100%" style="border:0;display:block" src="https://www.youtube.com/embed/' +
            encodeURIComponent(now.videoId) + '?autoplay=1&rel=0&modestbranding=1" allow="autoplay; encrypted-media" allowfullscreen></iframe>';
        }
        frameWrap.style.display = "block"; ph.style.display = "none";
        if (cel.props.showInfo !== false) { info.style.display = "block"; info.textContent = "▶ " + (now.title || "Video") + " · " + (now.requester || "viewer") + (now.amount ? (" · " + now.amount + " Kicks") : ""); info.style.borderBottom = "3px solid " + (cel.props.accent || "#53fc18"); }
        else info.style.display = "none";
      } else { curId = null; frameWrap.innerHTML = ""; frameWrap.style.display = "none"; info.style.display = "none"; ph.style.display = "flex"; }
    }
    function update(e2) {
      cel = e2; n.style.borderRadius = (e2.props.radius != null ? e2.props.radius : 12) + "px";
      if (window.MD.isOverlay && !subbed) { subbed = true; MD.sync.onMediaNow(showNow); }   // overlay = real player; dashboard = placeholder
    }
    update(el); return { node: n, update };
  };

  // ---- real-event Alert Box driver (overlay) ----
  // cue.type from the worker/test buttons -> the Alert Box per-event config key.
  const ALERT_KEY = { follow: "follow", sub: "sub", resub: "resub", giftsub: "gift", kicks: "kicks" };
  const ALERT_DEF = {
    follow: { icon: "👋", text: "{user} just followed" },
    sub:    { icon: "⭐", text: "{user} just subscribed" },
    resub:  { icon: "🌟", text: "{user} resubscribed" },
    gift:   { icon: "🎁", text: "{user} gifted {amount} subs" },
    kicks:  { icon: "💚", text: "{user} sent {amount} Kicks" },
  };
  function fillVars(t, cue) {
    const u = cue.anon ? "Anonymous" : (cue.user || "Someone");
    return String(t == null ? "" : t)
      .replace(/\{user\}/g, u)
      .replace(/\{amount\}/g, cue.amount != null ? cue.amount : "")
      .replace(/\{months\}/g, cue.months != null ? cue.months : "");
  }
  // Resolve a cue + an Alert Box widget's per-event config into {icon,text,sound,gif}.
  // Returns null if the event type is unknown or that event is toggled off.
  function alertContent(cue, cfg) {
    cue = cue || {};
    const key = ALERT_KEY[cue.type];
    const def = ALERT_DEF[key] || { icon: "🔔", text: "{user}" };
    const ec = (cfg && key && cfg[key]) || {};
    if (ec.on === false) return null;
    return { icon: ec.icon || def.icon, text: fillVars(ec.text || def.text, cue), sound: ec.sound || "", gif: ec.gif || "" };
  }
  function _findAlertBox(board) {
    if (board && board.order) for (let i = 0; i < board.order.length; i++) { const e = board.els[board.order[i]]; if (e && e.type === "alertbox") return e; }
    return null;
  }
  // Plays an alert on the overlay. Uses a placed Alert Box widget's geometry/colors/config if one
  // exists, otherwise a default top-center banner. Queues so a gift-bomb shows one at a time.
  let _alertQ = [], _alertBusy = false;
  function playAlert(stage, board, cue) {
    const box = _findAlertBox(board);
    const content = alertContent(cue, box && box.props && box.props.events);
    if (!content) return;                       // unknown or disabled event — don't waste a slot
    _alertQ.push({ stage, box, content });
    if (!_alertBusy) _drainAlerts();
  }
  function _drainAlerts() {
    if (!_alertQ.length) { _alertBusy = false; return; }
    _alertBusy = true;
    const job = _alertQ.shift();
    try { _renderAlert(job.stage, job.box, job.content); } catch (e) {}
    setTimeout(_drainAlerts, 4200);
  }
  function _renderAlert(stage, box, c) {
    const geo = box ? { x: box.x, y: box.y, w: box.w, h: box.h } : { x: 600, y: 80, w: 720, h: 124 };
    const bp = (box && box.props) || {};
    const bg = bp.bg || "rgba(16,18,28,.94)", accent = bp.accent || "#53fc18", color = bp.color || "#ffffff";
    const n = document.createElement("div");
    n.style.cssText = "position:absolute;left:" + geo.x + "px;top:" + geo.y + "px;width:" + geo.w + "px;height:" + geo.h +
      "px;display:flex;align-items:center;gap:16px;border-radius:14px;padding:0 22px;box-sizing:border-box;overflow:hidden;background:" +
      bg + ";border-left:5px solid " + accent + ";box-shadow:0 12px 44px rgba(0,0,0,.4);z-index:9999";
    const ic = document.createElement("div"); ic.style.cssText = "font-size:46px;line-height:1;flex:none"; ic.textContent = c.icon;
    const txt = document.createElement("div"); txt.style.cssText = "flex:1;min-width:0";
    const hl = document.createElement("div"); hl.style.cssText = "font:800 28px/1.15 Inter,system-ui,sans-serif;color:" + color + ";overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical"; hl.textContent = c.text;
    txt.appendChild(hl); n.appendChild(ic); n.appendChild(txt);
    if (c.gif) { const g = document.createElement("img"); g.src = c.gif; g.style.cssText = "height:" + Math.max(40, geo.h - 28) + "px;max-width:38%;object-fit:contain;border-radius:8px;flex:none"; g.onerror = () => g.remove(); n.appendChild(g); }
    if (c.sound) { try { const a = new Audio(c.sound); a.volume = 1; a.play().catch(() => {}); } catch (e) {} }
    n.style.animation = "md-alert-in .6s cubic-bezier(.2,.8,.2,1)";
    stage.appendChild(n);
    setTimeout(() => { n.style.transition = "opacity .4s, transform .4s"; n.style.opacity = "0"; n.style.transform = "translateY(-10px)"; setTimeout(() => n.remove(), 420); }, 3600);
  }

  window.MD.widgets = { create, Layer, applyBox, enableScheduler, playAlert, alertContent };
})();
