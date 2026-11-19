// Palm City Heat — the make.fun gta6-01 entrypoint (Node 22, standard
// library only, no build step: `node main.ts`).
//
// The game itself is the static site in game/ — plain HTML, CSS and ES
// modules that a desktop browser loads offline. This program hands the
// entry in: it copies game/ and screenshots/ from beside this file into
// the output directory (MAKEFUN_OUTPUT_DIR, or /output where the grader
// runs it) and writes dossier.json there with the vendored make.fun
// library, so the dossier is byte for byte the one the scorer builds
// from the same folders.

import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const entryDir = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });

// Fresh copies, so a stale file from an earlier run can never sneak into
// the entry: the output ends up holding exactly this repository's game/
// and screenshots/, plus the dossier.
for (const folder of ['game', 'screenshots']) {
  const target = join(outputDir, folder);
  rmSync(target, { recursive: true, force: true });
  cpSync(join(entryDir, folder), target, { recursive: true });
}

// The caps are the bounty's gate values, as the library documents them:
// only text_max_bytes shapes the dossier's bytes; the rest make this
// program refuse exactly where the scorer would refuse.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});

writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`Palm City Heat: game/ and screenshots/ copied to ${outputDir}, dossier.json written (${dossier.length} bytes).`);
