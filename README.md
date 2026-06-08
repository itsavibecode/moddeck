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

### v0.31.1 — Widget polish
- **Discord Highlights**: more internal padding so the avatar isn't edge-to-edge on the overlay.
- **Media Share**: shows **nothing on the live overlay when idle** (no empty box on stream) — the placeholder
  only appears in the dashboard editor so you can still position it.
- **Presets vs Scenes**: added hover **ⓘ tooltips** explaining each — Presets are reusable building-block
  layouts; Scenes are full overlay setups you switch between (Starting Soon / Live / BRB).

### v0.31.0 — Align & distribute
- Select 2+ elements (Shift+click or drag a box) and the Properties panel now shows **Align** — left, center,
  right, top, middle, bottom — plus **Distribute** horizontally/vertically for 3+. Each is a single undo step.

### v0.30.1 — "Kick Chat" naming
- Renamed the chat widget from **Combined Chat** to **Kick Chat** (palette, properties, default title, docs) to
  match reality — it's Kick-only today. We'll switch it back to "Combined Chat" when Twitch/YouTube join the
  feed. (Existing placed widgets keep their saved title until you edit it.)

### v0.30.0 — 24/7 commands
- `!commands` are now answered **server-side via Kick's chat webhook** — they work even with the dashboard
  closed (no Durable Objects needed). The worker matches the trigger, respects the cooldown, and replies as
  your configured identity. A presence check means the in-browser runner still handles commands while your
  dashboard is open, so replies never double up.
- Note: unverified Kick apps have a chat-event limit; very busy channels may want app verification. Requires
  the same fresh sign-in (to subscribe to `chat.message.sent`).

### v0.29.0 — 24/7 timed messages
- Timed chat messages now post from a **Worker cron** (every minute) even when your **dashboard is closed** —
  but only while your channel is **live**, so an offline chat never gets spammed. The cron is the single owner
  of timers (no more double-posting with the dashboard), tracks each timer's last-fired time, and posts as
  whatever "Posts appear as" is set to.
- Live `!command` answers still run from the open dashboard; always-on commands (Durable Objects) are next.
- Note: sign in once more so the worker stores your channel slug (used for the live check).

### v0.28.1 — ModDeck bot is the default
- **"Posts appear as" now defaults to ModDeck bot** — confirmed to post even in subscribers-only chat with no
  moderator setup needed. "Your channel" stays available as the alternative.

### v0.28.0 — Post as your channel (reliable chatbot)
- Added a **"Posts appear as"** choice in the Chatbot panel. Default **Your channel** posts from your own
  account (`type:user`) — **always works**, even in subscribers-only / follower-only chat, with no bot account
  or moderator setup. **ModDeck bot** (`type:bot`) remains an option but requires the auto-created bot to be a
  moderator on your channel, which restricted chat modes would otherwise block.
- Fixes the common "Send test message failed" caused by sub-only chat blocking the un-modded bot.

### v0.27.6 — Bot test shows the real error
- The Chatbot **Send test message** result now surfaces Kick's actual rejection reason (e.g. chat-mode blocks,
  missing `chat:write`) instead of a generic "failed", so you can tell *why* a post didn't go through.

### v0.27.5 — Toast position & duration
- Toast notifications now appear at the **top-center** of the screen and stay up **5 seconds** (was bottom-
  right for ~2.6s), so they're easier to notice and read.

### v0.27.4 — "Why" tooltips on OBS steps
- Each OBS setup step in the Get-OBS-Link modal now has a hover **ⓘ tooltip** explaining *why* it matters
  (resolution, "Control audio via OBS", "Shutdown source when not visible", Local file / Custom CSS).

### v0.27.3 — Clearer OBS link modal
- The **Get OBS Browser-Source Link** dialog no longer closes when you hit **Copy** — it stays open (close
  with the **✕**) so the setup steps remain visible.
- Rewrote the steps as a readable, spaced list and added the **"Control audio via OBS"** guidance (so alert
  sounds, Media Share videos & the soundboard are heard on stream), plus the Local-file / Custom-CSS notes.

### v0.27.2 — Honest platform status on the landing
- The landing page now makes clear ModDeck is **live on Kick today**, with **Twitch & YouTube coming soon**
  (pill copy, "SOON" badges on those connect buttons, and the Combined Chat / multi-platform cards updated),
  so visitors aren't misled into thinking all three platforms work yet.

### v0.27.1 — Bot test button
- Added **📣 Send test message** to the Chatbot panel — posts a line to your chat through the real path and
  reports success or the exact error (e.g. "enable Write to Chat feed"), so you can verify posting in one click.

