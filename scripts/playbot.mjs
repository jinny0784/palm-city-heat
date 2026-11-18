// End-to-end bot play-test for Palm City Heat: plays the real game in
// headless Chrome (puppeteer-core) with real keyboard/mouse — walks, steals
// a car, drives the mission chain (M1..M5) via road-grid waypoints, raises
// wanted, fights police, shoots the M3 crates. Run via the palmplay2
// systemd unit (Chromium crashes in the exec sandbox).
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import puppeteer from '/home/hatch/workspace/makefun-best-game/playtest/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import { ROADS_V, ROADS_H } from '../game/src/config.js';

const CHROME = '/home/hatch/.cache/puppeteer/chrome-headless-shell/linux-154.0.8037.57/chrome-headless-shell-linux64/chrome-headless-shell';
const REPO = '/home/hatch/workspace/makefun-gta6/palm-city-heat';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const nearest = (arr, v) => arr.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), arr[0]);
const LOG = [];
const log = (m) => { LOG.push(`${new Date().toISOString().slice(11, 19)} ${m}`); console.log(m); };

const server = spawn('node', ['serve.ts', '--port', '8128'], { cwd: REPO, stdio: 'ignore' });
await sleep(1500);

const result = {
  loaded: false, started: false, gotCar: false, m1: false, m2: false, m3: false, m4: false, m5: false,
  storyComplete: false, maxWanted: 0, policeSeen: 0, policeChased: false, cratesShot: 0,
  errors: [], log: LOG, durationSec: 0,
};
const t0 = Date.now();
let browser = null;
let page = null;
let steerRightKey = 'KeyD'; // calibrated below (err>0 -> this key)

async function readState() {
  return page.evaluate(() => {
    const w = window.__palm?.world;
    if (!w) return null;
    const p = w.player;
    const car = p.inCar;
    const police = w.cars.filter((c) => c.driver === 'police' && !c.wrecked)
      .map((c) => ({ x: Math.round(c.x), y: Math.round(c.y), d: Math.round(Math.hypot(c.x - p.x, c.y - p.y)) }));
    const parked = w.cars.filter((c) => c.driver === 'parked' && !c.wrecked)
      .map((c) => ({ x: Math.round(c.x), y: Math.round(c.y) }));
    const targetCar = w.cars.find((c) => c.target);
    return {
      t: +w.state.time.toFixed(1), missionIndex: w.state.missionIndex, missionObj: w.state.missionObj,
      missionActive: w.state.missionActive, missionTimer: w.state.missionTimer, cash: w.state.cash,
      wanted: w.state.wanted, storyComplete: w.state.storyComplete, over: w.state.over,
      px: Math.round(p.x), py: Math.round(p.y), php: Math.round(p.hp), ammo: p.ammo,
      inCar: !!car, carAngle: car ? +car.angle.toFixed(3) : null,
      carSpeed: car ? Math.round(Math.hypot(car.vx, car.vy)) : 0,
      carHp: car ? Math.round(car.health) : null,
      obj: w.currentObjective(), police, policeCount: police.length,
      parkedCount: parked.length, parked,
      targetCar: targetCar ? { x: Math.round(targetCar.x), y: Math.round(targetCar.y), driver: targetCar.driver } : null,
      cratesAlive: w.crates.filter((c) => !c.dead).length,
      bagsLeft: w.bags.filter((b) => !b.taken).length,
      bags: w.bags.filter((b) => !b.taken).map((b) => ({ x: Math.round(b.x), y: Math.round(b.y) })),
    };
  });
}

const pressed = new Set();
async function setKeys(want) {
  for (const k of [...pressed]) if (!want.has(k)) { await page.keyboard.up(k); pressed.delete(k); }
  for (const k of want) if (!pressed.has(k)) { await page.keyboard.down(k); pressed.add(k); }
}
async function pressKey(k, ms = 120) { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); }

