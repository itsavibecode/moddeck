/* ModDeck Worker — Kick OAuth (PKCE) token exchange + Firebase custom-token minting.
   Deployed to moddeck-worker.sevendwarfs.workers.dev. Dependency-free (WebCrypto).

   Flow: the browser does PKCE + sends the user to Kick; Kick redirects back to
   https://moddeck.bookhockeys.com/auth/kick, which POSTs {code, verifier} here.
   We exchange the code (using the client secret), look up the Kick user, and mint a
   Firebase custom token (uid = "kick:<id>") the browser signs in with.

   Secrets (wrangler secret put — never in code):
     KICK_CLIENT_SECRET            Kick app client secret
     FIREBASE_SERVICE_ACCOUNT_JSON Firebase service-account JSON (whole file)
   Vars (wrangler.toml): KICK_CLIENT_ID, KICK_REDIRECT_URI, FIREBASE_PROJECT_ID */

const ALLOWED_ORIGINS = [
  "https://moddeck.bookhockeys.com",
  "https://itsavibecode.github.io",
  "http://localhost:8104",
];

function cors(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}
const json = (obj, status, origin) =>
  new Response(JSON.stringify(obj), { status: status || 200, headers: { "Content-Type": "application/json", ...cors(origin) } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
    if (url.pathname === "/healthz") return json({ ok: true, service: "moddeck-worker" }, 200, origin);

    if (url.pathname === "/auth/kick/exchange" && request.method === "POST") {
      try {
        const { code, verifier } = await request.json();
        if (!code || !verifier) return json({ error: "missing code/verifier" }, 400, origin);

        // 1) exchange the authorization code for an access token (Kick requires the secret)
        const form = new URLSearchParams({
          grant_type: "authorization_code",
          client_id: env.KICK_CLIENT_ID,
          client_secret: env.KICK_CLIENT_SECRET,
          redirect_uri: env.KICK_REDIRECT_URI,
          code, code_verifier: verifier,
        });
        const tokRes = await fetch("https://id.kick.com/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString(),
        });
        if (!tokRes.ok) return json({ error: "kick token exchange failed", detail: await tokRes.text() }, 502, origin);
        const tok = await tokRes.json();

        // 2) look up the authenticated Kick user
        const uRes = await fetch("https://api.kick.com/public/v1/users", {
          headers: { Authorization: "Bearer " + tok.access_token, Accept: "application/json" },
        });
        if (!uRes.ok) return json({ error: "kick user lookup failed", detail: await uRes.text() }, 502, origin);
        const uBody = await uRes.json();
        const me = (uBody && uBody.data && uBody.data[0]) || uBody.data || uBody;
        const id = me.user_id || me.id;
        const username = me.name || me.username || me.slug || ("user" + id);
        const picture = me.profile_picture || me.profile_pic || "";
        if (!id) return json({ error: "could not read kick user id", detail: JSON.stringify(uBody).slice(0, 300) }, 502, origin);

        // 3) mint a Firebase custom token; username goes in claims so RTDB rules can match mods
        const uid = "kick:" + id;
        const claims = { platform: "kick", username, uname: String(username).toLowerCase(), picture };
        const firebaseToken = await mintFirebaseToken(env, uid, claims);

        // 4) best-effort: subscribe this broadcaster to the alert events (delivered to /kick/webhook).
        //    Requires the 'events:subscribe' scope + a webhook URL configured in the Kick app dashboard.
        let alerts = false;
        try { alerts = await subscribeKickEvents(tok.access_token); } catch (e) {}

        return json({ firebaseToken, profile: { platform: "kick", id: String(id), uid, username, picture }, alerts }, 200, origin);
      } catch (e) {
        return json({ error: "exchange error", detail: String(e && e.message || e) }, 500, origin);
      }
    }

    // resolve a Kick channel's chatroom id (browser can't fetch kick.com/api — CORS — but can read the
    // public Pusher chat socket once it has the chatroom id). Unofficial endpoint; may be rate-limited.
    if (url.pathname === "/kick/chatroom" && request.method === "GET") {
      const slug = (url.searchParams.get("slug") || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (!slug) return json({ error: "missing slug" }, 400, origin);
      try {
        const r = await fetch("https://kick.com/api/v2/channels/" + slug, {
          headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; ModDeck/1.0)" },
        });
        if (!r.ok) return json({ error: "kick channel lookup failed", status: r.status }, 502, origin);
        const d = await r.json();
        const chatroomId = d && d.chatroom && d.chatroom.id;
        if (!chatroomId) return json({ error: "no chatroom id in response" }, 502, origin);
        return json({ chatroomId, slug, userId: d.user_id || (d.user && d.user.id) || null }, 200, origin);
      } catch (e) { return json({ error: "lookup error", detail: String(e && e.message || e) }, 500, origin); }
    }

    // Kick event webhook — Kick POSTs follow/sub/gift/kicks events here (URL set in the app dashboard).
    // We verify the signature, map the event to an alert cue, and write it to the channel as admin.
    if (url.pathname === "/kick/webhook" && request.method === "POST") {
      const raw = await request.text();
      const msgId = request.headers.get("Kick-Event-Message-Id") || "";
      const ts = request.headers.get("Kick-Event-Message-Timestamp") || "";
      const sig = request.headers.get("Kick-Event-Signature") || "";
      const type = request.headers.get("Kick-Event-Type") || "";
      const ok = await verifyKickSignature(msgId, ts, raw, sig);
      if (!ok) return new Response("bad signature", { status: 401 });
      let body = {}; try { body = JSON.parse(raw); } catch (e) {}
      const cue = mapKickEvent(type, body);
      if (cue && cue.cid) { try { await rtdbSet(env, "channels/" + cue.cid + "/alertCue", cue.payload); } catch (e) {} }
      // Media Share: a Kicks donation whose message contains a YouTube link becomes a queue request.
      if (type === "kicks.gifted" && cue && cue.cid) {
        const vid = extractYouTubeId((body.gift && body.gift.message) || "");
        if (vid) {
          let title = "YouTube video"; try { title = (await ytTitle(vid)) || title; } catch (e) {}
          const entry = { videoId: vid, title, requester: cue.payload.user || "viewer", amount: cue.payload.amount || 0, status: "pending", t: Date.now() };
          try { await rtdbPush(env, "channels/" + cue.cid + "/media/queue", entry); } catch (e) {}
        }
      }
      return new Response("ok", { status: 200 });
    }

    return json({ error: "not found" }, 404, origin);
  },
};

