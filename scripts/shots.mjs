// Generate the 4 staged screenshots from shots.json with chrome-headless-shell.
// Serves game/ locally, screenshots each ?shot= URL at 1280x800, converts to
// JPEG q80 and checks the size caps. Run via the palmshots systemd unit (Chromium
// crashes in the exec sandbox); writes shots-result.json next to this script.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = '/home/hatch/.cache/puppeteer/chrome-headless-shell/linux-154.0.8037.57/chrome-headless-shell-linux64/chrome-headless-shell';
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = JSON.parse(readFileSync(join(repo, 'shots.json'), 'utf8'));
const outDir = join(repo, 'screenshots');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('node', ['serve.ts', '--port', '8126'], { cwd: repo, stdio: 'ignore' });
await sleep(1500);

const results = [];
for (const shot of shots) {
  const png = join(outDir, shot.name.replace(/\.jpe?g$/, '.png'));
  const jpg = join(outDir, shot.name);
  const url = `http://localhost:8126/${shot.query}`;
  const shotRun = spawnSync(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--window-size=1280,800`, '--virtual-time-budget=9000',
    `--screenshot=${png}`, url,
  ], { encoding: 'utf8', timeout: 120000 });
  let ok = shotRun.status === 0 && existsSync(png);
  let size = 0;
  if (ok) {
    const conv = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-q:v', '4', jpg], { encoding: 'utf8' });
    ok = conv.status === 0 && existsSync(jpg);
    if (ok) {
      const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-show_entries', 'format=size', '-of', 'json', jpg], { encoding: 'utf8' });
      const info = JSON.parse(probe.stdout || '{}');
      size = Number(info.format?.size || 0);
      const w = Number(info.streams?.[0]?.width || 0);
      const h = Number(info.streams?.[0]?.height || 0);
      ok = w === 1280 && h === 800 && size <= 262144 && size > 10000;
      results.push({ shot: shot.name, ok, width: w, height: h, bytes: size, note: shotRun.stderr?.slice(0, 200) || '' });
    } else {
      results.push({ shot: shot.name, ok: false, bytes: 0, note: `ffmpeg failed: ${(conv.stderr || '').slice(0, 200)}` });
    }
  } else {
    results.push({ shot: shot.name, ok: false, bytes: 0, note: `chrome failed: ${(shotRun.stderr || '').slice(0, 300)}` });
  }
  console.log(JSON.stringify(results[results.length - 1]));
}
server.kill();
writeFileSync(join(repo, 'scripts', 'shots-result.json'), JSON.stringify(results, null, 2));
const allOk = results.every((r) => r.ok);
console.log(allOk ? 'ALL SHOTS OK' : 'SOME SHOTS FAILED');
process.exit(allOk ? 0 : 1);
