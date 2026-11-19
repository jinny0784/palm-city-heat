// Palm City Heat — captures the four entry screenshots from the real
// game in headless Chrome. It serves game/ itself on a loopback port
// (module scripts will not load from file://), opens each staged scene
// from shots.json, waits for the first frame, and saves a JPEG sized to
// fit the bounty's 256 KiB cap.
//
// Chromium cannot run inside the usual exec sandbox here, so this is run
// by a systemd oneshot (see the unit the parent writes); it is otherwise
// just:  node scripts/shots.mjs

import puppeteer from '/home/hatch/workspace/makefun-best-game/playtest/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const gameDir = join(repo, 'game');
const CHROME = '/home/hatch/.cache/puppeteer/chrome-headless-shell/linux-154.0.8037.57/chrome-headless-shell-linux64/chrome-headless-shell';
const MAX_BYTES = 256 * 1024;

const SHOTS = [
  ['title', '1-title.jpg'],
  ['street', '2-street.jpg'],
  ['driving', '3-driving.jpg'],
  ['chase', '4-chase.jpg'],
];

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/index.html';
    const file = normalize(join(gameDir, path));
    if (!file.startsWith(gameDir)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const results = [];
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', (err) => console.log('page error:', err.message));
  for (const [name, file] of SHOTS) {
    await page.goto(`http://127.0.0.1:${port}/index.html?shot=${name}&seed=7`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction('window.__palmReady === true', { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 900));
    let quality = 84;
    let buffer = await page.screenshot({ type: 'jpeg', quality });
    while (buffer.length > MAX_BYTES - 2048 && quality > 40) {
      quality -= 10;
      buffer = await page.screenshot({ type: 'jpeg', quality });
    }
    const out = join(repo, 'screenshots', file);
    await writeFile(out, buffer);
    const { size } = await stat(out);
    results.push({ name, file, bytes: size, quality });
    console.log(`${name}: ${file} ${size} bytes @ q${quality}`);
  }
} finally {
  if (browser) await browser.close();
  server.close();
}
await writeFile(join(repo, 'scripts', 'shots-result.json'), JSON.stringify(results, null, 2) + '\n');
console.log('done');
