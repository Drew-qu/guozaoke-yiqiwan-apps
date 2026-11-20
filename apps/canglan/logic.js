/**
 * 沧澜突围 · 玩法模拟（无 DOM / 无 WebGL）
 * 虚构碧潮航道上的街机空海突围。空袭只伤空中目标，海攻只伤海面与航母部件。
 */
export const TUNE = {
  maxHp: 100,
  boundsX: 15.6,
  yMin: 6.0,
  yMax: 17.5,
  speedX: 20,
  speedY: 14,
  airCd: 0.14,
  airDmg: 12,
  airSpeed: 70,
  airLife: 1.35,
  airR: 0.62,
  seaCd: 0.42,
  seaDmg: 46,
  seaSplash: 24,
  seaDirect: 2.25,
  seaSplashR: 3.7,
  seaSpeed: 44,
  seaVy: -3.1,
  grav: -15,
  seaLife: 2.6,
  seaSpawnZ: 1.5,
  stealthTime: 2.3,
  stealthCd: 8.4,
  invuln: 0.7,
  playerR: 1.2,
  ramDist: 2.15,
  ramDmg: 16,
  spawnZ: 86,
  despawnZ: -16,
  bossHoldZ: 36,
  bossApproach: -15,
  shotCap: 18
};

export const SPEC = {
  carrier: {
    length: 36,
    width: 12.4,
    parts: {
      port: { name: '左舷炮', x: -5.3, y: 3.15, z: -2.2, r: 1.75, score: 480, phase: 1, hp: 92 },
      starboard: { name: '右舷炮', x: 5.3, y: 3.15, z: 6.2, r: 1.75, score: 480, phase: 1, hp: 92 },
      catapult: { name: '弹射器', x: 0.0, y: 2.45, z: -6.4, r: 2.05, score: 640, phase: 2, hp: 110 },
      island: { name: '舰岛', x: 3.35, y: 5.4, z: 10.2, r: 2.25, score: 720, phase: 2, hp: 128 },
      core: { name: '核心舱', x: 0.15, y: 2.85, z: 2.4, r: 2.1, score: 1600, phase: 3, hp: 150 }
    }
  }
};

const KINDS = {
  fighter: {
    name: '掠影', hp: 36, r: 1.45, vz: -21, y: 12, hitBy: 'air', team: 'air',
    fireEvery: 1.2, shotSpeed: 32, shotDmg: 8, spread: 1.5, weaveAmp: 1.7, weaveFreq: 1.25, score: 120, homing: 0.45
  },
  striker: {
    name: '雷鸦', hp: 60, r: 1.75, vz: -13.5, y: 13, hitBy: 'air', team: 'air',
    fireEvery: 1.95, shotSpeed: 20, shotDmg: 12, spread: 1.1, weaveAmp: 0.55, weaveFreq: 0.65,
    score: 220, homing: 0.85
  },
  escort: {
    name: '潮哨', hp: 78, r: 2.5, vz: -10, y: 0, hitBy: 'sea', team: 'sea',
    fireEvery: 1.65, shotSpeed: 22, shotDmg: 9, spread: 1.8, weaveAmp: 0.35, weaveFreq: 0.45, score: 300
  }
};

export const WAVES = [
  { t: 0, id: 1, name: '掠影试探' },
  { t: 17, id: 2, name: '雷鸦编队' },
  { t: 36, id: 3, name: '潮哨混编' },
  { t: 60, id: 4, name: '潮垒首领' }
];

