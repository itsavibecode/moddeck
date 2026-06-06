/* ModDeck client auth — Kick login via PKCE, then Firebase custom-token sign-in.
   Uses the Firebase compat SDK globals (firebase.*). Exposed as window.MD.auth.
   The channel a streamer owns == their Firebase uid (e.g. "kick:123"). */
(function () {
  window.MD = window.MD || {};
  let app, authMod, db, inited = false;

  function initFirebase() {
    if (inited) return true;
    if (typeof firebase === "undefined" || !window.MD.firebaseConfig) return false;
    app = firebase.initializeApp(window.MD.firebaseConfig);
    authMod = firebase.auth(); db = firebase.database();
    window.MD._fb = { app, auth: authMod, db };
    inited = true; return true;
  }

  // PKCE helpers
  function b64url(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function rand(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a.buffer); }
  async function sha256(s) { return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))); }

  async function startKick() {
    const C = window.MD.config;
    if (!C || !C.kickClientId || C.kickClientId.indexOf("REPLACE") === 0) { alert("Kick login isn't configured yet (missing Client ID)."); return; }
    const verifier = rand(48), state = rand(12), challenge = await sha256(verifier);
    sessionStorage.setItem("md_pkce", JSON.stringify({ verifier, state }));
    const p = new URLSearchParams({
      response_type: "code", client_id: C.kickClientId, redirect_uri: C.kickRedirect,
      scope: C.kickScope || "user:read channel:read", code_challenge: challenge, code_challenge_method: "S256", state,
    });
    location.href = "https://id.kick.com/oauth/authorize?" + p.toString();
  }

  // called on the /auth/kick callback page
  async function completeKick() {
    const C = window.MD.config;
    const q = new URLSearchParams(location.search);
    const code = q.get("code"), state = q.get("state"), err = q.get("error");
    if (err) throw new Error("Kick returned: " + err);
    if (!code) throw new Error("No authorization code in the URL.");
    const saved = JSON.parse(sessionStorage.getItem("md_pkce") || "{}");
    if (state !== saved.state) throw new Error("State mismatch — please try logging in again.");
    const res = await fetch(C.workerUrl + "/auth/kick/exchange", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, verifier: saved.verifier }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.firebaseToken) throw new Error(data.error || ("Login failed (" + res.status + ")"));
    if (!initFirebase()) throw new Error("Firebase SDK not loaded.");
    await authMod.signInWithCustomToken(data.firebaseToken);
    sessionStorage.removeItem("md_pkce");
    try { localStorage.setItem("md_profile", JSON.stringify(data.profile)); } catch {}
    return data.profile;
  }

  function onAuth(cb) { if (!initFirebase()) { cb(null); return; } authMod.onAuthStateChanged(cb); }
  function signOut() { try { localStorage.removeItem("md_profile"); } catch {} return initFirebase() ? authMod.signOut() : Promise.resolve(); }
  function profile() { try { return JSON.parse(localStorage.getItem("md_profile") || "null"); } catch { return null; } }
  function channelId(uid) { return uid; }   // the streamer's channel id == their uid

  window.MD.auth = { initFirebase, startKick, completeKick, onAuth, signOut, profile, channelId, get db() { return db; } };
})();
