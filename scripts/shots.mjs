// shots.mjs — renders the four entry screenshots from the real game in
// headless Chrome (puppeteer-core + chrome-headless-shell) and writes
// scripts/shots-result.json. The repo is served over a throwaway local
// HTTP port because ES modules do not load from file:// URLs. Each JPEG
// is re-encoded at a lower quality until it fits the 256 KiB cap.

import { createServer } from 'node:http';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = [
  { name: 'title', file: 'screenshots/1-title.jpg' },
  { name: 'street', file: 'screenshots/2-street.jpg' },
  { name: 'driving', file: 'screenshots/3-driving.jpg' },
  { name: 'chase', file: 'screenshots/4-chase.jpg' },
];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

function findShell(base) {
  if (!existsSync(base)) return null;
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    const p = join(base, entry.name);
    if (entry.isFile() && entry.name.startsWith('chrome-headless-shell')) return p;
    if (entry.isDirectory()) {
      const hit = findShell(p);
      if (hit) return hit;
    }
  }
  return null;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  let file = join(repo, decodeURIComponent(url.pathname));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(repo) || !existsSync(file)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const puppeteerModule = await import(
  pathToFileURL('/home/hatch/workspace/makefun-best-game/playtest/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')
);
const puppeteer = puppeteerModule.default;
const executablePath = findShell(join(process.env.HOME ?? '/home/hatch', '.cache/puppeteer'));
if (!executablePath) throw new Error('chrome-headless-shell not found under ~/.cache/puppeteer');

const browser = await puppeteer.launch({
  executablePath,
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
});
const results = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  for (const shot of SHOTS) {
    await page.goto(`http://127.0.0.1:${port}/game/index.html?shot=${shot.name}&seed=7`, {
      waitUntil: 'load',
      timeout: 60000,
    });
    await page.waitForFunction(() => document.body.classList.contains('shot-ready'), { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 350));
    const out = join(repo, shot.file);
    mkdirSync(dirname(out), { recursive: true });
    let quality = 84;
    let bytes = 0;
    for (;;) {
      await page.screenshot({ path: out, type: 'jpeg', quality });
      bytes = statSync(out).size;
      if (bytes <= 262144 || quality <= 45) break;
      quality -= 14;
    }
    results.push({ name: shot.name, file: shot.file, bytes, quality });
    console.log(`${shot.name}: ${bytes} bytes at quality ${quality}`);
  }
} finally {
  await browser.close();
  server.close();
}
writeFileSync(join(repo, 'scripts/shots-result.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log('shots done');