export const SCRIPT = [
  { t: 0.7, kind: 'fighter', x: -5, y: 12 },
  { t: 1.4, kind: 'fighter', x: 5.2, y: 12.6 },
  { t: 2.5, kind: 'fighter', x: 0, y: 10.6 },
  { t: 4.3, kind: 'fighter', x: -9, y: 14.2 },
  { t: 4.9, kind: 'fighter', x: 9, y: 13.4 },
  { t: 7.4, kind: 'fighter', x: -3, y: 11.2 },
  { t: 8.0, kind: 'fighter', x: 3.2, y: 15 },
  { t: 10.6, kind: 'fighter', x: 0.4, y: 12.2 },
  { t: 12.4, kind: 'escort', x: 0, weaveAmp: 0, banner: '金色环对准潮哨，按海攻' },

  { t: 18.2, kind: 'striker', x: 0, y: 13 },
  { t: 18.9, kind: 'striker', x: -6, y: 14.6 },
  { t: 18.9, kind: 'striker', x: 6, y: 14.6 },
  { t: 21.6, kind: 'fighter', x: -8, y: 11 },
  { t: 21.6, kind: 'fighter', x: 8, y: 11.4 },
  { t: 25.4, kind: 'striker', x: -4, y: 12.2 },
  { t: 26.0, kind: 'striker', x: 4.2, y: 16 },
  { t: 28.8, kind: 'fighter', x: 0, y: 13 },

  { t: 37.2, kind: 'escort', x: -8 },
  { t: 39.0, kind: 'fighter', x: -5, y: 14 },
  { t: 39.6, kind: 'fighter', x: 6, y: 12 },
  { t: 43.2, kind: 'escort', x: 7 },
  { t: 46.4, kind: 'striker', x: 0, y: 15.2 },
  { t: 49.2, kind: 'escort', x: -1.5 },
  { t: 52.2, kind: 'fighter', x: -10, y: 11.2 },
  { t: 52.8, kind: 'fighter', x: 10, y: 13.2 },

  { t: 60, kind: 'boss' }
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function bombFlightTime(y, vy) {
  const a = 0.5 * TUNE.grav;
  const b = vy;
  const c = y - 0.85;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return 0;
  const s = Math.sqrt(disc);
  const t1 = (-b + s) / (2 * a);
  const t2 = (-b - s) / (2 * a);
  if (t1 > 0.04 && t2 > 0.04) return Math.min(t1, t2);
  if (t1 > 0.04) return t1;
  if (t2 > 0.04) return t2;
  return 0;
}

export function bombImpact(y, vy, x, vx) {
  const t = bombFlightTime(y, vy == null ? TUNE.seaVy : vy);
  if (!(t > 0)) return null;
  return {
    t,
    x: (x || 0) + (vx || 0) * t,
    z: TUNE.seaSpawnZ + TUNE.seaSpeed * t
  };
}

export function createGame(opts) {
  opts = opts || {};
  const game = {
    phase: 'title',
    time: 0,
    elapsed: 0,
    score: 0,
    hp: TUNE.maxHp,
    maxHp: TUNE.maxHp,
    wave: 1,
    waveName: '掠影试探',
    banner: '',
    bannerT: 0,
    stealthT: 0,
    stealthCd: 0,
    airCd: 0,
    seaCd: 0,
    invuln: 0,
    shake: 0,
    player: { x: 0, y: 11.2, z: 0, vx: 0, vy: 0, bank: 0, pitch: 0 },
    enemies: [],
    shots: [],
    fx: [],
    decoy: null,
    boss: null,
    aim: { x: 0, z: 30 },
    scriptIndex: 0,
    script: opts.script || SCRIPT,
    nextId: 1,
    rng: mulberry32(opts.seed || 1),
    stats: { kills: 0, parts: 0 },
    clearBonus: 0
  };
  return game;
}

export function startGame(game, seed) {
  const script = game.script || SCRIPT;
  const fresh = createGame({ script, seed: seed == null ? (Date.now() % 1000000000) : seed });
  Object.keys(fresh).forEach((k) => { game[k] = fresh[k]; });
  game.phase = 'play';
  game.banner = '空袭打飞机 · 海攻炸舰船';
  game.bannerT = 3.2;
  game.script = script;
  return game;
}

function pushFx(game, fx) {
  game.fx.push(fx);
  if (game.fx.length > 36) game.fx.splice(0, game.fx.length - 36);
}

function enemyShotCount(game) {
  let n = 0;
  for (let i = 0; i < game.shots.length; i++) if (game.shots[i].team === 'enemy') n++;
  return n;
}

export function spawnEnemy(game, spec) {
  const k = KINDS[spec.kind];
  if (!k) return null;
  const x = spec.x == null ? 0 : spec.x;
  const y = spec.y == null ? k.y : spec.y;
  const e = {
    id: game.nextId++,
    kind: spec.kind,
    name: k.name,
    alive: true,
    x, y,
    z: spec.z == null ? TUNE.spawnZ : spec.z,
    x0: x,
    y0: y,
    vz: spec.vz == null ? k.vz : spec.vz,
    hp: spec.hp == null ? k.hp : spec.hp,
    maxHp: spec.hp == null ? k.hp : spec.hp,
    r: k.r,
    hitBy: k.hitBy,
    team: k.team,
    fireEvery: k.fireEvery,
    shotSpeed: k.shotSpeed,
    shotDmg: k.shotDmg,
    spread: k.spread,
    homing: k.homing || 0,
    weaveAmp: spec.weaveAmp == null ? k.weaveAmp : spec.weaveAmp,
    weaveFreq: k.weaveFreq,
    weavePhase: (spec.phase == null ? game.rng() : spec.phase) * Math.PI * 2,
    score: k.score,
    cd: 0.45 + game.rng() * 0.55,
    age: 0
  };
  game.enemies.push(e);
  return e;
}

export function spawnBoss(game) {
  if (game.boss) return game.boss;
  const parts = Object.keys(SPEC.carrier.parts).map((id) => {
    const s = SPEC.carrier.parts[id];
    return {
      id, name: s.name, x: s.x, y: s.y, z: s.z, r: s.r,
      hp: s.hp, maxHp: s.hp, score: s.score, phase: s.phase, cd: 0.9
    };
  });
  game.boss = {
    x: 0, y: 0, z: 112, age: 0, phase: 1, parts, launchCd: 2.4, dead: false
  };
  game.wave = 4;
  game.waveName = '潮垒首领';
  game.banner = '潮垒进入航道';
  game.bannerT = 2.4;
  return game.boss;
}

export function partWorld(boss, part) {
  return { x: boss.x + part.x, y: part.y, z: boss.z + part.z };
}

function openParts(boss) {
  if (!boss || boss.dead) return [];
  return boss.parts.filter((p) => p.hp > 0 && p.phase === boss.phase);
}

function aimVel(from, to, speed, rng, spread) {
  const dx = to.x - from.x + (rng() - 0.5) * spread;
  const dy = to.y - from.y + (rng() - 0.5) * spread * 0.65;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  return { vx: (dx / len) * speed, vy: (dy / len) * speed, vz: (dz / len) * speed };
}

function fireEnemy(game, origin, speed, dmg, spread, homing, kind) {
  if (enemyShotCount(game) >= TUNE.shotCap) return;
  const vel = aimVel(origin, { x: game.player.x, y: game.player.y, z: 0 }, speed, game.rng, spread);
  game.shots.push({
    team: 'enemy', mode: 'air', kind, dmg, r: 0.72, homing: homing || 0,
    x: origin.x, y: origin.y, z: origin.z,
    vx: vel.vx, vy: vel.vy, vz: vel.vz, life: 4.2
  });
}

function steerTo(shot, target, rate, dt) {
  const dx = target.x - shot.x;
  const dy = target.y - shot.y;
  const dz = (target.z || 0) - shot.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const sp = Math.hypot(shot.vx, shot.vy, shot.vz) || 1;
  const k = Math.min(1, rate * dt);
  shot.vx = shot.vx * (1 - k) + (dx / len) * sp * k;
  shot.vy = shot.vy * (1 - k) + (dy / len) * sp * k;
  shot.vz = shot.vz * (1 - k) + (dz / len) * sp * k;
}

function hurtPlayer(game, dmg) {
  if (game.phase !== 'play') return false;
  if (game.stealthT > 0 || game.invuln > 0) return false;
  game.hp -= dmg;
  game.invuln = TUNE.invuln;
  game.shake = Math.min(1, game.shake + 0.7);
  pushFx(game, { kind: 'hurt', x: game.player.x, y: game.player.y, z: 1, life: 0.28, age: 0, power: 0.6 });
  if (game.hp <= 0) {
    game.hp = 0;
    game.phase = 'over';
    game.banner = '折影受损';
    game.bannerT = 6;
    pushFx(game, { kind: 'boom', x: game.player.x, y: game.player.y, z: 0.5, life: 0.9, age: 0, power: 1.7 });
  }
  return true;
}

function killEnemy(game, e, cause) {
  if (!e.alive) return;
  e.alive = false;
  e.hp = 0;
  game.score += e.score;
  game.stats.kills += 1;
  game.shake = Math.min(1, game.shake + (e.kind === 'escort' ? 0.35 : 0.18));
  pushFx(game, {
    kind: e.team === 'sea' ? 'splash' : 'boom',
    x: e.x, y: e.team === 'sea' ? 1.2 : e.y, z: e.z,
    life: 0.7, age: 0, power: e.kind === 'striker' ? 1.25 : 1
  });
  if (cause) pushFx(game, { kind: 'ping', x: e.x, y: e.y, z: e.z, life: 0.25, age: 0, power: 0.4 });
}

function refreshBossPhase(game) {
  const b = game.boss;
  if (!b || b.dead || game.phase !== 'play') return;
  const dead = (id) => {
    const p = b.parts.find((x) => x.id === id);
    return p && p.hp <= 0;
  };
  if (b.phase === 1 && dead('port') && dead('starboard')) {
    b.phase = 2;
    game.banner = '二阶段 · 拆舰岛与弹射器';
    game.bannerT = 2.5;
    game.shake = Math.min(1, game.shake + 0.4);
  } else if (b.phase === 2 && dead('island') && dead('catapult')) {
    b.phase = 3;
    game.banner = '三阶段 · 核心舱暴露';
    game.bannerT = 2.6;
    game.shake = Math.min(1, game.shake + 0.55);
  }
}

function hurtPart(game, part, dmg) {
  if (part.hp <= 0 || dmg <= 0) return;
  part.hp -= dmg;
  const b = game.boss;
  const w = partWorld(b, part);
  if (part.hp <= 0) {
    part.hp = 0;
    game.score += part.score;
    game.stats.parts += 1;
    game.shake = Math.min(1, game.shake + 0.5);
    pushFx(game, { kind: 'boom', x: w.x, y: w.y, z: w.z, life: 0.85, age: 0, power: 1.5 });
    if (part.id === 'core') {
      b.dead = true;
      game.clearBonus = 900;
      game.score += game.clearBonus;
      game.phase = 'win';
      game.banner = '航道贯通';
      game.bannerT = 8;
    }
  } else {
    pushFx(game, { kind: 'ping', x: w.x, y: w.y, z: w.z, life: 0.22, age: 0, power: 0.7 });
  }
}

export function seaTargets(game) {
  const list = [];
  for (let i = 0; i < game.enemies.length; i++) {
    const e = game.enemies[i];
    if (e.alive && e.hitBy === 'sea') list.push({ kind: 'escort', ref: e, x: e.x, y: 1, z: e.z, r: e.r });
  }
  const b = game.boss;
  if (b && !b.dead) {
    const parts = b.parts;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.hp <= 0) continue;
      const w = partWorld(b, p);
      list.push({
        kind: 'part', ref: p, x: w.x, y: w.y, z: w.z, r: p.r,
        open: p.phase === b.phase
      });
    }
  }
  return list;
}

