# ModDeck

**The control deck for you and your mods.** A free, browser-based stream-overlay control tool for
**Kick, Twitch, and YouTube** — drop one browser source into OBS, then edit your live overlay (chat,
timers, polls, alerts, goal bars, wheels and more) from a web dashboard. Grant your mods access so they
can help run the overlay during a live show.

Will live at **moddeck.bookhockeys.com**.

> ModDeck is an independent, friendlier multi-platform take on the idea popularized by Poltergeist —
> with a smooth, properly-built canvas (no janky panning) and Kick + Twitch + YouTube support.

## How it works

- **Dashboard** (`dashboard.html`) — the control panel where you build the overlay on an infinite canvas.
- **Overlay** (`overlay.html`) — a transparent page you add as an **OBS Browser source** (1920×1080).
  It renders whatever you **Push to Live**.
- The two stay in sync in real time. Today that runs over a local channel (BroadcastChannel +
  localStorage) so the whole loop works with zero setup; a Firebase Realtime Database backend drops into
  the same interface for multi-device + mod access.

### Try it locally

Serve the folder over HTTP (e.g. `python -m http.server 8104`) and open:

- Dashboard: `http://localhost:8104/dashboard.html`
- Overlay:   `http://localhost:8104/overlay.html?c=dev-local`  ← add this as an OBS Browser source

Build something on the dashboard, hit **Push to Live**, and watch the overlay update.

## Canvas controls

| Action | How |
| --- | --- |
| Pan | Hold **Space** and drag (or middle-mouse drag) |
| Zoom | Scroll (zooms toward the cursor) · toolbar **+ / −** |
| Recenter | **Frame** button |
| Select | Click · **Shift**-click to multi-select · drag a marquee on empty space |
| Move / resize | Drag the element · drag a corner handle |
| Nudge | Arrow keys (**Shift** = 10px) |
| Duplicate / Delete | **Ctrl/Cmd+D** · **Delete** |
| Undo / Redo | **Ctrl/Cmd+Z** · **Ctrl/Cmd+Shift+Z** |
| Snap to guides | **Snap** toggle |

## Architecture

```
dashboard.html (writer) ──► sync ──► overlay.html (reader, OBS source)
        store.js  ── canonical state, staging/live boards, undo/redo
        canvas.js ── pan/zoom + select/drag/resize (handles in an unscaled layer)
        widgets.js ── shared renderers (staging preview == live output)
        sync.js   ── pluggable backend: local (now) | firebase RTDB (next)
```

No build step — plain HTML/CSS/JS, static-hostable on GitHub Pages.

## Status / Roadmap

- **Phase 1 ✅** Canvas engine + dashboard↔overlay live loop + Wave-1 widgets (chat, timer, text, image,
  video, shape) + presets/scenes (local).
- **Phase 2** Firebase RTDB sync + Kick OAuth login (via a Cloudflare Worker) + per-channel OBS link.
- **Phase 3** Mods with access + presence + staging/live workflow.
- **Phase 4** Remaining widgets (poll, goal bar, ticker, to-do, alert box, QR, tally) + soundboard + games.
- **Phase 5** Twitch + YouTube login + real combined chat.
- **Phase 6** Branding, docs, polish, custom domain.

## Changelog

### v0.8.0 — Docs page + Settings
- A full **documentation page** (`docs.html`): quick start, OBS setup table, inviting mods, staging vs
  live, canvas/keyboard-shortcut reference, the 17-widget reference, and soundboard/telestrator guides.
- Wired the previously-inert quick actions: **Docs** opens the docs page; **Settings** opens a panel
  (version, sync mode, channel ID, canvas size, and clear-staging). Docs linked from the landing nav.

### v0.7.0 — Landing page + branding
- A real **landing page** (`index.html`) for moddeck.bookhockeys.com: hero, how-it-works, feature grid,
  why-ModDeck, and FAQ, with platform "Connect" buttons (open the demo until live login ships).
- **Branding kit**: SVG logo/favicon, apple-touch + PWA icons, and a 1200×630 OG/Twitter card generated
  by `.scripts/build-og.py` (cairosvg→PNG). Favicons + theme-color wired into the dashboard too.

### v0.6.0 — Prize Wheel + inline text editing
- **Prize Wheel** widget (🎡): editable segments, a Spin button that animates a weighted SVG wheel and
  announces the winner — and spins identically on the live overlay so viewers see the same result.
- **Inline text editing**: double-click any Text element to edit it right on the canvas (Enter to save,
  Esc to cancel).

### v0.5.0 — Telestrator (on-stream drawing)
- **Pen & Eraser** tools in the toolbar — draw freely over the canvas to highlight plays or diagram
  things; strokes render live on the overlay (SVG, scales with zoom). Pick a pen color, erase strokes,
  or **Clear** the whole drawing. Hold **Space** to pan even while the pen is active.

### v0.4.0 — Remote Soundboard
- A **Soundboard** (🔊 quick action): add MP3/WAV sounds and trigger them on the live overlay (plays
  through the OBS browser source), with **Stop All**. One-shot cues ride a new `publishSound`/`onSound`
  channel in the sync layer (works today over BroadcastChannel; ready for Firebase RTDB).

### v0.3.0 — Widget Wave 3 (media & utility)
- Four new widgets (16 total): **QR Code** (live-generated), **Event List** feed, **Browser** source
  (iframe, optional interactive), and **Custom HTML/CSS/JS** (sandboxed iframe).
- **Image** widget upgraded to a **slideshow** (multiple URLs cycling on an interval).

### v0.2.0 — Widget Wave 2 + Auto-Scheduler
- Six new widgets: **Progress Goal** bar, **Ticker** (scrolling marquee), **To-Do List**, **Tally
  Counter** (with +/−), **Live Poll** (animated vote bars), and an **Event Alert Box** with a
  test-trigger and entrance animation. All render identically on the dashboard and the live overlay.
- **Auto-Scheduler**: any element can loop its visibility on a timer (show/hide seconds) on the live
  overlay — perfect for rotating sponsor logos, slideshows, or watermarks — while staying visible in
  the editor. Twelve widgets total now in the palette.

### v0.1.1 — Universal element properties
- Every element now supports **Opacity**, **Rotation**, and **FX filters** (Blur, Brightness,
  Saturation, Hue) plus a one-click **Fill Live Area** — applied identically on the dashboard preview
  and the live overlay via a shared `applyBox` renderer. Matches the depth of Poltergeist's properties
  panel; more (per-layer overlay URLs, animation timeline, chatbot builder) is mapped for later phases.

### v0.1.0 — Phase 1 foundation
- First working build: infinite pan/zoom canvas with a crisp, unscaled selection layer (fixes the
  janky-canvas problem these tools usually have), select/drag/resize/multi-select/marquee/snap/
  nudge/duplicate/delete and full undo/redo.
- Shared widget renderer so the staging preview and the live OBS overlay are pixel-identical.
- Wave-1 widgets: Combined Chat (sample feed), Timer, Text, Image, Video, Shape.
- Real-time **Push to Live** / **Swap** loop between dashboard and overlay over a local channel,
  with a pluggable sync layer ready for Firebase Realtime Database.
- Properties panel per widget, Presets & Scenes (saved locally), OBS browser-source link generator,
  Clean-SaaS UI with a deliberately dark canvas so overlay colors read true while editing.
