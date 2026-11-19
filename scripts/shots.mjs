// shots.mjs — renders the four entry screenshots from the real game in
// headless Chrome. Serves the repo over a throwaway local HTTP port (ES
// modules will not load from file://), opens each staged ?shot= scene at
// 1280x800, waits for the game's window.__palm.ready flag, and saves a JPEG
// per scene into screenshots/. Run: node scripts/shots.mjs
//
// In this workspace Chromium only survives outside the exec sandbox, so the
// script is normally launched by a systemd oneshot service.

import { createServer } from 'node:http';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import puppeteer from '/home/hatch/workspace/makefun-best-game/playtest/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = 8907;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

async function findChrome() {
  const cache = join(homedir(), '.cache', 'puppeteer');
  const buckets = ['chrome-headless-shell', 'chrome'];
  for (const bucket of buckets) {
    let versions = [];
    try {
      versions = await readdir(join(cache, bucket));
    } catch {
      continue;
    }
    for (const v of versions.sort().reverse()) {
      const base = join(cache, bucket, v);
      for (const sub of await readdir(base).catch(() => [])) {
        const dir = join(base, sub);
        for (const name of ['chrome-headless-shell', 'chrome']) {
          const candidate = join(dir, name);
          try {
            const s = await stat(candidate);
            if (s.isFile()) return candidate;
          } catch { /* keep looking */ }
        }
      }
    }
  }
  throw new Error('no puppeteer chrome build found under ' + cache);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost:' + PORT);
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    let filePath = join(root, rel);
    if (url.pathname.endsWith('/')) filePath = join(filePath, 'index.html');
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

const shotsDoc = JSON.parse(await readFile(join(root, 'shots.json'), 'utf8'));
const executablePath = await findChrome();
await new Promise((resolve) => server.listen(PORT, resolve));
const browser = await puppeteer.launch({
  executablePath,
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
});
const results = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  for (const shot of shotsDoc.shots) {
    const url = 'http://localhost:' + PORT + '/' + shot.url;
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction('window.__palm && window.__palm.ready === true', { timeout: 30000 });
    const out = join(root, shot.file);
    await page.screenshot({ path: out, type: 'jpeg', quality: 84 });
    const s = await stat(out);
    results.push({ scene: shot.scene, file: shot.file, bytes: s.size });
    console.log(shot.scene + ' -> ' + shot.file + ' (' + s.size + ' bytes)');
  }
} finally {
  await browser.close();
  server.close();
}
await writeFile(join(root, 'scripts', 'shots-result.json'), JSON.stringify(results, null, 2) + '\n');
console.log('done: ' + results.length + ' screenshots');
