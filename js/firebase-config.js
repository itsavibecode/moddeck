/* ModDeck Firebase config (public client keys — safe to commit; NOT secrets).
   Project: moddeck · Realtime Database. Consumed by sync.js (firebase backend) + auth.js.
   The service-account private key (a secret) lives only in the Cloudflare Worker, never here. */
(function () {
  window.MD = window.MD || {};
  window.MD.firebaseConfig = {
    apiKey: "AIzaSyAYy624l8pBgAnJMcdZ1N1yE4VI0Zfi1Dw",
    authDomain: "moddeck.firebaseapp.com",
    databaseURL: "https://moddeck-default-rtdb.firebaseio.com",
    projectId: "moddeck",
    storageBucket: "moddeck.firebasestorage.app",
    messagingSenderId: "271354099052",
    appId: "1:271354099052:web:092f7c72f0b8863918af49",
    measurementId: "G-5XK3ZVT6PC",
  };
})();
