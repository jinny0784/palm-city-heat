# Palm City Heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/jinny0784/palm-city-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/jinny0784/palm-city-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Palm City Heat is an original top-down open-world crime game, written for make.fun's "Make GTA 6" bounty (gta6-01). The whole city is yours to roam: a sunny coastal grid of avenues, rooftops and palm trees, with live traffic, pedestrians going about their day, and a beach running down the east shore. Walk it on foot or take any car you can reach — every theft, shot and crash feeds a five-star wanted level, and the police answer with interceptor cars and officers on foot. Through it all runs a five-mission story for fixer Mara Voss, from a first package run to a last boat out of the marina. Your cash and mission progress are saved, so a run can be picked up where it left off. Every name, character, place and line of story in Palm City is original to this game.

## How to play

No install, no build step. Open `game/index.html` in a desktop browser, or serve the folder:

```sh
node serve.ts
```

and visit http://localhost:8080.

## Controls

- **WASD / arrow keys** — move on foot, drive in a car
- **Mouse** — aim
- **Click / Space** — shoot the pistol
- **E** — enter or exit the nearest car
- **Shift** — sprint
- **Esc / P** — pause
- **M** — mute

Watch the stars: lose the police to let them fade, grab a spinning bribe star to shed one at once, or roll a hot car into the Pay 'n Spray and drive out clean, repaired and repainted.

## Entrypoint

```sh
node main.ts
```

The entrypoint copies `game/` and `screenshots/` into the output directory (`$MAKEFUN_OUTPUT_DIR`, or `/output`) and writes `dossier.json` there, built with the vendored make.fun library in `vendor/`.

## Layout

- `game/` — the playable game: `index.html`, `style.css`, and ES modules under `src/` (city generation, the simulation, rendering, input, synthesized audio, and the staged screenshot scenes)
- `screenshots/` — four staged captures of the real game, described in `shots.json`
- `scripts/` — a Node smoke test for the simulation (`node scripts/smoke.mjs`) and the screenshot capture script
- `vendor/makefun-game.ts` — make.fun's dossier library, vendored unchanged

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
