/* ModDeck Kick chat adapter — reads a channel's live chat from Kick's public Pusher socket
   (WebSocket reads aren't subject to CORS). Get the chatroom id from the Worker's /kick/chatroom first.
   Exposes window.MD.chat: connectKick(chatroomId) · onMessage(cb) · disconnect().
   Emits { platform:"kick", user, text, emotes:[{id,name}], color, mod }, and feeds emotes to the
   Emoji Combo via MD.pushEmote (real Kick emote images). Sets MD.chatConnected so demo feeds stand down. */
(function () {
  window.MD = window.MD || {};
  var PUSHER = "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0-rc2&flash=false";
  var ws = null, msgCbs = [], reconnectT = null, manualClose = false, curRoom = null;

  function emit(m) { msgCbs.forEach(function (cb) { try { cb(m); } catch (e) {} }); }
  function parseEmotes(content) {
    var emotes = [];
    var text = String(content || "").replace(/\[emote:(\d+):([^\]]+)\]/g, function (_, id, name) {
      emotes.push({ id: id, name: name }); return ":" + name + ":";
    });
    return { text: text, emotes: emotes };
  }
  function emoteUrl(id) { return "https://files.kick.com/emotes/" + id + "/fullsize"; }

  function connect(chatroomId) {
    if (!chatroomId) return;
    manualClose = false; curRoom = chatroomId;
    try { ws = new WebSocket(PUSHER); } catch (e) { return; }
    ws.onmessage = function (ev) {
      var d; try { d = JSON.parse(ev.data); } catch (e) { return; }
      if (d.event === "pusher:connection_established") {
        ws.send(JSON.stringify({ event: "pusher:subscribe", data: { channel: "chatrooms." + chatroomId + ".v2" } }));
        window.MD.chatConnected = true;
        return;
      }
      if (d.event && d.event.indexOf("ChatMessageEvent") >= 0) {
        var p; try { p = JSON.parse(d.data); } catch (e) { return; }
        var sender = p.sender || {}, ident = sender.identity || {};
        var pe = parseEmotes(p.content);
        var badges = (ident.badges || []).map(function (b) { return b.type; });
        var mod = badges.indexOf("moderator") >= 0 || badges.indexOf("broadcaster") >= 0;
        emit({ platform: "kick", user: sender.username || "?", text: pe.text, emotes: pe.emotes, color: ident.color || null, mod: mod });
        if (window.MD.pushEmote) pe.emotes.forEach(function (e) { window.MD.pushEmote(emoteUrl(e.id), { name: e.name }); });
      }
    };
    ws.onclose = function () {
      window.MD.chatConnected = false;
      if (!manualClose) { clearTimeout(reconnectT); reconnectT = setTimeout(function () { connect(curRoom); }, 3000); }
    };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }
  function disconnect() { manualClose = true; window.MD.chatConnected = false; if (ws) { try { ws.close(); } catch (e) {} } }

  // resolve chatroom id from a channel slug via the Worker, then connect
  function connectBySlug(slug) {
    if (!slug || !window.MD.config) return Promise.resolve(false);
    return fetch(window.MD.config.workerUrl + "/kick/chatroom?slug=" + encodeURIComponent(slug))
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.chatroomId) { connect(d.chatroomId); return d.chatroomId; } return false; })
      .catch(function () { return false; });
  }

  // inject a single message down the same path real chat uses (chat widget + emoji combo react)
  function injectTest(m) {
    emit(m);
    if (window.MD.pushEmote && m.emotes) m.emotes.forEach(function (e) { window.MD.pushEmote(emoteUrl(e.id), { name: e.name }); });
  }
  // replay a list of sample messages like live chat arriving (used by the "Test chat" button)
  window.MD.replayChatTest = function (msgs) {
    if (!msgs || !msgs.length) return;
    window.MD.chatConnected = true;                          // simulate a live connection (demo feeds stand down)
    msgs.forEach(function (m, i) { setTimeout(function () { injectTest(m); }, i * 850); });
  };

  window.MD.chat = { connectKick: connect, connectBySlug: connectBySlug, disconnect: disconnect, onMessage: function (cb) { msgCbs.push(cb); }, injectTest: injectTest };
})();