function blastSea(game, x, z) {
  pushFx(game, { kind: 'splash', x, y: 0.6, z, life: 0.62, age: 0, power: 1.15 });
  const targets = seaTargets(game);
  let best = null;
  let bestD = 1e9;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const d = Math.hypot(t.x - x, t.z - z);
    if (d < bestD) { bestD = d; best = t; }
  }
  if (!best || bestD > TUNE.seaSplashR) return { hit: false };
  const direct = bestD <= TUNE.seaDirect + (best.r || 0) * 0.15;
  const dmg = direct ? TUNE.seaDmg : TUNE.seaSplash;
  if (best.kind === 'escort') {
    best.ref.hp -= dmg;
    if (best.ref.hp <= 0) killEnemy(game, best.ref);
    else pushFx(game, { kind: 'ping', x: best.x, y: 1.4, z: best.z, life: 0.2, age: 0, power: 0.5 });
    return { hit: true, dmg, target: 'escort' };
  }
  if (!best.open) {
    pushFx(game, { kind: 'ping', x: best.x, y: best.y, z: best.z, life: 0.28, age: 0, power: 0.35 });
    return { hit: false, armored: true };
  }
  hurtPart(game, best.ref, dmg);
  refreshBossPhase(game);
  return { hit: true, dmg, target: best.ref.id };
}