// ── Kick events: subscribe + webhook mapping ──────────────────────────────
async function subscribeKickEvents(accessToken) {
  const events = [
    { name: "channel.followed", version: 1 },
    { name: "channel.subscription.new", version: 1 },
    { name: "channel.subscription.renewal", version: 1 },
    { name: "channel.subscription.gifts", version: 1 },
    { name: "kicks.gifted", version: 1 },
  ];
  const r = await fetch("https://api.kick.com/public/v1/events/subscriptions", {
    method: "POST",
    headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ events, method: "webhook" }),
  });
  return r.ok;
}

function mapKickEvent(type, b) {
  b = b || {};
  const bc = b.broadcaster || {};
  const cid = bc.user_id ? ("kick:" + bc.user_id) : null;
  if (!cid) return null;
  const base = { t: Date.now(), seq: String(b.event_id || (Date.now() + "-" + Math.floor(Math.random() * 1e6))) };
  const P = (o) => ({ cid, payload: Object.assign({}, base, o) });
  switch (type) {
    case "channel.followed":
      return P({ type: "follow", user: (b.follower && b.follower.username) || "Someone" });
    case "channel.subscription.new":
      return P({ type: "sub", user: (b.subscriber && b.subscriber.username) || "Someone", months: b.duration || 1 });
    case "channel.subscription.renewal":
      return P({ type: "resub", user: (b.subscriber && b.subscriber.username) || "Someone", months: b.duration || 1 });
    case "channel.subscription.gifts":
      return P({ type: "giftsub", user: (b.gifter && b.gifter.username) || null, anon: !!b.is_anonymous, amount: (b.giftees && b.giftees.length) || 1 });
    case "kicks.gifted":
      return P({ type: "kicks", user: (b.sender && b.sender.username) || "Someone", amount: (b.gift && b.gift.amount) || 0 });
    default:
      return null;
  }
}

