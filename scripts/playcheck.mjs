// Interactive smoke check in a real browser: load the game, click to start,
// hold W to walk, and confirm the loop runs (time advances, player moves,
// mission starts). Writes playcheck-result.json next to this script.
// Run via the palmplay systemd unit (Chromium crashes in the exec sandbox).
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import puppeteer from '/home/hatch/workspace/makefun-best-game/playtest/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CHROME = '/home/hatch/.cache/puppeteer/chrome-headless-shell/linux-154.0.8037.57/chrome-headless-shell-linux64/chrome-headless-shell';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('node', ['serve.ts', '--port', '8127'], { cwd: '/home/hatch/workspace/makefun-gta6/palm-city-heat', stdio: 'ignore' });
await sleep(1500);

const result = { loaded: false, started: false, timeAdvanced: false, playerMoved: false, missionStarted: false, errors: [] };
let browser = null;
try {
  browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1280, height: 800 } });
  const page = await browser.newPage();
  page.on('pageerror', (e) => result.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') result.errors.push(`console: ${m.text()}`); });
  await page.goto('http://localhost:8127/', { waitUntil: 'load' });
  await sleep(1500);
  result.loaded = !!(await page.evaluate(() => window.__palm));
  const before = await page.evaluate(() => ({ t: window.__palm.world.state.time, x: window.__palm.world.player.x, y: window.__palm.world.player.y }));
  await page.mouse.click(640, 430); // Start the game.
  await sleep(600);
  await page.keyboard.down('KeyW');
  await sleep(2000);
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => ({
    t: window.__palm.world.state.time,
    x: window.__palm.world.player.x, y: window.__palm.world.player.y,
    missionActive: window.__palm.world.state.missionActive,
  }));
  result.started = after.t > before.t;
  result.timeAdvanced = after.t > 2;
  result.playerMoved = after.y < before.y - 50;
  result.missionStarted = after.missionActive;
  await page.screenshot({ path: '/home/hatch/workspace/makefun-gta6/palm-city-heat/scripts/playcheck-play.jpg', type: 'jpeg', quality: 80 });
  result.screenshot = 'scripts/playcheck-play.jpg';
} catch (e) {
  result.errors.push(`harness: ${e.message}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}
writeFileSync('/home/hatch/workspace/makefun-gta6/palm-city-heat/scripts/playcheck-result.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
process.exit(result.loaded && result.started && result.playerMoved ? 0 : 1);
