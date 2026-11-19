# Palm City Heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/jinny0784/palm-city-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/jinny0784/palm-city-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Palm City Heat is an original top-down open-world crime game, built for make.fun's "Make GTA 6" bounty (gta6-01). You roam a sunny coastal city on foot and behind the wheel, weaving through live traffic and crowds of pedestrians. Any car you can reach is a car you can steal — but every crime feeds your wanted level, and the police answer with patrol cars, roadblocks and foot officers the hotter things get. Between the chaos runs a five-mission story for fixer Mara Voss, tracked on a HUD with a live minimap, and your progress is saved so you can quit and continue later. Every name, place, character and line of the story is original to this game.

## How to play

There is nothing to install and no build step. Either open `game/index.html` directly in a browser, or serve the folder:

```sh
node serve.ts
```

then visit http://localhost:8080.

## Controls

- **WASD / arrow keys** — move (and drive, once you're in a car)
- **Mouse** — aim
- **Click / Space** — shoot
- **E** — enter or exit a car
- **Shift** — sprint
- **Esc / P** — pause
- **M** — mute

## Entrypoint

```sh
node main.ts
```

This copies `game/` and `screenshots/` into the output directory and writes `dossier.json` describing the entry.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
