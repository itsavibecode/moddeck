/* ModDeck palette icons — clean line SVGs keyed by widget type (currentColor, tint with accent).
   Used by the dashboard palette. window.MD.ICONS_SVG[type] -> full <svg> string. */
(function () {
  window.MD = window.MD || {};
  function svg(inner) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }
  const I = {
    chat: 'M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z',
    alertbox: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    timer: '<circle cx="12" cy="14" r="8"/><path d="M12 10v4l2 2M9 2h6"/>',
    progress: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
    poll: '<path d="M5 21V10M12 21V4M19 21v-7"/>',
    wheel: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/>',
    viewers: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    emojicombo: '<path d="M12 2s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 1-3s0 2 2 2c0-3 2-5 2-8z"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v7h-7v-3"/>',
    discord: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.2 1 5.9L12 16.8 6.8 19.5l1-5.9L3.5 9.4l5.9-.9z"/>',
    text: '<path d="M4 7V4h16v3M12 4v16M9 20h6"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    video: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M10 8.5l5.5 3.5-5.5 3.5z" fill="currentColor" stroke="none"/>',
    shape: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
    ticker: '<rect x="2" y="8" width="20" height="8" rx="2"/><path d="M6.5 12h7m0 0-2-2m2 2-2 2"/>',
    todo: '<rect x="3" y="4.5" width="6" height="6" rx="1.2"/><path d="M4.6 7.5 6 8.9l1.9-2.2M12 7.5h9M12 16.5h9"/><rect x="3" y="13.5" width="6" height="6" rx="1.2"/>',
    tally: '<path d="M6 5v14M10 5v14M14 5v14M18 5v14M4 18 20 8"/>',
    eventlist: '<circle cx="4" cy="6" r="1.4" fill="currentColor"/><circle cx="4" cy="12" r="1.4" fill="currentColor"/><circle cx="4" cy="18" r="1.4" fill="currentColor"/><path d="M8 6h12M8 12h12M8 18h12"/>',
    browser: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/>',
    customcode: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
    powerchat: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M14.5 9.3A2.7 2.7 0 0 0 12 8c-1.5 0-2.5.9-2.5 2s1 1.7 2.5 1.9 2.5.8 2.5 2-1 2-2.5 2a2.7 2.7 0 0 1-2.5-1.3"/>',
  };
  const out = {};
  Object.keys(I).forEach(k => { out[k] = svg(I[k]); });
  window.MD.ICONS_SVG = out;
})();
