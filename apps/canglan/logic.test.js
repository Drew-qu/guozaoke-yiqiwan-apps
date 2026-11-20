import {
  createGame, startGame, step, spawnEnemy, spawnBoss, bombImpact,
  seaTargets, SCRIPT, TUNE, summary
} from './logic.js';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  }
}

function blastUntil(game, x, z, n) {
  for (let i = 0; i < n; i++) {
    game.shots.push({
      team: 'player', mode: 'sea', kind: 'bomb', dmg: TUNE.seaDmg, r: 0.7, homing: 0,
      x, y: 1.2, z, vx: 0, vy: -8, vz: 0, life: 1
    });
    step(game, {}, 0.05);
  }
}

// Altitude lengthens the sea-attack impact.
const near = bombImpact(6.2, TUNE.seaVy, 0, 0);
const far = bombImpact(17, TUNE.seaVy, 0, 0);
assert(near && far && far.z > near.z + 8, 'higher altitude should throw sea shots farther, got ' + JSON.stringify({ near, far }));

// Air shots kill fighters and do not damage escorts.
{
  const game = startGame(createGame({ script: [] }), 3);
  const f = spawnEnemy(game, { kind: 'fighter', x: 0, y: 11.2, z: 16, weaveAmp: 0, hp: 36 });
  const e = spawnEnemy(game, { kind: 'escort', x: 0, y: 0, z: 16, weaveAmp: 0, hp: 78 });
  const hp0 = e.hp;
  for (let i = 0; i < 40 && f.alive; i++) step(game, { air: true }, 1 / 60);
  assert(!f.alive, 'fighter should die to air attack');
  assert(e.hp === hp0, 'escort should ignore air attack, hp ' + e.hp);
  assert(game.score >= 120, 'fighter score should register');
}

// Sea bombs kill escorts and do not kill fighters.
{
  const game = startGame(createGame({ script: [] }), 4);
  game.player.x = 0;
  game.player.y = 11;
  const f = spawnEnemy(game, { kind: 'fighter', x: 0, y: 14, z: 30, weaveAmp: 0, hp: 36 });
  const e = spawnEnemy(game, { kind: 'escort', x: 0, z: 36, weaveAmp: 0, hp: 78 });
  const aim = bombImpact(game.player.y, TUNE.seaVy, 0, 0);
  e.z = aim.z;
  e.x0 = 0;
  e.x = 0;
  for (let i = 0; i < 180 && e.alive; i++) {
    e.z = aim.z;
    e.x = 0;
    step(game, { sea: true }, 1 / 60);
  }
  assert(!e.alive, 'escort should die to sea attack');
  assert(f.alive && f.hp === 36, 'fighter should ignore sea bombs');
}

// Stealth blocks damage and launches a decoy.
{
  const game = startGame(createGame({ script: [] }), 5);
  game.shots.push({
    team: 'enemy', mode: 'air', kind: 'bolt', dmg: 40, r: 0.8, homing: 0,
    x: 0, y: 11.2, z: 2, vx: 0, vy: 0, vz: -30, life: 2
  });
  step(game, { stealthEdge: true }, 1 / 30);
  assert(game.stealthT > 0, 'stealth should start');
  assert(game.decoy, 'decoy should exist');
  assert(game.hp === TUNE.maxHp, 'stealth should block the hit, hp ' + game.hp);
}

// Boss phases are ordered, armor holds, core victory is once.
{
  const game = startGame(createGame({ script: [] }), 6);
  spawnBoss(game);
  game.boss.z = TUNE.bossHoldZ;
  game.boss.x = 0;
  const island = game.boss.parts.find((p) => p.id === 'island');
  const before = island.hp;
  const iw = { x: island.x, z: TUNE.bossHoldZ + island.z };
  blastUntil(game, iw.x, iw.z, 6);
  assert(island.hp === before, 'island is armored in phase 1');
  assert(game.boss.phase === 1, 'phase stays 1');

  function kill(id) {
    const p = game.boss.parts.find((x) => x.id === id);
    for (let n = 0; n < 8 && p.hp > 0; n++) {
      game.boss.x = 0;
      blastUntil(game, p.x, game.boss.z + p.z, 1);
    }
    return p.hp;
  }
  assert(kill('port') <= 0, 'port turret should break');
  assert(game.boss.phase === 1, 'one turret does not advance the phase');
  assert(kill('starboard') <= 0, 'starboard turret should break');
  assert(game.boss.phase === 2, 'both turrets open phase 2');
  assert(kill('catapult') <= 0, 'catapult should break');
  assert(game.boss.phase === 2, 'catapult alone stays in phase 2');
  assert(kill('island') <= 0, 'island should break');
  assert(game.boss.phase === 3, 'island + catapult open the core');
  const scoreBefore = game.score;
  assert(kill('core') <= 0, 'core should break');
  assert(game.phase === 'win', 'core destruction wins');
  assert(game.stats.parts === 5, 'five components destroyed, got ' + game.stats.parts);
  const scoreAfter = game.score;
  blastUntil(game, 0, TUNE.bossHoldZ, 3);
  assert(game.score === scoreAfter && scoreAfter > scoreBefore, 'victory score is not repeatable');
  const sum = summary(game);
  assert(sum.win && sum.parts === 5, 'summary reports the win');
}

// A direct hit kills the player outside stealth.
{
  const game = startGame(createGame({ script: [] }), 7);
  game.shots.push({
    team: 'enemy', mode: 'air', kind: 'bolt', dmg: 500, r: 1, homing: 0,
    x: game.player.x, y: game.player.y, z: 0.2, vx: 0, vy: 0, vz: 0, life: 1
  });
  step(game, {}, 1 / 60);
  assert(game.phase === 'over' && game.hp === 0, 'lethal hit should end the run');
}