async function walkTo(tx, ty, timeoutMs = 60000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const s = await readState();
    if (!s) return false;
    const dx = tx - s.px; const dy = ty - s.py;
    if (Math.hypot(dx, dy) < 40) { await setKeys(new Set()); return true; }
    const want = new Set();
    if (dx < -20) want.add('KeyA');
    if (dx > 20) want.add('KeyD');
    if (dy < -20) want.add('KeyW');
    if (dy > 20) want.add('KeyS');
    await setKeys(want);
    await sleep(120);
  }
  await setKeys(new Set());
  return false;
}

function waypoints(x, y, tx, ty) {
  const rv = nearest(ROADS_V, x);
  const rh = nearest(ROADS_H, ty);
  return [{ x: rv, y }, { x: rv, y: rh }, { x: tx, y: rh }, { x: tx, y: ty }];
}

async function driveTo(tx, ty, timeoutMs = 150000, label = 'drive') {
  let steals = 0;
  let s0 = await readState();
  let wps = waypoints(s0.px, s0.py, tx, ty);
  let wi = 0;
  const legEnd = Date.now() + timeoutMs;
  while (wi < wps.length && Date.now() < legEnd) {
    const wp = wps[wi];
    const wpEnd = Date.now() + timeoutMs / wps.length;
    let lastProg = Date.now(); let stuckCount = 0;
    let lastDist = Infinity; let lastTele = 0;
    while (Date.now() < Math.min(wpEnd, legEnd)) {
      const s = await readState();
      if (!s) return false;
      if (s.over) { log(`${label}: game over (${s.over})`); return false; }
      if (!s.inCar) {
        // Car wrecked (or exited): steal another and resume from here.
        steals += 1;
        if (steals > 3) { log(`${label}: too many wrecks, giving up`); return false; }
        log(`${label}: car lost at wp${wi}, re-stealing (#${steals})`);
        await setKeys(new Set());
        if (!(await getCar(60000))) { log(`${label}: could not re-steal`); return false; }
        const ns = await readState();
        wps = waypoints(ns.px, ns.py, tx, ty);
        wi = 0;
        break;
      }
      const dx = wp.x - s.px; const dy = wp.y - s.py;
      const dist = Math.hypot(dx, dy);
      if (dist < 45) break;
      if (Date.now() - lastTele > 5000) { lastTele = Date.now(); log(`${label} wp${wi}: speed=${s.carSpeed} hp=${s.carHp} dist=${Math.round(dist)} wanted=${s.wanted}`); }
      if (dist < lastDist - 5) { lastDist = dist; lastProg = Date.now(); }
      const desired = Math.atan2(dy, dx);
      const err = wrap(desired - s.carAngle);
      // Speed control: never floor it while turning hard — that is how the
      // car rams walls at 500 px/s and wrecks. Coast/steer when |err| is big.
      const want = new Set();
      if (Math.abs(err) < 0.6 && dist > 120) want.add('KeyW');
      else if (Math.abs(err) < 0.25) want.add('KeyW');
      if (err > 0.12) want.add(steerRightKey);
      else if (err < -0.12) want.add(steerRightKey === 'KeyD' ? 'KeyA' : 'KeyD');
      if (s.carSpeed > 260 && Math.abs(err) > 0.4) { want.delete('KeyW'); want.add('KeyS'); } // brake into the turn
      if (Date.now() - lastProg > 1500) {
        // Stuck: reverse out.
        stuckCount += 1;
        if (stuckCount > 4) { log(`${label}: stuck at wp${wi}, skipping`); break; }
        await setKeys(new Set());
        await page.keyboard.down('KeyS');
        if (err > 0) await page.keyboard.down(steerRightKey === 'KeyD' ? 'KeyA' : 'KeyD');
        else await page.keyboard.down(steerRightKey);
        await sleep(1500);
        await setKeys(new Set());
        lastProg = Date.now(); lastDist = Infinity;
        continue;
      }
      await setKeys(want);
      await sleep(120);
    }
    wi += 1;
  }
  await setKeys(new Set());
  const s = await readState();
  return s ? Math.hypot(tx - s.px, ty - s.py) < 120 : false;
}

