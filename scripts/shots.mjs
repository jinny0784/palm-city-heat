// Palm City Heat — renders the four screenshots in shots.json from the
// real game in headless Chrome and writes them into screenshots/ as
// 1280x800 JPEGs of at most 256 KiB each. Run: node scripts/shots.mjs
// (in this workspace Chrome must be launched from a systemd service;
// see the unit the build used — the script itself is environment-blind).

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from '/home/hatch/workspace/makefun-best-game/playtest/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = 8137;
const MAX_BYTES = 262144;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const body = readFileSync(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

function chromePath() {
  const base = '/home/hatch/.cache/puppeteer/chrome-headless-shell';
  const versions = readdirSync(base).sort();
  for (let i = versions.length - 1; i >= 0; i -= 1) {
    const p = join(base, versions[i], 'chrome-headless-shell-linux64', 'chrome-headless-shell');
    if (existsSync(p)) return p;
  }
  throw new Error('no chrome-headless-shell found');
}

const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8')).shots;
const results = [];

await new Promise((resolve) => server.listen(PORT, resolve));
const browser = await puppeteer.launch({
  executablePath: chromePath(),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  for (const shot of shots) {
    const url = `http://localhost:${PORT}/${shot.url}`;
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => window.__shotReady === true, { timeout: 60000 });
    let quality = 88;
    let buffer = await page.screenshot({ type: 'jpeg', quality });
    while (buffer.length > MAX_BYTES && quality > 40) {
      quality -= 6;
      buffer = await page.screenshot({ type: 'jpeg', quality });
    }
    const out = join(root, shot.file);
    writeFileSync(out, buffer);
    const size = statSync(out).size;
    results.push({ name: shot.name, file: shot.file, bytes: size, quality });
    console.log(`${shot.name}: ${shot.file} — ${size} bytes (jpeg q${quality})`);
    if (size > MAX_BYTES) throw new Error(`${shot.file} is ${size} bytes, over the ${MAX_BYTES} cap`);
  }
  if (errors.length) console.log('page errors seen:', errors);
} finally {
  await browser.close();
  server.close();
}
writeFileSync(join(root, 'scripts', 'shots-result.json'), JSON.stringify(results, null, 2));
console.log('done:', results.length, 'screenshots');
