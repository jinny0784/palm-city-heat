// Palm City Heat — the make.fun gta6-01 entrypoint (Node 22, standard
// library only, no build step: `node main.ts`).
//
// The game itself is the static site in game/ — plain HTML, CSS and ES
// modules that a desktop browser loads offline. This program hands the
// entry in: it copies game/ and screenshots/ from beside this file into
// the output directory (MAKEFUN_OUTPUT_DIR, or /output when unset) and
// writes dossier.json there, built by the vendored make.fun library in
// vendor/makefun-game.ts with the bounty's gate caps. The dossier is
// canonical and deterministic: the same tree always writes the same
// bytes, so two runs of this program produce identical output.

import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
for (const name of ['game', 'screenshots']) {
  cpSync(join(here, name), join(outDir, name), { recursive: true });
}

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`Palm City Heat: game/ and screenshots/ copied to ${outDir}; dossier.json written (${dossier.length} bytes).`);
