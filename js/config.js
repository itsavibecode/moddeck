/* ModDeck public client config (safe to commit — no secrets).
   Replace REPLACE_WITH_KICK_CLIENT_ID with the Kick app's Client ID (public). */
(function () {
  window.MD = window.MD || {};
  window.MD.config = {
    kickClientId: "REPLACE_WITH_KICK_CLIENT_ID",
    kickRedirect: "https://moddeck.bookhockeys.com/auth/kick",
    kickScope: "user:read channel:read",
    workerUrl: "https://moddeck-worker.sevendwarfs.workers.dev",
  };
})();
