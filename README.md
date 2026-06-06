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