async function shootAt(tx, ty, n = 1) {
  const s = await readState();
  if (!s || s.inCar) return;
  const a = Math.atan2(ty - s.py, tx - s.px);
  await page.mouse.move(640 + Math.cos(a) * 220, 400 + Math.sin(a) * 220);
  for (let i = 0; i < n; i += 1) {
    await page.mouse.down(); await sleep(90); await page.mouse.up(); await sleep(180);
  }
}

async function getCar(timeoutMs = 90000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const s = await readState();
    if (!s) return false;
    if (s.inCar) return true;
    if (!s.parked.length) { await sleep(500); continue; }
    let best = null; let bd = Infinity;
    for (const c of s.parked) { const d = Math.hypot(c.x - s.px, c.y - s.py); if (d < bd) { bd = d; best = c; } }
    if (!best) { await sleep(500); continue; }
    if (bd < 55) { await pressKey('KeyE'); await sleep(400); continue; }
    await walkTo(best.x, best.y, 20000);
  }
  return false;
}

try {
  browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1280, height: 800 } });
  page = await browser.newPage();
  page.on('pageerror', (e) => result.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') result.errors.push(`console: ${m.text()}`); });
  await page.goto('http://localhost:8128/', { waitUntil: 'load' });
  await sleep(1500);
  result.loaded = !!(await page.evaluate(() => window.__palm));
  if (!result.loaded) throw new Error('game did not load');
  await page.mouse.click(640, 430);
  await sleep(800);
  let s = await readState();
  result.started = s.t > 0;
  log(`started, t=${s.t}, missionActive=${s.missionActive}`);
  // Wait for M1 to auto-start.
  for (let i = 0; i < 20 && !s.missionActive; i += 1) { await sleep(500); s = await readState(); }
  log(`M1 active: missionIndex=${s.missionIndex} obj=${JSON.stringify(s.obj)}`);

  // Calibrate steering: hold W+D and see which way the car angle moves.
  result.gotCar = await getCar();
  log(`got car: ${result.gotCar}`);
  if (result.gotCar) {
    s = await readState();
    const a0 = s.carAngle;
    await setKeys(new Set(['KeyW', 'KeyD'])); await sleep(700); await setKeys(new Set());
    s = await readState();
    const dAngle = wrap(s.carAngle - a0);
    steerRightKey = dAngle >= 0 ? 'KeyD' : 'KeyA';
    log(`steer calibration: dAngle=${dAngle.toFixed(2)} -> err>0 uses ${steerRightKey}`);
  }

  const DEADLINE = Date.now() + 11 * 60 * 1000;

  // --- M1: two goto legs ---
  if (result.gotCar && Date.now() < DEADLINE) {
    s = await readState();
    if (s.obj) {
      const ok1 = await driveTo(s.obj.x, s.obj.y, 150000, 'M1 leg1');
      s = await readState();
      log(`M1 leg1 reached=${ok1} missionObj=${s.missionObj} missionIndex=${s.missionIndex}`);
      if (s.obj && s.missionIndex === 0) {
        const ok2 = await driveTo(s.obj.x, s.obj.y, 150000, 'M1 leg2');
        s = await readState();
        log(`M1 leg2 reached=${ok2} missionIndex=${s.missionIndex}`);
      }
      result.m1 = s.missionIndex >= 1;
      await page.screenshot({ path: `${REPO}/scripts/playbot-m1.jpg`, type: 'jpeg', quality: 80 });
    }
  }

  // --- Wanted + police: fire the pistol on foot near peds ---
  if (result.m1 && Date.now() < DEADLINE) {
    s = await readState();
    if (s.inCar) { await pressKey('KeyE'); await sleep(500); }
    s = await readState();
    // Fire several shots (wanted rises from shooting near peds/police).
    for (let i = 0; i < 8; i += 1) { await shootAt(s.px + 200, s.py, 1); }
    await sleep(1000);
    s = await readState();
    log(`after shooting: wanted=${s.wanted} police=${s.policeCount}`);
    result.maxWanted = Math.max(result.maxWanted, s.wanted);
    // Wait for police to arrive and chase.
    let minD = Infinity;
    for (let i = 0; i < 20; i += 1) {
      await sleep(500);
      s = await readState();
      result.maxWanted = Math.max(result.maxWanted, s.wanted);
      result.policeSeen = Math.max(result.policeSeen, s.policeCount);
      for (const p of s.police) minD = Math.min(minD, p.d);
      if (s.policeCount > 0 && minD < 500) break;
    }
    result.policeChased = result.policeSeen > 0 && minD < 600;
    log(`police seen=${result.policeSeen} closest=${minD} chased=${result.policeChased} wanted=${s.wanted}`);
    await page.screenshot({ path: `${REPO}/scripts/playbot-wanted.jpg`, type: 'jpeg', quality: 80 });
  }

  // --- M2: steal the Comet GT (timed 90s) then deliver ---
  if (result.m1 && Date.now() < DEADLINE) {
    s = await readState();
    log(`M2 start: missionIndex=${s.missionIndex} timer=${s.missionTimer} obj=${JSON.stringify(s.obj)}`);
    if (s.missionIndex === 1) {
      if (!s.inCar) await getCar();
      if (s.targetCar) {
        await driveTo(s.targetCar.x, s.targetCar.y, 120000, 'M2 to GT');
        s = await readState();
        // Exit current car, walk to the GT, steal it.
        if (s.inCar) { await pressKey('KeyE'); await sleep(400); }
        s = await readState();
        if (s.targetCar) await walkTo(s.targetCar.x, s.targetCar.y, 30000);
        await pressKey('KeyE'); await sleep(500);
        s = await readState();
        log(`M2 steal: inCar=${s.inCar} missionObj=${s.missionObj} obj=${JSON.stringify(s.obj)}`);
        if (s.obj && s.missionIndex === 1) {
          await driveTo(s.obj.x, s.obj.y, 120000, 'M2 deliver');
          s = await readState();
        }
      }
      result.m2 = s.missionIndex >= 2;
      log(`M2 done=${result.m2} missionIndex=${s.missionIndex} timer=${s.missionTimer}`);
      await page.screenshot({ path: `${REPO}/scripts/playbot-m2.jpg`, type: 'jpeg', quality: 80 });
    }
  }

  // --- M3: shoot 3 crates at the depot, then safehouse ---
  if (result.m2 && Date.now() < DEADLINE) {
    s = await readState();
    log(`M3 start: missionIndex=${s.missionIndex} obj=${JSON.stringify(s.obj)} cratesAlive=${s.cratesAlive}`);
    if (s.missionIndex === 2 && s.obj) {
      if (!s.inCar) await getCar();
      await driveTo(s.obj.x, s.obj.y, 150000, 'M3 depot');
      s = await readState();
      if (s.inCar) { await pressKey('KeyE'); await sleep(400); }
      // Shoot crates until the objective advances.
      for (let round = 0; round < 40; round += 1) {
        s = await readState();
        if (s.missionIndex !== 2 || s.missionObj !== 0) break;
        const alive = await page.evaluate(() => window.__palm.world.crates.filter((c) => !c.dead).map((c) => ({ x: c.x, y: c.y })));
        if (!alive.length) break;
        let nearestC = null; let nd = Infinity;
        for (const c of alive) { const d = Math.hypot(c.x - s.px, c.y - s.py); if (d < nd) { nd = d; nearestC = c; } }
        if (nd > 60) await walkTo(nearestC.x, nearestC.y, 20000);
        await shootAt(nearestC.x, nearestC.y, 4);
        await sleep(300);
      }
      s = await readState();
      result.cratesShot = 3 - s.cratesAlive;
      log(`M3 crates shot=${result.cratesShot} missionObj=${s.missionObj} obj=${JSON.stringify(s.obj)}`);
      await page.screenshot({ path: `${REPO}/scripts/playbot-m3.jpg`, type: 'jpeg', quality: 80 });
      if (s.obj && s.missionIndex === 2) {
        if (!s.inCar) await getCar();
        await driveTo(s.obj.x, s.obj.y, 150000, 'M3 safehouse');
        s = await readState();
      }
      result.m3 = s.missionIndex >= 3;
      log(`M3 done=${result.m3} missionIndex=${s.missionIndex}`);
    }
  }

  // --- M4: airstrip pickup -> marina (forced 2 stars) ---
  if (result.m3 && Date.now() < DEADLINE) {
    s = await readState();
    log(`M4 start: missionIndex=${s.missionIndex} obj=${JSON.stringify(s.obj)}`);
    if (s.missionIndex === 3 && s.obj) {
      if (!s.inCar) await getCar();
      await driveTo(s.obj.x, s.obj.y, 150000, 'M4 pickup');
      s = await readState();
      log(`M4 pickup leg: missionObj=${s.missionObj} obj=${JSON.stringify(s.obj)}`);
      if (s.obj && s.missionIndex === 3) {
        const ok = await driveTo(s.obj.x, s.obj.y, 150000, 'M4 marina');
        s = await readState();
        result.maxWanted = Math.max(result.maxWanted, s.wanted);
        log(`M4 marina reached=${ok} wanted during leg (max so far ${result.maxWanted}) missionIndex=${s.missionIndex}`);
      }
      result.m4 = s.missionIndex >= 4;
      log(`M4 done=${result.m4}`);
    }
  }

  // --- M5: 3 cash bags -> marina boat ---
  if (result.m4 && Date.now() < DEADLINE) {
    s = await readState();
    log(`M5 start: missionIndex=${s.missionIndex} timer=${s.missionTimer} bagsLeft=${s.bagsLeft} obj=${JSON.stringify(s.obj)}`);
    if (s.missionIndex === 4) {
      for (let bag = 0; bag < 3; bag += 1) {
        s = await readState();
        if (!s.bags.length) break;
        if (!s.inCar) await getCar();
        const b = s.bags[0];
        await driveTo(b.x, b.y, 120000, `M5 bag${bag + 1}`);
        s = await readState();
        if (s.inCar) { await pressKey('KeyE'); await sleep(300); }
        s = await readState();
        if (s.bags.length) await walkTo(s.bags[0].x, s.bags[0].y, 20000);
        await sleep(400);
        s = await readState();
        log(`M5 bag${bag + 1}: bagsLeft=${s.bagsLeft} missionObj=${s.missionObj}`);
      }
      s = await readState();
      if (s.obj && s.missionIndex === 4) {
        if (!s.inCar) await getCar();
        await driveTo(s.obj.x, s.obj.y, 150000, 'M5 boat');
        s = await readState();
      }
      result.m5 = !!s.storyComplete;
      result.storyComplete = !!s.storyComplete;
      log(`M5 done=${result.m5} storyComplete=${s.storyComplete} over=${s.over}`);
      await page.screenshot({ path: `${REPO}/scripts/playbot-final.jpg`, type: 'jpeg', quality: 80 });
    }
  }

  s = await readState();
  if (s) {
    result.maxWanted = Math.max(result.maxWanted, s.wanted);
    result.final = { missionIndex: s.missionIndex, missionObj: s.missionObj, cash: s.cash, wanted: s.wanted, storyComplete: s.storyComplete, over: s.over, t: s.t };
  }
} catch (e) {
  result.errors.push(`harness: ${e.message}`);
  log(`HARNESS ERROR: ${e.message}`);
} finally {
  await setKeys(new Set()).catch(() => {});
  if (browser) await browser.close();
  server.kill();
}
result.durationSec = Math.round((Date.now() - t0) / 1000);
writeFileSync(`${REPO}/scripts/playbot-result.json`, JSON.stringify(result, null, 2));
console.log('PLAYBOT RESULT', JSON.stringify(result));
process.exit(result.errors.length === 0 && result.m1 ? 0 : 1);