// Script contains three archetypes plus the carrier.
{
  const kinds = new Set(SCRIPT.map((s) => s.kind));
  assert(kinds.has('fighter') && kinds.has('striker') && kinds.has('escort') && kinds.has('boss'), 'level script archetypes');
  const game = startGame(createGame(), 8);
  for (let t = 0; t < 62; t += 1 / 30) {
    game.invuln = 0.2;
    if (game.phase !== 'play') game.phase = 'play';
    step(game, {}, 1 / 30);
  }
  assert(game.boss && game.boss.parts.length === 5, 'campaign script reaches the five-part carrier');
  assert(game.stats.kills + game.enemies.length > 0, 'waves spawn aircraft');
}

function threat(game) {
  const p = game.player;
  let worst = null;
  let worstScore = 0;
  for (let i = 0; i < game.shots.length; i++) {
    const s = game.shots[i];
    if (s.team !== 'enemy' || s.vz >= -1) continue;
    const t = (s.z - 0.4) / Math.max(1, -s.vz);
    if (t < 0 || t > 0.72) continue;
    const fx = s.x + s.vx * t;
    const fy = s.y + s.vy * t;
    const dx = fx - p.x;
    const dy = fy - p.y;
    if (Math.abs(dx) < 2.6 && Math.abs(dy) < 2.3) {
      const score = (2.6 - Math.abs(dx)) + (2.3 - Math.abs(dy)) + (0.72 - t);
      if (score > worstScore) {
        worstScore = score;
        worst = { dx, dy };
      }
    }
  }
  return worst;
}

function yForZ(wantZ) {
  let bestY = 11;
  let bestErr = 1e9;
  for (let y = TUNE.yMin; y <= TUNE.yMax; y += 0.25) {
    const impact = bombImpact(y, TUNE.seaVy, 0, 0);
    if (!impact) continue;
    const err = Math.abs(impact.z - wantZ);
    if (err < bestErr) { bestErr = err; bestY = y; }
  }
  return bestY;
}

function autopilot(game) {
  const p = game.player;
  const danger = threat(game);
  const airs = game.enemies.filter((e) => e.alive && e.hitBy === 'air' && e.z > 4 && e.z < 78);
  airs.sort((a, b) => a.z - b.z);
  const seas = seaTargets(game).filter((t) => t.kind === 'escort' || t.open);
  seas.sort((a, b) => a.z - b.z);
  const impact = bombImpact(p.y, TUNE.seaVy, p.x, p.vx * 0.32);
  let sea = null;
  if (seas.length) {
    sea = seas[0];
    let best = 1e9;
    for (let i = 0; i < seas.length; i++) {
      const err = Math.abs(seas[i].z - (impact ? impact.z : 36)) + Math.abs(seas[i].x - p.x) * 0.35;
      if (seas[i].z > 22 && seas[i].z < 62 && err < best) { best = err; sea = seas[i]; }
    }
  }
  let moveX = 0;
  let moveY = 0;
  let air = false;
  let seaFire = false;
  if (danger) {
    moveX = danger.dx > 0 ? -1 : 1;
    moveY = danger.dy > 0 ? -1 : 1;
  } else if (sea && (!airs.length || sea.z < 48)) {
    moveX = clampAxis(sea.x - p.x, 0.35);
    const wantY = yForZ(sea.z);
    moveY = clampAxis(wantY - p.y, 0.28);
    seaFire = Math.abs(sea.x - p.x) < 1.15 && impact && Math.abs(impact.z - sea.z) < 2.4;
  } else if (airs.length) {
    const a = airs[0];
    if (a.z < 9) moveX = p.x > a.x ? 1 : -1;
    else moveX = clampAxis(a.x - p.x, 0.45);
    moveY = clampAxis(a.y - p.y, 0.45);
  } else {
    moveX = clampAxis(-p.x, 0.4);
    moveY = clampAxis(11.2 - p.y, 0.4);
  }
  if (airs.length) {
    const a = airs[0];
    air = Math.abs(a.x - p.x) < 1.55 && Math.abs(a.y - p.y) < 1.7 && a.z < 72 && a.z > 6;
  }
  const stealthEdge = !!(danger && game.hp < 48 && game.stealthCd <= 0 && game.stealthT <= 0);
  return { moveX, moveY, air, sea: seaFire, stealthEdge };
}

function clampAxis(delta, dead) {
  if (Math.abs(delta) < dead) return 0;
  return delta > 0 ? 1 : -1;
}

{
  const game = startGame(createGame(), 11);
  let guard = 0;
  const maxSteps = 200 * 60;
  while (game.phase === 'play' && guard < maxSteps) {
    step(game, autopilot(game), 1 / 60);
    guard += 1;
  }
  const boss = game.boss;
  const partHp = boss ? boss.parts.map((p) => p.id + ':' + Math.ceil(p.hp) + '/p' + p.phase).join(' ') : 'none';
  console.log('autopilot', {
    phase: game.phase,
    hp: Math.ceil(game.hp),
    score: game.score,
    time: Math.round(game.elapsed),
    kills: game.stats.kills,
    parts: game.stats.parts,
    bossPhase: boss && boss.phase,
    partHp,
    steps: guard
  });
  assert(game.phase === 'win', 'scripted pilot should clear the carrier');
  assert(game.hp > 0, 'clear should leave the jet flying');
  assert(game.stats.kills >= 8, 'pilot should shoot down several aircraft, kills ' + game.stats.kills);
  assert(game.stats.parts === 5, 'all carrier components should break');
}

if (failed) {
  console.error(failed + ' assertion(s) failed');
  process.exit(1);
}
console.log('logic tests passed');
