/**
 * main.ts — the make.fun entrypoint for Palm City Heat.
 *
 * Running `node main.ts` packages the entry: it mirrors the playable game
 * (the static site under game/) and the screenshot set (screenshots/) into
 * the output directory, then asks the vendored make.fun library to compile
 * dossier.json describing that tree. The dossier build is deterministic —
 * the same tree in, the same bytes out — so repeat runs are byte-identical.
 *
 * Node 22+, standard library only; no build step, no dependencies.
 */

import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as makefun from "./vendor/makefun-game.ts";

// The bounty's gate caps, named for what they guard. These are the limits
// the dossier is compiled against: how large a single text file may be, how
// many screenshots may ship and how heavy each may be, and the ceiling on
// the game's file count and total size.
const LIMIT_TEXT_FILE_BYTES = 163_840;
const LIMIT_SCREENSHOT_COUNT = 4;
const LIMIT_SCREENSHOT_BYTES = 262_144;
const LIMIT_GAME_FILE_COUNT = 993;
const LIMIT_GAME_TOTAL_BYTES = 50_331_648;

// Where the finished entry lands: MAKEFUN_OUTPUT_DIR when the harness sets
// it, /output by convention otherwise.
const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

// Mirror the two payload trees next to this file into the output dir.
mkdirSync(outDir, { recursive: true });
for (const tree of ["game", "screenshots"]) {
  cpSync(join(here, tree), join(outDir, tree), { recursive: true });
}

// Compile the dossier with the caps gathered into one options object.
const gateCaps = {
  text_max_bytes: LIMIT_TEXT_FILE_BYTES,
  screenshots: {
    max: LIMIT_SCREENSHOT_COUNT,
    max_bytes: LIMIT_SCREENSHOT_BYTES,
  },
  game_max_files: LIMIT_GAME_FILE_COUNT,
  game_max_bytes: LIMIT_GAME_TOTAL_BYTES,
};
const dossierJson = makefun.buildDossier(outDir, gateCaps);
writeFileSync(join(outDir, "dossier.json"), dossierJson);

console.log(`Palm City Heat: game/ and screenshots/ copied to ${outDir}; dossier.json written.`);
