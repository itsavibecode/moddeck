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
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; setTimeout(() => t.remove(), 300); }, 5000);
  }

  // ---------- palette ----------
  const PALETTE = [
    ["chat", "💬", "Kick Chat"], ["alertbox", "🔔", "Alert Box"], ["timer", "⏱️", "Timer"],
    ["progress", "🎯", "Goal Bar"], ["poll", "📊", "Live Poll"], ["todo", "✅", "To-Do"],
    ["tally", "🔢", "Tally"], ["emojicombo", "🔥", "Emoji Combo"], ["ticker", "📰", "Ticker"], ["eventlist", "📋", "Event List"],
    ["text", "📝", "Text"], ["image", "🖼️", "Image"], ["video", "🎬", "Video"],
    ["shape", "⬛", "Shape"], ["wheel", "🎡", "Prize Wheel"], ["discord", "⭐", "Discord Highlights"],
    ["powerchat", "💸", "PowerChat"], ["viewers", "👁", "Viewer Count"], ["qr", "🔳", "QR Code"],
    ["mediashare", "📺", "Media Share"],
    ["browser", "🌐", "Browser"], ["customcode", "💻", "Custom Code"],
  ];
  function buildPalette() {
    const g = $("#palette"); g.innerHTML = "";
    PALETTE.forEach(([type, icon, label]) => {
      const glyph = (window.MD.ICONS_SVG && window.MD.ICONS_SVG[type]) || icon;
      const b = el("button", "wbtn", `<span class="i">${glyph}</span>${label}`);
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
  // switch the whole dashboard from demo (local) to real-time Firebase sync on login.
  // Two modes: OWNER (editing your own channel) or MOD (editing a streamer's channel via ?channel=).
  let liveMode = false, editChannel = null, amOwner = true;
  function goLive(user) {
    if (liveMode || !window.MD._fb || !window.MD._fb.db) return;
    liveMode = true;
    const db = window.MD._fb.db;
    const prof = MD.auth.profile() || {};
    const target = editChannel || user.uid;
    amOwner = (target === user.uid);
    channelId = target;
    try { SY.init({ backend: "firebase", db, channelId: target }); }
    catch (e) { console.error(e); liveMode = false; return; }
    const sk = $("#syncKind"), ci = $("#chanId");
    if (sk) sk.textContent = "firebase"; if (ci) ci.textContent = target;
    renderLists();

    // MOD: self-register so the rules grant write access (requires the streamer to have added your username)
    if (!amOwner) {
      db.ref("channels/" + target + "/mods/" + user.uid)
        .set({ username: prof.username || "", uname: (prof.username || "").toLowerCase(), addedAt: Date.now() })
        .then(function () { toast("Connected as mod 🎛️", "ok"); })
        .catch(function () { modDenied(prof); });
    }

    // presence — who's editing right now (auto-clears on disconnect)
    try {
      const pref = db.ref("channels/" + target + "/presence/" + user.uid);
      pref.set({ username: prof.username || "", t: Date.now(), owner: amOwner });
      pref.onDisconnect().remove();
    } catch (e) {}

    // restore this channel's saved staging from the cloud (or push current up if cloud is empty)
    SY.loadStaging(function (board) {
      if (board && board.order && board.order.length) S.loadIntoStaging(board);
      else if (amOwner) scheduleStagingWrite();
    });

    // chat: owner connects by slug + records the chatroom id; mod connects via the saved chatroom id
    if (amOwner) {
      if (window.MD.chat && prof.username) MD.chat.connectBySlug(prof.username).then(function (roomId) {
        if (roomId) { try { SY.publishMeta({ slug: prof.username, chatroomId: roomId }); } catch (e) {} toast("Kick chat connected 💬", "ok"); }
      });
    } else if (window.MD.chat && SY.loadMeta) {
      SY.loadMeta(function (meta) { if (meta && meta.chatroomId) { try { MD.chat.connectKick(meta.chatroomId); } catch (e) {} } });
    }

    subscribeBot(); subscribeMediaSettings();   // re-bind cloud bot/media config to the live channel
    wireMods(target, user);
    if (amOwner) { startBotRunner(target); startMediaController(); }   // run the chatbot + media auto-advance from the streamer's session
    toast(amOwner ? "Real-time sync on" : "Editing as mod", "ok");
  }

  // ---------- mods + invite links ----------
  function modDenied(prof) {
    const banner = $("#modBanner");
    if (banner) {
      banner.style.display = "block"; banner.style.color = "var(--danger)"; banner.style.background = "#fdecec";
      banner.innerHTML = "Not authorized yet. Ask the streamer to add <b>" + ((prof.username || "").toLowerCase()) + "</b> as a mod, then reload.";
    }
    toast("Not a mod here yet — ask the streamer to add you", "err");
  }
  function modInviteLink(target) {
    const base = location.href.replace(/dashboard\.html.*$/, "").replace(/\/$/, "");
    return base + "/dashboard.html?channel=" + encodeURIComponent(target);
  }
  function removeMod(target, uname, mods) {
    const db = window.MD._fb.db, base = db.ref("channels/" + target);
    base.child("modNames/" + uname).remove();
    Object.keys(mods || {}).forEach(function (uid) {
      const u = ((mods[uid] && (mods[uid].uname || mods[uid].username)) || "").toLowerCase();
      if (u === uname) base.child("mods/" + uid).remove();
    });
    toast("Removed mod " + uname);
  }
  function renderModList(target, isOwner) {
    const db = window.MD._fb.db, base = db.ref("channels/" + target), host = $("#modList");
    if (!host) return;
    let names = {}, mods = {}, pres = {};
    function paint() {
      host.innerHTML = "";
      const unames = Object.keys(names);
      if (!unames.length) { host.appendChild(el("div", "list-empty", isOwner ? "No mods yet — add a Kick username below." : "—")); }
      const online = {};
      Object.keys(pres).forEach(function (uid) { const u = ((pres[uid] && pres[uid].username) || "").toLowerCase(); if (u) online[u] = true; });
      unames.forEach(function (u) {
        const on = !!online[u];
        const row = el("div", "mod", `<div class="mav"></div><div class="mn">${u}</div><div class="me${on ? " on" : ""}">${on ? "ONLINE" : "offline"}</div>`);
        if (!on) row.querySelector(".mav").style.background = "#cbd5e1";
        if (isOwner) { const rm = el("div", "rm", "✕"); rm.style.cursor = "pointer"; rm.onclick = () => removeMod(target, u, mods); row.appendChild(rm); }
        host.appendChild(row);
      });
    }
    base.child("modNames").on("value", function (s) { names = s.val() || {}; paint(); });
    base.child("mods").on("value", function (s) { mods = s.val() || {}; paint(); });
    base.child("presence").on("value", function (s) { pres = s.val() || {}; paint(); });
  }
  let _modsWired = false;
  function wireMods(target, user) {
    const addRow = $("#addModRow"), linkBtn = $("#modLinkBtn"), note = $("#modNote"), banner = $("#modBanner");
    if (amOwner) {
      if (addRow) addRow.style.display = "";
      if (linkBtn) linkBtn.style.display = "block";
      if (banner) banner.style.display = "none";
      if (note) note.innerHTML = "Add a mod by Kick username, then send them the <b>invite link</b>. They sign in with Kick and can edit your overlay — but never your OBS, audio, or stream key.";
      if (!_modsWired) {
        _modsWired = true;
        const addBtn = $("#addModBtn"), inp = $("#addModInput");
        const doAdd = () => {
          const u = (inp.value || "").trim().toLowerCase().replace(/^@/, "");
          if (!u) return;
          if (/[.#$\[\]\/]/.test(u)) { toast("Invalid username", "err"); return; }
          window.MD._fb.db.ref("channels/" + target + "/modNames/" + u).set(true)
            .then(() => { toast("Added mod " + u, "ok"); inp.value = ""; })
            .catch(() => toast("Could not add mod", "err"));
        };
        if (addBtn) addBtn.onclick = doAdd;
        if (inp) inp.onkeydown = (e) => { if (e.key === "Enter") doAdd(); };
        if (linkBtn) linkBtn.onclick = () => {
          const link = modInviteLink(target);
          navigator.clipboard.writeText(link).then(() => toast("Mod invite link copied 🔗", "ok"));
          const back = el("div", "modal-back");
          back.innerHTML = `<div class="modal"><h3>🔗 Mod Invite Link</h3>
            <p>Add the mod's Kick username above first, then send them this link. They sign in with Kick and can edit <b>this</b> overlay — nothing else.</p>
            <div class="obs-url">${link}</div>
            <div class="mrow"><button id="miClose">Close</button><button class="primary" id="miCopy">Copy link</button></div></div>`;
          document.body.appendChild(back);
          back.onclick = (e) => { if (e.target === back) back.remove(); };
          $("#miClose", back).onclick = () => back.remove();
          $("#miCopy", back).onclick = () => { navigator.clipboard.writeText(link).then(() => toast("Copied", "ok")); back.remove(); };
        };
      }
    } else {
      if (addRow) addRow.style.display = "none";
      if (linkBtn) linkBtn.style.display = "none";
      if (banner) { banner.style.display = "block"; banner.textContent = "🎛️ You're modding this channel."; }
      if (note) note.innerHTML = "You can edit the canvas and Push to Live. Only the streamer can add or remove mods.";
    }
    renderModList(target, amOwner);
  }
  // persist the staging canvas (debounced) to whatever backend is active (localStorage in demo, RTDB live)
  let _stagingTimer = null;
  function scheduleStagingWrite() {
    clearTimeout(_stagingTimer);
    _stagingTimer = setTimeout(function () { try { SY.publishStaging(S.exportBoard(S.state.staging)); } catch (e) {} }, 500);
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
      back.innerHTML = `<div class="modal" style="position:relative;max-width:540px">
        <button id="mX" aria-label="Close" style="position:absolute;top:11px;right:14px;border:none;background:none;font-size:19px;line-height:1;color:var(--ink-faint);cursor:pointer;padding:4px">✕</button>
        <h3>🔗 OBS Browser Source</h3>
        <p style="margin:0 0 10px">Add <b>one</b> Browser source in OBS and point it at this URL:</p>
        <div class="obs-url">${url}</div>
        <div class="mrow" style="margin:12px 0 18px;justify-content:flex-start"><button class="primary" id="mCopy">📋 Copy URL</button></div>

        <div style="font-weight:800;font-size:12.5px;margin-bottom:9px">Then in the source's properties:</div>
        <ol style="margin:0;padding-left:18px;font-size:12.5px;color:var(--ink-dim);line-height:1.4">
          <li style="margin-bottom:10px"><b>Width</b> 1920 &nbsp;·&nbsp; <b>Height</b> 1080 <span class="why">i<span class="tt">Matches the 1080p overlay canvas exactly, so your widgets land where you placed them.</span></span></li>
          <li style="margin-bottom:10px">Check <b>"Control audio via OBS"</b> <span class="why">i<span class="tt">Routes the overlay's sound — alert sounds, Media Share videos and the soundboard — into OBS so viewers hear it and you can set the volume in the mixer.</span></span></li>
          <li style="margin-bottom:10px">Leave <b>"Shutdown source when not visible"</b> unchecked <span class="why">i<span class="tt">If checked, OBS unloads the overlay whenever the scene isn't active, which disconnects it from ModDeck.</span></span></li>
          <li style="margin-bottom:10px">Leave <b>Local file</b> off &amp; the default <b>Custom CSS</b> as-is <span class="why">i<span class="tt">You're loading a live web URL, not a local file. The default CSS keeps the overlay background transparent.</span></span></li>
          <li>Everything else stays default — click <b>OK</b>.</li>
        </ol>
      </div>`;
      document.body.appendChild(back);
      $("#mX", back).onclick = () => back.remove();
      $("#mCopy", back).onclick = () => { navigator.clipboard.writeText(url).then(() => toast("Overlay URL copied", "ok")); };
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

  // ---------- chatbot (commands + timed messages) — cloud-synced so mods share it across devices ----------
  let _botCfg = { commands: [], timers: [] }, _botRepaint = null;
  function _toArr(x) { return Array.isArray(x) ? x : (x && typeof x === "object" ? Object.values(x) : []); }
  function normBot(v) { v = v || {}; return { commands: _toArr(v.commands), timers: _toArr(v.timers), postAs: v.postAs === "self" ? "self" : "bot" }; }
  function botCommands() { return _botCfg.commands || []; }
  function saveBotCommands(a) { _botCfg.commands = a; if (_botRepaint) _botRepaint(); SY.setBot({ commands: a }); }
  function botTimers() { return _botCfg.timers || []; }
  function saveBotTimers(a) { _botCfg.timers = a; if (_botRepaint) _botRepaint(); SY.setBot({ timers: a }); }
  function subscribeBot() {
    SY.onBot(function (cfg) { _botCfg = normBot(cfg); if (_botRepaint) _botRepaint(); });
  }
  // runs the bot while the streamer's dashboard is open: fires timed messages + answers !commands.
  // Posts via the worker (which holds the Kick token); only the owner runs it to avoid double-posting.
  let _botRunner = false;
  function botPostAs() { return _botCfg.postAs === "self" ? "self" : "bot"; }
  function botSay(cid, text) {
    if (!window.firebase || !firebase.auth || !firebase.auth().currentUser) return;
    firebase.auth().currentUser.getIdToken().then(function (idToken) {
      fetch((window.MD.config && MD.config.workerUrl) + "/kick/say", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cid: cid, text: text, idToken: idToken, as: botPostAs() }),
      }).catch(function () {});
    }).catch(function () {});
  }
  // like botSay but resolves with the result so the UI can report success/the exact error
  function botSayTest(cid, text) {
    return new Promise(function (res) {
      if (!window.firebase || !firebase.auth || !firebase.auth().currentUser) { res({ ok: false, detail: "not signed in" }); return; }
      firebase.auth().currentUser.getIdToken().then(function (idToken) {
        fetch((window.MD.config && MD.config.workerUrl) + "/kick/say", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cid: cid, text: text, idToken: idToken, as: botPostAs() }),
        }).then(function (r) {
          r.json().then(function (j) { res({ ok: r.ok, status: r.status, error: (j && j.error) || "", detail: (j && (j.detail || j.error)) || "" }); }).catch(function () { res({ ok: r.ok, status: r.status }); });
        }).catch(function (e) { res({ ok: false, detail: String(e && e.message || e) }); });
      }).catch(function () { res({ ok: false, detail: "auth error" }); });
    });
  }
  function startBotRunner(cid) {
    if (_botRunner) return; _botRunner = true;
    // timed messages run 24/7 from the worker cron (even with the dashboard closed); the client only
    // answers !commands from live chat here (re-reads config each message so edits apply).
    const lastFired = {};
    if (window.MD.chat && MD.chat.onMessage) MD.chat.onMessage(function (m) {
      const text = ((m && m.text) || "").trim().toLowerCase();
      if (text[0] !== "!") return;
      const cmds = botCommands();
      for (let i = 0; i < cmds.length; i++) {
        const c = cmds[i]; if (c.on === false) continue;
        if (text === c.trigger || text.indexOf(c.trigger + " ") === 0) {
          const now = Date.now(), cd = (c.cooldown || 0) * 1000;
          if (lastFired[c.trigger] && now - lastFired[c.trigger] < cd) return;
          lastFired[c.trigger] = now; botSay(cid, c.reply); return;
        }
      }
    });
  }
  function wireBot() {
    $("#botBtn").onclick = () => {
      const back = el("div", "modal-back");
      back.innerHTML = `<div class="modal" style="max-width:600px">
        <h3>🤖 Chatbot</h3>
        <div style="font-size:11px;color:var(--ink-faint);background:var(--accent-soft);border-radius:8px;padding:8px 10px;margin-bottom:12px">
          <b>Timed messages and !commands run 24/7</b> — answered even with this dashboard closed (timed messages post while you're live). (Needs "Write to Chat feed" on your Kick app + a fresh sign-in.)</div>
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:14px;font-size:11.5px">
          <span style="color:var(--ink-dim);font-weight:700">Posts appear as</span>
          <select id="botAs" style="background:#fff;border:1px solid var(--line2);border-radius:7px;padding:6px 9px;font-size:11.5px;font-weight:700;color:var(--ink-dim)">
            <option value="bot">ModDeck bot (recommended)</option>
            <option value="self">Your channel (posts as you)</option>
          </select>
        </div>

        <div style="font-weight:800;font-size:13px;margin-bottom:7px">⌨️ Commands</div>
        <div id="cmdList" style="display:flex;flex-direction:column;gap:7px;margin-bottom:10px;max-height:200px;overflow:auto"></div>
        <div style="display:flex;gap:7px;margin-bottom:16px;flex-wrap:wrap">
          <input id="cmdTrig" placeholder="!discord" style="flex:1;min-width:90px;background:#fff;border:1px solid var(--line2);border-radius:8px;padding:8px 10px;font-size:12px">
          <input id="cmdReply" placeholder="Join: discord.gg/…" style="flex:2;min-width:140px;background:#fff;border:1px solid var(--line2);border-radius:8px;padding:8px 10px;font-size:12px">
          <input id="cmdCd" type="number" value="30" title="cooldown (s)" style="width:70px;background:#fff;border:1px solid var(--line2);border-radius:8px;padding:8px 10px;font-size:12px">
          <button class="primary" id="cmdAdd" style="border:none;background:var(--accent);color:#fff;border-radius:8px;padding:0 14px;font-weight:700">Add</button>
        </div>

        <div style="font-weight:800;font-size:13px;margin-bottom:7px">⏲️ Timed messages</div>
        <div id="timList" style="display:flex;flex-direction:column;gap:7px;margin-bottom:10px;max-height:200px;overflow:auto"></div>
        <div style="display:flex;gap:7px;margin-bottom:14px;flex-wrap:wrap">
          <input id="timText" placeholder="Don't forget to follow! 💜" style="flex:2;min-width:160px;background:#fff;border:1px solid var(--line2);border-radius:8px;padding:8px 10px;font-size:12px">
          <input id="timEvery" type="number" value="10" title="every N minutes" style="width:80px;background:#fff;border:1px solid var(--line2);border-radius:8px;padding:8px 10px;font-size:12px">
          <button class="primary" id="timAdd" style="border:none;background:var(--accent);color:#fff;border-radius:8px;padding:0 14px;font-weight:700">Add</button>
        </div>
        <div class="mrow"><button id="botTest">📣 Send test message</button><button id="botClose" class="primary">Done</button></div>
      </div>`;
      document.body.appendChild(back);
      back.onclick = (e) => { if (e.target === back) back.remove(); };
      const toggleChip = (on) => `<span style="font-size:9px;font-weight:800;padding:2px 7px;border-radius:20px;background:${on ? "#16331a" : "#3a3030"};color:${on ? "#7dff5a" : "#ff8a8a"}">${on ? "ON" : "OFF"}</span>`;
      function renderCmds() {
        const host = $("#cmdList", back), arr = botCommands(); host.innerHTML = "";
        if (!arr.length) { host.appendChild(el("div", "list-empty", "No commands yet.")); return; }
        arr.forEach((c, i) => {
          const row = el("div"); row.style.cssText = "display:flex;gap:8px;align-items:center;background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:7px 10px";
          row.innerHTML = `<b style="font-size:12px;color:var(--accent)">${c.trigger}</b><span style="flex:1;font-size:11.5px;color:var(--ink-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.reply}</span><span style="font-size:10px;color:var(--ink-faint)">${c.cooldown||0}s</span>`;
          const tog = el("button", null, toggleChip(c.on !== false)); tog.style.cssText = "border:none;background:none;cursor:pointer;padding:0";
          tog.onclick = () => { const a = botCommands(); a[i].on = a[i].on === false; saveBotCommands(a); renderCmds(); };
          const del = el("button", null, "✕"); del.style.cssText = "border:1px solid var(--line2);background:#fff;color:var(--ink-faint);border-radius:7px;padding:4px 8px";
          del.onclick = () => { const a = botCommands(); a.splice(i, 1); saveBotCommands(a); renderCmds(); };
          row.appendChild(tog); row.appendChild(del); host.appendChild(row);
        });
      }
      function renderTimers() {
        const host = $("#timList", back), arr = botTimers(); host.innerHTML = "";
        if (!arr.length) { host.appendChild(el("div", "list-empty", "No timed messages yet.")); return; }
        arr.forEach((t, i) => {
          const row = el("div"); row.style.cssText = "display:flex;gap:8px;align-items:center;background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:7px 10px";
          row.innerHTML = `<span style="flex:1;font-size:11.5px;color:var(--ink-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.text}</span><span style="font-size:10px;color:var(--ink-faint)">every ${t.everyMin||10}m</span>`;
          const tog = el("button", null, toggleChip(t.on !== false)); tog.style.cssText = "border:none;background:none;cursor:pointer;padding:0";
          tog.onclick = () => { const a = botTimers(); a[i].on = a[i].on === false; saveBotTimers(a); renderTimers(); };
          const del = el("button", null, "✕"); del.style.cssText = "border:1px solid var(--line2);background:#fff;color:var(--ink-faint);border-radius:7px;padding:4px 8px";
          del.onclick = () => { const a = botTimers(); a.splice(i, 1); saveBotTimers(a); renderTimers(); };
          row.appendChild(tog); row.appendChild(del); host.appendChild(row);
        });
      }
      renderCmds(); renderTimers();
      const asSel = $("#botAs", back); asSel.value = botPostAs();
      asSel.onchange = () => { SY.setBot({ postAs: asSel.value }); toast(asSel.value === "bot" ? "Posting as ModDeck bot" : "Posting as your channel", "ok"); };
      _botRepaint = function () { if (document.body.contains(back)) { renderCmds(); renderTimers(); const a = $("#botAs", back); if (a) a.value = botPostAs(); } else { _botRepaint = null; } };
      $("#cmdAdd", back).onclick = () => {
        let trig = ($("#cmdTrig", back).value || "").trim(); const reply = ($("#cmdReply", back).value || "").trim();
        if (!trig || !reply) return; if (trig[0] !== "!") trig = "!" + trig;
        const a = botCommands(); a.push({ trigger: trig.toLowerCase(), reply, cooldown: parseInt($("#cmdCd", back).value) || 0, on: true });
        saveBotCommands(a); $("#cmdTrig", back).value = ""; $("#cmdReply", back).value = ""; renderCmds();
      };
      $("#timAdd", back).onclick = () => {
        const text = ($("#timText", back).value || "").trim(); if (!text) return;
        const a = botTimers(); a.push({ text, everyMin: Math.max(1, parseInt($("#timEvery", back).value) || 10), on: true });
        saveBotTimers(a); $("#timText", back).value = ""; renderTimers();
      };
      $("#botTest", back).onclick = () => {
        const btn = $("#botTest", back); btn.disabled = true; btn.textContent = "Sending…";
        botSayTest(channelId, "✅ ModDeck bot connected — test message").then((r) => {
          btn.disabled = false; btn.textContent = "📣 Send test message";
          if (r.ok) toast("Bot posted to your chat ✅", "ok");
          else if (r.detail === "not signed in") toast("Sign in first to test the bot", "err");
          else if (r.status === 503) toast("Bot not connected — enable 'Write to Chat feed' + sign in again", "err");
          else if (r.status === 401 || r.status === 403) toast("Not authorized — sign out/in after enabling 'Write to Chat feed' (chat:write)", "err");
          else toast("Failed (" + (r.status || "?") + "): " + (r.detail || r.error || "unknown — check chat mode / bot is a mod"), "err");
        });
      };
      $("#botClose", back).onclick = () => { _botRepaint = null; back.remove(); };
    };
  }

  // ---------- media share queue ----------
  function ytId(u) {
    const m = String(u || "").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : null;
  }
  // ---- media auto-advance (owner's dashboard drives it; overlay is unauthed so can't self-advance) ----
  // A hidden, muted YouTube player mirrors /media/now to detect when a video ends, then plays the next
  // approved request. A duration timer is a fallback in case the tab is backgrounded and ENDED is throttled.
  let _ytReady = null, _ytPlayer = null, _mediaCtrl = false, _mediaQ = {}, _advTimer = null, _mediaSettings = {};
  function autoAdvanceOn() { return _mediaSettings.autoAdvance !== false; }   // default on
  function subscribeMediaSettings() { SY.onMediaSettings(function (v) { _mediaSettings = v || {}; }); }
  function loadYT() {
    if (_ytReady) return _ytReady;
    _ytReady = new Promise(function (res) {
      if (window.YT && window.YT.Player) return res();
      window.onYouTubeIframeAPIReady = function () { res(); };
      const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s);
    });
    return _ytReady;
  }
  function nextApprovedId() {
    const ids = Object.keys(_mediaQ).filter(id => (_mediaQ[id].status || "") === "approved");
    ids.sort((a, b) => (_mediaQ[a].t || 0) - (_mediaQ[b].t || 0));
    return ids[0];
  }
  function advanceMedia() {
    const id = nextApprovedId();
    if (id) { const it = _mediaQ[id]; SY.playMedia({ videoId: it.videoId, title: it.title, requester: it.requester, amount: it.amount }); SY.updateMedia(id, { status: "played" }); }
    else SY.stopMedia();
  }
  function startMediaController() {
    if (_mediaCtrl) return; _mediaCtrl = true;
    SY.onMediaQueue(q => { _mediaQ = q || {}; });
    SY.onMediaNow(now => {
      clearTimeout(_advTimer);
      if (!autoAdvanceOn() || !now || !now.videoId) return;
      loadYT().then(() => {
        let hold = document.getElementById("ytctrl");
        if (!hold) { hold = document.createElement("div"); hold.id = "ytctrl"; hold.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px"; document.body.appendChild(hold); }
        if (!_ytPlayer) {
          _ytPlayer = new YT.Player(hold, {
            height: "1", width: "1", videoId: now.videoId, playerVars: { autoplay: 1, mute: 1 },
            events: {
              onReady: e => { try { e.target.mute(); e.target.playVideo(); } catch (_) {} },
              onStateChange: e => {
                if (e.data === YT.PlayerState.PLAYING) { try { const d = _ytPlayer.getDuration(); if (d > 0) { clearTimeout(_advTimer); _advTimer = setTimeout(advanceMedia, (d + 2) * 1000); } } catch (_) {} }
                if (e.data === YT.PlayerState.ENDED) { clearTimeout(_advTimer); advanceMedia(); }
              },
            },
          });
        } else { try { _ytPlayer.loadVideoById(now.videoId); _ytPlayer.mute(); } catch (_) {} }
      });
    });
  }

  function wireMedia() {
    $("#mediaBtn").onclick = () => {
      const back = el("div", "modal-back");
      back.innerHTML = `<div class="modal" style="max-width:620px">
        <h3>📺 Media Queue</h3>
        <label style="display:flex;gap:7px;align-items:center;font-size:11.5px;color:var(--ink-dim);cursor:pointer;margin-bottom:12px"><input type="checkbox" id="mAuto"> Auto-advance to the next approved video when one ends</label>
        <div id="mNowWrap" style="margin-bottom:12px"></div>
        <div style="font-weight:800;font-size:13px;margin-bottom:7px">Requests</div>
        <div id="mList" style="display:flex;flex-direction:column;gap:7px;margin-bottom:12px;max-height:300px;overflow:auto"></div>
        <div style="display:flex;gap:7px;margin-bottom:14px">
          <input id="mTestUrl" placeholder="paste a YouTube link to add a test request" style="flex:2;background:#fff;border:1px solid var(--line2);border-radius:8px;padding:8px 10px;font-size:12px">
          <button id="mTestAdd" style="border:1px solid var(--line2);background:#fff;border-radius:8px;padding:0 14px;font-weight:700;color:var(--ink-dim)">Add test</button>
        </div>
        <div class="mrow"><button id="mClose" class="primary">Done</button></div>
      </div>`;
      document.body.appendChild(back);
      back.onclick = (e) => { if (e.target === back) back.remove(); };
      let queue = {}, now = null;
      function paintNow() {
        const host = $("#mNowWrap", back); host.innerHTML = "";
        if (now && now.videoId) {
          const w = el("div"); w.style.cssText = "display:flex;align-items:center;gap:10px;background:#16331a;border:1px solid #2a5a2f;border-radius:9px;padding:9px 11px";
          w.innerHTML = `<span style="font-size:18px">▶</span><div style="flex:1;min-width:0"><div style="font-weight:800;font-size:12.5px;color:#7dff5a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Now playing: ${now.title || now.videoId}</div><div style="font-size:10.5px;color:var(--ink-faint)">${now.requester || ""}${now.amount ? " · " + now.amount + " Kicks" : ""}</div></div>`;
          const stop = el("button", null, "⏹ Stop"); stop.style.cssText = "border:1px solid var(--line2);background:#fff;border-radius:7px;padding:6px 11px;font-weight:700;color:var(--danger)";
          stop.onclick = () => SY.stopMedia();
          w.appendChild(stop); host.appendChild(w);
        }
      }
      function paintList() {
        const host = $("#mList", back); host.innerHTML = "";
        const ids = Object.keys(queue);
        if (!ids.length) { host.appendChild(el("div", "list-empty", "No requests yet. Viewers send Kicks with a YouTube link.")); return; }
        ids.sort((a, b) => (queue[a].t || 0) - (queue[b].t || 0)).forEach(id => {
          const it = queue[id];
          const row = el("div"); row.style.cssText = "display:flex;gap:8px;align-items:center;background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:7px 10px";
          const pend = (it.status || "pending") === "pending";
          row.innerHTML = `<img src="https://i.ytimg.com/vi/${it.videoId}/default.jpg" style="width:48px;height:36px;object-fit:cover;border-radius:5px;flex:none" onerror="this.style.visibility='hidden'"><div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${it.title || it.videoId}</div><div style="font-size:10.5px;color:var(--ink-faint)">${it.requester || "viewer"}${it.amount ? " · " + it.amount + " Kicks" : ""} · ${it.status || "pending"}</div></div>`;
          if (pend) { const ok = el("button", null, "✓"); ok.title = "Approve"; ok.style.cssText = "border:none;background:#16331a;color:#7dff5a;border-radius:7px;padding:6px 10px;font-weight:800"; ok.onclick = () => SY.updateMedia(id, { status: "approved" }); row.appendChild(ok); }
          const play = el("button", null, "▶"); play.title = "Play now"; play.style.cssText = "border:none;background:var(--accent);color:#fff;border-radius:7px;padding:6px 11px;font-weight:800"; play.onclick = () => { SY.playMedia({ videoId: it.videoId, title: it.title, requester: it.requester, amount: it.amount }); SY.updateMedia(id, { status: "played" }); };
          const del = el("button", null, "✕"); del.style.cssText = "border:1px solid var(--line2);background:#fff;color:var(--ink-faint);border-radius:7px;padding:6px 9px"; del.onclick = () => SY.removeMedia(id);
          row.appendChild(play); row.appendChild(del); host.appendChild(row);
        });
      }
      SY.onMediaQueue(q => { queue = q || {}; paintList(); });
      SY.onMediaNow(v => { now = v; paintNow(); });
      const autoCb = $("#mAuto", back); autoCb.checked = autoAdvanceOn();
      SY.onMediaSettings(v => { _mediaSettings = v || {}; autoCb.checked = autoAdvanceOn(); });
      autoCb.onchange = () => { SY.setMediaSettings({ autoAdvance: autoCb.checked }); toast(autoCb.checked ? "Auto-advance on" : "Auto-advance off"); };
      $("#mTestAdd", back).onclick = () => {
        const u = $("#mTestUrl", back).value.trim(); const vid = ytId(u); if (!vid) { toast("Not a YouTube link", "err"); return; }
        SY.pushMedia({ videoId: vid, title: "Test request", requester: "you", amount: 0, status: "pending" });
        $("#mTestUrl", back).value = "";
      };
      $("#mClose", back).onclick = () => back.remove();
    };
  }

  // ---------- docs + settings ----------
  function wireMisc() {
    const d = $("#docsBtn"); if (d) d.onclick = () => window.open("docs.html", "_blank");
    const s = $("#settingsBtn"); if (s) s.onclick = () => {
      const back = el("div", "modal-back");
      back.innerHTML = `<div class="modal">
        <h3>⚙️ Settings</h3>
        <p>ModDeck <b>v${window.MD.VERSION}</b> · sync: <b>${SY.kind}</b></p>
        <div class="field"><label>Channel ID (overlay)</label><div class="obs-url">${channelId}</div></div>
        <div class="field"><label>Canvas</label><div style="font-size:12.5px;color:var(--ink-dim)">${S.CANVAS_W} × ${S.CANVAS_H} (1080p)</div></div>
        <div class="mrow"><button id="stClear" style="color:var(--danger)">Clear staging canvas</button><button id="stClose" class="primary">Done</button></div>
      </div>`;
      document.body.appendChild(back);
      back.onclick = (e) => { if (e.target === back) back.remove(); };
      $("#stClear", back).onclick = () => { S.loadIntoStaging({ order: [], els: {} }); toast("Staging cleared"); back.remove(); };
      $("#stClose", back).onclick = () => back.remove();
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
      const ab = (label, mode) => { const b = el("button", null, label); b.style.cssText = "padding:8px 4px;border:1px solid var(--line2);border-radius:7px;background:#fff;font-weight:600;color:var(--ink-dim);font-size:11px"; b.onclick = () => S.alignSelection(mode); return b; };
      const lbl = (t) => { const d = el("div"); d.style.cssText = "font-size:10px;color:var(--ink-faint);font-weight:700;letter-spacing:.4px;margin:2px 0 6px"; d.textContent = t; return d; };
      box.appendChild(lbl("ALIGN"));
      const ag = el("div"); ag.style.cssText = "display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px";
      ag.appendChild(ab("⇤ Left", "left")); ag.appendChild(ab("↔ Center", "hcenter")); ag.appendChild(ab("Right ⇥", "right"));
      ag.appendChild(ab("⤒ Top", "top")); ag.appendChild(ab("↕ Middle", "vcenter")); ag.appendChild(ab("Bottom ⤓", "bottom"));
      box.appendChild(ag);
      if (sel.length > 2) {
        box.appendChild(lbl("DISTRIBUTE"));
        const dg = el("div"); dg.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px";
        dg.appendChild(ab("Horizontally", "dhoriz")); dg.appendChild(ab("Vertically", "dvert"));
        box.appendChild(dg);
      }
      const row = el("div"); row.style.cssText = "display:flex;gap:8px";
      const dup = el("button", null, "Duplicate"); dup.style.cssText = "flex:1;padding:8px;border:1px solid var(--line2);border-radius:8px;background:#fff;font-weight:600;color:var(--ink-dim)"; dup.onclick = () => S.duplicateSelected();
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
      note.innerHTML = "Shows your <b>live Kick chat</b> once you're signed in (a sample feed in demo). Twitch &amp; YouTube join the same widget soon.";
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
      add(labeled("Accent", swatchRow(SWATCHES, p.accent, c => upp({ accent: c }))));
      add(labeled("Text color", swatchRow(SWATCHES, p.color, c => upp({ color: c }))));
      // per-event customisation: icon · message · sound · gif, one block per event type
      const updEvent = (k, patch) => { const cur = (S.getEl(elx.id).props.events) || {}; upp({ events: Object.assign({}, cur, { [k]: Object.assign({}, cur[k], patch) }) }); };
      const inpx = (val, ph, on) => { const i = el("input"); i.type = "text"; i.value = val || ""; i.placeholder = ph || ""; i.style.cssText = "width:100%;background:#fff;border:1px solid var(--line2);border-radius:7px;padding:6px 8px;font-size:11.5px;box-sizing:border-box"; i.oninput = () => on(i.value); return i; };
      [["follow", "Follow"], ["sub", "Sub"], ["resub", "Resub"], ["gift", "Gift subs"], ["kicks", "Kicks"]].forEach(([k, lbl]) => {
        const cfg = (p.events && p.events[k]) || {};
        const block = el("div"); block.style.cssText = "border:1px solid var(--line2);border-radius:9px;padding:9px;margin-top:8px;background:var(--panel2)";
        const hdr = el("div"); hdr.style.cssText = "display:flex;align-items:center;gap:7px;margin-bottom:7px";
        const iconI = inpx(cfg.icon, "🎉", v => updEvent(k, { icon: v })); iconI.style.width = "40px"; iconI.style.flex = "none"; iconI.style.textAlign = "center";
        const name = el("div", null, lbl); name.style.cssText = "font-weight:800;font-size:12px;flex:1";
        const onW = el("label"); onW.style.cssText = "display:flex;gap:4px;align-items:center;font-size:10px;color:var(--ink-faint);cursor:pointer";
        const onCb = el("input"); onCb.type = "checkbox"; onCb.checked = cfg.on !== false; onCb.onchange = () => updEvent(k, { on: onCb.checked });
        onW.appendChild(onCb); onW.appendChild(document.createTextNode("on"));
        hdr.appendChild(iconI); hdr.appendChild(name); hdr.appendChild(onW); block.appendChild(hdr);
        const m = inpx(cfg.text, "{user} just followed", v => updEvent(k, { text: v })); m.style.marginBottom = "6px"; block.appendChild(m);
        const s = inpx(cfg.sound, "sound URL (mp3/wav) — optional", v => updEvent(k, { sound: v })); s.style.marginBottom = "6px"; block.appendChild(s);
        const g = inpx(cfg.gif, "GIF / image URL — optional", v => updEvent(k, { gif: v })); block.appendChild(g);
        add(block);
      });
      const varsNote = el("div"); varsNote.style.cssText = "font-size:10px;color:var(--ink-faint);margin-top:7px";
      varsNote.innerHTML = "Variables: <code>{user}</code> · <code>{amount}</code> · <code>{months}</code>";
      add(varsNote);
      const trig = el("button", null, "▶ Preview style here");
      trig.style.cssText = "width:100%;margin-top:4px;padding:9px;border:1px solid var(--line2);border-radius:8px;background:#fff;color:var(--ink-dim);font-weight:700";
      trig.onclick = () => { upp({ triggerSeq: (S.getEl(elx.id).props.triggerSeq || 0) + 1 }); toast("Preview animation"); };
      add(labeled("", trig));
      // fire a real test alert onto the LIVE overlay (same path Kick events use)
      const testGrid = el("div"); testGrid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:6px";
      const TESTS = [
        ["👋 Follow", { type: "follow", user: "NewFollower" }],
        ["⭐ Sub", { type: "sub", user: "BigFan", months: 1 }],
        ["🎁 Gift x5", { type: "giftsub", user: "Generous1", amount: 5 }],
        ["💚 Kicks", { type: "kicks", user: "Hype", amount: 200 }],
      ];
      TESTS.forEach(([lbl, cue]) => {
        const b = el("button", null, lbl);
        b.style.cssText = "padding:8px;border:1px solid var(--line2);border-radius:8px;background:#fff;font-weight:700;color:var(--ink-dim);font-size:11px";
        b.onclick = () => { try { SY.publishAlert(Object.assign({ seq: Date.now() + "-" + Math.floor(Math.random() * 1e6) }, cue)); toast("Fired " + cue.type + " to live overlay"); } catch (e) {} };
        testGrid.appendChild(b);
      });
      add(labeled("Test on live overlay", testGrid));
      const note = el("div"); note.style.cssText = "font-size:10.5px;color:var(--ink-faint);line-height:1.5;margin-top:4px";
      note.innerHTML = "Real Kick <b>follows, subs, gift subs &amp; Kicks</b> fire this automatically once you've signed in and set the webhook URL in your Kick app (see Docs). Place one Alert Box to control where/how they look.";
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
    } else if (elx.type === "wheel") {
      const ta = el("textarea"); ta.style.minHeight = "110px"; ta.value = p.segments;
      ta.oninput = () => upp({ segments: ta.value }); add(labeled("Segments (one per line)", ta));
      const spin = el("button", null, "🎡 SPIN THE WHEEL");
      spin.style.cssText = "width:100%;padding:11px;border:none;border-radius:8px;background:var(--accent);color:#fff;font-weight:800;font-size:13px";
      spin.onclick = () => { const segs = (S.getEl(elx.id).props.segments || "").split("\n").filter(s => s.trim()); const w = Math.floor(Math.random() * Math.max(1, segs.length)); upp({ winner: w, spinSeq: (S.getEl(elx.id).props.spinSeq || 0) + 1 }); toast("Spinning…"); };
      add(labeled("", spin));
      add(labeled("Accent (winner text)", swatchRow(SWATCHES, p.accent, c => upp({ accent: c }))));
      const note = el("div"); note.style.cssText = "font-size:10.5px;color:var(--ink-faint);line-height:1.5;margin-top:4px";
      note.innerHTML = "Spin fires on the live overlay too — viewers see the same result. Chat <code>!spin</code> wiring comes with the bot phase.";
      add(note);
    } else if (elx.type === "emojicombo") {
      add(labeled("Show after (count)", range(p.startAt, 2, 25, 1, v => upp({ startAt: v }))));
      add(labeled("Combo timeout (ms)", numInput(p.comboTimeout, v => upp({ comboTimeout: v }))));
      add(labeled("Max emotes shown", range(p.max, 1, 8, 1, v => upp({ max: v }))));
      add(labeled("Accent", swatchRow(SWATCHES, p.accent, c => upp({ accent: c }))));
      add(labeled("Auto-clip at (count, 0 = off)", numInput(p.clipAt || 0, v => upp({ clipAt: v }))));
      // simulate chat emote spam (a real Kick emote + a few emojis) — previews here AND fires to the live overlay
      const testBtn = el("button", null, "🔥 Test combo (simulate spam)");
      testBtn.style.cssText = "width:100%;margin-top:2px;padding:9px;border:none;border-radius:8px;background:var(--accent);color:#fff;font-weight:700;font-size:11.5px";
      testBtn.onclick = () => {
        const burst = [
          { key: "https://files.kick.com/emotes/37226/fullsize", name: "KEKW", count: 11 },
          { key: "🔥", count: 6 }, { key: "😂", count: 4 }, { key: "💀", count: 2 },
        ];
        if (window.MD.replayEmoteBurst) MD.replayEmoteBurst(burst);          // preview on this canvas
        try { SY.publishEmote({ burst, seq: Date.now() + "-" + Math.floor(Math.random() * 1e6) }); } catch (e) {}   // + the live overlay
        toast("Simulating emote spam 🔥");
      };
      add(labeled("", testBtn));
      const clipBtn = el("button", null, "📎 Test auto-clip");
      clipBtn.style.cssText = "width:100%;margin-top:6px;padding:9px;border:1px solid var(--line2);border-radius:8px;background:#fff;font-weight:700;color:var(--ink-dim);font-size:11px";
      clipBtn.onclick = () => { if (window.MD.fireClip) MD.fireClip({ emote: "🔥", count: p.clipAt || 50 }); };
      add(labeled("", clipBtn));
      const note = el("div"); note.style.cssText = "font-size:10.5px;color:var(--ink-faint);line-height:1.5;margin-top:4px";
      note.innerHTML = "Counts emotes spammed in your <b>real Kick chat</b> and shows live combos (your actual channel emotes, as images). <b>Test combo</b> simulates a spam burst here and on your overlay. <b>Auto-clip</b> fires when an emote hits your threshold.";
      add(note);
    } else if (elx.type === "discord") {
      add(labeled("Title", txt(p.title, v => upp({ title: v }))));
      add(labeled("Accent", swatchRow(["#5865F2", "#eb459e", "#57f287", "#faa61a", "#ffffff"], p.accent, c => upp({ accent: c }))));
      add(labeled("Auto-clear after (sec, 0 = always show)", numInput(p.clearAfter, v => upp({ clearAfter: v }))));
      const w = el("label"); w.style.cssText = "display:flex;gap:6px;align-items:center;font-size:11px;color:var(--ink-dim);cursor:pointer";
      const cb = el("input"); cb.type = "checkbox"; cb.checked = p.showAvatar; cb.onchange = () => upp({ showAvatar: cb.checked });
      w.appendChild(cb); w.appendChild(document.createTextNode("Show avatar")); add(labeled("", w));
      const note = el("div"); note.style.cssText = "font-size:10.5px;color:var(--ink-faint);line-height:1.5;margin-top:4px";
      note.innerHTML = "Shows messages your community <b>stars</b> in Discord. Showing a <b>demo feed</b> — needs the ModDeck Discord bot to go live (see below).";
      add(note);
    } else if (elx.type === "powerchat") {
      add(labeled("PowerChat overlay URL", url(p.url, v => upp({ url: v }))));
      const note = el("div"); note.style.cssText = "font-size:10.5px;color:var(--ink-faint);line-height:1.5;margin-top:4px";
      note.innerHTML = "Embeds your <b>powerchat.live</b> TTS &amp; media-donation overlay. Get the URL from powerchat.live → your alert/overlay widget, and paste it here.";
      add(note);
    } else if (elx.type === "viewers") {
      add(labeled("Label", txt(p.label, v => upp({ label: v }))));
      add(labeled("Icon (emoji)", txt(p.icon, v => upp({ icon: v }))));
      add(labeled("Accent", swatchRow(["#53fc18", "#5b5bf0", "#0fb5a8", "#ffffff"], p.accent, c => upp({ accent: c }))));
      const note = el("div"); note.style.cssText = "font-size:10.5px;color:var(--ink-faint);line-height:1.5;margin-top:4px";
      note.innerHTML = "Shows a live, animated viewer count. <b>Demo number</b> for now — real Kick viewer count connects via the worker later.";
      add(note);
    } else if (elx.type === "mediashare") {
      add(labeled("Accent", swatchRow(["#53fc18", "#5b5bf0", "#0fb5a8", "#ff4d4d", "#ffffff"], p.accent, c => upp({ accent: c }))));
      add(labeled("Corner radius", range(p.radius == null ? 12 : p.radius, 0, 40, 1, v => upp({ radius: v }))));
      const w = el("label"); w.style.cssText = "display:flex;gap:6px;align-items:center;font-size:11px;color:var(--ink-dim);cursor:pointer";
      const cb = el("input"); cb.type = "checkbox"; cb.checked = p.showInfo !== false; cb.onchange = () => upp({ showInfo: cb.checked });
      w.appendChild(cb); w.appendChild(document.createTextNode("Show requester + amount banner")); add(labeled("", w));
      const open = el("button", null, "📺 Open Media Queue");
      open.style.cssText = "width:100%;margin-top:6px;padding:9px;border:none;border-radius:8px;background:var(--accent);color:#fff;font-weight:700";
      open.onclick = () => $("#mediaBtn").click();
      add(labeled("", open));
      const note = el("div"); note.style.cssText = "font-size:10.5px;color:var(--ink-faint);line-height:1.5;margin-top:4px";
      note.innerHTML = "Viewers request a video by sending <b>Kicks with a YouTube link</b> in the message. Requests land in the <b>Media Queue</b> for you/your mods to approve, then play here. A custom submit form (Stripe) can come later.";
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

  // ---------- account header (real Kick login when configured) ----------
  function renderAccount() {
    const action = $("#acctAction"), av = $("#acctAv"), brandLogo = $("#brandLogo");
    if (brandLogo && window.MD.logoSvg) brandLogo.innerHTML = MD.logoSvg();   // default brand mark
    const loggedOut = () => {
      $("#acctName").textContent = "Demo mode";
      $("#badges").innerHTML = `<span class="pf off">NOT SIGNED IN</span>`;
      av.style.backgroundImage = "";
      action.innerHTML = `<button id="connectKick" style="background:var(--k-bg);color:var(--k);border:1px solid #cdeecb;border-radius:7px;padding:4px 10px;font-size:11px;font-weight:800;cursor:pointer">⚡ Connect Kick</button>`;
      const b = $("#connectKick"); if (b) b.onclick = () => window.MD.auth && MD.auth.startKick();
    };
    if (!window.MD.auth) { loggedOut(); return; }
    MD.auth.onAuth((user) => {
      if (user) {
        const p = MD.auth.profile() || {};
        $("#acctName").textContent = p.username || user.displayName || "Streamer";
        if (brandLogo && window.MD.logoSvg) brandLogo.innerHTML = MD.logoSvg(p.platform);  // platform-themed
        $("#badges").innerHTML = `<span class="pf k">KICK</span>`;
        if (p.picture) av.style.backgroundImage = `url("${p.picture}")`;
        action.innerHTML = `<a id="logout" style="font-size:11px;color:var(--accent);cursor:pointer;font-weight:600">Log out</a> <span style="font-size:10px;color:var(--ink-faint)">· synced</span>`;
        const lo = $("#logout"); if (lo) lo.onclick = () => MD.auth.signOut().then(() => location.reload());
        goLive(user);
      } else loggedOut();
    });
  }

  // ---------- boot ----------
  function init() {
    viewport = $("#viewport"); channelId = "dev-local";
    editChannel = (new URLSearchParams(location.search)).get("channel") || null;
    SY.init({ channelId });
    subscribeBot(); subscribeMediaSettings();   // demo/local until login swaps to the firebase backend
    C.init({
      viewport, world: $("#world"), frame: $("#frame"), frameLabel: $("#frameLabel"),
      content: $("#content"), ui: $("#ui"), dots: $("#dots"),
      onViewChange: (s) => { $("#zoomVal").textContent = Math.round(s * 100) + "%"; },
    });
    buildPalette(); wireBroadcast(); wirePresets(); wireToolbar(); wireObs(); wireSoundboard(); wireBot(); wireMedia(); wireMisc();
    // auto-clip feedback (real clip-cut via the platform API lands in the bot phase)
    window.MD.fireClip = function (info) { toast("📎 Auto-clip: " + (info && info.emote) + " ×" + (info && info.count) + " (demo)", "ok"); try { SY.publishClip(info || {}); } catch (e) {} };
    renderAccount(); renderLists(); updateLivePill(false);
    S.on("select", renderProps); renderProps();
    // persist staging on edits, and restore it on load (so a refresh never loses your layout)
    S.on("change", scheduleStagingWrite);
    SY.loadStaging(function (board) {
      if (board && board.order && board.order.length) S.loadIntoStaging(board);
      else if (!S.state.staging.order.length) seed();
    });
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