function fireAir(game) {
  const p = game.player;
  const offs = [-0.95, 0.95];
  for (let i = 0; i < offs.length; i++) {
    game.shots.push({
      team: 'player', mode: 'air', kind: 'pulse', dmg: TUNE.airDmg, r: TUNE.airR, homing: 0,
      x: p.x + offs[i], y: p.y - 0.12, z: 2.3,
      vx: offs[i] * 0.35, vy: 0, vz: TUNE.airSpeed, life: TUNE.airLife
    });
  }
  pushFx(game, { kind: 'muzzle-air', x: p.x, y: p.y - 0.1, z: 2.6, life: 0.06, age: 0, power: 0.5 });
}

function fireSea(game) {
  const p = game.player;
  const vx = p.vx * 0.32;
  game.shots.push({
    team: 'player', mode: 'sea', kind: 'bomb', dmg: TUNE.seaDmg, r: 0.7, homing: 0,
    x: p.x, y: p.y - 0.35, z: TUNE.seaSpawnZ,
    vx, vy: TUNE.seaVy, vz: TUNE.seaSpeed, life: TUNE.seaLife
  });
  pushFx(game, { kind: 'muzzle-sea', x: p.x, y: p.y - 0.4, z: 1.8, life: 0.08, age: 0, power: 0.8 });
}

