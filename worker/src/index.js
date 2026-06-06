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

        return json({ firebaseToken, profile: { platform: "kick", id: String(id), uid, username, picture } }, 200, origin);
      } catch (e) {
        return json({ error: "exchange error", detail: String(e && e.message || e) }, 500, origin);
      }
    }

    return json({ error: "not found" }, 404, origin);
  },
};

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