### v0.27.0 — Cloud-synced bot & media config
- **Chatbot commands/timed messages and the Media auto-advance toggle now live in the cloud** (per channel),
  so you and your mods share the same config across devices instead of it being stuck in one browser.
- Timed-message edits now apply **live** (no reload needed) — the runner rebuilds whenever the config changes.
- Adds a `bot` RTDB rule (re-publish `database.rules.json`).

### v0.26.0 — Media Share auto-advance
- Approved videos now play **back-to-back automatically** — when one ends, the next approved request starts.
  Driven from the streamer's dashboard via a hidden, muted YouTube player that detects the end (with a
  duration-based fallback for backgrounded tabs). Toggle in the Media Queue (on by default).

### v0.25.0 — Chatbot posting (live)
- The chatbot now **actually posts to Kick chat** as the ModDeck bot: timed messages fire on their interval
  and `!commands` are answered from live chat (with cooldowns), while the streamer's dashboard is open.
- New worker `/kick/say` endpoint posts with the streamer's stored Kick token (`type:"bot"`), gated by
  **Firebase ID-token verification** (caller must be the channel owner or a mod). Kick tokens are stored in a
  locked `/bot_tokens` path and auto-refreshed.
- Setup: tick **"Write to Chat feed"** on your Kick app and **sign in again** to grant `chat:write`.

### v0.24.0 — Media Share (native PowerChat)
- New **📺 Media Share** widget + **Media Queue** panel. Viewers request a video by sending **Kicks with a
  YouTube link** in the message; the worker parses the link (title via YouTube oEmbed) into a per-channel
  queue. You/your mods **approve, reject, and play** requests; approved videos play in the overlay widget
  with a "requested by {user} · {amount} Kicks" banner.
- Reuses the existing Kicks webhook — no extra setup beyond the alert wiring. (A custom Stripe-paid submit
  form is a planned follow-up.)
- Requires the `media` RTDB rule (re-publish `database.rules.json`).

### v0.23.0 — Chatbot foundation
- New **🤖 Chatbot** panel: define **commands** (`!trigger` → reply, with cooldown) and **timed messages**
  (post every N minutes), each toggleable on/off. Saved per channel.
- This release ships the **config layer**; actually posting to Kick chat turns on once the ModDeck bot is
  connected to your Kick app (the chat-posting layer is the next step).

### v0.22.0 — Custom alerts (sound, text, GIF)
- Each alert event (Follow, Sub, Resub, Gift subs, Kicks) now has its own **icon, message, sound effect,
  and optional GIF** in the Alert Box properties, each toggleable on/off.
- Messages support **variables** — `{user}`, `{amount}`, `{months}` — filled from the real Kick event.
- The overlay plays the configured sound and shows the GIF when an alert fires (test buttons included).

### v0.21.1 — Kicks-donation alerts
- Added the `kicks:read` scope to sign-in so **💚 Kicks donations** fire alerts alongside follows/subs/gifts
  (the worker already subscribes to `kicks.gifted`). Check **"Read KICKs related information"** in your Kick app.

### v0.21.0 — Real Kick alerts 🔔
- **On-stream alerts fire from real Kick events** — follows, new subs, resubs, gift subs, and Kicks
  donations. Drop an **Alert Box** widget to set where/how they look; events animate in there
  automatically and queue one-at-a-time so a gift-bomb doesn't overlap.
- The worker now hosts `/kick/webhook` (Kick-signed, RSA-verified) and, on sign-in, subscribes your
  channel to the alert events. Verified webhooks write an alert cue to your channel as a Firebase admin;
  the overlay plays it (with a stale-cue guard so refreshing OBS never replays an old alert).
- **Test on live overlay** buttons in the Alert Box panel fire sample Follow / Sub / Gift / Kicks alerts.
- One-time setup: add the `events:subscribe` scope + set the webhook URL in your Kick app (see docs).

### v0.20.0 — Mods + invite links 🎛️
- **Mods can now run your overlay.** Sign in, add a mod by Kick username under **Mods with Access**, and
  click **Copy mod invite link**. Your mod opens the link, signs in with Kick, and edits *your* overlay
  (canvas + Push to Live) — with **zero access to your OBS, audio mixer, or stream keys**.
- **Live presence** — a green dot shows which mods are online and editing right now.
- **Instant revoke** — remove a mod with the ✕ and their access is pulled immediately (allow-list +
  registration both cleared). Anyone who opens the link without being on your list is locked out and asked
  to have you add them.
