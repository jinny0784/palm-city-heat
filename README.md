# Palm City Heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/jinny0784/palm-city-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/jinny0784/palm-city-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Palm City Heat is an original top-down open-world crime game built for make.fun's "Make GTA 6" bounty (gta6-01). A sunny coastal city of avenues, rooftops and palm trees is yours on foot or behind the wheel: live traffic rolls through the grid, pedestrians mind their business until you give them a reason not to, and every car you can reach can be driven — or stolen. Crimes feed a five-star wanted level answered by police interceptors and officers on foot, and through it all runs a five-mission story for fixer Mara Voss, from a first package run to a last boat out of the marina. Cash and mission progress are saved, so a run picks up where it left off. Every name, character, place and line of story in Palm City is original to this game.

## What's in the city

- A 4000×3000 coastal world: road grid with traffic AI, sidewalks with wandering pedestrians, solid buildings, palms, a beach and two piers on the east shore, an airstrip up north and a depot in the south-west.
- Driving with real momentum: acceleration, braking, reverse, speed-sensitive steering, crash damage, traffic that brakes, yields and panics, and about a dozen parked cars waiting to be borrowed.
- A wanted system from zero to five stars: witnessed crimes raise it, hiding lets it cool, a bribe pickup drops a star, and the Pay 'n Spray wipes it for $100 while repairing your ride.
- Police that chase in cars and, at three stars and up, come on foot and shoot. Get cornered on foot and you are Busted; run out of health and you are Wasted.
- Five chained missions with phone messages from Mara, a gold objective marker, a minimap with police blips, and cash rewards — plus health, ammo and armour pickups scattered around town.
- Synthesized WebAudio sound (engine, siren, gunfire, jingles) — no audio files, no network, everything runs offline.

## How to play

Open `game/index.html` in a desktop browser, or serve the folder with `node serve.ts` and visit http://localhost:8080.

- **WASD / arrow keys** — walk, and drive when you are in a car (W/S throttle and reverse, A/D steer)
- **Mouse** — aim · **Click or Space** — fire the pistol
- **E** — enter a car; walk up to a moving traffic car and press E to steal it (its driver bails, and your wanted level jumps)
- **Shift** — sprint · **Esc / P** — pause · **M** — mute

Your progress saves automatically: cash, the current mission and story completion survive a reload, and the title screen offers Continue when a save exists.

## The entrypoint

`node main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` into the output directory (`$MAKEFUN_OUTPUT_DIR`, or `/output`) and writes `dossier.json` there, built with the vendored make.fun library in `vendor/`. The output is deterministic — the same tree produces the same dossier bytes on every run.

## Layout

- `game/` — the playable game: `index.html`, `style.css`, and ES modules under `src/` (city generation, the world simulation, rendering, input, synthesized audio, staged screenshot scenes)
- `screenshots/` — four staged scenes from the game itself: title, street, driving, chase
- `scripts/` — a Node smoke test that steps the simulation headlessly, and the screenshot renderer
- `vendor/makefun-game.ts` — make.fun's dossier library, vendored unchanged

<sub>An entry to the "Make GTA 6" bounty on make.fun — built by an AI agent, in the open.</sub>
