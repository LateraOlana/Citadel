# 🏰 Citadel · A daily capital-city game

A geography game inspired by Wordle and Globle. Each day, one of the world's 197 capitals is hidden. Guess any capital, see how far away it is, get a compass arrow pointing toward the answer, and a "warmth" pin on the world map. Keep guessing until you find it.

## Files

- `index.html` — markup
- `styles.css` — atmospheric night-sky theme
- `app.js` — game logic, map, animations, stats
- `capitals.json` — 197 capitals with coordinates

That's it. No build, no bundler, no backend.

## How it works

- A deterministic seed picks the **same capital for every player on the same UTC day**, like Wordle.
- The map uses **Leaflet** + free OpenStreetMap tiles (no API key needed). Tiles are darkened with a CSS filter for the night theme.
- Distance is computed with **haversine** (great-circle); direction with the standard **initial-bearing** formula.
- Pins are color-coded by warmth:
  - **Scorching** (under 100 km) → red
  - **Hot** (under 500 km) → coral
  - **Warm** (under 1500 km) → gold
  - **Cool** (under 4000 km) → slate blue
  - **Cold** (further) → ice blue
- All progress and stats are stored in your browser's `localStorage`. Nothing is uploaded anywhere.

## Hosting on GitHub Pages

1. Push these four files to a repo (e.g. `citadel`).
2. Repo → **Settings** → **Pages** → set source to `main` branch, root folder.
3. Visit `https://<your-username>.github.io/citadel/`.

## Modes

- **Daily** — one puzzle per UTC day, shared by all players. Updates streaks and stats.
- **Free play** — random capital. Tap the ↻ icon in the header. Doesn't affect stats.

## Sharing

After a win, click **Share result**. On mobile, the system share sheet opens; on desktop, the result is copied to your clipboard. The share format mirrors Wordle:

```
Citadel #14 · 5 guesses
🟦 ↗
🟨 ↖
🟧 ↑
🟥 ←
🟩 🎯
```

## Customization

- **Colors**: edit the CSS variables at the top of `styles.css` — `--gold`, `--coral`, the warmth tier colors, etc.
- **Warmth tiers**: edit `WARMTH_TIERS` in `app.js`.
- **Add/remove capitals**: just edit `capitals.json`. Each entry needs `{city, country, continent, lat, lon}`.
- **Change puzzle epoch** (when puzzle #1 = which date): edit `PUZZLE_EPOCH` in `app.js`.

## Keyboard

- `Enter` — submit guess (auto-completes from the suggestion list)
- `↑`/`↓` — navigate suggestions
- `Esc` — close modal / dismiss suggestions

## Credits

- Map tiles © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
- Built with [Leaflet](https://leafletjs.com/)
- Type: **Fraunces** (display) + **Inter** (body) + **JetBrains Mono** (numbers)