- Enforced by Firebase security rules (write access keyed to your channel owner UID + the mod allow-list),
  not just the UI.

### v0.19.2 — Hero text layout
- Headline "From Mod to Director" forced to one line (wraps only on small screens); sub-line split so
  "Approve your mods to control your overlay from a browser" sits above "with one simple OBS source change."

### v0.19.1 — Living landing demo
- The hero demo chat now **scrolls** (left-justified, styled like the real widget) with **Kick + Twitch +
  YouTube** messages (platform-colored dots), and the **Emoji Combo is fed by the emotes scrolling past in
  chat** — it builds and decays live instead of being a static strip. Includes real Kick emote images.

### v0.19.0 — Real Kick chat 🎉
- **Live Kick chat is now real.** A Worker endpoint resolves a channel's chatroom id, and `js/chat-kick.js`
  reads the channel's public chat socket (Pusher) in the browser. The **Combined Chat** widget shows real
  messages with **real Kick emote images**, name colors, and mod badges; the **Emoji Combo** counts real
  emotes; and **auto-clip** fires on real spam. Demo feeds automatically stand down once chat connects.
- Dashboard connects on login (and records the chatroom id); the overlay reads it and connects too.

### v0.18.2 — Auto-clip recording indicator
- When an auto-clip fires, the overlay flashes a recording-style **pulsing red ● CLIP** dot in the corner
  for ~4s. Driven by a new synced `publishClip`/`onClip` cue (so it shows on the live overlay wherever the
  clip was triggered).

### v0.18.1 — Version pill on landing + PWA manifest
- Added the **version pill** to the landing nav (it was only on the dashboard) and made the dashboard pills
  read the version constant automatically. Added `site.webmanifest` (PWA) + a PNG favicon fallback — finishing
  the favicons/social set.

### v0.18.0 — Logo F + platform theming
- New official logo: **Logo F** (overlay layers + control cursor). Updated favicon, app/PWA icons, and OG card,
  and unified the wordmark to one-color "ModDeck".
- **Full platform theming:** the logo tile turns the platform's color once you log in — Kick green, Twitch
  purple, YouTube red (default indigo when logged out). Applied to the dashboard logo + overlay watermark via
  a shared `MD.logoSvg(platform)` helper.

### v0.17.3 — New hero headline
- Hero headline is now **"From Mod to Director"** (was "Put your mods in the director's chair"); regenerated
  the OG/social card to match.

### v0.17.2 — Real viewer usernames on both clips
- Each hero clip now has its own real-viewer demo chat: clip 1 (StrongDabs420, Hydroponicz, BotRix…),
  clip 2 (PogTX, piglover4919, FATCHOP, TheGOATSchizo, Neejoh, MJAYY5).

### v0.17.1 — Real viewer usernames in demo chat
- Clip 2's hero demo chat now uses real viewer usernames (StrongDabs420, Hydroponicz, BotRix, kppfarmer,
  jameskibs, Coyote7) for a more authentic preview.

### v0.17.0 — Auto-clip on emote threshold
- The **Emoji Combo** widget can now **auto-clip** hype moments: set an "Auto-clip at" emote count and it
  fires once when a combo crosses it (with a Test button). The trigger plumbing + `MD.fireClip` hook ship
  now; the actual clip-cut activates with live chat + the platform clip API in the bot phase (Twitch's
  Create Clip is official; Kick when available).

### v0.16.4 — Richer landing demo
- The landing hero mock now showcases more widgets — added a **Viewer Count** and an **Emoji Combo** strip
  alongside the goal bar, timer, and chat — so visitors see ModDeck's variety at a glance.

### v0.16.3 — Hero copy + audible demo clips
- New, punchier hero line: "Approve your mods to control your overlay from a browser with one simple OBS
  source change."
- Re-encoded the hero clips **with audio** (the earlier compression had stripped it), so the **Tap for sound**
  button actually plays sound. Cache-busted the video URLs.

### v0.16.2 — Wordmark/BETA alignment
- Vertically centered the **BETA** badge against the "ModDeck" wordmark (tightened wordmark line-height so
  box-center matches optical-center) in both the landing nav and the dashboard.

### v0.16.1 — Subtle overlay watermark
- A small, low-opacity **ModDeck watermark** in the overlay's bottom-right corner (marketing) — hide it with
  `?nowm=1` on the overlay URL (for paid tiers later).