function updateAim(game) {
  const p = game.player;
  const impact = bombImpact(p.y, TUNE.seaVy, p.x, p.vx * 0.32);
  if (impact) game.aim = { x: impact.x, z: impact.z };
}

function updateWaveLabel(game) {
  if (game.boss) return;
  let w = WAVES[0];
  for (let i = 0; i < WAVES.length; i++) if (game.time >= WAVES[i].t) w = WAVES[i];
  if (w.id !== game.wave) {
    game.wave = w.id;
    game.waveName = w.name;
    game.banner = w.name;
    game.bannerT = 2.1;
  } else {
    game.waveName = w.name;
  }
}

function runScript(game) {
  const script = game.script || [];
  while (game.scriptIndex < script.length && script[game.scriptIndex].t <= game.time) {
    const entry = script[game.scriptIndex++];
    if (entry.kind === 'boss') spawnBoss(game);
    else spawnEnemy(game, entry);
    if (entry.banner) {
      game.banner = entry.banner;
      game.bannerT = 2.4;
    }
  }
}

function updateBoss(game, dt) {
  const b = game.boss;
  if (!b || b.dead) return;
  b.age += dt;
  if (b.z > TUNE.bossHoldZ) b.z = Math.max(TUNE.bossHoldZ, b.z + TUNE.bossApproach * dt);
  const amp = b.z <= TUNE.bossHoldZ + 0.05 ? 3.6 : 0.8;
  b.x = Math.sin(game.time * 0.42) * amp;
  for (let i = 0; i < b.parts.length; i++) {
    const p = b.parts[i];
    if (p.hp <= 0) continue;
    const armed = (p.id === 'port' || p.id === 'starboard') || (p.id === 'core' && b.phase >= 3);
    if (!armed) continue;
    p.cd -= dt;
    if (p.cd > 0 || b.z > 90) continue;
    const origin = partWorld(b, p);
    if (p.id === 'core') {
      p.cd = 1.65;
      for (let k = -1; k <= 1; k++) {
        fireEnemy(game, { x: origin.x + k * 0.2, y: origin.y + 0.4, z: origin.z - 1 }, 18, 11, 0.4, 0, 'fan');
        const last = game.shots[game.shots.length - 1];
        if (last && last.kind === 'fan') last.vx += k * 7;
      }
    } else {
      p.cd = 1.2;
      fireEnemy(game, origin, 26, 10, 1.6, 0, 'flak');
    }
  }
  if (b.phase >= 2 && game.phase === 'play') {
    b.launchCd -= dt;
    if (b.launchCd <= 0) {
      b.launchCd = b.phase === 3 ? 3.3 : 4.5;
      spawnEnemy(game, {
        kind: 'fighter',
        x: b.x + (game.rng() - 0.5) * 8,
        y: 8.5 + game.rng() * 3,
        z: Math.max(18, b.z - 12),
        hp: 30,
        vz: -24
      });
    }
  }
}

