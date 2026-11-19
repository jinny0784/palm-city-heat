// Palm City Heat — the entrypoint of the make.fun gta6-01 entry.
//
// The game itself is a folder of static files under game/ (open
// game/index.html in a desktop browser to play it). This program is what
// hands the entry in: it copies game/ and screenshots/ from beside this
// file into the output directory and writes the entry's dossier.json
// there, using the vendored make.fun library so the dossier is spelled
// exactly the way the bounty's scorer spells it.
//
// Run it with Node 22:  node main.ts
// The output directory is $MAKEFUN_OUTPUT_DIR, or /output when unset.

import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outputDir, 'game'), { recursive: true });
cpSync(join(repoDir, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });

// The caps are the bounty's own gate values: the dossier text is shaped by
// text_max_bytes alone, and the rest only refuse what the scorer refuses.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});

writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`Palm City Heat: game/ and screenshots/ copied to ${outputDir}, dossier.json written (${dossier.length} bytes).`);