### v0.16.0 — Landing polish + BETA branding
- Wordmark is one cohesive "ModDeck" again (dropped the two-tone split), with a candy-blue **BETA** badge
  and a **version pill** by the dashboard logo.
- Landing hero **video moved up** (tighter spacing), added a **mute/unmute "Tap for sound"** button, and the
  demo chat is now **per-clip** (each playlist video shows its own matching chat — placeholder text for now).

### v0.15.0 — Line-SVG palette icons
- Replaced the emoji widget icons with clean **line SVG icons** (tinted with the accent color, identical
  on every device) across all 21 widgets — `js/icons.js`.

### v0.14.0 — Staging persistence
- Your **staging canvas now saves automatically** (debounced) and restores on load, so refreshing the
  dashboard never loses your layout. Logged in → saved to your channel in Firebase RTDB (and used to seed
  the cloud on first login); demo mode → saved to localStorage. Foundation for mod collaboration.

### v0.13.0 — PowerChat + Viewer Count widgets
- **PowerChat** widget: embeds your [powerchat.live](https://powerchat.live) TTS &amp; media-donation overlay
  (paste your PowerChat overlay URL).
- **Viewer Count** widget: animated live viewer counter with icon (demo number now; real Kick count via the
  worker later, through the `MD.pushViewers` hook). 21 widgets in the palette.

### v0.12.3 — Landing hero demo video
- The landing hero mock now plays a real **stream behind the overlay**, rotating through demo clips
  (`video/`) as a playlist — so the overlay widgets are shown sitting on top of an actual stream.

### v0.12.2 — Fix: overlay font
- The overlay now loads the **Inter** font (it only loaded on the dashboard before), so live overlay text
  matches the editor exactly instead of falling back to a system font.

### v0.12.1 — Fix: right panel scrolling
- The right Properties panel now scrolls when its content is taller than the window (it was clipping for
  widgets with many properties). Wrapped it in a scroll container to match the left sidebar.

### v0.12.0 — Discord Highlights widget
- New **Discord Highlights** widget (⭐): shows messages your community "stars" in Discord on your stream,
  Discord-blurple styled with avatar + name + message and an entrance animation. Configurable title, accent,
  auto-clear, and avatar toggle. Demo-fed today via the `MD.pushHighlight` hook; goes live once the ModDeck
  Discord bot is connected (a small always-on bot that watches ⭐ reactions and pushes them to your channel).
  19 widgets in the palette.

### v0.11.0 — Real-time Firebase sync
- On Kick login the dashboard switches from the local demo bus to **Firebase Realtime Database** sync on
  your own channel (`channelId == your uid`); **Push to Live** now writes to RTDB and any `overlay.html?c=<uid>`
  (your OBS source, anywhere) updates live. The overlay auto-uses Firebase for real channels and the local
  bus for the `dev-local` demo. Soundboard cues ride the same path. (Requires the Worker's secrets, published
  RTDB rules, and Firebase Authentication enabled.)

### v0.10.0 — Emoji Combo widget
- New **Emoji Combo** widget (🔥): watches chat for repeated emotes and shows live "xN" combos, with the
  hottest emote emphasized — configurable show-after count, combo timeout, and max emotes. Real combo logic
  runs on a demo feed today and switches to live Kick chat automatically when the chat phase lands (via the
  `MD.pushEmote` hook). 18 widgets in the palette.

### v0.9.0 — Real Kick login (auth foundation)
- **Kick OAuth login** end to end: PKCE in the browser → a **Cloudflare Worker** (`worker/`) exchanges
  the code with the client secret and mints a **Firebase custom token** → the browser signs into Firebase.
  "Connect Kick" on the landing page and a live account header (username, avatar, log out) on the dashboard.
- Added `js/config.js`, `js/auth.js`, `auth/kick.html` (callback), `database.rules.json` (RTDB rules with
  owner + mod-allow-list access), and the Worker (dependency-free WebCrypto signing, no jose).
- Demo mode is untouched — the app still works fully without logging in. Real-time Firebase sync flips on
  next, once the Worker is deployed with its secrets.

### v0.8.2 — SEO + branded 404
- Added `robots.txt`, `sitemap.xml`, and a branded **404 page**. First public deploy: live at
  **itsavibecode.github.io/moddeck** (custom domain moddeck.bookhockeys.com pending DNS).

### v0.8.1 — Wording refresh
- Reworded the hero/OG headline to **“Put your mods in the director's chair”** (regenerated the OG card)
  so the messaging is our own rather than echoing other tools.

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