function updateEnemies(game, dt) {
  for (let i = 0; i < game.enemies.length; i++) {
    const e = game.enemies[i];
    if (!e.alive) continue;
    e.age += dt;
    e.z += e.vz * dt;
    if (e.kind === 'escort') {
      e.x = e.x0 + Math.sin(e.age * e.weaveFreq + e.weavePhase) * e.weaveAmp;
      e.y = 0;
    } else {
      e.x = e.x0 + Math.sin(e.age * e.weaveFreq + e.weavePhase) * e.weaveAmp;
      e.y = e.y0 + Math.sin(e.age * 0.85 + e.weavePhase) * 0.32;
    }
    if (e.z < TUNE.despawnZ || e.z > 150) {
      e.alive = false;
      continue;
    }
    if (e.z < 78 && e.z > 8) {
      e.cd -= dt;
      if (e.cd <= 0) {
        e.cd = e.fireEvery;
        const origin = { x: e.x, y: e.kind === 'escort' ? 1.6 : e.y, z: e.z - 0.5 };
        fireEnemy(game, origin, e.shotSpeed, e.shotDmg, e.spread, e.homing, e.kind === 'striker' ? 'missile' : 'bolt');
      }
    }
    if (e.team === 'air') {
      const d = Math.hypot(e.x - game.player.x, e.y - game.player.y, e.z);
      if (d < TUNE.ramDist) {
        hurtPlayer(game, TUNE.ramDmg);
        killEnemy(game, e);
        if (game.phase !== 'play') return;
      }
    }
  }
}

function collideAirShot(game, shot) {
  let best = null;
  let bestD = 1e9;
  for (let i = 0; i < game.enemies.length; i++) {
    const e = game.enemies[i];
    if (!e.alive || e.hitBy !== 'air') continue;
    const d = Math.hypot(e.x - shot.x, e.y - shot.y, e.z - shot.z);
    const reach = shot.r + e.r;
    if (d < reach && d < bestD) { bestD = d; best = e; }
  }
  if (best) {
    best.hp -= shot.dmg;
    shot.life = 0;
    if (best.hp <= 0) killEnemy(game, best);
    else pushFx(game, { kind: 'ping', x: shot.x, y: shot.y, z: shot.z, life: 0.16, age: 0, power: 0.45 });
    return;
  }
  const targets = seaTargets(game);
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (Math.abs(shot.z - t.z) < 1.35 && Math.hypot(shot.x - t.x, shot.z - t.z) < (t.r || 1.5) + 0.8) {
      shot.life = 0;
      pushFx(game, { kind: 'ping', x: t.x, y: Math.max(t.y, 1.5), z: t.z, life: 0.22, age: 0, power: 0.3 });
      return;
    }
  }
}

function updateShots(game, dt) {
  if (game.phase !== 'play') return;
  for (let i = 0; i < game.shots.length; i++) {
    const s = game.shots[i];
    if (s.life <= 0) continue;
    if (s.team === 'enemy') {
      const rate = game.decoy ? 2.4 : s.homing;
      if (rate > 0) steerTo(s, game.decoy || game.player, rate, dt);
    }
    if (s.kind === 'bomb') s.vy += TUNE.grav * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    s.life -= dt;
    if (s.kind === 'bomb' && s.y <= 0.85) {
      s.life = 0;
      blastSea(game, s.x, s.z);
      if (game.phase !== 'play') return;
      continue;
    }
    if (s.team === 'player' && s.mode === 'air') collideAirShot(game, s);
    if (s.team === 'enemy') {
      const d = Math.hypot(s.x - game.player.x, s.y - game.player.y, s.z - game.player.z);
      if (d < TUNE.playerR + s.r) {
        s.life = 0;
        hurtPlayer(game, s.dmg);
        if (game.phase !== 'play') return;
      }
    }
    if (s.z < -20 || s.z > 150 || s.y < -4 || s.y > 40) s.life = 0;
  }
}