// Kick's webhook public key (verifies Kick-Event-Signature over `id.timestamp.body`).
const KICK_PUBLIC_KEY =
  "-----BEGIN PUBLIC KEY-----\n" +
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq/+l1WnlRrGSolDMA+A8\n" +
  "6rAhMbQGmQ2SapVcGM3zq8ANXjnhDWocMqfWcTd95btDydITa10kDvHzw9WQOqp2\n" +
  "MZI7ZyrfzJuz5nhTPCiJwTwnEtWft7nV14BYRDHvlfqPUaZ+1KR4OCaO/wWIk/rQ\n" +
  "L/TjY0M70gse8rlBkbo2a8rKhu69RQTRsoaf4DVhDPEeSeI5jVrRDGAMGL3cGuyY\n" +
  "6CLKGdjVEM78g3JfYOvDU/RvfqD7L89TZ3iN94jrmWdGz34JNlEI5hqK8dd7C5EF\n" +
  "BEbZ5jgB8s8ReQV8H+MkuffjdAj3ajDDX3DOJMIut1lBrUVD1AaSrGCKHooWoL2e\n" +
  "twIDAQAB\n" +
  "-----END PUBLIC KEY-----";

async function verifyKickSignature(msgId, ts, rawBody, sigB64) {
  if (!msgId || !ts || !sigB64) return false;
  try {
    const pem = KICK_PUBLIC_KEY.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
    const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("spki", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const data = new TextEncoder().encode(msgId + "." + ts + "." + rawBody);
    const sig = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, data);
  } catch (e) { return false; }
}

// ── Firebase RTDB admin write (service-account OAuth2 access token + REST PUT) ──
let _tokCache = { token: null, exp: 0 };
async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (_tokCache.token && _tokCache.exp - 60 > now) return _tokCache.token;
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  };
  const unsigned = b64urlJson(header) + "." + b64urlJson(claim);
  const key = await pemToCryptoKey(sa.private_key);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = unsigned + "." + b64url(arrayBufferToBase64(sig));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + encodeURIComponent(assertion),
  });
  const j = await res.json();
  _tokCache = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return j.access_token;
}
async function rtdbSet(env, path, value) {
  const dbUrl = env.FIREBASE_DB_URL || ("https://" + env.FIREBASE_PROJECT_ID + "-default-rtdb.firebaseio.com");
  const tok = await getAccessToken(env);
  const res = await fetch(dbUrl + "/" + path + ".json?access_token=" + encodeURIComponent(tok), {
    method: "PUT", body: JSON.stringify(value),
  });
  return res.ok;
}
async function rtdbPush(env, path, value) {
  const dbUrl = env.FIREBASE_DB_URL || ("https://" + env.FIREBASE_PROJECT_ID + "-default-rtdb.firebaseio.com");
  const tok = await getAccessToken(env);
  const res = await fetch(dbUrl + "/" + path + ".json?access_token=" + encodeURIComponent(tok), {
    method: "POST", body: JSON.stringify(value),
  });
  return res.ok;
}

// ── Media Share helpers ───────────────────────────────────────────────────
function extractYouTubeId(text) {
  const m = String(text || "").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}
async function ytTitle(videoId) {
  const r = await fetch("https://www.youtube.com/oembed?format=json&url=https://youtu.be/" + encodeURIComponent(videoId));
  if (!r.ok) return null;
  const j = await r.json();
  return j && j.title ? j.title : null;
}

// ── Firebase custom token (signed JWT, RS256 via WebCrypto) ───────────────
async function mintFirebaseToken(env, uid, claims) {
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email, sub: sa.client_email,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now, exp: now + 3600, uid, claims,
  };
  const unsigned = b64urlJson(header) + "." + b64urlJson(payload);
  const key = await pemToCryptoKey(sa.private_key);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return unsigned + "." + b64url(arrayBufferToBase64(sig));
}

// ── helpers (mirrors usage-worker / stocks-worker) ────────────────────────
function b64url(b64) { return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf); let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64urlJson(obj) { return b64url(arrayBufferToBase64(new TextEncoder().encode(JSON.stringify(obj)))); }
async function pemToCryptoKey(pem) {
  const stripped = pem.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s/g, "");
  const der = Uint8Array.from(atob(stripped), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}
