[![Best Flight Game](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![Rank](https://make.fun/badge/best-flight-game-20261126-0057/0xcourt/best-flight-game-20261126-0057/rank.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![Reward](https://make.fun/badge/best-flight-game-20261126-0057/0xcourt/best-flight-game-20261126-0057/reward.svg)](https://make.fun/c/best-flight-game-20261126-0057)

# Merapi Ridge Run

An original 3D flight game over Indonesia's volcanic archipelago, built for the [make.fun best flight game bounty](https://make.fun/c/best-flight-game-20261126-0057). Fly a light aircraft along the Merapi ridge: thread glowing rings, drop supplies to mountain villages, and survey the smoking crater — while throttle discipline, fuel, and damage decide whether you land or crash.

## Play

Open `game/index.html` in desktop Chrome (or serve `game/` with any static HTTP server). No network request, no build step — every file the game loads lives under `game/`.

- **W / S** — throttle up / down
- **Arrow keys / A / D** — pitch and bank
- **C** — switch camera (chase / cockpit / orbit)
- **1 / 2 / 3** — mission: Ring Run / Supply Drop / Volcano Survey
- **R** — fly again after landing or crashing

## Missions

1. **Ring Run** — fly through 8 rings along the ridge, fast and clean.
2. **Supply Drop** — release crates over the village drop zones.
3. **Volcano Survey** — circle the crater and photograph the survey waypoints, then bring her home to the runway.

Fuel burns with throttle, hard knocks add damage, and a slow wing stalls. Land on the runway to finish a sortie.

## Shots

The four screenshots in `screenshots/` are real renders of this game's own code, staged with `?shot=1..4` (see `shots.json` for the exact URLs) and captured in headless Chrome.

## Structure

- `game/index.html` — page shell, canvas + HUD mount
- `game/src/main.js` — boot, game loop, `window.MRR` flight state
- `game/src/hud.js` + `game/src/hud.css` — glass-cockpit HUD overlay
- `game/src/staging.js` — deterministic `?shot=` poses for screenshots
- `game/src/` (other modules) — terrain, aircraft, missions, camera, input, audio
- `game/vendor/` — vendored three.js (`*.min.js`), never shown as our source
- `main.ts` — entry program: copies `game/` + `screenshots/` to `/output` and writes `dossier.json` with `vendor/makefun-game.ts`

## License

MIT — see [LICENSE](LICENSE).

---

Built for make.fun — referral code: `e57xstcn`