function compact(list, keep) {
  let j = 0;
  for (let i = 0; i < list.length; i++) if (keep(list[i])) list[j++] = list[i];
  list.length = j;
}

export function step(game, input, dt) {
  if (!game || game.phase !== 'play') return game;
  dt = clamp(dt || 0, 0, 0.05);
  if (dt === 0) return game;
  input = input || {};
  game.time += dt;
  game.elapsed += dt;
  game.airCd -= dt;
  game.seaCd -= dt;
  game.stealthCd = Math.max(0, game.stealthCd - dt);
  game.stealthT = Math.max(0, game.stealthT - dt);
  game.invuln = Math.max(0, game.invuln - dt);
  game.bannerT = Math.max(0, game.bannerT - dt);
  game.shake = Math.max(0, game.shake - dt * 1.7);

  const p = game.player;
  const tx = clamp(input.moveX || 0, -1, 1) * TUNE.speedX;
  const ty = clamp(input.moveY || 0, -1, 1) * TUNE.speedY;
  const k = 1 - Math.exp(-10 * dt);
  p.vx += (tx - p.vx) * k;
  p.vy += (ty - p.vy) * k;
  p.x = clamp(p.x + p.vx * dt, -TUNE.boundsX, TUNE.boundsX);
  p.y = clamp(p.y + p.vy * dt, TUNE.yMin, TUNE.yMax);
  if (p.x <= -TUNE.boundsX || p.x >= TUNE.boundsX) p.vx *= 0.2;
  if (p.y <= TUNE.yMin || p.y >= TUNE.yMax) p.vy *= 0.2;
  p.bank = clamp(p.vx / TUNE.speedX, -1, 1);
  p.pitch = clamp(-p.vy / TUNE.speedY, -1, 1);

  updateAim(game);

  if (input.air && game.airCd <= 0) {
    fireAir(game);
    game.airCd = TUNE.airCd;
  }
  if (input.sea && game.seaCd <= 0) {
    fireSea(game);
    game.seaCd = TUNE.seaCd;
  }
  if (input.stealthEdge && game.stealthCd <= 0 && game.stealthT <= 0) {
    game.stealthT = TUNE.stealthTime;
    game.stealthCd = TUNE.stealthCd;
    game.decoy = { x: p.x, y: p.y, z: 1.2, vx: 11, vy: 6.5, vz: 16, life: TUNE.stealthTime };
    game.banner = '诱饵展开';
    game.bannerT = Math.max(game.bannerT, 1.1);
    pushFx(game, { kind: 'ping', x: p.x, y: p.y, z: 1, life: 0.3, age: 0, power: 0.8 });
  }
  if (game.decoy) {
    const d = game.decoy;
    d.life -= dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.z += d.vz * dt;
    if (d.life <= 0) game.decoy = null;
  }

  runScript(game);
  updateWaveLabel(game);
  updateBoss(game, dt);
  if (game.phase !== 'play') return game;
  updateEnemies(game, dt);
  if (game.phase !== 'play') return game;
  updateShots(game, dt);

  for (let i = 0; i < game.fx.length; i++) {
    game.fx[i].age += dt;
    game.fx[i].life -= dt;
  }
  compact(game.enemies, (e) => e.alive);
  compact(game.shots, (s) => s.life > 0);
  compact(game.fx, (f) => f.life > 0);
  return game;
}

export function summary(game) {
  const time = Math.round(game.elapsed * 10) / 10;
  return {
    score: game.score | 0,
    time,
    kills: game.stats.kills,
    parts: game.stats.parts,
    hp: Math.max(0, Math.ceil(game.hp)),
    win: game.phase === 'win',
    waveName: game.waveName
  };
}
