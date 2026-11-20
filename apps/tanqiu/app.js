(async function () {
  'use strict';

  var BOARD_ID_CLASSIC = 'tanqiu-classic-v1';
  var BOARD_ID_DAILY = 'tanqiu-daily-';
  var SAVE_KEY = 'tanqiu.progress.v1';
  var POLL_MS = 25000;

  // 逻辑画布尺寸与网格常量
  var W = 420;
  var H = 600;
  var COLS = 7;
  var CELL_W = W / COLS; // 60
  var CELL_H = 48;
  var TOP_OFFSET = 54;
  var BOTTOM_LINE = H - 34; // 发射基准线
  var DANGER_ROW = 9; // 第 9 行触底失败
  var BALL_R = 6.5;
  var BASE_SPEED = 560; // px/s
  var FIRE_INTERVAL = 0.068; // 秒/颗
  var PERK_EVERY = 5;

  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');

  var els = {
    modeSub: document.getElementById('modeSub'),
    modeDesc: document.getElementById('modeDesc'),
    meterWave: document.getElementById('meterWave'),
    meterScore: document.getElementById('meterScore'),
    meterBalls: document.getElementById('meterBalls'),
    btnSound: document.getElementById('btnSound'),
    hint: document.getElementById('hint'),
    btnSpeed: document.getElementById('btnSpeed'),
    btnRecall: document.getElementById('btnRecall'),
    btnClassic: document.getElementById('btnClassic'),
    btnDaily: document.getElementById('btnDaily'),
    btnRestart: document.getElementById('btnRestart'),
    btnTutorial: document.getElementById('btnTutorial'),
    btnSubmit: document.getElementById('btnSubmit'),
    btnAutoSubmit: document.getElementById('btnAutoSubmit'),
    btnRefreshBoard: document.getElementById('btnRefreshBoard'),
    buildTags: document.getElementById('buildTags'),
    boardList: document.getElementById('boardList'),
    boardMeta: document.getElementById('boardMeta'),
    boardMine: document.getElementById('boardMine'),
    perkOverlay: document.getElementById('perkOverlay'),
    perkWaveNum: document.getElementById('perkWaveNum'),
    perkList: document.getElementById('perkList'),
    overOverlay: document.getElementById('overOverlay'),
    overSummary: document.getElementById('overSummary'),
    btnOverSubmit: document.getElementById('btnOverSubmit'),
    btnOverRestart: document.getElementById('btnOverRestart')
  };

  // --- SDK 兼容层（支持一起玩平台 & 本地无 SDK 时降级） ---
  var hasSdk = !!window.Yiqiwan;
  var platformMuted = false;
  var sdk = hasSdk ? window.Yiqiwan : {
    ready: function () { return Promise.resolve({ theme: 'dark' }); },
    on: function () {},
    storage: {
      get: function (k) {
        try { return Promise.resolve(JSON.parse(localStorage.getItem(k) || 'null')); }
        catch (_) { return Promise.resolve(null); }
      },
      set: function (k, v) {
        try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {}
        return Promise.resolve();
      }
    },
    scores: {
      me: function () { return Promise.resolve({ loggedIn: false }); },
      list: function () { return Promise.reject(new Error('offline')); },
      submit: function () { return Promise.reject(new Error('offline')); }
    },
    ui: {
      showTutorial: function () { return Promise.reject(new Error('offline')); }
    }
  };

  // --- 轻量合成音效（五声音阶，零外部资源） ---
  var audioCtx = null;
  var soundOn = true;
  var PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.5];
  var comboTone = 0;

  function ensureAudio() {
    // 平台「静音进入」时禁止创建/恢复 AudioContext（官方文档强制要求）
    if (!soundOn || platformMuted) return null;
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(function () {});
    }
    return audioCtx;
  }

  function stopAudioNow() {
    if (audioCtx && audioCtx.state === 'running') {
      audioCtx.suspend().catch(function () {});
    }
  }

  async function applyPlatformSoundPref(context) {
    var pref = null;
    try {
      if (sdk.audio && typeof sdk.audio.getPreference === 'function') {
        pref = await sdk.audio.getPreference();
      } else if (context && context.sound) {
        pref = context.sound;
      }
    } catch (_) {}
    platformMuted = pref === 'muted';
    if (platformMuted) {
      soundOn = false;
      stopAudioNow();
    }
  }

  function playTone(freq, dur, type, vol) {
    var ac = ensureAudio();
    if (!ac) return;
    try {
      var osc = ac.createOscillator();
      var gain = ac.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      gain.gain.setValueAtTime(vol || 0.06, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0008, ac.currentTime + dur);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + dur);
    } catch (_) {}
  }

  function sfxHit(isCrit) {
    var idx = Math.min(PENTA.length - 1, comboTone % PENTA.length);
    comboTone += 1;
    playTone(PENTA[idx] * (isCrit ? 1.5 : 1), isCrit ? 0.09 : 0.055, isCrit ? 'triangle' : 'sine', isCrit ? 0.08 : 0.045);
  }

  function sfxBreak() {
    playTone(987.77, 0.09, 'triangle', 0.06);
  }

  function sfxPickup() {
    playTone(659.25, 0.07, 'sine', 0.06);
    setTimeout(function () { playTone(987.77, 0.1, 'sine', 0.06); }, 55);
  }

  function sfxPerk() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      setTimeout(function () { playTone(f, 0.14, 'triangle', 0.06); }, i * 65);
    });
  }

  function sfxOver() {
    playTone(220, 0.28, 'sawtooth', 0.06);
    setTimeout(function () { playTone(165, 0.35, 'sawtooth', 0.05); }, 140);
  }

  // --- 随机与日期工具 ---
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function hashString(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // --- 肉鸽词条库 ---
  var PERK_POOL = [
    {
      id: 'ammo',
      icon: '🟢',
      name: '弹药扩容',
      desc: '立刻增加 3 颗永久弹珠，火力瞬间拉满。',
      apply: function () {
        state.ballCount += 3;
        addBuildTag('弹药+3');
      }
    },
    {
      id: 'power',
      icon: '🔥',
      name: '高能弹芯',
      desc: '所有弹珠基础伤害 +1（当前每击 ' + 'DMG' + ' 点）。',
      apply: function () {
        state.mods.damage += 1;
        addBuildTag('伤害+' + (state.mods.damage - 1), 'power');
      }
    },
    {
      id: 'crit',
      icon: '⚡',
      name: '雷霆暴击',
      desc: '暴击率 +20%，触发时造成双倍伤害与闪光。',
      apply: function () {
        state.mods.critChance = Math.min(0.85, state.mods.critChance + 0.2);
        addBuildTag('暴击 ' + Math.round(state.mods.critChance * 100) + '%', 'crit');
      }
    },
    {
      id: 'blast',
      icon: '💥',
      name: '爆裂弹头',
      desc: '撞击有概率引发范围溅射，对邻近砖块造成额外伤害。',
      apply: function () {
        state.mods.blastChance = Math.min(0.75, state.mods.blastChance + 0.22);
        state.mods.blastDmg += 1;
        addBuildTag('爆裂 Lv.' + state.mods.blastDmg, 'blast');
      }
    },
    {
      id: 'split',
      icon: '🪩',
      name: '镜像折射',
      desc: '弹珠撞壁反弹时有概率分裂出临时幻影球。',
      apply: function () {
        state.mods.splitChance = Math.min(0.45, state.mods.splitChance + 0.14);
        addBuildTag('分裂 ' + Math.round(state.mods.splitChance * 100) + '%', 'split');
      }
    },
    {
      id: 'laser',
      icon: '🔦',
      name: '贯穿光束',
      desc: '每回合开火时附带一道穿透激光，灼烧路径上所有砖块。',
      apply: function () {
        state.mods.laserDmg += 4;
        addBuildTag('激光 ' + state.mods.laserDmg, 'laser');
      }
    },
    {
      id: 'freeze',
      icon: '❄️',
      name: '极寒缓降',
      desc: '冻结砖块 1 回合不下落，且全场砖块血量立减 20%。',
      apply: function () {
        state.mods.freezeTurns += 1;
        state.bricks.forEach(function (b) {
          b.hp = Math.max(1, Math.floor(b.hp * 0.8));
          b.flash = 0.25;
        });
        spawnFloatText(W / 2, H * 0.42, '全场冻结 -20% HP', '#7ae6ff');
        addBuildTag('极寒触发');
      }
    },
    {
      id: 'purge',
      icon: '🧹',
      name: '底线清扫',
      desc: '立刻摧毁最靠近底线的一整排砖块，绝境翻盘！',
      apply: function () {
        if (!state.bricks.length) return;
        var maxRow = 0;
        state.bricks.forEach(function (b) { if (b.row > maxRow) maxRow = b.row; });
        var kept = [];
        var cleared = 0;
        state.bricks.forEach(function (b) {
          if (b.row === maxRow) {
            cleared += 1;
            state.score += b.hp * 2;
            spawnBurst(b.x + b.w / 2, b.y + b.h / 2, '#ff8a6a', 10);
          } else {
            kept.push(b);
          }
        });
        state.bricks = kept;
        if (cleared) sfxBreak();
        spawnFloatText(W / 2, TOP_OFFSET + maxRow * CELL_H, '底线清扫！', '#ffd166');
        addBuildTag('清底救急');
      }
    }
  ];

  // --- 游戏状态 ---
  var mode = 'classic'; // 'classic' | 'daily'
  var autoSubmit = false;
  var rng = Math.random;
  var progress = {
    bestClassic: 0,
    bestDaily: {},
    settings: { soundOn: true, autoSubmit: false }
  };

  var state = {};
  var buildTagMap = {};
  var buildTagList = [];

  var isAiming = false;
  var aimAngle = -Math.PI / 2;
  var paused = false;
  var lastTs = 0;
  var pollTimer = 0;
  var dpr = 1;
  var viewScale = 1;

  function addBuildTag(text, key) {
    if (key) {
      buildTagMap[key] = text;
    } else {
      buildTagList.push(text);
    }
    renderBuildTags();
  }

  function renderBuildTags() {
    els.buildTags.innerHTML = '';
    var items = [];
    Object.keys(buildTagMap).forEach(function (k) { items.push(buildTagMap[k]); });
    buildTagList.forEach(function (t) { items.push(t); });
    if (!items.length) {
      var sp = document.createElement('span');
      sp.className = 'empty-tag';
      sp.textContent = '第 ' + PERK_EVERY + ' 回合解锁首项强化';
      els.buildTags.appendChild(sp);
      return;
    }
    items.forEach(function (t) {
      var tag = document.createElement('span');
      tag.className = 'build-tag';
      tag.textContent = t;
      els.buildTags.appendChild(tag);
    });
  }

  function initGame() {
    if (mode === 'daily') {
      rng = mulberry32(hashString('tanqiu-daily-' + todayKey()));
    } else {
      rng = mulberry32((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    }

    buildTagMap = {};
    buildTagList = [];
    renderBuildTags();

    state = {
      phase: 'aim', // 'aim' | 'shoot' | 'perk' | 'over'
      wave: 1,
      score: 0,
      ballCount: 1,
      pendingAddBalls: 0,
      launchX: W / 2,
      nextLaunchX: null,
      balls: [],
      toFire: 0,
      fireCooldown: 0,
      fireAngle: -Math.PI / 2,
      shootElapsed: 0,
      speedMult: 1,
      bricks: [],
      pickups: [],
      particles: [],
      floats: [],
      lasers: [],
      submitted: false,
      mods: {
        damage: 1,
        critChance: 0,
        blastChance: 0,
        blastDmg: 0,
        splitChance: 0,
        laserDmg: 0,
        freezeTurns: 0
      }
    };

    els.perkOverlay.classList.add('hidden');
    els.overOverlay.classList.add('hidden');
    els.btnSubmit.disabled = true;
    els.btnSpeed.classList.add('hidden');
    els.btnSpeed.classList.remove('active');
    els.btnRecall.classList.add('hidden');

    spawnRow();
    updateHud();
    els.hint.textContent = '在盘面按住拖动瞄准，松手发射';
  }

  function brickRect(col, row) {
    var gap = 4;
    return {
      x: col * CELL_W + gap,
      y: TOP_OFFSET + row * CELL_H + gap,
      w: CELL_W - gap * 2,
      h: CELL_H - gap * 2
    };
  }

  function spawnRow() {
    var wave = state.wave;
    // 选一列放 +1 弹珠
    var pickupCol = Math.floor(rng() * COLS);
    var placedBricks = 0;

    for (var c = 0; c < COLS; c++) {
      if (c === pickupCol) {
        state.pickups.push({
          col: c,
          row: 0,
          x: c * CELL_W + CELL_W / 2,
          y: TOP_OFFSET + CELL_H / 2,
          r: 10
        });
        continue;
      }
      // 随波次提高生成密度
      var prob = Math.min(0.76, 0.42 + wave * 0.012);
      if (rng() < prob) {
        var isTough = wave >= 4 && rng() < 0.16;
        var baseHp = wave + Math.floor(wave * wave * 0.04);
        var hp = isTough ? Math.round(baseHp * 1.8) : baseHp;
        var rect = brickRect(c, 0);
        state.bricks.push({
          col: c,
          row: 0,
          x: rect.x,
          y: rect.y,
          w: rect.w,
          h: rect.h,
          hp: Math.max(1, hp),
          maxHp: Math.max(1, hp),
          tough: isTough,
          flash: 0
        });
        placedBricks += 1;
      }
    }

    // 保底至少 2 块砖
    if (placedBricks < 2) {
      for (var k = 0; k < COLS && placedBricks < 2; k++) {
        if (k === pickupCol) continue;
        var exists = state.bricks.some(function (b) { return b.row === 0 && b.col === k; });
        if (!exists) {
          var r2 = brickRect(k, 0);
          state.bricks.push({
            col: k, row: 0, x: r2.x, y: r2.y, w: r2.w, h: r2.h,
            hp: Math.max(1, wave), maxHp: Math.max(1, wave), tough: false, flash: 0
          });
          placedBricks += 1;
        }
      }
    }
  }

  function advanceTurn() {
    state.ballCount += state.pendingAddBalls;
    state.pendingAddBalls = 0;
    if (state.nextLaunchX !== null) {
      state.launchX = Math.max(24, Math.min(W - 24, state.nextLaunchX));
      state.nextLaunchX = null;
    }
    state.wave += 1;
    state.speedMult = 1;
    els.btnSpeed.classList.add('hidden');
    els.btnSpeed.classList.remove('active');
    els.btnRecall.classList.add('hidden');

    // 检查是否冻结不下落
    if (state.mods.freezeTurns > 0) {
      state.mods.freezeTurns -= 1;
      spawnFloatText(W / 2, TOP_OFFSET + 20, '冰冻生效：砖块未下移', '#7ae6ff');
    } else {
      var over = false;
      state.bricks.forEach(function (b) {
        b.row += 1;
        b.y = TOP_OFFSET + b.row * CELL_H + 4;
        if (b.row >= DANGER_ROW) over = true;
      });
      state.pickups = state.pickups.filter(function (p) {
        p.row += 1;
        p.y = TOP_OFFSET + p.row * CELL_H + CELL_H / 2;
        return p.row < DANGER_ROW;
      });
      if (over) {
        triggerGameOver();
        return;
      }
      spawnRow();
    }

    // 清空全场额外奖励分
    if (state.bricks.length === 0) {
      state.score += state.wave * 20;
      spawnFloatText(W / 2, H * 0.45, '全清奖励 +' + (state.wave * 20), '#ffd166');
    }

    updateHud();

    // 每 PERK_EVERY 回合弹出肉鸽三选一
    if (state.wave > 1 && (state.wave - 1) % PERK_EVERY === 0) {
      openPerkChoice();
    } else {
      state.phase = 'aim';
      els.hint.textContent = '第 ' + state.wave + ' 关 · 拖动瞄准发射';
    }
  }

  function openPerkChoice() {
    state.phase = 'perk';
    sfxPerk();
    els.perkWaveNum.textContent = String(state.wave - 1);
    els.perkList.innerHTML = '';

    // 用当前种子随机抽取 3 个不重复词条
    var pool = PERK_POOL.slice();
    var picks = [];
    while (picks.length < 3 && pool.length > 0) {
      var idx = Math.floor(rng() * pool.length);
      picks.push(pool.splice(idx, 1)[0]);
    }

    picks.forEach(function (perk) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'perk-btn';
      var desc = perk.desc.replace('DMG', String(state.mods.damage));
      btn.innerHTML =
        '<span class="perk-icon">' + perk.icon + '</span>' +
        '<span class="perk-name">' + perk.name + '</span>' +
        '<span class="perk-desc">' + desc + '</span>';
      btn.addEventListener('click', function () {
        perk.apply();
        els.perkOverlay.classList.add('hidden');
        state.phase = 'aim';
        updateHud();
        els.hint.textContent = '已装备「' + perk.name + '」，继续进攻！';
      });
      els.perkList.appendChild(btn);
    });

    els.perkOverlay.classList.remove('hidden');
  }

  function triggerGameOver() {
    state.phase = 'over';
    sfxOver();
    saveLocalBest();
    els.btnSubmit.disabled = false;
    els.btnOverSubmit.disabled = false;
    els.overSummary.textContent =
      (mode === 'daily' ? '每日同种 ' + todayKey() : '经典无尽') +
      ' · 坚持到第 ' + state.wave + ' 关 · 总分 ' + state.score + ' · 最终弹珠 ' + state.ballCount + ' 颗';
    els.overOverlay.classList.remove('hidden');
    els.hint.textContent = '砖块突破底线，游戏结束';
    refreshBoard();
    if (autoSubmit) {
      submitScore({ auto: true });
    }
  }

  // --- 发射与物理更新 ---
  function fireVolley(angle) {
    if (state.phase !== 'aim') return;
    ensureAudio();
    comboTone = 0;
    state.phase = 'shoot';
    state.fireAngle = angle;
    state.toFire = state.ballCount;
    state.fireCooldown = 0;
    state.shootElapsed = 0;
    state.nextLaunchX = null;
    els.hint.textContent = '连射中… 可随时点击右侧加速或收球';

    // 如果有贯穿激光强化，开火瞬间射出一道贯穿光束
    if (state.mods.laserDmg > 0) {
      fireLaserBeam(state.launchX, BOTTOM_LINE, angle, state.mods.laserDmg);
    }
  }

  function fireLaserBeam(x0, y0, angle, dmg) {
    var dx = Math.cos(angle);
    var dy = Math.sin(angle);
    // 计算射线终点（碰到边界）
    var tMin = 2000;
    if (dx < -1e-5) tMin = Math.min(tMin, (0 - x0) / dx);
    if (dx > 1e-5) tMin = Math.min(tMin, (W - x0) / dx);
    if (dy < -1e-5) tMin = Math.min(tMin, (0 - y0) / dy);
    var x1 = x0 + dx * tMin;
    var y1 = y0 + dy * tMin;
    state.lasers.push({ x0: x0, y0: y0, x1: x1, y1: y1, life: 0.28 });

    // 检测路径上的砖块
    for (var i = state.bricks.length - 1; i >= 0; i--) {
      var b = state.bricks[i];
      if (segmentIntersectsRect(x0, y0, x1, y1, b)) {
        damageBrick(b, dmg, false, false);
      }
    }
    cleanupBricks();
  }

  function segmentIntersectsRect(x0, y0, x1, y1, r) {
    // 采样检测足够精确且极快
    var steps = 36;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var px = x0 + (x1 - x0) * t;
      var py = y0 + (y1 - y0) * t;
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return true;
    }
    return false;
  }

  function damageBrick(b, dmg, isCrit, allowBlast) {
    if (b.hp <= 0) return;
    var actual = Math.min(b.hp, dmg);
    b.hp -= dmg;
    b.flash = 0.14;
    state.score += actual;

    if (isCrit) {
      spawnFloatText(b.x + b.w / 2, b.y + 8, '-' + dmg + '!', '#ffe066');
    }

    if (allowBlast && state.mods.blastDmg > 0 && rng() < state.mods.blastChance) {
      var cx = b.x + b.w / 2;
      var cy = b.y + b.h / 2;
      spawnBurst(cx, cy, '#ff9f43', 8);
      state.bricks.forEach(function (other) {
        if (other === b || other.hp <= 0) return;
        var ox = other.x + other.w / 2;
        var oy = other.y + other.h / 2;
        var dist = Math.hypot(ox - cx, oy - cy);
        if (dist <= CELL_W * 1.45) {
          damageBrick(other, state.mods.blastDmg, false, false);
        }
      });
    }

    if (b.hp <= 0) {
      sfxBreak();
      spawnBurst(b.x + b.w / 2, b.y + b.h / 2, brickColor(b.maxHp), 10);
    }
  }

  function cleanupBricks() {
    state.bricks = state.bricks.filter(function (b) { return b.hp > 0; });
  }

  function spawnBurst(x, y, color, count) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 50 + Math.random() * 140;
      state.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: 2 + Math.random() * 2.5,
        color: color,
        life: 0.32 + Math.random() * 0.2
      });
    }
  }

  function spawnFloatText(x, y, text, color) {
    state.floats.push({ x: x, y: y, text: text, color: color || '#ffffff', life: 0.7 });
  }

  function stepPhysics(dt) {
    // 粒子与飘字动画
    state.particles.forEach(function (p) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 180 * dt;
      p.life -= dt;
    });
    state.particles = state.particles.filter(function (p) { return p.life > 0; });

    state.floats.forEach(function (f) {
      f.y -= 34 * dt;
      f.life -= dt;
    });
    state.floats = state.floats.filter(function (f) { return f.life > 0; });

    state.lasers.forEach(function (l) { l.life -= dt; });
    state.lasers = state.lasers.filter(function (l) { return l.life > 0; });

    state.bricks.forEach(function (b) {
      if (b.flash > 0) b.flash = Math.max(0, b.flash - dt);
    });

    if (state.phase !== 'shoot') return;

    var simDt = dt * state.speedMult;
    state.shootElapsed += dt;

    if (state.shootElapsed > 1.4 && els.btnSpeed.classList.contains('hidden')) {
      els.btnSpeed.classList.remove('hidden');
      els.btnRecall.classList.remove('hidden');
    }

    // 依次发射弹珠
    if (state.toFire > 0) {
      state.fireCooldown -= simDt;
      while (state.toFire > 0 && state.fireCooldown <= 0) {
        state.balls.push({
          x: state.launchX,
          y: BOTTOM_LINE,
          vx: Math.cos(state.fireAngle) * BASE_SPEED,
          vy: Math.sin(state.fireAngle) * BASE_SPEED,
          phantom: false,
          wallHits: 0
        });
        state.toFire -= 1;
        state.fireCooldown += FIRE_INTERVAL;
      }
    }

    // 子步进防穿模
    var subSteps = 4;
    var stepDt = simDt / subSteps;
    var newPhantoms = [];

    for (var s = 0; s < subSteps; s++) {
      for (var i = state.balls.length - 1; i >= 0; i--) {
        var ball = state.balls[i];
        ball.x += ball.vx * stepDt;
        ball.y += ball.vy * stepDt;

        // 墙壁碰撞
        var hitWall = false;
        if (ball.x - BALL_R < 0) {
          ball.x = BALL_R;
          ball.vx = Math.abs(ball.vx);
          hitWall = true;
        } else if (ball.x + BALL_R > W) {
          ball.x = W - BALL_R;
          ball.vx = -Math.abs(ball.vx);
          hitWall = true;
        }
        if (ball.y - BALL_R < 0) {
          ball.y = BALL_R;
          ball.vy = Math.abs(ball.vy);
          hitWall = true;
        }

        if (hitWall) {
          // 防止水平死循环 / 速度崩坏
          if (Math.abs(ball.vy) < 42) {
            ball.vy = ball.vy >= 0 ? 55 : -55;
          }
          var mag = Math.hypot(ball.vx, ball.vy);
          if (!mag || !isFinite(mag)) {
            ball.vx = 0;
            ball.vy = BASE_SPEED;
            mag = BASE_SPEED;
          }
          ball.vx = (ball.vx / mag) * BASE_SPEED;
          ball.vy = (ball.vy / mag) * BASE_SPEED;
          // 镜像折射词条：撞墙概率分裂临时球
          if (!ball.phantom && state.mods.splitChance > 0 && state.balls.length + newPhantoms.length < 90) {
            ball.wallHits += 1;
            if (ball.wallHits % 2 === 0 && rng() < state.mods.splitChance) {
              var spread = (rng() - 0.5) * 0.45;
              var ang = Math.atan2(ball.vy, ball.vx) + spread;
              newPhantoms.push({
                x: ball.x, y: ball.y,
                vx: Math.cos(ang) * BASE_SPEED,
                vy: Math.sin(ang) * BASE_SPEED,
                phantom: true,
                wallHits: 0
              });
            }
          }
        }

        // 落地回收：到发射线即接住（含越界兜底，避免球掉出盘面）
        if ((ball.y >= BOTTOM_LINE && ball.vy >= 0) || ball.y > H - BALL_R) {
          catchBallAtFloor(ball, i);
          continue;
        }

        // 拾取加球道具（扫掠检测，避免高速穿模接不住）
        for (var p = state.pickups.length - 1; p >= 0; p--) {
          var pk = state.pickups[p];
          if (ballHitsPickup(ball, pk, stepDt)) {
            state.pendingAddBalls += 1;
            sfxPickup();
            spawnFloatText(pk.x, pk.y, '+1 弹珠', '#52e5a8');
            state.pickups.splice(p, 1);
          }
        }

        // 砖块碰撞（圆与AABB）
        for (var j = 0; j < state.bricks.length; j++) {
          var b = state.bricks[j];
          if (b.hp <= 0) continue;
          var cx = Math.max(b.x, Math.min(ball.x, b.x + b.w));
          var cy = Math.max(b.y, Math.min(ball.y, b.y + b.h));
          var dx = ball.x - cx;
          var dy = ball.y - cy;
          if (dx * dx + dy * dy <= BALL_R * BALL_R) {
            // 判断反弹轴向
            var overlapLeft = (ball.x + BALL_R) - b.x;
            var overlapRight = (b.x + b.w) - (ball.x - BALL_R);
            var overlapTop = (ball.y + BALL_R) - b.y;
            var overlapBottom = (b.y + b.h) - (ball.y - BALL_R);
            var minOverlapX = Math.min(overlapLeft, overlapRight);
            var minOverlapY = Math.min(overlapTop, overlapBottom);

            if (minOverlapX < minOverlapY) {
              ball.vx = -ball.vx;
              ball.x += overlapLeft < overlapRight ? -minOverlapX : minOverlapX;
            } else {
              ball.vy = -ball.vy;
              ball.y += overlapTop < overlapBottom ? -minOverlapY : minOverlapY;
            }

            var isCrit = state.mods.critChance > 0 && rng() < state.mods.critChance;
            var dmg = state.mods.damage * (isCrit ? 2 : 1);
            sfxHit(isCrit);
            damageBrick(b, dmg, isCrit, true);
            break;
          }
        }
      }
      if (newPhantoms.length) {
        state.balls = state.balls.concat(newPhantoms);
        newPhantoms = [];
      }
      cleanupBricks();
    }

    updateHud();

    // 卡球兜底：超时自动收球，避免永远接不回来
    if (state.toFire <= 0 && state.balls.length > 0 && state.shootElapsed > 18) {
      state.balls.forEach(function (b) {
        if (!b.phantom && state.nextLaunchX === null) state.nextLaunchX = b.x;
      });
      state.balls = [];
      els.hint.textContent = '弹珠超时自动回收';
    }

    // 所有球落地，进入下一回合
    if (state.toFire <= 0 && state.balls.length === 0) {
      advanceTurn();
    }
  }

  function catchBallAtFloor(ball, index) {
    var x = Math.max(BALL_R, Math.min(W - BALL_R, ball.x));
    if (!ball.phantom && state.nextLaunchX === null) {
      state.nextLaunchX = x;
    }
    // 接到的球短暂停在底线，下一帧绘制前已移除；先吸附到发射线避免“掉出界”
    ball.y = BOTTOM_LINE;
    ball.x = x;
    ball.vx = 0;
    ball.vy = 0;
    state.balls.splice(index, 1);
  }

  function ballHitsPickup(ball, pk, stepDt) {
    var hitR = BALL_R + pk.r + 3;
    var dNow = Math.hypot(ball.x - pk.x, ball.y - pk.y);
    if (dNow <= hitR) return true;
    // 回溯半步，覆盖高速穿过绿环的情况
    var px = ball.x - ball.vx * stepDt;
    var py = ball.y - ball.vy * stepDt;
    var dx = ball.x - px;
    var dy = ball.y - py;
    var len2 = dx * dx + dy * dy;
    if (len2 < 1e-6) return false;
    var t = ((pk.x - px) * dx + (pk.y - py) * dy) / len2;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    var cx = px + dx * t;
    var cy = py + dy * t;
    return Math.hypot(cx - pk.x, cy - pk.y) <= hitR;
  }

  // --- 绘制 ---
  function brickColor(hp) {
    if (hp <= 4) return '#2fa88e';
    if (hp <= 12) return '#3b8ec2';
    if (hp <= 25) return '#e08e36';
    if (hp <= 50) return '#d9534f';
    return '#9b59b6';
  }

  function drawRoundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawAimPreview() {
    if (state.phase !== 'aim' || !isAiming) return;
    var x = state.launchX;
    var y = BOTTOM_LINE;
    var dx = Math.cos(aimAngle);
    var dy = Math.sin(aimAngle);

    // 追踪一段带墙壁一次反射的虚线
    var pts = [{ x: x, y: y }];
    var remaining = 440;
    for (var bounce = 0; bounce < 2 && remaining > 0; bounce++) {
      var tHit = remaining;
      var hitX = false;
      var hitY = false;
      if (dx < -1e-5) {
        var tl = (BALL_R - x) / dx;
        if (tl > 0 && tl < tHit) { tHit = tl; hitX = true; hitY = false; }
      } else if (dx > 1e-5) {
        var tr = (W - BALL_R - x) / dx;
        if (tr > 0 && tr < tHit) { tHit = tr; hitX = true; hitY = false; }
      }
      if (dy < -1e-5) {
        var tt = (BALL_R - y) / dy;
        if (tt > 0 && tt < tHit) { tHit = tt; hitX = false; hitY = true; }
      }
      x += dx * tHit;
      y += dy * tHit;
      pts.push({ x: x, y: y });
      remaining -= tHit;
      if (hitX) dx = -dx;
      else if (hitY) dy = -dy;
      else break;
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = 'rgba(61, 184, 173, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 7]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function draw() {
    var dark = document.documentElement.dataset.theme === 'dark';

    // 背景
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    if (dark) {
      bg.addColorStop(0, '#141f24');
      bg.addColorStop(1, '#0d1418');
    } else {
      bg.addColorStop(0, '#f3f8f7');
      bg.addColorStop(1, '#e1eeec');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 淡网格参考线
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.035)' : 'rgba(29,42,46,0.05)';
    ctx.lineWidth = 1;
    for (var c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL_W, 0);
      ctx.lineTo(c * CELL_W, BOTTOM_LINE);
      ctx.stroke();
    }

    // 警戒底线
    var dangerY = TOP_OFFSET + DANGER_ROW * CELL_H;
    ctx.save();
    ctx.strokeStyle = 'rgba(220, 75, 75, 0.35)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(8, dangerY);
    ctx.lineTo(W - 8, dangerY);
    ctx.stroke();
    ctx.restore();

    // 激光效果
    state.lasers.forEach(function (l) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, l.life / 0.28);
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(l.x0, l.y0);
      ctx.lineTo(l.x1, l.y1);
      ctx.stroke();
      ctx.strokeStyle = '#fff5f5';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    });

    // 砖块
    state.bricks.forEach(function (b) {
      ctx.save();
      var col = b.flash > 0 ? '#ffffff' : brickColor(b.hp);
      drawRoundedRect(b.x, b.y, b.w, b.h, 8);
      ctx.fillStyle = col;
      ctx.fill();

      if (b.tough && b.flash <= 0) {
        ctx.strokeStyle = 'rgba(255, 224, 102, 0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // 砖块数字
      ctx.fillStyle = b.flash > 0 ? '#1d2a2e' : '#ffffff';
      ctx.font = '700 16px "Avenir Next", "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(b.hp), b.x + b.w / 2, b.y + b.h / 2 + 1);
      ctx.restore();
    });

    // 加球道具
    var pulse = 1 + Math.sin(performance.now() * 0.006) * 0.14;
    state.pickups.forEach(function (pk) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(pk.x, pk.y, pk.r * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = '#2ecc71';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(pk.x, pk.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#52e5a8';
      ctx.fill();
      ctx.restore();
    });

    // 瞄准线
    drawAimPreview();

    // 发射点底座
    ctx.save();
    ctx.beginPath();
    ctx.arc(state.launchX, BOTTOM_LINE, BALL_R + 2, 0, Math.PI * 2);
    ctx.fillStyle = dark ? '#5cd4c8' : '#1f8f86';
    ctx.fill();
    if (state.phase === 'aim') {
      ctx.fillStyle = dark ? '#d5ecee' : '#1d2a2e';
      ctx.font = '600 12px "Avenir Next", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('x' + state.ballCount, state.launchX, BOTTOM_LINE + 21);
    }
    ctx.restore();

    // 飞行中的弹珠
    state.balls.forEach(function (ball) {
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
      ctx.fillStyle = ball.phantom ? '#74d7ff' : (dark ? '#f7fffd' : '#1d2a2e');
      ctx.fill();
    });

    // 粒子
    state.particles.forEach(function (p) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 飘字
    state.floats.forEach(function (f) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.life / 0.7);
      ctx.fillStyle = f.color;
      ctx.font = '700 13px "Avenir Next", "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    });
  }

  function loop(ts) {
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.035, (ts - lastTs) / 1000);
    lastTs = ts;
    if (!paused) {
      stepPhysics(dt);
      draw();
    }
    requestAnimationFrame(loop);
  }

  // --- 画布自适应布局 ---
  function layoutCanvas() {
    var wrap = canvas.parentElement;
    var rect = wrap.getBoundingClientRect();
    var scale = Math.min(rect.width / W, rect.height / H);
    scale = Math.max(0.4, scale);
    viewScale = scale;
    var cssW = Math.floor(W * scale);
    var cssH = Math.floor(H * scale);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  }

  // --- 输入交互（支持直接瞄准） ---
  function pointerToLogical(ev) {
    var rect = canvas.getBoundingClientRect();
    // 用实际 CSS 尺寸换算，避免 viewScale 与取整后的宽高漂移导致瞄不准/接不住
    return {
      x: (ev.clientX - rect.left) * (W / Math.max(1, rect.width)),
      y: (ev.clientY - rect.top) * (H / Math.max(1, rect.height))
    };
  }

  function updateAimFromPoint(p) {
    var dx = p.x - state.launchX;
    var dy = p.y - BOTTOM_LINE;
    // 如果向下拉，自动镜像为向上弹弓方向，兼顾两种手势习惯
    if (dy > 12) {
      dx = -dx;
      dy = -dy;
    }
    var ang = Math.atan2(dy, dx);
    // 限制在 [-170°, -10°] 之间
    var minA = -Math.PI + 0.17;
    var maxA = -0.17;
    if (ang > 0) ang = dx < 0 ? minA : maxA;
    aimAngle = Math.max(minA, Math.min(maxA, ang));
  }

  canvas.addEventListener('pointerdown', function (ev) {
    if (ev.button || state.phase !== 'aim') return;
    canvas.setPointerCapture(ev.pointerId);
    ensureAudio();
    isAiming = true;
    updateAimFromPoint(pointerToLogical(ev));
  });

  canvas.addEventListener('pointermove', function (ev) {
    if (!isAiming || state.phase !== 'aim') return;
    updateAimFromPoint(pointerToLogical(ev));
  });

  function finishAim() {
    if (!isAiming) return;
    isAiming = false;
    if (state.phase === 'aim') {
      fireVolley(aimAngle);
    }
  }

  canvas.addEventListener('pointerup', finishAim);
  // 部分 WebView 松手走 cancel 不走 up，当作发射，否则球发出去后状态错乱
  canvas.addEventListener('pointercancel', finishAim);

  // --- HUD 与存档 / 排行榜 ---
  function updateHud() {
    els.meterWave.textContent = '第 ' + state.wave + ' 关';
    els.meterScore.textContent = '得分 ' + state.score;
    els.meterBalls.textContent = '弹珠 ' + state.ballCount;
    els.btnClassic.classList.toggle('active', mode === 'classic');
    els.btnDaily.classList.toggle('active', mode === 'daily');
    els.modeSub.textContent = mode === 'daily'
      ? ('每日同种 · ' + todayKey())
      : '经典无尽 · 肉鸽弹球';
    els.modeDesc.textContent = mode === 'daily'
      ? '今日全服同种子：砖块与强化选项完全一致。'
      : '自由冲分，每 5 回合三选一构筑强化。';
    if (platformMuted) {
      els.btnSound.textContent = '🔇 平台静音';
      els.btnSound.setAttribute('aria-pressed', 'false');
      els.btnSound.title = '本次为静音进入；需重新打开应用并选择「开启声音」';
    } else {
      els.btnSound.textContent = soundOn ? '🔊 音效' : '🔇 静音';
      els.btnSound.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
      els.btnSound.title = '音效开关';
    }
    els.btnAutoSubmit.classList.toggle('active', autoSubmit);
    els.btnAutoSubmit.setAttribute('aria-pressed', autoSubmit ? 'true' : 'false');
  }

  function currentBoardId() {
    return mode === 'daily' ? (BOARD_ID_DAILY + todayKey()) : BOARD_ID_CLASSIC;
  }

  function saveLocalBest() {
    if (mode === 'daily') {
      var k = todayKey();
      if (!progress.bestDaily[k] || state.score > progress.bestDaily[k]) {
        progress.bestDaily[k] = state.score;
      }
    } else {
      if (state.score > (progress.bestClassic || 0)) {
        progress.bestClassic = state.score;
      }
    }
    persistProgress();
  }

  async function persistProgress() {
    progress.settings = { soundOn: soundOn, autoSubmit: autoSubmit };
    try { await sdk.storage.set(SAVE_KEY, progress); } catch (_) {}
  }

  async function loadProgress() {
    try {
      var saved = await sdk.storage.get(SAVE_KEY);
      if (!saved || typeof saved !== 'object') return;
      progress.bestClassic = Number(saved.bestClassic) || 0;
      progress.bestDaily = saved.bestDaily || {};
      if (saved.settings) {
        soundOn = saved.settings.soundOn !== false;
        autoSubmit = !!saved.settings.autoSubmit;
      }
    } catch (_) {}
  }

  function renderBoard(items, mineLabel) {
    els.boardList.innerHTML = '';
    if (!items || !items.length) {
      var li = document.createElement('li');
      li.textContent = '暂无成绩';
      li.style.gridTemplateColumns = '1fr';
      els.boardList.appendChild(li);
      els.boardMine.textContent = mineLabel || '';
      return;
    }
    items.forEach(function (row) {
      var li = document.createElement('li');
      if (row.isMe) li.className = 'me';
      li.innerHTML =
        '<span>#' + row.rank + '</span>' +
        '<span>' + escapeHtml(row.displayName || '社友') + '</span>' +
        '<span>' + row.score + ' 分</span>';
      els.boardList.appendChild(li);
    });
    els.boardMine.textContent = mineLabel || '';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function localBestScore() {
    return mode === 'daily' ? (progress.bestDaily[todayKey()] || 0) : (progress.bestClassic || 0);
  }

  async function refreshBoard() {
    els.boardMeta.textContent = (mode === 'daily' ? '每日榜 ' + todayKey() : '经典无尽榜') + ' · 按总分排行';
    try {
      var me = await sdk.scores.me();
      if (!me.loggedIn) els.boardMeta.textContent += '（游客可看榜）';
      var list = await sdk.scores.list({ boardId: currentBoardId(), verified: false, limit: 15 });
      var items = list.items || [];
      if (items.length) {
        var self = items.filter(function (x) { return x.isMe; })[0];
        var mine = self ? ('我的名次 #' + self.rank + ' · ' + self.score + ' 分') : '';
        renderBoard(items, mine);
      } else {
        var lb = localBestScore();
        renderBoard(lb ? [{ rank: 1, displayName: '我（本地）', score: lb, isMe: true }] : [], lb ? '本地最佳' : '');
      }
    } catch (_) {
      var lb2 = localBestScore();
      renderBoard(lb2 ? [{ rank: 1, displayName: '我（本地）', score: lb2, isMe: true }] : [], lb2 ? '本地预览最佳' : '结算后显示');
      els.boardMeta.textContent = '本地预览榜（上线后为社区公开榜）';
    }
  }

  async function submitScore(options) {
    options = options || {};
    if (state.phase !== 'over' || state.submitted) return;
    els.btnSubmit.disabled = true;
    els.btnOverSubmit.disabled = true;
    try {
      var me = await sdk.scores.me();
      if (!me.loggedIn) {
        els.hint.textContent = options.auto ? '自动提交跳过：未登录' : '请先登录再提交公开榜';
        els.btnSubmit.disabled = false;
        els.btnOverSubmit.disabled = false;
        return;
      }
      await sdk.scores.submit({ boardId: currentBoardId(), score: state.score });
      state.submitted = true;
      els.hint.textContent = options.auto ? '已自动提交成绩' : '成绩已提交！';
      await refreshBoard();
    } catch (_) {
      saveLocalBest();
      await refreshBoard();
      els.hint.textContent = '公开提交暂不可用，已记录本地最佳';
    }
  }

  // --- 按钮事件 ---
  els.btnSound.addEventListener('click', function () {
    if (platformMuted) {
      els.hint.textContent = '本次为平台静音进入，请关闭后重新打开并选择「开启声音」';
      return;
    }
    soundOn = !soundOn;
    if (!soundOn) stopAudioNow();
    persistProgress();
    updateHud();
  });

  els.btnSpeed.addEventListener('click', function () {
    state.speedMult = state.speedMult === 1 ? 2.2 : 1;
    els.btnSpeed.classList.toggle('active', state.speedMult > 1);
  });

  els.btnRecall.addEventListener('click', function () {
    if (state.phase !== 'shoot') return;
    state.toFire = 0;
    state.balls = [];
    advanceTurn();
  });

  els.btnClassic.addEventListener('click', function () {
    if (mode === 'classic') return;
    mode = 'classic';
    initGame();
    refreshBoard();
  });

  els.btnDaily.addEventListener('click', function () {
    if (mode === 'daily') return;
    mode = 'daily';
    initGame();
    refreshBoard();
  });

  els.btnRestart.addEventListener('click', initGame);
  els.btnOverRestart.addEventListener('click', initGame);
  els.btnSubmit.addEventListener('click', function () { submitScore(); });
  els.btnOverSubmit.addEventListener('click', function () { submitScore(); });
  els.btnRefreshBoard.addEventListener('click', refreshBoard);

  els.btnAutoSubmit.addEventListener('click', function () {
    autoSubmit = !autoSubmit;
    persistProgress();
    updateHud();
  });

  els.btnTutorial.addEventListener('click', function () {
    sdk.ui.showTutorial().catch(function () {
      els.hint.textContent = '拖动瞄准发射弹珠，击碎数字砖块；每 5 关三选一强化！';
    });
  });

  // --- 启动 ---
  try {
    var context = await sdk.ready();
    document.documentElement.dataset.theme = (context && context.theme) || 'dark';
    await applyPlatformSoundPref(context);
    sdk.on('themechange', function (theme) {
      document.documentElement.dataset.theme = theme;
    });
    sdk.on('pause', function () {
      paused = true;
      stopAudioNow();
    });
    sdk.on('resume', function () {
      // 文档要求：恢复可见时不自动发声，等用户再次点击
      paused = false;
      lastTs = 0;
    });
    if (sdk.ui && sdk.ui.onViewportChange) {
      sdk.ui.onViewportChange(layoutCanvas);
    } else {
      window.addEventListener('resize', layoutCanvas);
    }

    await loadProgress();
    // 存档里的音效偏好不能覆盖平台静音进入
    if (platformMuted) soundOn = false;
    layoutCanvas();
    initGame();
    refreshBoard();
    clearInterval(pollTimer);
    pollTimer = setInterval(refreshBoard, POLL_MS);
    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    els.hint.textContent = '初始化异常，请关闭后重试。';
  }
})();
