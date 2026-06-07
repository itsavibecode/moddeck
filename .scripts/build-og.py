#!/usr/bin/env python3
"""Build ModDeck's OG image + PNG icons from SVG. Requires cairosvg + Pillow.
   Run:  python .scripts/build-og.py   (from the repo root)"""
import os, sys
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

try:
    import cairosvg
except Exception as e:
    print("cairosvg not available:", e); sys.exit(1)

# ---- app icon (rounded square mark, matches favicon.svg) ----
ICON = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#6d6dff"/><stop offset="1" stop-color="#5b5bf0"/></linearGradient></defs>
  <rect x="4" y="4" width="56" height="56" rx="15" fill="url(#g)"/>
  <rect x="18" y="17" width="28" height="22" rx="4" fill="#fff"/>
  <circle cx="24" cy="24" r="3" fill="#5b5bf0"/>
  <rect x="18" y="45" width="28" height="5" rx="2.5" fill="#fff" opacity="0.92"/>
  <rect x="18" y="45" width="11" height="5" rx="2.5" fill="#0fb5a8"/></svg>'''

# ---- 1200x630 OG card ----
OG = '''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f1118"/><stop offset="1" stop-color="#1a1d2b"/></linearGradient>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6d6dff"/><stop offset="1" stop-color="#5b5bf0"/></linearGradient>
    <radialGradient id="glow" cx="50%" cy="0%" r="70%">
      <stop offset="0" stop-color="#5b5bf0" stop-opacity="0.30"/><stop offset="1" stop-color="#5b5bf0" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <g transform="translate(90,150)">
    <rect x="0" y="0" width="96" height="96" rx="26" fill="url(#g)"/>
    <rect x="24" y="22" width="48" height="38" rx="7" fill="#fff"/>
    <circle cx="34" cy="32" r="5" fill="#5b5bf0"/>
    <rect x="24" y="70" width="48" height="9" rx="4.5" fill="#fff" opacity="0.92"/>
    <rect x="24" y="70" width="19" height="9" rx="4.5" fill="#0fb5a8"/>
  </g>
  <text x="210" y="222" font-family="Inter,Arial,sans-serif" font-size="76" font-weight="900" fill="#fff" letter-spacing="-2">Mod<tspan fill="#8b8bff">Deck</tspan></text>
  <text x="92" y="330" font-family="Inter,Arial,sans-serif" font-size="44" font-weight="800" fill="#eef0f8" letter-spacing="-1">From Mod to Director.</text>
  <text x="92" y="392" font-family="Inter,Arial,sans-serif" font-size="27" font-weight="500" fill="#9aa0b8">Browser-based stream-overlay control. Drop one source into OBS,</text>
  <text x="92" y="430" font-family="Inter,Arial,sans-serif" font-size="27" font-weight="500" fill="#9aa0b8">then run the show together — live.</text>
  <g font-family="Inter,Arial,sans-serif" font-size="22" font-weight="800">
    <rect x="92"  y="486" width="150" height="50" rx="25" fill="#16331a"/><circle cx="120" cy="511" r="6" fill="#53fc18"/><text x="136" y="519" fill="#7dff5a">KICK</text>
    <rect x="258" y="486" width="180" height="50" rx="25" fill="#2a1a44"/><circle cx="286" cy="511" r="6" fill="#a970ff"/><text x="302" y="519" fill="#c9a4ff">TWITCH</text>
    <rect x="454" y="486" width="190" height="50" rx="25" fill="#3a1414"/><circle cx="482" cy="511" r="6" fill="#ff4d4d"/><text x="498" y="519" fill="#ff8a8a">YOUTUBE</text>
  </g>
  <text x="1108" y="600" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="600" fill="#5b6178">moddeck.bookhockeys.com</text>
</svg>'''

os.makedirs(os.path.join(HERE, "icons"), exist_ok=True)
cairosvg.svg2png(bytestring=OG.encode(), write_to=os.path.join(HERE, "og.png"), output_width=1200, output_height=630)
print("wrote og.png")
for size, name in [(180, "icons/apple-touch-icon.png"), (192, "icons/icon-192.png"), (512, "icons/icon-512.png"), (32, "icons/favicon-32.png")]:
    cairosvg.svg2png(bytestring=ICON.encode(), write_to=os.path.join(HERE, name), output_width=size, output_height=size)
    print("wrote", name)
print("done.")
