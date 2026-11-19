# Palm City Heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/jinny0784/palm-city-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/jinny0784/palm-city-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Palm City Heat** is an original top-down open-world crime game, built from scratch for make.fun's "Make GTA 6" bounty. Every name, street and storyline in it is our own invention — no borrowed worlds, just a sun-baked coastal city, a fixer with jobs to run, and a police force that would very much like a word.

## The city

Palm City is a palm-lined grid of avenues and streets, roughly 4000×3000 pixels of it, with the sea washing its eastern shore. You explore it on foot and by car: traffic rolls the grid on its own business, pedestrians stroll the pavements (and scatter when things get loud), and about a dozen parked cars sit at the kerbs waiting for a new owner. Any car can be taken — including one that's still moving, though its driver will bail out and the street will notice.

## The law

Crimes witnessed by pedestrians or officers raise your wanted level, from a curious one star to a five-star manhunt. Police interceptors are quicker than an ordinary sedan, and from three stars up, foot officers join the chase and shoot. Lose line of sight long enough and the heat cools; get pinned on foot and the busted meter fills. A bribe star tucked in an alley buys back one star, and the Pay 'n Spray will repaint your car, mend it and wipe your record clean — for a price.

## The story

Fixer **Mara Voss** runs the city's errands, and she runs them through you. Her five-mission story chain — **First Run, Hot Wheels, Loud Message, The Pickup** and **Last Job** — sends you to the docks, a depot, an old airstrip and the marina, stealing a gold sports car against the clock, breaking crates, collecting a stranded driver under a forced two-star chase, and gathering cash bags for one last payday. Finish all five and the city is yours to free-roam.

The screen keeps you oriented throughout: health and armour bars, wanted stars, cash, a mission banner with objective and distance, Mara's phone toasts, and a live minimap with police blips and the gold objective marker. Progress — cash, current mission, story completion — is saved in your browser, so you can leave and pick the story back up.

## How to play

Open `game/index.html` in a desktop browser, or serve the repo locally:

```
node serve.ts
```

then visit http://localhost:8080. No build step, no downloads — the game runs fully offline.

| Input | Action |
| --- | --- |
| WASD / arrow keys | Walk, and drive when you're in a car |
| Mouse | Aim |
| Left click / Space | Fire the pistol (on foot) |
| E | Enter / exit the nearest car |
| Shift | Sprint |
| Esc / P | Pause |
| M | Mute |

On the title screen, **Enter** starts a new game and **C** continues a saved one.

## Entrypoint

For the bounty, the entry is packaged by `main.ts` (Node 22+, standard library only):

```
node main.ts
```

It copies `game/` and `screenshots/` into the output directory (`MAKEFUN_OUTPUT_DIR`, or `/output` by default) and writes `dossier.json` there, compiled by the vendored make.fun library in `vendor/makefun-game.ts`. The output is deterministic: the same tree always produces the same dossier bytes.

## Layout

- `game/` — the playable static site (`index.html`, `style.css`, ES modules under `src/`: city generation, world simulation, rendering, input, synth audio, staged scenes)
- `screenshots/` — the four entry screenshots, staged deterministically via `?shot=` scenes
- `scripts/` — a Node smoke test for the simulation and the headless-Chrome screenshot renderer
- `main.ts` — the entrypoint described above; `serve.ts` — a tiny local dev server
