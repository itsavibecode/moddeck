/* ModDeck Twitch chat adapter — reads a channel's live chat via Twitch's anonymous IRC-over-WebSocket
   (justinfan login, read-only, no auth, no CORS). Mirrors the Kick adapter's message shape so the same
   Kick Chat widget + Emoji Combo render both platforms.
   Exposes window.MD.chatTwitch: connect(channel) · onMessage(cb) · disconnect().
   Emits { platform:"twitch", user, text, emotes:[{name,url}], color, mod } and feeds emotes to MD.pushEmote. */
(function () {
  window.MD = window.MD || {};
  var URL_ = "wss://irc-ws.chat.twitch.tv:443";
  var ws = null, msgCbs = [], reconnectT = null, manualClose = false, curChan = null;

  function emit(m) { msgCbs.forEach(function (cb) { try { cb(m); } catch (e) {} }); }
  function emoteUrl(id) { return "https://static-cdn.jtvnw.net/emoticons/v2/" + id + "/default/dark/1.0"; }

  // parse a tagged PRIVMSG line: "@tags :nick!user@host PRIVMSG #chan :message"
  function parsePrivmsg(line) {
    var tags = {};
    if (line[0] === "@") {
      var sp = line.indexOf(" ");
      line.substring(1, sp).split(";").forEach(function (kv) { var i = kv.indexOf("="); tags[kv.substring(0, i)] = kv.substring(i + 1); });
      line = line.substring(sp + 1);
    }
    var m = line.match(/^:([^!]+)![^ ]+ PRIVMSG #[^ ]+ :([\s\S]*)$/);
    if (!m) return null;
    var user = tags["display-name"] || m[1];
    var text = m[2];
    var emotes = [];
    if (tags.emotes) {
      tags.emotes.split("/").forEach(function (part) {
        var c = part.split(":"); if (c.length < 2) return;
        var id = c[0], r0 = (c[1].split(",")[0] || "").split("-");
        var name = text.substring(+r0[0], +r0[1] + 1);
        if (name) emotes.push({ name: name, url: emoteUrl(id) });
      });
      // wrap each emote name as :name: so the chat widget renders it as an image (same path as Kick)
      emotes.forEach(function (e) { text = text.split(e.name).join(":" + e.name + ":"); });
    }
    var badges = tags.badges || "";
    var mod = tags.mod === "1" || /moderator|broadcaster/.test(badges);
    return { platform: "twitch", user: user, text: text, emotes: emotes, color: tags.color || null, mod: mod };
  }

  function connect(channel) {
    channel = String(channel || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!channel) return;
    manualClose = false; curChan = channel;
    try { ws = new WebSocket(URL_); } catch (e) { return; }
    ws.onopen = function () {
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws.send("NICK justinfan" + Math.floor(Math.random() * 999999));
      ws.send("JOIN #" + channel);
      window.MD.chatConnected = true;   // a platform is live -> demo feeds stand down
    };
    ws.onmessage = function (ev) {
      String(ev.data || "").split("\r\n").forEach(function (line) {
        if (!line) return;
        if (line.indexOf("PING") === 0) { try { ws.send("PONG :tmi.twitch.tv"); } catch (e) {} return; }
        if (line.indexOf(" PRIVMSG ") >= 0) {
          var msg = parsePrivmsg(line);
          if (msg) { emit(msg); if (window.MD.pushEmote) msg.emotes.forEach(function (e) { window.MD.pushEmote(e.url, { name: e.name }); }); }
        }
      });
    };
    ws.onclose = function () {
      if (!manualClose) { clearTimeout(reconnectT); reconnectT = setTimeout(function () { connect(curChan); }, 3000); }
    };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }
  function disconnect() { manualClose = true; if (ws) { try { ws.close(); } catch (e) {} } }

  window.MD.chatTwitch = { connect: connect, onMessage: function (cb) { msgCbs.push(cb); }, disconnect: disconnect };
})();
