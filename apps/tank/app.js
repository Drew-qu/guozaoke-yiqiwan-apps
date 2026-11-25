(async function () {
  'use strict';

  var BOARD_ID_CAMPAIGN = 'tank-v2-campaign';
  var BOARD_ID_DAILY = 'tank-v2-daily-';
  var BOARD_ID_SURVIVAL = 'tank-v2-survival';
  var BOARD_ID_SNIPE = 'tank-v2-snipe';
  var BOARD_ID_BOSS = 'tank-v2-boss';
  var SAVE_KEY = 'tank.v2.progress';
  var SAVE_VERSION = 2;
  var SNIPE_SHOTS = 8;
  var SNIPE_TARGETS = 5;
  var POLL_MS = 25000;
  var CRIT_DIST_RATIO = 0.34;
  var CRIT_MULT = 1.35;
  var SURVIVAL_SCORE_WAVE = 100000;

  var LevelDB = window.ParabolaLevels || null;
  var TOTAL_LEVELS = LevelDB ? LevelDB.total : 10;

  var W = 840;
  var H = 470;
  var WATER_Y = H - 24;
  var GRAVITY = 420;
  var MAX_SPEED = 680;
  var WIND_ACCEL = 16;

  // 四种角色：重装 / 灵巧 / 精准 / 控场（招式含地形系数）
  // 力度统一：D = D0 * max(0.25, 1 - 0.75 * d / R)
  var DAMAGE_FALLOFF = 0.75;
  var TANK_CLASSES = {
    cannon: {
      id: 'cannon', name: '夯夯', role: '重装', color: '#2b8a3e', accent: '#69db7c',
      hp: 150, speed: 58, minRelAng: 12, maxRelAng: 70,
      wep1: { name: '重抛', dmg: 36, radius: 36, terrain: 1.15, color: '#ffffff' },
      wep2: { name: '大范围', dmg: 58, radius: 64, terrain: 1.45, color: '#ff4d6d', special: 'heavy' }
    },
    cross: {
      id: 'cross', name: '闪闪', role: '速攻', color: '#228be6', accent: '#74c0fc',
      hp: 118, speed: 92, minRelAng: 8, maxRelAng: 78,
      wep1: { name: '尖抛', dmg: 32, radius: 26, terrain: 0.85, color: '#ffffff' },
      wep2: { name: '三连', dmg: 22, radius: 24, terrain: 0.8, color: '#ffd166', special: 'triple' }
    },
    meteor: {
      id: 'meteor', name: '星轨', role: '精准', color: '#7950f2', accent: '#b197fc',
      hp: 112, speed: 76, minRelAng: 10, maxRelAng: 82,
      wep1: { name: '星屑', dmg: 34, radius: 26, terrain: 0.9, color: '#d0bfff' },
      wep2: { name: '寻踪', dmg: 48, radius: 28, terrain: 0.95, color: '#4cc9f0', special: 'homing' }
    },
    dragon: {
      id: 'dragon', name: '焰焰', role: '控制', color: '#e8590c', accent: '#ffa94d',
      hp: 128, speed: 70, minRelAng: 10, maxRelAng: 75,
      wep1: { name: '火团', dmg: 30, radius: 30, terrain: 1.0, color: '#ffc078' },
      wep2: { name: '持续区', dmg: 28, radius: 40, terrain: 1.1, color: '#ff6b6b', special: 'napalm' }
    }
  };
  var CLASS_KEYS = ['cannon', 'cross', 'meteor', 'dragon'];
  var AI_TYPES = ['aggressive', 'defensive', 'sniper', 'tactical'];

  function emptyBattleStats() {
    return {
      damageDealt: 0,
      damageTaken: 0,
      terrainCarved: 0,
      kills: 0,
      fallKills: 0,
      multiHitShots: 0,
      crits: 0,
      shotDamage: 0,
      shotHits: 0,
      shotTerrain: 0,
      shotKills: 0,
      shotCrits: 0,
      shotFalls: 0
    };
  }

  function emptyRunBuffs() {
    return {
      dmgMul: 1,
      radiusMul: 1,
      terrainMul: 1,
      critBonus: 0,
      speedMul: 1,
      fuelBonus: 0
    };
  }

  var SURVIVAL_UPGRADES = [
    { id: 'dmg', name: '威力强化', desc: '全部招式力度 +18%', apply: function (b, t) { b.dmgMul *= 1.18; } },
    { id: 'radius', name: '范围扩大', desc: '影响半径 +15%', apply: function (b) { b.radiusMul *= 1.15; } },
    { id: 'armor', name: '装甲加厚', desc: '最大生命 +30，并回复 30', apply: function (b, t) {
      t.maxHp += 30; t.hp = Math.min(t.maxHp, t.hp + 30);
    } },
    { id: 'crit', name: '锐利落点', desc: '中心加分 +20%', apply: function (b) { b.critBonus += 0.2; } },
    { id: 'fuel', name: '高能燃料', desc: '移速 +12%', apply: function (b) { b.speedMul *= 1.12; } },
    { id: 'wep2', name: '次数补给', desc: '副招式次数 +2', apply: function (b, t) { t.wep2Left += 2; } },
    { id: 'heal', name: '急救包', desc: '回复道具 +1，立刻回复 35', apply: function (b, t) {
      t.items.heal += 1; t.hp = Math.min(t.maxHp, t.hp + 35);
    } },
    { id: 'terrain', name: '钻地落点', desc: '地形破坏 +25%', apply: function (b) { b.terrainMul *= 1.25; } }
  ];

  function calcBlastDamage(baseDmg, dist, radius) {
    var R = radius + 18;
    if (dist > R || baseDmg <= 0) return 0;
    return Math.max(1, Math.round(baseDmg * Math.max(0.25, 1 - DAMAGE_FALLOFF * (dist / R))));
  }

  function encodeSurvivalScore(wave, score) {
    return Math.max(0, Math.floor(wave || 0)) * SURVIVAL_SCORE_WAVE + Math.min(SURVIVAL_SCORE_WAVE - 1, Math.max(0, Math.floor(score || 0)));
  }

  function formatSurvivalScore(raw) {
    raw = Math.max(0, Math.floor(Number(raw) || 0));
    var w = Math.floor(raw / SURVIVAL_SCORE_WAVE);
    var s = raw % SURVIVAL_SCORE_WAVE;
    return '波' + w + ' · ' + s;
  }

  function pickAiType(classKey, rng, elite) {
    if (elite) return 'boss';
    if (classKey === 'meteor') return 'sniper';
    if (classKey === 'cannon') return rng() < 0.55 ? 'tactical' : 'aggressive';
    if (classKey === 'dragon') return rng() < 0.6 ? 'tactical' : 'defensive';
    if (classKey === 'cross') return rng() < 0.65 ? 'aggressive' : 'sniper';
    return AI_TYPES[Math.floor(rng() * AI_TYPES.length)];
  }

  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');

  // 离屏 2D 像素级地形画布 + 像素掩码（1=实体土块, 0=空气）
  var terrCanvas = document.createElement('canvas');
  terrCanvas.width = W;
  terrCanvas.height = H;
  var terrCtx = terrCanvas.getContext('2d', { willReadFrequently: true });
  var terrMask = new Uint8Array(W * H);

  var els = {
    modeSub: document.getElementById('modeSub'),
    modeDesc: document.getElementById('modeDesc'),
    meterWind: document.getElementById('meterWind'),
    meterWeather: document.getElementById('meterWeather'),
    meterWave: document.getElementById('meterWave'),
    meterShots: document.getElementById('meterShots'),
    meterTurn: document.getElementById('meterTurn'),
    meterScore: document.getElementById('meterScore'),
    meterRun: document.getElementById('meterRun'),
    wepStats: document.getElementById('wepStats'),
    pickOverlay: document.getElementById('pickOverlay'),
    pickTitle: document.getElementById('pickTitle'),
    pickSummary: document.getElementById('pickSummary'),
    pickChoices: document.getElementById('pickChoices'),
    btnSound: document.getElementById('btnSound'),
    btnMenu: document.getElementById('btnMenu'),
    sideBackdrop: document.getElementById('sideBackdrop'),
    sidePanel: document.getElementById('sidePanel'),
    levelList: document.getElementById('levelList'),
    chapterTabs: document.getElementById('chapterTabs'),
    chapterLabel: document.getElementById('chapterLabel'),
    hint: document.getElementById('hint'),
    appRoot: document.getElementById('app'),
    roundHud: document.getElementById('roundHud'),
    hudLeader: document.getElementById('hudLeader'),
    hudLeaderName: document.getElementById('hudLeaderName'),
    hudLeaderPhase: document.getElementById('hudLeaderPhase'),
    hudLeaderHp: document.getElementById('hudLeaderHp'),
    hudLeaderHpText: document.getElementById('hudLeaderHpText'),
    hudMineName: document.getElementById('hudMineName'),
    hudMineHp: document.getElementById('hudMineHp'),
    hudMineHpText: document.getElementById('hudMineHpText'),
    hudFoeName: document.getElementById('hudFoeName'),
    hudFoeHp: document.getElementById('hudFoeHp'),
    hudFoeHpText: document.getElementById('hudFoeHpText'),
    hudRound: document.getElementById('hudRound'),
    chargeOverlay: document.getElementById('chargeOverlay'),
    chargePct: document.getElementById('chargePct'),
    cancelZone: document.getElementById('cancelZone'),
    cancelZoneDock: document.getElementById('cancelZoneDock'),
    btnWep1: document.getElementById('btnWep1'),
    btnWep2: document.getElementById('btnWep2'),
    wep1Name: document.getElementById('wep1Name'),
    wep2Name: document.getElementById('wep2Name'),
    wep2Cnt: document.getElementById('wep2Cnt'),
    cntTp: document.getElementById('cntTp'),
    cntHeal: document.getElementById('cntHeal'),
    cntPower: document.getElementById('cntPower'),
    cntDouble: document.getElementById('cntDouble'),
    btnLeft: document.getElementById('btnLeft'),
    btnRight: document.getElementById('btnRight'),
    btnAngDown: document.getElementById('btnAngDown'),
    btnAngUp: document.getElementById('btnAngUp'),
    angleReadout: document.getElementById('angleReadout'),
    fuelReadout: document.getElementById('fuelReadout'),
    powerReadout: document.getElementById('powerReadout'),
    powerFill: document.getElementById('powerFill'),
    powerLastMark: document.getElementById('powerLastMark'),
    btnThrow: document.getElementById('btnThrow'),
    aimTip: document.getElementById('aimTip'),
    btnCampaign: document.getElementById('btnCampaign'),
    btnDaily: document.getElementById('btnDaily'),
    btnSurvival: document.getElementById('btnSurvival'),
    btnSnipe: document.getElementById('btnSnipe'),
    btnLeader: document.getElementById('btnLeader'),
    btnPvp: document.getElementById('btnPvp'),
    btnRestart: document.getElementById('btnRestart'),
    btnTutorial: document.getElementById('btnTutorial'),
    btnSubmit: document.getElementById('btnSubmit'),
    btnAutoSubmit: document.getElementById('btnAutoSubmit'),
    btnRefreshBoard: document.getElementById('btnRefreshBoard'),
    boardList: document.getElementById('boardList'),
    boardMeta: document.getElementById('boardMeta'),
    boardMine: document.getElementById('boardMine'),
    modalOverlay: document.getElementById('modalOverlay'),
    modalKicker: document.getElementById('modalKicker'),
    modalTitle: document.getElementById('modalTitle'),
    modalStars: document.getElementById('modalStars'),
    modalSummary: document.getElementById('modalSummary'),
    btnModalPrimary: document.getElementById('btnModalPrimary'),
    btnModalSubmit: document.getElementById('btnModalSubmit'),
    btnModalRetry: document.getElementById('btnModalRetry')
  };

  // --- SDK 兼容层（无 SDK 时降级 localStorage） ---
  var hasSdk = !!window.Yiqiwan;
  var sdk = hasSdk ? window.Yiqiwan : {
    ready: function () { return Promise.resolve({ theme: 'light' }); },
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
    },
    audio: {
      getPreference: function () { return Promise.resolve('enabled'); }
    }
  };

  // --- 合成音效 ---
  var audioCtx = null;
  var soundOn = true;
  var platformMuted = false;

  function ensureAudio() {
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
    if (audioCtx) {
      try { audioCtx.close(); } catch (_) {}
      audioCtx = null;
    }
  }

  async function syncPlatformAudioPref() {
    var pref = 'enabled';
    try {
      if (sdk.audio && typeof sdk.audio.getPreference === 'function') {
        pref = await sdk.audio.getPreference();
      }
    } catch (_) {}
    platformMuted = pref === 'muted';
    if (platformMuted) {
      soundOn = false;
      stopAudioNow();
    }
  }

  function tone(freq, dur, type, vol, endFreq) {
    var ac = ensureAudio();
    if (!ac) return;
    try {
      var osc = ac.createOscillator();
      var g = ac.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, ac.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.06, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0008, ac.currentTime + dur);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + dur);
    } catch (_) {}
  }

  function sfxFire() {
    tone(220, 0.16, 'sawtooth', 0.08, 65);
    tone(520, 0.09, 'triangle', 0.05, 180);
  }
  function sfxExplode(big) {
    tone(big ? 105 : 148, big ? 0.36 : 0.22, 'sawtooth', big ? 0.12 : 0.08, 34);
    tone(82, 0.25, 'square', 0.05, 30);
  }
  function sfxTeleport() {
    tone(440, 0.12, 'sine', 0.06, 1280);
    setTimeout(function () { tone(1280, 0.14, 'triangle', 0.05, 620); }, 90);
  }
  function sfxHeal() {
    [523, 659, 784].forEach(function (f, i) {
      setTimeout(function () { tone(f, 0.12, 'sine', 0.055); }, i * 70);
    });
  }
  function sfxSplash() {
    tone(420, 0.18, 'sine', 0.06, 140);
    setTimeout(function () { tone(620, 0.12, 'triangle', 0.04, 240); }, 60);
  }
  function sfxWin() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      setTimeout(function () { tone(f, 0.16, 'triangle', 0.06); }, i * 80);
    });
  }
  function sfxLose() {
    tone(240, 0.28, 'sawtooth', 0.06, 130);
    setTimeout(function () { tone(160, 0.36, 'sawtooth', 0.05, 90); }, 150);
  }

  // --- 随机与日期 ---
  function todayKey() {
    // 北京时间日榜，不跟设备本地时区走
    var d = new Date(Date.now() + 8 * 3600 * 1000);
    return d.getUTCFullYear() + '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(d.getUTCDate()).padStart(2, '0');
  }

  function chapterLevel(lv) {
    if (!LevelDB) {
      return {
        id: 'legacy-' + lv, chapter: 1, name: '第 ' + lv + ' 关',
        map: { id: 'hills', terrain: 2, palette: 'grass', relief: 1 },
        weather: { id: 'calm', name: '晴朗', windAbs: 3, windMul: 1 },
        terrain: 2, enemies: lv === 1 ? 1 : (lv <= 3 ? 2 : 3),
        hpScale: 0.78 + lv * 0.12, maxTurns: 12, seedSalt: 'l' + lv, windAbs: 3
      };
    }
    return LevelDB.resolve(LevelDB.getLevel(lv));
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

  // --- 2D 像素级可破坏地形（支持悬空桥、山洞与穿山打洞） ---
  function rebuildMaskFromCanvas() {
    var img = terrCtx.getImageData(0, 0, W, H).data;
    for (var i = 0, p = 3; i < terrMask.length; i++, p += 4) {
      terrMask[i] = img[p] > 120 ? 1 : 0;
    }
  }

  function isSolid(x, y) {
    var ix = Math.round(x);
    var iy = Math.round(y);
    if (ix < 0 || ix >= W || iy < 0 || iy >= H) return false;
    return terrMask[iy * W + ix] === 1;
  }

  function findSurfaceNear(x, startY) {
    var ix = Math.max(0, Math.min(W - 1, Math.round(x)));
    var y = Math.max(0, Math.min(H - 1, Math.round(startY)));
    // 如果当前在实体内，向上找空气边界（炸坑后可能埋得较深，多爬一点）
    if (isSolid(ix, y)) {
      for (var up = 1; up <= 42; up++) {
        if (y - up >= 0 && !isSolid(ix, y - up)) return y - up + 1;
      }
      return null; // 坡太陡爬不上去
    }
    // 如果在空气中，向下找落脚点
    for (var dn = y; dn < H; dn++) {
      if (isSolid(ix, dn)) return dn;
    }
    return H + 20;
  }

  function findTopSurface(x) {
    var ix = Math.max(0, Math.min(W - 1, Math.round(x)));
    for (var y = 60; y < WATER_Y; y++) {
      if (isSolid(ix, y)) return y;
    }
    return WATER_Y - 60;
  }

  function measureSlope(x, y) {
    var yL = findSurfaceNear(x - 9, y - 6);
    var yR = findSurfaceNear(x + 9, y - 6);
    if (yL === null || yR === null || yL > y + 26 || yR > y + 26) return 0;
    return Math.max(-0.58, Math.min(0.58, Math.atan2(yR - yL, 18)));
  }

  function terrainPalette(kind, dark) {
    if (kind === 'desert') {
      return dark
        ? { top: '#8a6a3a', mid: '#6b512c', bot: '#3d2e18', grass: [168, 132, 72] }
        : { top: '#e8c87a', mid: '#c9a14a', bot: '#8a6a2e', grass: [210, 170, 90] };
    }
    if (kind === 'canyon') {
      return dark
        ? { top: '#6a4538', mid: '#4a3028', bot: '#2a1c16', grass: [90, 120, 70] }
        : { top: '#c48a6a', mid: '#9a6248', bot: '#6a4030', grass: [110, 150, 80] };
    }
    if (kind === 'lava') {
      return dark
        ? { top: '#5a3030', mid: '#3a2020', bot: '#1a1010', grass: [180, 70, 40] }
        : { top: '#a85840', mid: '#7a3828', bot: '#4a2018', grass: [220, 90, 50] };
    }
    if (kind === 'ice') {
      return dark
        ? { top: '#5a6e82', mid: '#3a4a5c', bot: '#1e2834', grass: [180, 210, 230] }
        : { top: '#c5d8e8', mid: '#8eb0cc', bot: '#5a7a98', grass: [230, 245, 255] };
    }
    return dark
      ? { top: '#56473a', mid: '#3e3229', bot: '#241d17', grass: [47, 143, 94] }
      : { top: '#9c7b5c', mid: '#73573f', bot: '#4a3625', grass: [67, 190, 109] };
  }

  function generatePixelTerrain(rng, dark, styleOverride, mapCfg) {
    terrCtx.clearRect(0, 0, W, H);
    terrCtx.globalCompositeOperation = 'source-over';

    var style = styleOverride != null ? styleOverride : Math.floor(rng() * 3); // 0=拱桥, 1=浮空岛, 2=丘陵
    var relief = (mapCfg && mapCfg.relief != null) ? mapCfg.relief : 1;
    var pal = terrainPalette(mapCfg && mapCfg.palette, dark);
    var dirtGrad = terrCtx.createLinearGradient(0, 140, 0, H);
    dirtGrad.addColorStop(0, pal.top);
    dirtGrad.addColorStop(0.55, pal.mid);
    dirtGrad.addColorStop(1, pal.bot);
    terrCtx.fillStyle = dirtGrad;

    if (style === 1) {
      function drawIsland(cx, cy, rx, ry) {
        terrCtx.beginPath();
        terrCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        terrCtx.fill();
      }
      drawIsland(165, 315, 138, 62);
      drawIsland(420, 265, 118, 46);
      drawIsland(675, 315, 138, 62);
    } else {
      var p1 = rng() * Math.PI * 2;
      var p2 = rng() * Math.PI * 2;
      terrCtx.beginPath();
      terrCtx.moveTo(0, H);
      for (var x = 0; x <= W; x += 4) {
        var t = x / W;
        var y = 292 + (Math.sin(t * Math.PI * 2.4 + p1) * 48 + Math.cos(t * Math.PI * 5.2 + p2) * 24) * relief;
        if (t < 0.12 || t > 0.88) y -= 16;
        terrCtx.lineTo(x, Math.max(175, Math.min(WATER_Y - 46, y)));
      }
      terrCtx.lineTo(W, H);
      terrCtx.closePath();
      terrCtx.fill();

      terrCtx.globalCompositeOperation = 'destination-out';
      if (style === 0) {
        terrCtx.beginPath();
        terrCtx.ellipse(W * 0.5, WATER_Y - 12, 115, 92, 0, Math.PI, 0, false);
        terrCtx.fill();
      } else {
        terrCtx.beginPath();
        terrCtx.ellipse(W * 0.36, 365, 62, 34, 0, 0, Math.PI * 2);
        terrCtx.ellipse(W * 0.64, 365, 62, 34, 0, 0, Math.PI * 2);
        terrCtx.fill();
      }
      terrCtx.globalCompositeOperation = 'source-over';
    }

    rebuildMaskFromCanvas();
    var grass = terrCtx.getImageData(0, 0, W, H);
    var gd = grass.data;
    var gr = pal.grass[0];
    var gg = pal.grass[1];
    var gb = pal.grass[2];
    for (var gx = 0; gx < W; gx++) {
      var gy = 40;
      while (gy < H - 8) {
        var midx = gy * W + gx;
        if (terrMask[midx] === 1 && terrMask[midx - W] === 0) {
          for (var gh = 0; gh < 7 && gy + gh < H; gh++) {
            if (terrMask[(gy + gh) * W + gx] !== 1) break;
            var pi = ((gy + gh) * W + gx) * 4;
            var lift = gh < 2 ? 30 : (gh > 4 ? -20 : 0);
            gd[pi] = gr + lift; gd[pi + 1] = gg + lift; gd[pi + 2] = gb + lift; gd[pi + 3] = 255;
          }
          gy += 8;
          while (gy < H - 8 && terrMask[gy * W + gx] === 1) gy++;
        } else {
          gy++;
        }
      }
    }
    // 土层质感：颗粒噪点 + 斜向地层纹
    for (var ti = 0; ti < terrMask.length; ti++) {
      if (terrMask[ti] !== 1) continue;
      var pj = ti * 4;
      var hh = ((ti * 2654435761) >>> 0) % 100;
      var dd = hh < 10 ? -10 : (hh > 91 ? 9 : 0);
      var ty = (ti / W) | 0, tx2 = ti - ty * W;
      dd += Math.sin(ty * 0.33 + tx2 * 0.025) * 3.5;
      gd[pj] += dd; gd[pj + 1] += dd; gd[pj + 2] += dd;
    }
    terrCtx.putImageData(grass, 0, 0);
    rebuildMaskFromCanvas();
  }

  function carvePixelCrater(cx, cy, radius, terrainMul) {
    var carveR = Math.max(6, radius * (terrainMul != null ? terrainMul : 1));
    terrCtx.save();
    terrCtx.globalCompositeOperation = 'destination-out';
    terrCtx.beginPath();
    terrCtx.arc(cx, cy, carveR, 0, Math.PI * 2);
    terrCtx.fill();
    terrCtx.restore();

    // 坑边留一圈焦黑痕迹
    terrCtx.save();
    terrCtx.globalCompositeOperation = 'source-atop';
    terrCtx.strokeStyle = 'rgba(20, 14, 10, 0.55)';
    terrCtx.lineWidth = 4;
    terrCtx.beginPath();
    terrCtx.arc(cx, cy, carveR + 1, 0, Math.PI * 2);
    terrCtx.stroke();
    terrCtx.restore();

    // 只更新局部掩码（略大于可视半径，减少锯齿薄片）
    var x0 = Math.max(0, Math.floor(cx - carveR - 4));
    var x1 = Math.min(W - 1, Math.ceil(cx + carveR + 4));
    var y0 = Math.max(0, Math.floor(cy - carveR - 4));
    var y1 = Math.min(H - 1, Math.ceil(cy + carveR + 4));
    var r2 = (carveR + 0.75) * (carveR + 0.75);
    var carved = 0;
    for (var y = y0; y <= y1; y++) {
      var dy = y - cy;
      var row = y * W;
      for (var x = x0; x <= x1; x++) {
        var dx = x - cx;
        if (dx * dx + dy * dy <= r2 && terrMask[row + x] === 1) {
          terrMask[row + x] = 0;
          carved++;
        }
      }
    }
    if (state && state.stats && carved) {
      state.stats.terrainCarved += carved;
      state.stats.shotTerrain += carved;
    }

    // 清掉坑边悬空薄片，避免角色踩在“一条绿线”上
    cleanupThinDebris(x0, y0, x1, y1);
    // 炸点附近角色若嵌进土里，立刻顶出
    if (state && state.tanks) {
      state.tanks.forEach(function (t) {
        if (!t.alive) return;
        if (Math.hypot(t.x - cx, t.y - cy) <= carveR + 28) ejectTankFromTerrain(t);
      });
    }
  }

  function solidNeighbors(x, y) {
    var n = 0;
    for (var oy = -1; oy <= 1; oy++) {
      for (var ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        var xx = x + ox;
        var yy = y + oy;
        if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
        if (terrMask[yy * W + xx] === 1) n++;
      }
    }
    return n;
  }

  function cleanupThinDebris(x0, y0, x1, y1) {
    x0 = Math.max(1, x0);
    y0 = Math.max(1, y0);
    x1 = Math.min(W - 2, x1);
    y1 = Math.min(H - 2, y1);
    var pass;
    for (pass = 0; pass < 3; pass++) {
      var kill = [];
      for (var y = y0; y <= y1; y++) {
        var row = y * W;
        for (var x = x0; x <= x1; x++) {
          if (terrMask[row + x] !== 1) continue;
          // 邻居过少 = 孤立薄片/细悬臂，视觉上像“浮空绿台”
          if (solidNeighbors(x, y) <= 2) kill.push(row + x);
        }
      }
      if (!kill.length) break;
      for (var i = 0; i < kill.length; i++) {
        var idx = kill[i];
        terrMask[idx] = 0;
        var px = (idx % W);
        var py = (idx / W) | 0;
        terrCtx.clearRect(px, py, 1, 1);
      }
    }
  }

  // 角色身体卡进地形时，上推到可站立的表面（修截图那种嵌坑）
  function ejectTankFromTerrain(t) {
    var x = Math.round(t.x);
    var y = Math.round(t.y);
    var embedded = isSolid(x, y) || isSolid(x, y - 5) || isSolid(x, y - 10) ||
      (isSolid(x, y + 1) && isSolid(x, y - 8));
    if (!embedded) return false;

    for (var yy = y; yy >= 36; yy--) {
      if (!isSolid(x, yy - 1) && !isSolid(x, yy - 6) && isSolid(x, yy)) {
        t.y = yy;
        t.vy = 0;
        t.slope = measureSlope(t.x, t.y);
        return true;
      }
    }
    // 上方全堵死：强制下落，等重力掉穿或坠海
    t.vy = Math.max(t.vy, 120);
    return false;
  }

  // --- 游戏状态 ---
  var mode = 'campaign'; // campaign|daily|survival|snipe|boss|pvp
  var selectedClass = 'cannon';
  var selectedChapter = 1;
  var autoSubmit = false;
  var progress = {
    version: SAVE_VERSION,
    level: 1,
    campaignRunScore: 0,
    bestCampaign: 0,
    bestRunScore: 0,
    bestSurvival: 0,
    bestSnipe: 0,
    bestBoss: 0,
    bossIndex: 0,
    stars: {},
    bestDaily: {},
    settings: { soundOn: true, autoSubmit: false, tankClass: 'cannon' }
  };

  var state = {};
  var keys = {};
  var holdBtn = null; // 兼容旧逻辑；实际以 activeHolds 为准
  var activeHolds = Object.create(null); // name -> pointerId
  var isCharging = false;
  var chargePower = 0;
  var chargeDir = 1;
  var chargeWillCancel = false;
  var isDragging = false;
  var dragStart = null;
  var paused = false;
  var lastTs = 0;
  var pollTimer = 0;
  var dpr = 1;
  var viewScale = 1;
  // 粗指针/窄屏：画布拖动只调瞄准，松手不抛出（避免误触）
  // 鼠标桌面：拖动画布调角度+力度，松手抛出
  var touchAimOnly = false;
  try {
    touchAimOnly = window.matchMedia('(pointer: coarse)').matches ||
      (navigator.maxTouchPoints > 0 && window.matchMedia('(max-width: 860px)').matches);
  } catch (_) {}

  function setSideOpen(open) {
    if (!els.appRoot) return;
    els.appRoot.classList.toggle('side-open', !!open);
    if (els.sideBackdrop) {
      if (open) els.sideBackdrop.removeAttribute('hidden');
      else els.sideBackdrop.setAttribute('hidden', '');
    }
    if (els.btnMenu) els.btnMenu.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function makeTank(id, team, name, x, classKey, isAi, hpScale, aiType, bossCfg) {
    var cls = TANK_CLASSES[classKey] || TANK_CLASSES.cannon;
    var y = findTopSurface(x);
    var maxHp = Math.round(cls.hp * (hpScale || 1));
    if (bossCfg) maxHp = Math.round(maxHp * 1.35);
    return {
      id: id,
      team: team,
      name: name,
      cls: cls,
      x: x,
      y: y,
      vy: 0,
      slope: measureSlope(x, y),
      facing: team === 0 ? 1 : -1,
      relAngle: 42,
      hp: maxHp,
      maxHp: maxHp,
      isAi: isAi,
      aiType: isAi ? (aiType || 'aggressive') : null,
      isBoss: !!bossCfg,
      bossCfg: bossCfg || null,
      bossPhase: 0,
      alive: true,
      fuel: 100,
      lastPower: 0,
      weaponSlot: 1,
      wep2Left: bossCfg ? 6 : 3,
      items: { tp: 1, heal: bossCfg ? 2 : 1, power: 1, double: 1 },
      armedItem: null,
      hitFlash: 0
    };
  }

  // 根据角色坡度计算真实世界抛出角（埋坑会压仰角）
  function tankWorldAngle(tank) {
    var relRad = (tank.relAngle * Math.PI) / 180;
    if (tank.facing === 1) {
      return tank.slope - relRad;
    }
    return Math.PI + tank.slope + relRad;
  }

  function shade(hex, p) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
    var t = p < 0 ? 0 : 255, q = Math.abs(p);
    return 'rgb(' + Math.round((t - r) * q + r) + ',' + Math.round((t - gg) * q + gg) + ',' + Math.round((t - b) * q + b) + ')';
  }

  /** Canvas 质感造型：渐变体积 + 描边 + 高光 + 接地阴影，四角色轮廓各异 */
  function drawTankVisual(g, tank, opts) {
    opts = opts || {};
    var scale = opts.scale || 1;
    var preview = !!opts.preview;
    var cls = tank.cls || TANK_CLASSES.cannon;
    var id = cls.id || 'cannon';
    var color = cls.color;
    var accent = cls.accent;
    var facing = tank.facing == null ? 1 : tank.facing;
    var slope = preview ? 0 : (tank.slope || 0);
    var flash = preview ? 0 : (tank.hitFlash || 0);
    var wang = preview
      ? (facing > 0 ? -Math.PI / 5 : Math.PI + Math.PI / 5)
      : tankWorldAngle(tank);
    var edge = shade(color, -0.55);

    g.save();
    g.scale(scale, scale);

    // 接地阴影（不随坡度旋转）
    g.fillStyle = 'rgba(10,20,30,0.28)';
    g.beginPath();
    g.ellipse(0, 3, 22, 3.6, 0, 0, Math.PI * 2);
    g.fill();

    g.rotate(slope * 0.9);

    // 履带：渐变 + 防滑齿 + 轮毂
    var tg = g.createLinearGradient(0, -7, 0, 4);
    tg.addColorStop(0, '#59616b');
    tg.addColorStop(0.5, '#2f363f');
    tg.addColorStop(1, '#171c22');
    g.fillStyle = tg;
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 1;
    g.beginPath();
    g.roundRect(-19, -7, 38, 11, 5.5);
    g.fill();
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.beginPath();
    for (var tx = -15; tx <= 15; tx += 5) { g.moveTo(tx, -6.5); g.lineTo(tx, -4.5); }
    g.stroke();
    [-13, -4.5, 4.5, 13].forEach(function (wx) {
      g.fillStyle = '#262c34';
      g.beginPath(); g.arc(wx, -1, 3.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#8b95a1';
      g.beginPath(); g.arc(wx, -1, 1.3, 0, Math.PI * 2); g.fill();
    });

    // 车身：纵向渐变（上亮下暗）+ 深色描边
    var bg = g.createLinearGradient(0, -27, 0, -6);
    bg.addColorStop(0, shade(color, 0.32));
    bg.addColorStop(0.45, color);
    bg.addColorStop(1, shade(color, -0.32));
    g.fillStyle = bg;
    g.strokeStyle = edge;
    g.lineWidth = 1.3;
    g.lineJoin = 'round';
    g.save();
    if (id === 'cannon') {
      g.beginPath(); g.roundRect(-16, -19, 32, 14, 5); g.fill(); g.stroke();
      g.fillStyle = shade(accent, -0.1);
      g.fillRect(-12, -16, 7, 4); g.fillRect(5, -16, 7, 4);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(-12, -16, 7, 1.2); g.fillRect(5, -16, 7, 1.2);
      g.fillStyle = shade(color, -0.45);
      g.beginPath(); g.arc(-12, -8, 1, 0, 7); g.arc(12, -8, 1, 0, 7); g.fill();
      var hg = g.createRadialGradient(-1, -22, 1, 0, -20, 7);
      hg.addColorStop(0, shade(accent, 0.4)); hg.addColorStop(1, shade(color, -0.1));
      g.fillStyle = hg; g.strokeStyle = edge;
      g.beginPath(); g.arc(0, -20, 6, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
    } else if (id === 'cross') {
      g.beginPath();
      g.moveTo(-14, -7); g.lineTo(-10, -20); g.lineTo(11, -19); g.lineTo(16, -7);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = accent;
      g.beginPath(); g.moveTo(-5, -20); g.lineTo(1, -28); g.lineTo(8, -19.5); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(-8, -18); g.lineTo(-4, -18); g.moveTo(-11, -12); g.lineTo(13, -12); g.stroke();
    } else if (id === 'meteor') {
      g.beginPath();
      g.moveTo(0, -26); g.lineTo(14, -15); g.lineTo(10, -7); g.lineTo(-10, -7); g.lineTo(-14, -15);
      g.closePath(); g.fill(); g.stroke();
      var sgl = g.createRadialGradient(0, -15, 1, 0, -15, 8);
      sgl.addColorStop(0, 'rgba(255,255,255,0.95)'); sgl.addColorStop(1, 'rgba(177,151,252,0)');
      g.fillStyle = sgl; g.beginPath(); g.arc(0, -15, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = shade(accent, 0.25);
      g.beginPath();
      for (var i = 0; i < 10; i++) {
        var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 === 0 ? 4.8 : 2.1;
        var sx = Math.cos(a) * r, sy = -15 + Math.sin(a) * r;
        if (i === 0) g.moveTo(sx, sy); else g.lineTo(sx, sy);
      }
      g.closePath(); g.fill();
    } else {
      g.beginPath(); g.ellipse(0, -12.5, 15, 10.5, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      var fg = g.createLinearGradient(0, -31, 0, -18);
      fg.addColorStop(0, '#ffe066'); fg.addColorStop(1, accent);
      g.fillStyle = fg; g.strokeStyle = shade(color, -0.35); g.lineWidth = 1;
      g.beginPath(); g.moveTo(-5, -20); g.quadraticCurveTo(-3, -31, 3, -23); g.quadraticCurveTo(0, -25, -5, -20); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(3, -20); g.quadraticCurveTo(10, -30, 14, -16); g.quadraticCurveTo(9, -20, 3, -20); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,230,160,0.5)';
      g.beginPath(); g.ellipse(0, -9, 8, 3.2, 0, 0, Math.PI * 2); g.fill();
    }
    // 车身顶部高光
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1.2;
    g.beginPath();
    if (id === 'cannon') { g.moveTo(-12, -18.2); g.lineTo(12, -18.2); }
    else if (id === 'cross') { g.moveTo(-8, -19.3); g.lineTo(9, -18.4); }
    else if (id === 'meteor') { g.moveTo(-3, -23); g.lineTo(-11, -15.5); }
    else { g.moveTo(-9, -18); g.quadraticCurveTo(-4, -22, 3, -22); }
    g.stroke();

    // 管口（真实仰角）：金属质感 + 管端
    g.save();
    g.translate(0, id === 'meteor' ? -15 : -12);
    g.rotate(wang);
    var L = id === 'cannon' ? 20 : id === 'cross' ? 26 : id === 'meteor' ? 28 : 18;
    var T = id === 'cannon' ? 9 : id === 'cross' ? 4.6 : id === 'meteor' ? 4.2 : 6;
    var bgd = g.createLinearGradient(0, -T / 2, 0, T / 2);
    bgd.addColorStop(0, '#8a939d'); bgd.addColorStop(0.35, '#4b535c'); bgd.addColorStop(1, '#22272d');
    g.fillStyle = bgd; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1;
    g.beginPath(); g.roundRect(0, -T / 2, L, T, 1.5); g.fill(); g.stroke();
    if (id === 'cannon') {
      g.fillStyle = accent; g.beginPath(); g.roundRect(L - 4, -6.2, 10, 12.4, 3); g.fill(); g.stroke();
    } else if (id === 'cross') {
      g.fillStyle = accent; g.fillRect(L - 4, -3.8, 8, 7.6); g.fillRect(9, -5.2, 3, 10.4); g.fillRect(15, -5.2, 3, 10.4);
    } else if (id === 'meteor') {
      g.strokeStyle = accent; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(6, -5); g.lineTo(24, -5); g.moveTo(6, 5); g.lineTo(24, 5); g.stroke();
      g.fillStyle = shade(accent, 0.3); g.beginPath(); g.arc(L, 0, 3.6, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = '#ff922b';
      g.beginPath(); g.moveTo(L - 2, -5.5); g.lineTo(L + 11, 0); g.lineTo(L - 2, 5.5); g.closePath(); g.fill();
      g.fillStyle = '#ffe066';
      g.beginPath(); g.moveTo(L, -2.5); g.lineTo(L + 7, 0); g.lineTo(L, 2.5); g.closePath(); g.fill();
    }
    g.restore();

    if (flash > 0) {
      g.globalAlpha = Math.min(0.8, flash * 3);
      g.fillStyle = '#ffffff';
      g.beginPath(); g.roundRect(-15, -22, 30, 17, 7); g.fill();
      g.globalAlpha = 1;
    }

    if (tank.isBoss && !preview) {
      g.strokeStyle = 'rgba(255, 212, 59, 0.9)';
      g.lineWidth = 2;
      g.setLineDash([5, 4]);
      g.lineDashOffset = -performance.now() * 0.01;
      g.beginPath(); g.arc(0, -12, 24, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
    }

    g.restore();
  }

  function paintTankCards() {
    document.querySelectorAll('.role-card').forEach(function (btn) {
      var key = btn.dataset.role;
      var canvas = btn.querySelector('canvas.role-art');
      if (!canvas || !TANK_CLASSES[key]) return;
      var g = canvas.getContext('2d');
      var w = canvas.width;
      var h = canvas.height;
      g.clearRect(0, 0, w, h);
      g.save();
      g.translate(w * 0.5, h * 0.68);
      drawTankVisual(g, {
        cls: TANK_CLASSES[key],
        facing: 1,
        slope: 0,
        hitFlash: 0,
        relAngle: 38,
        isBoss: false
      }, { scale: 2.15, preview: true });
      g.restore();
    });
  }

  function bossLevelIndexes() {
    if (LevelDB && LevelDB.listBossIndexes) return LevelDB.listBossIndexes();
    var out = [];
    for (var i = 1; i <= TOTAL_LEVELS; i++) {
      var raw = LevelDB ? LevelDB.getLevel(i) : null;
      if (raw && raw.boss) out.push(i);
    }
    return out.length ? out : [10];
  }

  function initGame() {
    var lv = mode === 'daily' ? 3 : (mode === 'pvp' || mode === 'survival' || mode === 'snipe' ? 1 : progress.level);
    var lvCfg = mode === 'campaign' ? chapterLevel(lv) : null;
    if (mode === 'boss') {
      var bosses = bossLevelIndexes();
      var bi = Math.max(0, (progress.bossIndex || 0) % bosses.length);
      lv = bosses[bi];
      lvCfg = chapterLevel(lv);
    }
    if (mode === 'daily' && LevelDB) {
      // 每日：用日期种子挑一张地图 + 天气轮换
      var dayHash = hashString('tank-weather-' + todayKey());
      var maps = Object.keys(LevelDB.MAPS);
      var weathers = Object.keys(LevelDB.WEATHER);
      lvCfg = LevelDB.resolve({
        id: 'daily-' + todayKey(),
        chapter: 0,
        name: '每日同种',
        map: maps[dayHash % maps.length],
        weather: weathers[(dayHash >>> 3) % weathers.length],
        enemies: 2,
        hpScale: 1.0,
        maxTurns: 14,
        seedSalt: todayKey()
      });
    }
    if (mode === 'survival' && LevelDB) {
      var sHash = hashString('tank-surv-' + Date.now());
      var sMaps = Object.keys(LevelDB.MAPS);
      var sWeathers = Object.keys(LevelDB.WEATHER).filter(function (w) { return w !== 'toxic'; });
      lvCfg = LevelDB.resolve({
        id: 'surv-' + sHash,
        chapter: 0,
        name: '耐力无尽',
        map: sMaps[sHash % sMaps.length],
        weather: sWeathers[(sHash >>> 4) % sWeathers.length],
        enemies: 1,
        hpScale: 0.82,
        maxTurns: 999,
        seedSalt: 'surv-' + sHash
      });
    }
    if (mode === 'snipe' && LevelDB) {
      var snHash = hashString('tank-snipe-' + Date.now());
      var snMaps = Object.keys(LevelDB.MAPS);
      lvCfg = LevelDB.resolve({
        id: 'snipe-' + snHash,
        chapter: 0,
        name: '落点练习',
        map: snMaps[snHash % snMaps.length],
        weather: 'breeze',
        enemies: 0,
        hpScale: 1,
        maxTurns: SNIPE_SHOTS,
        seedSalt: 'snipe-' + snHash
      });
    }
    var seed = mode === 'daily'
      ? hashString('tank-v2-daily-' + todayKey())
      : (mode === 'campaign' || mode === 'boss'
        ? hashString('tank-v2-lv-' + lv + '-' + (lvCfg && lvCfg.seedSalt || 'x') + (mode === 'boss' ? '-boss' : ''))
        : hashString('tank-v2-' + mode + '-' + lv + '-' + Date.now()));
    var rng = mulberry32(seed);
    var dark = document.documentElement.dataset.theme === 'dark';
    var mapCfg = lvCfg && lvCfg.map ? lvCfg.map : null;

    generatePixelTerrain(rng, dark, lvCfg ? lvCfg.terrain : null, mapCfg);

    var clouds = [];
    for (var i = 0; i < 6; i++) {
      clouds.push({ x: rng() * W, y: 30 + rng() * 90, w: 54 + rng() * 54 });
    }

    state = {
      level: lv,
      levelCfg: lvCfg,
      levelId: lvCfg ? lvCfg.id : (mode + '-' + lv),
      levelName: lvCfg ? lvCfg.name : '',
      maxTurns: lvCfg ? lvCfg.maxTurns : 12,
      weather: lvCfg && lvCfg.weather ? lvCfg.weather : { id: 'calm', name: '晴朗', windAbs: 3, windMul: 1 },
      mapName: mapCfg ? mapCfg.name : '随机地形',
      windMul: (lvCfg && lvCfg.weather && lvCfg.weather.windMul) || 1,
      rng: rng,
      clouds: clouds,
      tanks: [],
      turnIdx: 0,
      wind: 0,
      phase: 'aim',
      aiTimer: 0,
      pendingShots: [],
      projectiles: [],
      fires: [],
      particles: [],
      explosions: [],
      floats: [],
      shake: 0,
      score: 0,
      stars: 0,
      turnsUsed: 0,
      ended: false,
      won: false,
      submitted: false,
      aiCursor: 0,
      stats: emptyBattleStats(),
      lastShotSummary: '',
      bossTankId: null,
      wave: 1,
      runBuffs: emptyRunBuffs(),
      targets: [],
      shotsLeft: mode === 'snipe' ? SNIPE_SHOTS : 99,
      snipeHits: 0,
      erupt: !!(lvCfg && lvCfg.erupt)
    };

    if (mode === 'campaign' && lvCfg && lvCfg.chapter) selectedChapter = lvCfg.chapter;

    if (els.pickOverlay) els.pickOverlay.classList.add('hidden');

    if (mode === 'pvp') {
      var p2Cls = CLASS_KEYS[(CLASS_KEYS.indexOf(selectedClass) + 1) % CLASS_KEYS.length];
      state.tanks.push(makeTank('p1', 0, 'P1 ' + TANK_CLASSES[selectedClass].name, 115 + rng() * 75, selectedClass, false, 1));
      state.tanks.push(makeTank('p2', 1, 'P2 ' + TANK_CLASSES[p2Cls].name, W - 115 - rng() * 75, p2Cls, false, 1));
    } else if (mode === 'snipe') {
      state.tanks.push(makeTank('p1', 0, '我方·' + TANK_CLASSES[selectedClass].name, 100 + rng() * 60, selectedClass, false, 1));
      placeSnipeTargets(rng);
    } else if (mode === 'survival') {
      state.tanks.push(makeTank('p1', 0, '我方·' + TANK_CLASSES[selectedClass].name, 105 + rng() * 75, selectedClass, false, 1));
      spawnSurvivalWave(false);
    } else if (lvCfg && lvCfg.boss) {
      state.tanks.push(makeTank('p1', 0, '我方·' + TANK_CLASSES[selectedClass].name, 105 + rng() * 75, selectedClass, false, 1));
      var b = lvCfg.boss;
      var bCls = b.classKey && TANK_CLASSES[b.classKey] ? b.classKey : 'cannon';
      var phase0 = b.phases && b.phases[0];
      var bossTank = makeTank(
        'boss_0', 1, b.name || '章末', W - 140 - rng() * 40, bCls, true,
        lvCfg.hpScale, (phase0 && phase0.ai) || 'boss', b
      );
      state.tanks.push(bossTank);
      state.bossTankId = bossTank.id;
      // 小跟班（非章末关才有多名对方；章末关可带 0～1 名）
      if ((lvCfg.enemies || 1) > 1) {
        var minion = makeTank('ai_m', 1, '护卫·' + TANK_CLASSES.cross.name, W * 0.55, 'cross', true, 0.75, 'defensive');
        state.tanks.push(minion);
      }
    } else {
      state.tanks.push(makeTank('p1', 0, '我方·' + TANK_CLASSES[selectedClass].name, 105 + rng() * 75, selectedClass, false, 1));
      var enemyCount = lvCfg ? lvCfg.enemies : (lv === 1 ? 1 : (lv <= 3 ? 2 : 3));
      var hpScale = lvCfg ? lvCfg.hpScale : (0.78 + lv * 0.12);
      var elite = !!(lvCfg && lvCfg.elite);
      for (var e = 0; e < enemyCount; e++) {
        var eCls = CLASS_KEYS[Math.floor(rng() * CLASS_KEYS.length)];
        var span = (W - 320) / enemyCount;
        var ex = 320 + e * span + rng() * Math.max(20, span - 60);
        var aiType = pickAiType(eCls, rng, elite && e === enemyCount - 1);
        var tag = aiType === 'boss' ? '章末' : ({
          aggressive: '激进', defensive: '防御', sniper: '远瞄', tactical: '算路'
        }[aiType] || '对方');
        state.tanks.push(makeTank(
          'ai_' + e, 1, tag + '·' + TANK_CLASSES[eCls].name, ex, eCls, true, hpScale, aiType
        ));
      }
    }

    rollWind();
    isCharging = false;
    chargePower = 0;
    chargeWillCancel = false;
    isDragging = false;
    setChargeUi(false);
    els.modalOverlay.classList.add('hidden');
    if (els.modalStars) els.modalStars.textContent = '';
    els.btnSubmit.disabled = true;
    updateHud();
    updateBossHud();
    refreshWepStats();
    if (mode === 'survival') {
      els.hint.textContent = '耐力无尽：清波后三选一。' + playerAimHint();
    } else if (mode === 'snipe') {
      els.hint.textContent = '落点练习：套中全部圆环（共 ' + SNIPE_SHOTS + ' 发）。' + playerAimHint();
    } else if (mode === 'boss') {
      els.hint.textContent = '章末关：' + (state.levelName || '章末') + '。' + playerAimHint();
    } else {
      els.hint.textContent = playerAimHint();
    }
    syncAimTip();
  }

  function playerAimHint() {
    return touchAimOnly
      ? '先拖地图调角度，再按住「抛出」蓄力松手抛出；滑向取消区或 Esc 取消。'
      : '推荐：在地图按住拖出虚线，松手即抛出。也可按住「抛出」/空格蓄力（滑向取消区或 Esc 取消）。';
  }

  function syncAimTip() {
    if (!els.aimTip) return;
    els.aimTip.textContent = touchAimOnly
      ? '先拖图调角，再按住抛出蓄力'
      : '主操作：拖地图虚线 → 松手抛出';
  }

  function placeSnipeTargets(rng) {
    state.targets = [];
    for (var i = 0; i < SNIPE_TARGETS; i++) {
      var tx = 280 + i * ((W - 340) / Math.max(1, SNIPE_TARGETS - 1)) + (rng() - 0.5) * 36;
      tx = Math.max(220, Math.min(W - 60, tx));
      var surf = findTopSurface(tx);
      var ty = Math.max(90, surf - (40 + rng() * 70));
      state.targets.push({
        id: 'tg' + i,
        x: tx,
        y: ty,
        rOuter: 34,
        rMid: 20,
        rInner: 9,
        hit: false,
        points: 0
      });
    }
  }

  function snipeTargetsLeft() {
    return (state.targets || []).filter(function (t) { return !t.hit; }).length;
  }

  function scoreSnipeImpact(x, y) {
    if (mode !== 'snipe' || !state.targets) return;
    state.targets.forEach(function (tg) {
      if (tg.hit) return;
      var d = Math.hypot(tg.x - x, tg.y - y);
      var pts = 0;
      if (d <= tg.rInner) pts = 100;
      else if (d <= tg.rMid) pts = 60;
      else if (d <= tg.rOuter) pts = 30;
      if (pts <= 0) return;
      tg.hit = true;
      tg.points = pts;
      state.snipeHits = (state.snipeHits || 0) + 1;
      state.score += pts;
      spawnFloat(tg.x, tg.y - 28, (pts >= 100 ? '圆心 +' : '碰上 +') + pts, pts >= 100 ? '#ffd43b' : '#74c0fc');
    });
  }

  function standY(x) {
    var ix = Math.max(8, Math.min(W - 9, Math.round(x)));
    for (var y = 60; y < WATER_Y - 10; y++) {
      if (isSolid(ix, y) && isSolid(ix, y + 4)) return y;
    }
    return null;
  }

  function pickStandX(rng, minX, maxX) {
    var lo = Math.max(16, Math.min(minX, maxX));
    var hi = Math.min(W - 16, Math.max(minX, maxX));
    var i, x;
    for (i = 0; i < 28; i++) {
      x = lo + rng() * Math.max(1, hi - lo);
      if (standY(x) != null) return x;
    }
    for (x = lo; x <= hi; x += 4) {
      if (standY(x) != null) return x;
    }
    for (var d = 4; d < W; d += 4) {
      if (lo - d >= 16 && standY(lo - d) != null) return lo - d;
      if (hi + d <= W - 16 && standY(hi + d) != null) return hi + d;
    }
    return (lo + hi) * 0.5;
  }

  function placeTankOnGround(tank, x) {
    var y = standY(x);
    tank.x = x;
    tank.y = y != null ? y : findTopSurface(x);
    tank.vy = 0;
    tank.slope = measureSlope(tank.x, tank.y);
  }

  function refreshSurvivalGround() {
    var rng = mulberry32(hashString('tank-surv-wave-' + state.wave + '-' + Date.now()));
    var dark = document.documentElement.dataset.theme === 'dark';
    var lvCfg = state.levelCfg;
    var mapCfg = lvCfg && lvCfg.map ? lvCfg.map : null;
    generatePixelTerrain(rng, dark, lvCfg ? lvCfg.terrain : null, mapCfg);
    state.rng = rng;
    state.fires = [];
    state.projectiles = [];
    state.pendingShots = [];
    state.explosions = [];
    state.particles = [];
    state.floats = [];
    state.shake = 0;
    var clouds = [];
    for (var i = 0; i < 6; i++) {
      clouds.push({ x: rng() * W, y: 30 + rng() * 90, w: 54 + rng() * 54 });
    }
    state.clouds = clouds;
  }

  function spawnSurvivalWave(advance) {
    var player = state.tanks.filter(function (t) { return t.team === 0 && t.alive; })[0];
    if (advance) {
      state.wave += 1;
      refreshSurvivalGround();
      if (player) placeTankOnGround(player, pickStandX(state.rng, 72, 190));
    }
    state.tanks = player ? [player] : [];
    state.bossTankId = null;
    var wave = state.wave || 1;
    var enemyCount = Math.min(4, 1 + Math.floor((wave - 1) / 2));
    var hpScale = 0.78 + wave * 0.09;
    var elite = wave % 5 === 0;
    for (var e = 0; e < enemyCount; e++) {
      var eCls = CLASS_KEYS[Math.floor(state.rng() * CLASS_KEYS.length)];
      var span = (W - 300) / enemyCount;
      var segLo = 300 + e * span;
      var ex = pickStandX(state.rng, segLo, segLo + Math.max(16, span - 8));
      var aiType = pickAiType(eCls, state.rng, elite && e === enemyCount - 1);
      var tag = aiType === 'boss' ? '章末' : ({
        aggressive: '激进', defensive: '防御', sniper: '远瞄', tactical: '算路'
      }[aiType] || '对方');
      state.tanks.push(makeTank(
        'sv_' + wave + '_' + e, 1, 'W' + wave + '·' + tag + '·' + TANK_CLASSES[eCls].name,
        ex, eCls, true, hpScale, aiType
      ));
    }
    state.turnIdx = 0;
    state.phase = 'aim';
    state.pendingShots = [];
    state.projectiles = [];
    rollWind();
  }

  function showSurvivalPick() {
    state.phase = 'pick';
    setChargeUi(false);
    if (!els.pickOverlay || !els.pickChoices) {
      beginNextSurvivalWave();
      return;
    }
    var pool = SURVIVAL_UPGRADES.slice();
    var choices = [];
    while (choices.length < 3 && pool.length) {
      var ix = Math.floor(state.rng() * pool.length);
      choices.push(pool.splice(ix, 1)[0]);
    }
    if (els.pickTitle) els.pickTitle.textContent = '第 ' + state.wave + ' 波通关 · 三选一';
    if (els.pickSummary) {
      els.pickSummary.textContent = '本局 ' + state.score + ' · 选一项强化后进入第 ' + (state.wave + 1) + ' 波';
    }
    els.pickChoices.innerHTML = '';
    choices.forEach(function (up) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pick-btn';
      btn.innerHTML = '<strong>' + up.name + '</strong><span>' + up.desc + '</span>';
      btn.addEventListener('click', function () {
        var p1 = state.tanks.filter(function (t) { return t.team === 0 && t.alive; })[0];
        if (p1) up.apply(state.runBuffs, p1);
        spawnFloat(p1 ? p1.x : W / 2, p1 ? p1.y - 40 : 120, up.name, '#ffe066');
        els.pickOverlay.classList.add('hidden');
        beginNextSurvivalWave();
      });
      els.pickChoices.appendChild(btn);
    });
    els.pickOverlay.classList.remove('hidden');
    updateHud();
  }

  function beginNextSurvivalWave() {
    state.score += 160 + state.wave * 45;
    spawnSurvivalWave(true);
    if (els.hint) els.hint.textContent = '第 ' + state.wave + ' 波开始！地形已重新铺好。';
    refreshWepStats();
    updateHud();
  }

  function refreshWepStats() {
    if (!els.wepStats) return;
    var cls = TANK_CLASSES[selectedClass] || TANK_CLASSES.cannon;
    var buff = (state && state.runBuffs) || emptyRunBuffs();
    var d1 = Math.round(cls.wep1.dmg * (buff.dmgMul || 1));
    var r1 = Math.round(cls.wep1.radius * (buff.radiusMul || 1));
    var t1 = (cls.wep1.terrain * (buff.terrainMul || 1)).toFixed(2);
    var d2 = Math.round(cls.wep2.dmg * (buff.dmgMul || 1));
    var r2 = Math.round(cls.wep2.radius * (buff.radiusMul || 1));
    var t2 = (cls.wep2.terrain * (buff.terrainMul || 1)).toFixed(2);
    var critMul = (CRIT_MULT + (buff.critBonus || 0)).toFixed(2);
    els.wepStats.innerHTML =
      '<div class="wep-line"><strong>1号 · ' + cls.wep1.name + '</strong>' +
      '<span>力度 ' + d1 + ' · 半径 ' + r1 + ' · 挖地×' + t1 + ' · ∞</span></div>' +
      '<div class="wep-line"><strong>2号 · ' + cls.wep2.name + '</strong>' +
      '<span>力度 ' + d2 + ' · 半径 ' + r2 + ' · 挖地×' + t2 + '</span></div>' +
      '<div class="wep-line"><strong>结算规则</strong>' +
      '<span>靠近中心（≤半径' + Math.round(CRIT_DIST_RATIO * 100) + '%）加分×' + critMul +
      ' · 一发多人=多目标 · 挖穿坠海=坠落出局</span></div>';
  }

  function setChargeUi(on) {
    if (els.appRoot) {
      els.appRoot.classList.toggle('charging', !!on);
      els.appRoot.classList.toggle('will-cancel', !!on && chargeWillCancel);
    }
    if (els.chargeOverlay) els.chargeOverlay.classList.toggle('hidden', !on);
    if (els.chargePct) els.chargePct.textContent = Math.round(chargePower) + '%';
    if (els.cancelZoneDock) els.cancelZoneDock.setAttribute('aria-hidden', on ? 'false' : 'true');
  }

  function pointerInRect(ev, el) {
    if (!el || !ev) return false;
    var r = el.getBoundingClientRect();
    return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
  }

  function updateChargeCancelFromEvent(ev) {
    if (!isCharging) return;
    var inCancel = pointerInRect(ev, els.cancelZoneDock) || pointerInRect(ev, els.cancelZone);
    chargeWillCancel = !!inCancel;
    if (els.appRoot) els.appRoot.classList.toggle('will-cancel', chargeWillCancel);
    if (els.chargePct) els.chargePct.textContent = Math.round(chargePower) + '%';
  }

  function calcStars(playerWon) {
    if (!playerWon) return 0;
    var p1 = state.tanks[0];
    var stars = 1;
    if (p1 && p1.hp > p1.maxHp * 0.5) stars += 1;
    if (state.turnsUsed <= (state.maxTurns || 12)) stars += 1;
    return stars;
  }

  function starsText(n) {
    var s = '';
    for (var i = 0; i < 3; i++) s += i < n ? '★' : '☆';
    return s;
  }

  function activeTank() {
    return state.tanks[state.turnIdx];
  }

  function rollWind() {
    var wa = 10;
    if (state.weather && state.weather.windAbs != null) wa = state.weather.windAbs;
    else if (state.levelCfg && state.levelCfg.windAbs != null) wa = state.levelCfg.windAbs;
    state.wind = Math.floor(state.rng() * (wa * 2 + 1)) - wa;
    // 风暴：额外随机翻一次符号或加大偏置
    if (state.weather && state.weather.id === 'storm' && state.rng() < 0.45) {
      state.wind = (state.wind >= 0 ? 1 : -1) * Math.min(wa, Math.abs(state.wind) + 3);
    }
  }

  function tickEruptions() {
    if (!state || !state.erupt || state.ended) return;
    // 每回合约 55% 在地面喷发一处灼热区（避开玩家脚下过近）
    if (state.rng() > 0.55) return;
    var tries = 0;
    var ex = 200 + state.rng() * (W - 280);
    var ey = findTopSurface(ex);
    while (tries < 6) {
      var tooClose = state.tanks.some(function (t) {
        return t.alive && t.team === 0 && Math.hypot(t.x - ex, t.y - ey) < 70;
      });
      if (!tooClose && ey < WATER_Y - 20) break;
      ex = 120 + state.rng() * (W - 240);
      ey = findTopSurface(ex);
      tries += 1;
    }
    state.fires.push({
      x: ex, y: ey - 6, r: 32 + state.rng() * 10,
      turnsLeft: 2 + Math.floor(state.rng() * 2),
      dps: 12, ownerTeam: -1
    });
    state.shake = Math.max(state.shake || 0, 5);
    spawnFloat(ex, ey - 40, '地热喷涌！', '#ff922b');
    sfxExplode(false);
  }

  function effectiveWindAccel() {
    return WIND_ACCEL * (state.windMul || 1);
  }

  function currentBoss() {
    if (!state.bossTankId) return null;
    for (var i = 0; i < state.tanks.length; i++) {
      if (state.tanks[i].id === state.bossTankId) return state.tanks[i];
    }
    return null;
  }

  function bossPhaseOf(tank) {
    if (!tank || !tank.bossCfg || !tank.bossCfg.phases) return null;
    var ratio = tank.hp / tank.maxHp;
    var phases = tank.bossCfg.phases;
    var idx = 0;
    for (var j = 0; j < phases.length; j++) {
      if (ratio <= phases[j].hp) idx = j;
    }
    return { index: idx, conf: phases[idx] };
  }

  function updateBossPhase(tank, fromDamage) {
    if (!tank || !tank.isBoss) return;
    var info = bossPhaseOf(tank);
    if (!info) return;
    if (info.index !== tank.bossPhase) {
      tank.bossPhase = info.index;
      tank.aiType = info.conf.ai || tank.aiType;
      spawnFloat(tank.x, tank.y - 56, '阶段：' + (info.conf.label || ('P' + (info.index + 1))), '#ffd43b');
      if (info.conf.quake) {
        var qx = tank.x + (state.rng() - 0.5) * 160;
        carvePixelCrater(qx, tank.y + 10, 42, 1.2);
        state.shake = 10;
        spawnFloat(qx, tank.y - 30, '落石！', '#fab005');
      }
      if (els.hint) els.hint.textContent = (tank.name || '章末') + ' 进入「' + info.conf.label + '」阶段！';
    }
    updateBossHud();
  }

  function updateBossHud() {
    var boss = currentBoss();
    if (!els.hudLeader) return;
    if (!boss || !boss.alive) {
      els.hudLeader.classList.add('hidden');
      return;
    }
    els.hudLeader.classList.remove('hidden');
    var info = bossPhaseOf(boss);
    if (els.hudLeaderName) els.hudLeaderName.textContent = boss.name;
    if (els.hudLeaderPhase) els.hudLeaderPhase.textContent = info && info.conf ? ('阶段 ' + (info.index + 1) + ' · ' + info.conf.label) : '';
    var pct = Math.max(0, Math.round(100 * boss.hp / boss.maxHp));
    if (els.hudLeaderHp) els.hudLeaderHp.style.width = pct + '%';
    if (els.hudLeaderHpText) els.hudLeaderHpText.textContent = Math.round(boss.hp) + '/' + boss.maxHp;
  }

  function applyBossWeakness(tank, dmg) {
    if (!tank || !tank.isBoss) return dmg;
    var info = bossPhaseOf(tank);
    if (info && info.conf && info.conf.weakness) {
      return Math.round(dmg * info.conf.weakness);
    }
    return dmg;
  }

  function checkBattleOutcome() {
    if (state.ended || state.phase === 'pick') return true;
    var alive0 = state.tanks.filter(function (t) { return t.alive && t.team === 0; });
    var alive1 = state.tanks.filter(function (t) { return t.alive && t.team === 1; });
    if (mode === 'snipe') {
      if (alive0.length === 0) {
        finishBattle(false);
        return true;
      }
      if (snipeTargetsLeft() === 0) {
        finishBattle(true);
        return true;
      }
      var busy = state.phase === 'firing' || state.projectiles.length || state.pendingShots.length || state.explosions.length;
      if (!busy && state.shotsLeft <= 0) {
        finishBattle(false);
        return true;
      }
      return false;
    }
    if (mode === 'survival') {
      if (alive0.length === 0) {
        finishBattle(false);
        return true;
      }
      if (alive1.length === 0) {
        // 等本次抛出结算完再出三选一，避免弧线冻结
        if (state.phase === 'firing' || state.projectiles.length || state.pendingShots.length) {
          state.wavePending = true;
          return false;
        }
        state.wavePending = false;
        showSurvivalPick();
        return true;
      }
      return false;
    }
    if (alive0.length === 0 || alive1.length === 0) {
      finishBattle(alive0.length > 0);
      return true;
    }
    return false;
  }

  function nextTurn() {
    if (state.ended || state.phase === 'pick') return;

    // 烈焰灼热区结算与衰减
    for (var f = state.fires.length - 1; f >= 0; f--) {
      var fire = state.fires[f];
      var burn = fire.dps || 12;
      state.tanks.forEach(function (t) {
        if (t.alive && Math.hypot(t.x - fire.x, t.y - fire.y) <= fire.r + 14) {
          t.hp = Math.max(0, t.hp - burn);
          t.hitFlash = 0.2;
          spawnFloat(t.x, t.y - 36, '热 -' + burn, '#ff922b');
          if (state.stats && fire.ownerTeam === 0 && t.team === 1) state.stats.damageDealt += burn;
          if (state.stats && t.team === 0) state.stats.damageTaken += burn;
          if (t.hp <= 0) {
            t.alive = false;
            if (t.team === 1) {
              state.score += 150;
              if (state.stats) state.stats.kills += 1;
            }
          }
        }
      });
      fire.turnsLeft -= 1;
      if (fire.turnsLeft <= 0) state.fires.splice(f, 1);
    }

    // 迷雾：站在较低处持续掉体力
    if (state.weather && state.weather.toxicDps) {
      var toxicLine = WATER_Y - 90;
      var tdps = state.weather.toxicDps;
      state.tanks.forEach(function (t) {
        if (!t.alive || t.y < toxicLine) return;
        t.hp = Math.max(0, t.hp - tdps);
        t.hitFlash = 0.15;
        spawnFloat(t.x, t.y - 28, '雾 -' + tdps, '#94d82d');
        if (t.team === 0 && state.stats) state.stats.damageTaken += tdps;
        if (t.hp <= 0) {
          t.alive = false;
          if (t.team === 1 && state.stats) state.stats.kills += 1;
        }
      });
    }

    if (checkBattleOutcome()) return;

    tickEruptions();
    if (checkBattleOutcome()) return;

    if (mode === 'pvp') {
      var n = state.tanks.length;
      for (var s = 1; s <= n; s++) {
        var idx = (state.turnIdx + s) % n;
        if (state.tanks[idx].alive) {
          state.turnIdx = idx;
          break;
        }
      }
    } else {
      // 闯关/每日：你抛一次，只轮到一名对方，再回到你。避免第二关两名对方连着行动。
      var curTeam = state.tanks[state.turnIdx].team;
      var nextIdx = -1;
      if (curTeam === 0) {
        var start = state.aiCursor || 0;
        var count = state.tanks.length;
        for (var k = 0; k < count; k++) {
          var j = (start + k) % count;
          if (state.tanks[j].alive && state.tanks[j].team === 1) {
            nextIdx = j;
            state.aiCursor = j + 1;
            break;
          }
        }
      } else {
        for (var p = 0; p < state.tanks.length; p++) {
          if (state.tanks[p].alive && state.tanks[p].team === 0) {
            nextIdx = p;
            break;
          }
        }
      }
      if (nextIdx >= 0) state.turnIdx = nextIdx;
    }

    var cur = activeTank();
    cur.fuel = 100;
    cur.armedItem = null;
    if (els.hint) els.hint.dataset.fuelHint = '';
    rollWind();
    isCharging = false;
    chargePower = 0;

    if (cur.isAi) {
      state.phase = 'ai_think';
      state.aiTimer = 0.8;
      var aiLabel = ({
        aggressive: '激进', defensive: '防御', sniper: '远瞄', tactical: '算路', boss: '章末'
      })[cur.aiType] || '';
      els.hint.textContent = cur.name + (aiLabel ? '（' + aiLabel + '）' : '') + ' 正在测算风向与坡度…';
    } else {
      state.phase = 'aim';
      state.turnsUsed += 1;
      var prev = state.lastShotSummary ? ('上发：' + state.lastShotSummary + ' · ') : '';
      els.hint.textContent = prev + cur.name + ' 回合 · ' + playerAimHint();
    }
    updateHud();
  }

  function finishBattle(playerWon) {
    state.ended = true;
    state.won = playerWon;
    state.phase = 'over';
    setChargeUi(false);
    if (els.pickOverlay) els.pickOverlay.classList.add('hidden');

    if (mode === 'survival') {
      var survScore = encodeSurvivalScore(state.wave, state.score);
      if (survScore > (progress.bestSurvival || 0)) {
        progress.bestSurvival = survScore;
        persistProgress();
      }
      sfxLose();
      var stS = state.stats || emptyBattleStats();
      els.modalKicker.textContent = '生存结束';
      els.modalTitle.textContent = '撑到第 ' + state.wave + ' 波';
      if (els.modalStars) els.modalStars.textContent = '';
      els.modalSummary.textContent =
        '本局 ' + state.score + ' · 波次 ' + state.wave +
        ' · 力度 ' + stS.damageDealt + ' · 加分 ' + (stS.crits || 0) +
        ' · 多目标 ' + (stS.multiHitShots || 0) +
        ' · 坠落出局 ' + (stS.fallKills || 0) +
        ' · 历史最佳 ' + formatSurvivalScore(progress.bestSurvival || 0);
      els.btnModalPrimary.textContent = '再开一局';
      els.btnSubmit.disabled = false;
      els.btnModalSubmit.disabled = false;
      state.won = true; // 允许提交生存成绩
      if (autoSubmit) submitScore({ auto: true });
      els.modalOverlay.classList.remove('hidden');
      updateHud();
      refreshBoard();
      return;
    }

    if (mode === 'snipe') {
      if (state.score > (progress.bestSnipe || 0)) {
        progress.bestSnipe = state.score;
        persistProgress();
      }
      var hits = state.snipeHits || 0;
      var left = snipeTargetsLeft();
      if (playerWon) sfxWin(); else sfxLose();
      els.modalKicker.textContent = '落点练习';
      els.modalTitle.textContent = playerWon ? '全部碰上！' : '次数用尽';
      if (els.modalStars) els.modalStars.textContent = '';
      els.modalSummary.textContent =
        '本局 ' + state.score + ' · 碰上 ' + hits + '/' + SNIPE_TARGETS +
        (left ? (' · 剩余环 ' + left) : '') +
        ' · 剩余次数 ' + Math.max(0, state.shotsLeft || 0) +
        ' · 历史最佳 ' + (progress.bestSnipe || 0);
      els.btnModalPrimary.textContent = '再来一局';
      els.btnSubmit.disabled = false;
      els.btnModalSubmit.disabled = false;
      state.won = true;
      if (autoSubmit) submitScore({ auto: true });
      els.modalOverlay.classList.remove('hidden');
      updateHud();
      refreshBoard();
      return;
    }

    if (mode === 'pvp') {
      sfxWin();
      if (els.modalStars) els.modalStars.textContent = '';
      els.modalKicker.textContent = '双人同屏结束';
      els.modalTitle.textContent = playerWon ? '蓝方 P1 获胜！' : '红方 P2 获胜！';
      els.modalSummary.textContent = '精彩一局！点击下方立即开启下一局新地形。';
      els.btnModalPrimary.textContent = '再来一局';
      els.btnSubmit.disabled = true;
      els.btnModalSubmit.disabled = true;
    } else {
      if (playerWon) {
        var p1 = state.tanks[0];
        state.score += Math.round(p1.hp * 3) + Math.max(0, 280 - state.turnsUsed * 20);
        state.stars = calcStars(true);
        sfxWin();
        if (mode === 'campaign') {
          progress.campaignRunScore = (progress.campaignRunScore || 0) + state.score;
          if (state.score > progress.bestCampaign) progress.bestCampaign = state.score;
          if (progress.campaignRunScore > (progress.bestRunScore || 0)) {
            progress.bestRunScore = progress.campaignRunScore;
          }
          var prevStar = progress.stars[state.levelId] || 0;
          if (state.stars > prevStar) progress.stars[state.levelId] = state.stars;
        }
        if (mode === 'daily') {
          var k = todayKey();
          if (!progress.bestDaily[k] || state.score > progress.bestDaily[k]) progress.bestDaily[k] = state.score;
        }
        if (mode === 'boss') {
          if (state.score > (progress.bestBoss || 0)) progress.bestBoss = state.score;
          progress.bossIndex = (progress.bossIndex || 0) + 1;
        }
        persistProgress();
      } else {
        state.stars = 0;
        sfxLose();
      }

      var st = state.stats || emptyBattleStats();
      var starLine = playerWon && mode !== 'boss' ? ('评价 ' + starsText(state.stars) + ' · ') : '';
      els.modalKicker.textContent = playerWon
        ? (mode === 'daily' ? '每日同种通关'
          : (mode === 'boss' ? ('章末通过 · ' + (state.levelName || '章末'))
            : ((state.levelName || ('第 ' + state.level + ' 关')) + ' 完成')))
        : '本局结束';
      els.modalTitle.textContent = playerWon ? '通关啦！' : '再试一次';
      if (els.modalStars) els.modalStars.textContent = (playerWon && mode !== 'boss') ? starsText(state.stars) : '';
      els.modalSummary.textContent =
        starLine + '本局 ' + state.score + ' · 回合 ' + state.turnsUsed + '/' + (state.maxTurns || '—') +
        (mode === 'campaign' ? (' · 累计 ' + (progress.campaignRunScore || 0)) : '') +
        (mode === 'boss' ? (' · 章末榜最佳 ' + (progress.bestBoss || 0)) : '') +
        ' · 造成影响 ' + st.damageDealt + ' / 承受 ' + st.damageTaken +
        ' · 挖地 ' + st.terrainCarved + ' · 出局 ' + st.kills +
        (st.crits ? (' · 加分 ' + st.crits) : '') +
        (st.fallKills ? (' · 坠落出局 ' + st.fallKills) : '') +
        (st.multiHitShots ? (' · 多目标 ' + st.multiHitShots) : '') +
        (playerWon
          ? (mode === 'boss' ? ' · 轮换下一位章末！' : (state.stars >= 3 ? ' · 三星通关！' : ' · 漂亮的抛物线！'))
          : ' · 善用瞬移离开凹地、回复体力，再来一局！');
      els.btnModalPrimary.textContent = playerWon
        ? (mode === 'daily' ? '再刷一次' : (mode === 'boss' ? '下一章末' : '下一关'))
        : '再玩本局';
      els.btnSubmit.disabled = !playerWon;
      els.btnModalSubmit.disabled = !playerWon;
      if (playerWon && autoSubmit) submitScore({ auto: true });
    }

    els.modalOverlay.classList.remove('hidden');
    updateHud();
    renderLevelList();
    refreshBoard();
  }

  function unlockedLevel() {
    var u = Math.max(1, progress.level || 1);
    if (LevelDB && progress.stars) {
      for (var i = 1; i <= TOTAL_LEVELS; i++) {
        var raw = LevelDB.getLevel(i);
        if (raw && progress.stars[raw.id]) u = Math.max(u, Math.min(TOTAL_LEVELS, i + 1));
      }
    }
    return Math.min(TOTAL_LEVELS, u);
  }

  function chapterRange(ch) {
    var meta = LevelDB && LevelDB.CHAPTER_META[ch];
    if (meta && meta.range) return meta.range;
    return [1, TOTAL_LEVELS];
  }

  function chapterUnlocked(ch) {
    var range = chapterRange(ch);
    return unlockedLevel() >= range[0];
  }

  function renderChapterTabs() {
    if (!els.chapterTabs) return;
    els.chapterTabs.innerHTML = '';
    if (mode !== 'campaign' || !LevelDB) {
      els.chapterTabs.classList.add('hidden');
      return;
    }
    els.chapterTabs.classList.remove('hidden');
    var chapters = LevelDB.listChapters ? LevelDB.listChapters() : [1, 2, 3, 4, 5];
    chapters.forEach(function (ch) {
      var meta = LevelDB.CHAPTER_META[ch] || {};
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chapter-chip' + (ch === selectedChapter ? ' active' : '');
      btn.textContent = meta.short || ('第' + ch + '章');
      btn.title = meta.name || ('第 ' + ch + ' 章');
      btn.disabled = !chapterUnlocked(ch);
      btn.dataset.chapter = String(ch);
      btn.addEventListener('click', function () {
        var n = Number(btn.dataset.chapter);
        if (!n || !chapterUnlocked(n)) return;
        selectedChapter = n;
        var range = chapterRange(n);
        if (progress.level < range[0] || progress.level > range[1]) {
          progress.level = Math.min(unlockedLevel(), range[0]);
          persistProgress();
          initGame();
        }
        renderLevelList();
      });
      els.chapterTabs.appendChild(btn);
    });
  }

  function renderLevelList() {
    if (!els.levelList) return;
    els.levelList.innerHTML = '';
    if (mode !== 'campaign' || !LevelDB) {
      if (els.chapterTabs) els.chapterTabs.classList.add('hidden');
      if (els.chapterLabel) els.chapterLabel.textContent = mode === 'campaign' ? '关卡数据未加载' : '选关仅闯关模式可用';
      return;
    }
    if (!selectedChapter) selectedChapter = LevelDB.chapterOf(progress.level) || 1;
    if (!chapterUnlocked(selectedChapter)) {
      selectedChapter = LevelDB.chapterOf(Math.min(progress.level, unlockedLevel())) || 1;
    }
    renderChapterTabs();
    var meta = LevelDB.CHAPTER_META[selectedChapter];
    var range = chapterRange(selectedChapter);
    if (els.chapterLabel) {
      els.chapterLabel.textContent = (meta && meta.name) || ('第 ' + selectedChapter + ' 章');
    }
    var unlock = unlockedLevel();
    for (var i = range[0]; i <= range[1]; i++) {
      var raw = LevelDB.getLevel(i);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'level-btn';
      if (raw && raw.boss) btn.classList.add('leader');
      if (raw && raw.erupt) btn.classList.add('erupt');
      if (i === progress.level) btn.classList.add('active');
      btn.disabled = i > unlock;
      var localIdx = i - range[0] + 1;
      var starN = (raw && progress.stars[raw.id]) || 0;
      var starS = starN ? ('★'.repeat(starN) + '☆'.repeat(3 - starN)) : '';
      btn.innerHTML = String(localIdx) + (starS ? ('<small>' + starS + '</small>') : (raw && raw.boss ? '<small>章末</small>' : ''));
      btn.title = (raw && raw.name) || ('第 ' + i + ' 关');
      btn.dataset.level = String(i);
      btn.addEventListener('click', function (ev) {
        var n = Number(ev.currentTarget.dataset.level);
        if (!n || n > unlockedLevel()) return;
        progress.level = n;
        selectedChapter = LevelDB.chapterOf(n) || selectedChapter;
        persistProgress();
        initGame();
        renderLevelList();
        setSideOpen(false);
        layoutCanvas();
      });
      els.levelList.appendChild(btn);
    }
  }

  // --- 抛出系统（支持 4 种角色进阶 + 瞬移/加强/连抛道具） ---
  function resetShotStats() {
    if (!state.stats) return;
    state.stats.shotDamage = 0;
    state.stats.shotHits = 0;
    state.stats.shotTerrain = 0;
    state.stats.shotKills = 0;
    state.stats.shotCrits = 0;
    state.stats.shotFalls = 0;
    state.lastShotSummary = '';
  }

  function summarizeShot(ownerTeam) {
    if (!state.stats) return;
    var s = state.stats;
    if (!s.shotDamage && !s.shotTerrain && !s.shotKills && !s.shotFalls) {
      state.lastShotSummary = '未碰上有效目标';
      if (ownerTeam === 0 && els.hint) els.hint.textContent = '本发：' + state.lastShotSummary;
      return;
    }
    var bits = [];
    if (s.shotDamage) bits.push('力度 ' + s.shotDamage);
    if (s.shotCrits) bits.push('加分×' + s.shotCrits);
    if (s.shotHits > 1) bits.push('多目标×' + s.shotHits);
    if (s.shotTerrain) bits.push('挖地 ' + s.shotTerrain);
    var directKills = Math.max(0, (s.shotKills || 0) - (s.shotFalls || 0));
    if (directKills) bits.push('正中离场×' + directKills);
    if (s.shotFalls) bits.push('坠落出局×' + s.shotFalls);
    state.lastShotSummary = bits.join(' · ');
    if (ownerTeam === 0 && els.hint) els.hint.textContent = '本发：' + state.lastShotSummary;
    if (s.shotHits >= 2) s.multiHitShots += 1;
  }

  function fireTank(tank, powerPct) {
    if (state.phase === 'pick' || state.ended) return;
    if (state.phase !== 'aim' && state.phase !== 'ai_think') return;
    if (mode === 'snipe' && !tank.isAi) {
      if (state.shotsLeft <= 0) return;
      state.shotsLeft -= 1;
    }
    tank.lastPower = powerPct;
    state.phase = 'firing';
    resetShotStats();

    var baseAng = tankWorldAngle(tank);
    var speed = Math.max(130, (powerPct / 100) * MAX_SPEED);
    var mx = tank.x + Math.cos(baseAng) * 20;
    var my = tank.y - 12 + Math.sin(baseAng) * 20;

    // 如果装备了瞬移
    if (tank.armedItem === 'tp') {
      tank.items.tp -= 1;
      tank.armedItem = null;
      state.pendingShots.push({
        delay: 0, x: mx, y: my,
        vx: Math.cos(baseAng) * speed, vy: Math.sin(baseAng) * speed,
        dmg: 0, radius: 0, terrain: 0, color: '#63e6be', special: 'tp',
        ownerId: tank.id, ownerTeam: tank.team
      });
      updateHud();
      return;
    }

    var isBig = (tank.weaponSlot === 2 && tank.wep2Left > 0);
    if (isBig) tank.wep2Left -= 1;
    var wep = isBig ? tank.cls.wep2 : tank.cls.wep1;

    var dmgMul = 1;
    var radMul = 1;
    var terrMul = 1;
    var volleys = 1;
    // AI：三连不叠连抛，避免一回合六次
    var wantDouble = tank.armedItem === 'double';
    if (tank.isAi && wep.special === 'triple') wantDouble = false;
    if (tank.armedItem === 'power') {
      tank.items.power -= 1;
      dmgMul = 1.75;
    } else if (wantDouble) {
      tank.items.double -= 1;
      volleys = 2;
    }
    tank.armedItem = null;
    if (tank.isBoss) {
      var bpFire = bossPhaseOf(tank);
      if (bpFire && bpFire.conf && bpFire.conf.berserk) dmgMul *= 1.22;
    }
    if (!tank.isAi && state.runBuffs) {
      dmgMul *= state.runBuffs.dmgMul || 1;
      radMul *= state.runBuffs.radiusMul || 1;
      terrMul *= state.runBuffs.terrainMul || 1;
    }

    for (var v = 0; v < volleys; v++) {
      var vDelay = v * 0.28;
      var shotDmg = Math.round(wep.dmg * dmgMul);
      var shotR = Math.round(wep.radius * radMul);
      var shotT = (wep.terrain || 1) * terrMul;
      if (wep.special === 'triple') {
        [-0.1, 0, 0.1].forEach(function (da, idx) {
          state.pendingShots.push({
            delay: vDelay + idx * 0.04, x: mx, y: my,
            vx: Math.cos(baseAng + da) * speed * (0.96 + idx * 0.04),
            vy: Math.sin(baseAng + da) * speed * (0.96 + idx * 0.04),
            dmg: shotDmg, radius: shotR,
            terrain: shotT, color: wep.color,
            special: 'normal', ownerId: tank.id, ownerTeam: tank.team
          });
        });
      } else {
        state.pendingShots.push({
          delay: vDelay, x: mx, y: my,
          vx: Math.cos(baseAng) * speed, vy: Math.sin(baseAng) * speed,
          dmg: shotDmg, radius: shotR,
          terrain: shotT, color: wep.color,
          special: wep.special || 'normal', ownerId: tank.id, ownerTeam: tank.team
        });
      }
    }

    if (tank.weaponSlot === 2 && tank.wep2Left <= 0) tank.weaponSlot = 1;
    updateHud();
  }

  // --- AI 操作（对抛 + 埋脚/砸桥落水 + 道具） ---
  function terrainThicknessUnder(x, y) {
    var ix = Math.max(0, Math.min(W - 1, Math.round(x)));
    var iy = Math.max(0, Math.min(H - 1, Math.round(y)));
    var thick = 0;
    for (var dy = 0; dy < 48; dy++) {
      if (iy + dy >= H) break;
      if (terrMask[(iy + dy) * W + ix] === 1) thick++;
      else if (thick > 0) break;
    }
    return thick;
  }

  function scoreAiImpact(sx, sy, target, radius) {
    var body = Math.hypot(sx - target.x, sy - (target.y - 10));
    var feet = Math.hypot(sx - target.x, sy - (target.y + 10));
    var score = Math.min(body, feet * 0.82);
    var thick = terrainThicknessUnder(target.x, target.y);
    // 薄板/悬空：砸脚下更优（坠海/埋坑）
    if (thick > 0 && thick < 38 && feet < radius + 22) {
      score *= 0.42 + thick / 90;
    }
    // 正中角色额外加分
    if (body <= 18) score *= 0.55;
    return score;
  }

  function aiUseItems(ai, bestErr) {
    var typ = ai.aiType || 'aggressive';
    var healLine = typ === 'defensive' ? 0.55 : 0.42;
    if (ai.hp / ai.maxHp < healLine && ai.items.heal > 0 && state.rng() < (typ === 'defensive' ? 0.85 : 0.72)) {
      ai.items.heal -= 1;
      ai.hp = Math.min(ai.maxHp, ai.hp + 40);
      sfxHeal();
      spawnFloat(ai.x, ai.y - 30, '+40', '#69db7c');
    }
    var usingTriple = ai.weaponSlot === 2 && ai.cls.wep2 && ai.cls.wep2.special === 'triple';
    if (bestErr < 48 && ai.items.power > 0 && state.rng() < (typ === 'sniper' ? 0.55 : 0.4)) {
      ai.armedItem = 'power';
    } else if (!usingTriple && bestErr < 70 && ai.items.double > 0 && state.rng() < (typ === 'aggressive' ? 0.32 : 0.18)) {
      ai.armedItem = 'double';
    } else if (bestErr > 110 && ai.items.tp > 0 && state.rng() < (typ === 'defensive' ? 0.28 : 0.14)) {
      ai.armedItem = 'tp';
    }
  }

  function aiNudgePosition(ai, target) {
    if (ai.fuel < 28) return;
    var typ = ai.aiType || 'aggressive';
    var thick = terrainThicknessUnder(ai.x, ai.y);
    // 不再先走到有利瞄准点再瞄准；只在脚下太薄时小退，防御型多退几步
    if (thick >= 18 && typ !== 'defensive') return;
    var away = ai.x < W * 0.5 ? 1 : -1;
    if (target) away = target.x >= ai.x ? -1 : 1;
    var steps = thick < 18 ? away : (typ === 'defensive' && state.rng() < 0.35 ? away : 0);
    if (!steps) return;
    var maxStep = typ === 'defensive' ? 5 : 3;
    for (var i = 0; i < maxStep && ai.fuel > 20; i++) {
      var nx = Math.max(18, Math.min(W - 18, ai.x + steps * 6));
      var ny = findSurfaceNear(nx, ai.y);
      if (ny === null || ny > WATER_Y - 8) break;
      ai.x = nx;
      ai.y = ny;
      ai.fuel -= 6;
      ai.facing = steps;
      if (terrainThicknessUnder(ai.x, ai.y) >= 18 && typ !== 'defensive') break;
    }
    ai.slope = measureSlope(ai.x, ai.y);
  }

  function runAiTurn() {
    var ai = activeTank();
    var target = state.tanks.filter(function (t) { return t.alive && t.team === 0; })[0];
    if (!ai || !target) { nextTurn(); return; }

    var typ = ai.aiType || 'aggressive';
    aiNudgePosition(ai, target);
    ai.facing = target.x >= ai.x ? 1 : -1;

    var underThin = terrainThicknessUnder(target.x, target.y) < 34;
    var wep2Chance = underThin ? 0.72 : 0.3;
    if (typ === 'tactical' || typ === 'boss') wep2Chance = underThin ? 0.88 : 0.45;
    if (typ === 'sniper') wep2Chance = underThin ? 0.35 : 0.18;
    if (typ === 'defensive') wep2Chance *= 0.7;
    if (ai.wep2Left > 0 && state.rng() < wep2Chance) {
      ai.weaponSlot = 2;
    } else {
      ai.weaponSlot = 1;
    }

    var wep = ai.weaponSlot === 2 && ai.wep2Left > 0 ? ai.cls.wep2 : ai.cls.wep1;
    var bestRel = 42, bestPow = 55, bestErr = 99999;
    var relList = typ === 'sniper' || typ === 'boss'
      ? [16, 22, 28, 34, 40, 46, 52, 58, 64, 70, 76]
      : [18, 28, 38, 48, 58, 68, 76];
    var powStep = typ === 'sniper' || typ === 'boss' ? 3 : 5;
    for (var a = 0; a < relList.length; a++) {
      ai.relAngle = Math.max(ai.cls.minRelAng, Math.min(ai.cls.maxRelAng, relList[a]));
      var wang = tankWorldAngle(ai);
      for (var p = 22; p <= 98; p += powStep) {
        var spd = (p / 100) * MAX_SPEED;
        var sx = ai.x + Math.cos(wang) * 20;
        var sy = ai.y - 12 + Math.sin(wang) * 20;
        var vx = Math.cos(wang) * spd;
        var vy = Math.sin(wang) * spd;
        for (var st = 0; st < 160; st++) {
          var dt = 0.03;
          vx += state.wind * effectiveWindAccel() * dt;
          vy += GRAVITY * dt;
          sx += vx * dt;
          sy += vy * dt;
          if (sx < -20 || sx >= W + 20 || sy >= WATER_Y) break;
          var hitTank = Math.hypot(sx - target.x, sy - (target.y - 10)) <= 16;
          if (isSolid(sx, sy) || hitTank) {
            var err = scoreAiImpact(sx, sy, target, wep.radius);
            // 算路型更偏爱砸脚
            if (typ === 'tactical' || typ === 'boss') {
              var feet = Math.hypot(sx - target.x, sy - (target.y + 10));
              if (feet < wep.radius + 20) err *= 0.78;
            }
            if (err < bestErr) { bestErr = err; bestRel = ai.relAngle; bestPow = p; }
            break;
          }
        }
      }
    }

    aiUseItems(ai, bestErr);
    if (ai.armedItem === 'tp') {
      bestRel = Math.max(ai.cls.minRelAng, Math.min(ai.cls.maxRelAng, 50 + (state.rng() - 0.5) * 16));
      bestPow = 48 + Math.abs(target.x - ai.x) / W * 40;
    }

    var jitter = Math.max(1.2, 11 - state.level * 1.5);
    if (typ === 'sniper') jitter *= 0.45;
    if (typ === 'boss') jitter *= 0.55;
    if (ai.isBoss) {
      var bpAi = bossPhaseOf(ai);
      if (bpAi && bpAi.conf && bpAi.conf.berserk) jitter *= 0.7;
    }
    if (typ === 'aggressive') jitter *= 1.15;
    ai.relAngle = Math.max(ai.cls.minRelAng, Math.min(ai.cls.maxRelAng, Math.round(bestRel + (state.rng() - 0.5) * jitter)));
    var finalPow = Math.max(18, Math.min(98, bestPow + (state.rng() - 0.5) * jitter));
    fireTank(ai, finalPow);
  }

  // --- 落点、瞬移与热区 ---
  function onShellImpact(pr, x, y) {
    if (pr.special === 'tp') {
      var owner = state.tanks.filter(function (t) { return t.id === pr.ownerId; })[0];
      if (owner && owner.alive) {
        owner.x = Math.max(20, Math.min(W - 20, x));
        owner.y = Math.max(20, y - 14);
        owner.vy = 0;
        sfxTeleport();
        spawnFloat(owner.x, owner.y - 26, '瞬移到达！', '#63e6be');
      }
      return;
    }

    carvePixelCrater(x, y, pr.radius, pr.terrain || 1);
    sfxExplode(pr.radius >= 45);
    state.shake = Math.min(13, pr.radius * 0.22);

    if (pr.special === 'napalm') {
      state.fires.push({ x: x, y: y, r: 36, turnsLeft: 3, dps: 14, ownerTeam: pr.ownerTeam });
      spawnFloat(x, y - 24, '持续热区！', '#ff922b');
    }

    state.explosions.push({ x: x, y: y, r: 6, maxR: pr.radius * 1.25, life: 0.32 });
    for (var i = 0; i < (pr.radius >= 45 ? 24 : 14); i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 55 + Math.random() * 190;
      state.particles.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 65,
        r: 2.5 + Math.random() * 3.5,
        color: i % 2 === 0 ? '#ffd166' : '#ff4d6d',
        life: 0.4 + Math.random() * 0.25
      });
    }

    var hitCount = 0;
    var critCount = 0;
    var R = pr.radius + 18;
    state.tanks.forEach(function (t) {
      if (!t.alive) return;
      var dist = Math.hypot(t.x - x, (t.y - 10) - y);
      var dmg = calcBlastDamage(pr.dmg, dist, pr.radius);
      if (dmg <= 0) return;
      var isCrit = dist <= R * CRIT_DIST_RATIO;
      if (isCrit) {
        var cMul = CRIT_MULT + ((pr.ownerTeam === 0 && state.runBuffs) ? (state.runBuffs.critBonus || 0) : 0);
        dmg = Math.round(dmg * cMul);
        critCount += 1;
      }
      dmg = applyBossWeakness(t, dmg);
      hitCount += 1;
      t.hp = Math.max(0, t.hp - dmg);
      t.hitFlash = 0.28;
      if (t.isBoss) updateBossPhase(t, true);
      // 轻推动：落点越近推得越开
      var push = (1 - Math.min(1, dist / R)) * 10;
      if (push > 2 && t.x !== x) {
        t.x = Math.max(18, Math.min(W - 18, t.x + (t.x >= x ? 1 : -1) * push));
        var ny = findSurfaceNear(t.x, t.y);
        if (ny !== null) t.y = ny;
      }
      spawnFloat(
        t.x, t.y - 34,
        (isCrit ? '加分 -' : '-') + dmg,
        isCrit ? '#ffd43b' : '#ff6b6b'
      );
      if (state.stats) {
        if (pr.ownerTeam === 0 && t.team === 1) {
          state.stats.damageDealt += dmg;
          state.stats.shotDamage += dmg;
          state.stats.shotHits += 1;
          if (isCrit) {
            state.stats.shotCrits += 1;
            state.stats.crits += 1;
          }
          state.score += dmg * 2;
        } else if (pr.ownerTeam === 1 && t.team === 0) {
          state.stats.damageTaken += dmg;
        }
      } else if (pr.ownerTeam === 0 && t.team === 1) {
        state.score += dmg * 2;
      }
      if (t.hp <= 0) {
        t.alive = false;
        spawnFloat(t.x, t.y - 52, '出局！', '#ffd166');
        if (pr.ownerTeam === 0 && t.team === 1) {
          state.score += 160;
          if (state.stats) {
            state.stats.kills += 1;
            state.stats.shotKills += 1;
          }
        }
      }
    });
    if (hitCount >= 2) {
      spawnFloat(x, y - 48, '多目标×' + hitCount + '！', '#74c0fc');
    } else if (critCount > 0 && hitCount === 1) {
      spawnFloat(x, y - 48, '靠近中心！', '#ffd43b');
    }
    scoreSnipeImpact(x, y);
  }

  function spawnFloat(x, y, text, color) {
    state.floats.push({ x: x, y: y, text: text, color: color || '#ffffff', life: 1.0 });
  }

  // --- 物理主循环 ---
  function step(dt) {
    state.clouds.forEach(function (cl) {
      cl.x += (state.wind * 2.4 + (state.wind === 0 ? 4 : 0)) * dt;
      if (cl.x > W + 80) cl.x = -80;
      if (cl.x < -80) cl.x = W + 80;
    });
    if (state.phase === 'pick') {
      state.floats.forEach(function (fl) { fl.y -= 28 * dt; fl.life -= dt; });
      state.floats = state.floats.filter(function (fl) { return fl.life > 0; });
      return;
    }
    if (state.ended) return;

    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 28);

    // 角色重力贴地（悬空桥挖穿后可落入水区）
    state.tanks.forEach(function (t) {
      if (!t.alive) return;

      // 每帧检测嵌地，避免炸坑后卡在土墙/薄片里
      if (isSolid(t.x, t.y) || isSolid(t.x, t.y - 6) ||
          (isSolid(t.x, t.y + 1) && isSolid(t.x, t.y - 8))) {
        ejectTankFromTerrain(t);
      }

      if (!isSolid(t.x, t.y + 1)) {
        t.vy += GRAVITY * 0.95 * dt;
        var nextY = t.y + t.vy * dt;
        var hitGround = false;
        var startY = Math.floor(t.y);
        var endY = Math.ceil(nextY);
        // 高速下落时逐步检测，防止穿地
        if (endY < startY) endY = startY;
        for (var sy = startY; sy <= endY; sy++) {
          if (isSolid(t.x, sy)) {
            t.y = sy;
            t.vy = 0;
            hitGround = true;
            break;
          }
        }
        if (!hitGround) t.y = nextY;
      } else {
        // 脚在地上，但若腰部仍嵌土则再顶一次
        if (isSolid(t.x, t.y - 6)) ejectTankFromTerrain(t);
        else t.vy = 0;
      }
      t.slope = measureSlope(t.x, t.y);

      if (t.hitFlash > 0) t.hitFlash = Math.max(0, t.hitFlash - dt);
      if (t.y >= WATER_Y) {
        t.alive = false;
        t.hp = 0;
        sfxSplash();
        var fallLabel = t.team === 1 ? '坠落出局！' : '落入水区！';
        spawnFloat(t.x, WATER_Y - 24, fallLabel, t.team === 1 ? '#ffd43b' : '#72efdd');
        if (t.team === 1) {
          state.score += 240;
          if (state.stats) {
            state.stats.kills += 1;
            state.stats.fallKills += 1;
            if (state.phase === 'firing') {
              state.stats.shotKills += 1;
              state.stats.shotFalls += 1;
            }
          }
        }
      }
    });
    if (checkBattleOutcome()) return;
    // 当前操作角色已离场（如自挖落水）则跳过到下一家
    var curLive = activeTank();
    if (state.phase === 'aim' && curLive && !curLive.alive) {
      nextTurn();
      return;
    }

    // 玩家操控
    var cur = activeTank();
    if (state.phase === 'aim' && cur && !cur.isAi && !state.ended) {
      var moveDir = 0;
      if (keys['ArrowLeft'] || keys['KeyA'] || activeHolds.left != null) moveDir -= 1;
      if (keys['ArrowRight'] || keys['KeyD'] || activeHolds.right != null) moveDir += 1;
      if (moveDir !== 0) {
        if (cur.fuel <= 0) {
          if (els.hint && els.hint.dataset.fuelHint !== '1') {
            els.hint.dataset.fuelHint = '1';
            els.hint.textContent = '本回合燃料已用尽，先抛出；下回合会回满。';
          }
        } else {
          cur.facing = moveDir;
          var slip = (state.weather && state.weather.slip) || 1;
          var spdMul = (state.runBuffs && state.runBuffs.speedMul) || 1;
          var nx = Math.max(18, Math.min(W - 18, cur.x + moveDir * cur.cls.speed * slip * spdMul * dt));
          var ny = findSurfaceNear(nx, cur.y);
          if (ny !== null && ny <= WATER_Y + 6) {
            cur.x = nx;
            if (ny <= cur.y + 8) cur.y = ny;
            cur.fuel = Math.max(0, cur.fuel - 36 * slip * dt);
            if (cur.fuel <= 0 && els.hint) {
              els.hint.dataset.fuelHint = '1';
              els.hint.textContent = '本回合燃料已用尽，先抛出；下回合会回满。';
            }
          }
        }
      }

      if (keys['ArrowUp'] || keys['KeyW'] || activeHolds.angUp != null) {
        cur.relAngle = Math.min(cur.cls.maxRelAng, cur.relAngle + 48 * dt);
      }
      if (keys['ArrowDown'] || keys['KeyS'] || activeHolds.angDown != null) {
        cur.relAngle = Math.max(cur.cls.minRelAng, cur.relAngle - 48 * dt);
      }

      if (isCharging) {
        chargePower += chargeDir * 78 * dt;
        if (chargePower >= 100) { chargePower = 100; chargeDir = -1; }
        if (chargePower <= 8) { chargePower = 8; chargeDir = 1; }
      }
      updateCockpitReadout();
    }

    if (state.phase === 'ai_think') {
      state.aiTimer -= dt;
      if (state.aiTimer <= 0) runAiTurn();
    }

    // 抛出队列
    for (var q = state.pendingShots.length - 1; q >= 0; q--) {
      var ps = state.pendingShots[q];
      ps.delay -= dt;
      if (ps.delay <= 0) {
        sfxFire();
        state.projectiles.push({
          x: ps.x, y: ps.y, vx: ps.vx, vy: ps.vy,
          dmg: ps.dmg, radius: ps.radius, terrain: ps.terrain || 1, color: ps.color,
          special: ps.special, ownerId: ps.ownerId, ownerTeam: ps.ownerTeam,
          age: 0, trail: []
        });
        state.pendingShots.splice(q, 1);
      }
    }

    // 球飞行与像素级碰撞
    for (var i = state.projectiles.length - 1; i >= 0; i--) {
      var pr = state.projectiles[i];
      pr.age += dt;
      pr.trail.push({ x: pr.x, y: pr.y });
      if (pr.trail.length > 16) pr.trail.shift();

      // 寻踪球：接近对方时修正（星轨定位）
      if (pr.special === 'homing' && pr.age > 0.2) {
        var nearest = null, bestD = 300;
        state.tanks.forEach(function (t) {
          if (t.alive && t.team !== pr.ownerTeam) {
            var d = Math.hypot(t.x - pr.x, (t.y - 10) - pr.y);
            if (d < bestD) { bestD = d; nearest = t; }
          }
        });
        if (nearest) {
          var dx = nearest.x - pr.x;
          var dy = (nearest.y - 10) - pr.y;
          var len = Math.max(1, Math.hypot(dx, dy));
          pr.vx += (dx / len) * 720 * dt;
          pr.vy += (dy / len) * 720 * dt;
        }
      }

      pr.vx += state.wind * effectiveWindAccel() * dt;
      pr.vy += GRAVITY * dt;

      // 子步进防止高速穿薄墙
      var subSteps = 3;
      var impacted = false;
      for (var ss = 0; ss < subSteps; ss++) {
        pr.x += (pr.vx * dt) / subSteps;
        pr.y += (pr.vy * dt) / subSteps;

        if (pr.x < -50 || pr.x > W + 50) {
          state.projectiles.splice(i, 1);
          impacted = true;
          break;
        }
        if (pr.y >= WATER_Y) {
          sfxSplash();
          state.projectiles.splice(i, 1);
          impacted = true;
          break;
        }

        // 碰上角色
        for (var k = 0; k < state.tanks.length; k++) {
          var tk = state.tanks[k];
          if (!tk.alive) continue;
          if (pr.age < 0.14 && tk.id === pr.ownerId) continue;
          if (Math.hypot(pr.x - tk.x, pr.y - (tk.y - 10)) <= 16) {
            onShellImpact(pr, pr.x, pr.y);
            state.projectiles.splice(i, 1);
            impacted = true;
            break;
          }
        }
        if (impacted) break;

        // 落点练习：空中圆环
        if (mode === 'snipe' && state.targets) {
          for (var ti = 0; ti < state.targets.length; ti++) {
            var tgHit = state.targets[ti];
            if (tgHit.hit) continue;
            if (Math.hypot(pr.x - tgHit.x, pr.y - tgHit.y) <= tgHit.rOuter) {
              onShellImpact(pr, pr.x, pr.y);
              state.projectiles.splice(i, 1);
              impacted = true;
              break;
            }
          }
        }
        if (impacted) break;

        // 碰上 2D 像素地形
        if (isSolid(pr.x, pr.y)) {
          onShellImpact(pr, pr.x, pr.y);
          state.projectiles.splice(i, 1);
          impacted = true;
          break;
        }
      }
    }

    // 落点效果、粒子、飘字
    state.explosions.forEach(function (ex) {
      ex.r += (ex.maxR - ex.r) * Math.min(1, dt * 14);
      ex.life -= dt;
    });
    state.explosions = state.explosions.filter(function (ex) { return ex.life > 0; });

    state.particles.forEach(function (p) {
      p.vy += 320 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    });
    state.particles = state.particles.filter(function (p) { return p.life > 0; });

    state.floats.forEach(function (fl) { fl.y -= 28 * dt; fl.life -= dt; });
    state.floats = state.floats.filter(function (fl) { return fl.life > 0; });

    if (state.phase === 'firing' && state.pendingShots.length === 0 &&
        state.projectiles.length === 0 && state.explosions.length === 0) {
      var anyFalling = state.tanks.some(function (t) { return t.alive && !isSolid(t.x, t.y + 1) && t.y < WATER_Y; });
      if (!anyFalling) {
        var shooter = state.tanks[state.turnIdx];
        summarizeShot(shooter ? shooter.team : 0);
        if (mode === 'survival' && state.wavePending) {
          state.wavePending = false;
          if (!state.tanks.some(function (t) { return t.alive && t.team === 1; })) {
            showSurvivalPick();
            return;
          }
        }
        if (checkBattleOutcome()) return;
        nextTurn();
      }
    }
  }

  var bgCache = null, bgKey = '';

  function buildBackdrop(dark, wid, pal) {
    var c = document.createElement('canvas');
    c.width = W * 2; c.height = H * 2;
    var g = c.getContext('2d');
    g.scale(2, 2);

    // 天空
    var SKY = {
      storm: [['#5b6b7c', '#8b9aab', '#b7c2ce'], ['#151922', '#1e2836', '#243040']],
      toxic: [['#7fa86a', '#b5d49a', '#d7ebc0'], ['#15241a', '#1c3222', '#203828']],
      ice: [['#7eb6e0', '#c8e5f8', '#eef7ff'], ['#101c2c', '#18283a', '#1c3044']],
      gale: [['#5aa6d8', '#a9d4f2', '#d8eefc'], ['#152436', '#1c3348', '#20384e']],
      def: [['#4fa6ee', '#a5d6f8', '#e4f3fe'], ['#0e1830', '#1a2a46', '#2a3d5c']]
    };
    var s = (SKY[wid] || SKY.def)[dark ? 1 : 0];
    var sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, s[0]); sky.addColorStop(0.5, s[1]); sky.addColorStop(0.85, s[2]);
    sky.addColorStop(1, dark ? s[2] : (wid ? s[2] : '#ffe9cc'));
    g.fillStyle = sky; g.fillRect(0, 0, W, H);

    // 日 / 月（同心光环，参照封面）
    var ox = W * 0.8, oy = H * 0.2;
    if (dark || wid === 'storm') {
      for (var st = 0; st < 46; st++) {
        var sxx = (st * 191) % W, syy = (st * 67) % (H * 0.5);
        g.fillStyle = 'rgba(255,255,255,' + (0.25 + (st % 4) * 0.12) + ')';
        g.fillRect(sxx, syy, st % 5 === 0 ? 2 : 1.2, st % 5 === 0 ? 2 : 1.2);
      }
      [64, 44, 30].forEach(function (r, i) {
        g.fillStyle = 'rgba(200,215,255,' + (0.06 + i * 0.05) + ')';
        g.beginPath(); g.arc(ox, oy, r, 0, Math.PI * 2); g.fill();
      });
      g.fillStyle = '#e9eefb'; g.beginPath(); g.arc(ox, oy, 19, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(160,175,205,0.5)';
      g.beginPath(); g.arc(ox - 6, oy - 3, 3.5, 0, 7); g.arc(ox + 5, oy + 5, 2.6, 0, 7); g.arc(ox + 4, oy - 8, 1.8, 0, 7); g.fill();
    } else {
      [86, 62, 44].forEach(function (r, i) {
        g.fillStyle = 'rgba(255,244,200,' + (0.1 + i * 0.07) + ')';
        g.beginPath(); g.arc(ox, oy, r, 0, Math.PI * 2); g.fill();
      });
      g.fillStyle = '#fff1b8'; g.beginPath(); g.arc(ox, oy, 28, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fffbe8'; g.beginPath(); g.arc(ox, oy, 16, 0, Math.PI * 2); g.fill();
    }

    // 地平雾光
    var hz = g.createLinearGradient(0, 150, 0, 290);
    hz.addColorStop(0, 'rgba(255,255,255,0)');
    hz.addColorStop(1, dark ? 'rgba(120,150,200,0.16)' : 'rgba(255,255,255,0.4)');
    g.fillStyle = hz; g.fillRect(0, 150, W, 140);

    // 三层远山：近大远淡（大气透视），带山脊亮线
    var HILL = {
      grass: [['#8eaecb', '#68a07c', '#4b8a5c'], ['#2a3b52', '#26493a', '#1b3a2b']],
      desert: [['#e8d2a6', '#d9b074', '#c39654'], ['#5a4a35', '#6b5334', '#4a3a24']],
      canyon: [['#d2aa94', '#b98264', '#9a6549'], ['#4a3830', '#5a3f33', '#3f2b23']],
      lava: [['#c09484', '#aa6350', '#8a4436'], ['#3d2828', '#4a2828', '#2f1a1a']],
      ice: [['#b8d4ea', '#8eb4d0', '#6a92b0'], ['#2a3a4c', '#243848', '#1a2838']]
    };
    var hc = (HILL[pal] || HILL.grass)[dark ? 1 : 0];
    function hillBand(color, baseY, amp, phase, sx) {
      var gr = g.createLinearGradient(0, baseY - amp, 0, H);
      gr.addColorStop(0, color); gr.addColorStop(1, shade(color, dark ? -0.25 : 0.3));
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(0, H); g.lineTo(0, baseY);
      var pts = [];
      for (var x = 0; x <= W; x += 6) {
        var y = baseY + Math.sin(x * sx + phase) * amp + Math.sin(x * sx * 2.3 + phase * 1.7) * amp * 0.35;
        pts.push([x, y]); g.lineTo(x, y);
      }
      g.lineTo(W, H); g.closePath(); g.fill();
      g.strokeStyle = dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.28)';
      g.lineWidth = 1.5; g.beginPath();
      pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1] - 1); else g.moveTo(p[0], p[1] - 1); });
      g.stroke();
    }
    hillBand(hc[0], 200, 30, 0.6, 0.008);
    hillBand(hc[1], 244, 24, 1.8, 0.012);
    hillBand(hc[2], 278, 16, 3.1, 0.017);

    // 天气色调
    var tint = wid === 'storm' ? 'rgba(50,60,78,0.24)' : wid === 'toxic' ? 'rgba(130,190,70,0.16)' : wid === 'ice' ? 'rgba(220,240,255,0.2)' : null;
    if (tint) { g.fillStyle = tint; g.fillRect(0, 0, W, H); }

    // 暗角
    var vg = g.createRadialGradient(W / 2, H * 0.55, H * 0.45, W / 2, H * 0.55, W * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, dark ? 'rgba(0,0,0,0.35)' : 'rgba(20,40,70,0.14)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    return c;
  }

  function drawBattleBackdrop(g, dark, wid, now) {
    var pal = (state.levelCfg && state.levelCfg.map && state.levelCfg.map.palette) || 'grass';
    var key = (dark ? 'd' : 'l') + '|' + (wid || '') + '|' + pal;
    if (key !== bgKey || !bgCache) { bgCache = buildBackdrop(dark, wid, pal); bgKey = key; }
    g.drawImage(bgCache, 0, 0, W, H);

    // 云：底部阴影 + 柔和主体
    var cloudA = dark ? 0.12 : 0.85;
    if (wid === 'storm') cloudA = dark ? 0.2 : 0.5;
    if (wid === 'toxic') cloudA *= 0.7;
    var cBody = wid === 'storm' ? (dark ? '180,190,210' : '225,230,238') : '255,255,255';
    var cShade = dark ? '90,105,140' : '140,170,205';
    (state.clouds || []).forEach(function (cl) {
      [[0.4, 3, cShade, 0.22], [0, 0, cBody, cloudA]].forEach(function (L) {
        g.fillStyle = 'rgba(' + L[2] + ',' + L[3] + ')';
        g.beginPath();
        g.ellipse(cl.x, cl.y + L[1], cl.w * 0.42, cl.w * 0.17, 0, 0, Math.PI * 2);
        g.ellipse(cl.x + cl.w * 0.26, cl.y - 8 + L[1], cl.w * 0.28, cl.w * 0.2, 0, 0, Math.PI * 2);
        g.ellipse(cl.x - cl.w * 0.18, cl.y - 5 + L[1], cl.w * 0.24, cl.w * 0.16, 0, 0, Math.PI * 2);
        g.fill();
      });
    });

    // 天气粒子
    if (wid === 'storm' || wid === 'gale') {
      g.strokeStyle = wid === 'storm'
        ? (dark ? 'rgba(180,200,230,0.35)' : 'rgba(255,255,255,0.45)')
        : (dark ? 'rgba(200,220,255,0.2)' : 'rgba(255,255,255,0.35)');
      g.lineWidth = 1.2;
      var rainN = wid === 'storm' ? 55 : 28;
      for (var r = 0; r < rainN; r++) {
        var rx = ((r * 97 + now * (wid === 'storm' ? 0.35 : 0.55)) % (W + 40)) - 20;
        var ry = ((r * 53 + now * 0.45) % (WATER_Y - 40)) + 10;
        g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx + (wid === 'gale' ? 14 : 4), ry + 12); g.stroke();
      }
    } else if (wid === 'ice') {
      g.fillStyle = dark ? 'rgba(220,235,255,0.55)' : 'rgba(255,255,255,0.8)';
      for (var s = 0; s < 36; s++) {
        var sx = ((s * 73 + now * 0.08) % W);
        var sy = ((s * 41 + now * 0.12) % (WATER_Y - 30)) + 8;
        g.beginPath(); g.arc(sx, sy, 1.4 + (s % 3) * 0.4, 0, Math.PI * 2); g.fill();
      }
    }
  }

  // --- 绘制 ---
  function draw() {
    var dark = document.documentElement.dataset.theme === 'dark';
    ctx.save();
    if (state.shake > 0) {
      ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }

    var wid = state.weather && state.weather.id;
    var now = performance.now();
    drawBattleBackdrop(ctx, dark, wid, now);

    // 2. 贴上 2D 像素级可破坏地形
    ctx.drawImage(terrCanvas, 0, 0);

    // 迷雾罩层（低洼）
    if (wid === 'toxic') {
      var tox = ctx.createLinearGradient(0, WATER_Y - 120, 0, H);
      tox.addColorStop(0, 'rgba(148, 216, 45, 0)');
      tox.addColorStop(0.45, 'rgba(148, 216, 45, 0.18)');
      tox.addColorStop(1, 'rgba(92, 148, 30, 0.32)');
      ctx.fillStyle = tox;
      ctx.fillRect(0, WATER_Y - 120, W, H - (WATER_Y - 120));
    }

    // 3. 焰雾灼热区
    state.fires.forEach(function (f) {
      var pulse = 0.75 + Math.sin(now * 0.015) * 0.25;
      var grad = ctx.createRadialGradient(f.x, f.y, 4, f.x, f.y, f.r);
      grad.addColorStop(0, 'rgba(255, 224, 102, ' + (0.65 * pulse) + ')');
      grad.addColorStop(0.6, 'rgba(255, 107, 107, ' + (0.45 * pulse) + ')');
      grad.addColorStop(1, 'rgba(255, 107, 107, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // 4. 海水：深度渐变 + 双层波浪 + 泡沫线 + 流动高光
    var wave = Math.sin(now * 0.004) * 3;
    var wy0 = WATER_Y + wave;
    var waterGrad = ctx.createLinearGradient(0, wy0, 0, H);
    if (dark) {
      waterGrad.addColorStop(0, 'rgba(30, 120, 170, 0.9)');
      waterGrad.addColorStop(0.5, 'rgba(16, 70, 120, 0.94)');
      waterGrad.addColorStop(1, 'rgba(8, 30, 60, 0.97)');
    } else {
      waterGrad.addColorStop(0, 'rgba(72, 188, 238, 0.86)');
      waterGrad.addColorStop(0.5, 'rgba(44, 140, 208, 0.92)');
      waterGrad.addColorStop(1, 'rgba(28, 100, 172, 0.95)');
    }
    function wavePath(off, amp, k, sp) {
      ctx.beginPath();
      ctx.moveTo(0, H + 10);
      for (var wx = 0; wx <= W; wx += 8) {
        ctx.lineTo(wx, wy0 + off + Math.sin(now * sp + wx * k) * amp);
      }
      ctx.lineTo(W, H + 10);
      ctx.closePath();
    }
    wavePath(-2, 2.6, 0.035, 0.0035);
    ctx.fillStyle = dark ? 'rgba(120,190,240,0.28)' : 'rgba(255,255,255,0.3)';
    ctx.fill();
    wavePath(0, 2.2, 0.05, 0.006);
    ctx.fillStyle = waterGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var fx = 0; fx <= W; fx += 8) {
      var fy = wy0 + Math.sin(now * 0.006 + fx * 0.05) * 2.2;
      if (fx === 0) ctx.moveTo(fx, fy); else ctx.lineTo(fx, fy);
    }
    ctx.stroke();
    ctx.lineWidth = 1.2;
    for (var sp = 0; sp < 16; sp++) {
      var lx = (sp * 83 + now * (0.012 + (sp % 3) * 0.006)) % (W + 30) - 15;
      var ly = wy0 + 9 + ((sp * 19) % 30);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.1 + (sp % 4) * 0.05) + ')';
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 12 + (sp % 3) * 6, ly); ctx.stroke();
    }

    // 4.5 落点练习圆环
    if (mode === 'snipe' && state.targets) {
      state.targets.forEach(function (tg) {
        ctx.save();
        ctx.globalAlpha = tg.hit ? 0.28 : 0.95;
        ctx.strokeStyle = tg.hit ? 'rgba(148,163,184,0.7)' : '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(tg.x, tg.y, tg.rOuter, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = tg.hit ? 'rgba(148,163,184,0.55)' : '#ff922b';
        ctx.beginPath(); ctx.arc(tg.x, tg.y, tg.rMid, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = tg.hit ? 'rgba(148,163,184,0.45)' : '#ff6b6b';
        ctx.beginPath(); ctx.arc(tg.x, tg.y, tg.rInner, 0, Math.PI * 2); ctx.fill();
        if (!tg.hit) {
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('环', tg.x, tg.y - tg.rOuter - 8);
        } else if (tg.points) {
          ctx.fillStyle = '#94d82d';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('+' + tg.points, tg.x, tg.y - tg.rOuter - 6);
        }
        ctx.restore();
      });
    }

    // 5. 瞄准射角扇区 + 抛物线前段辅助
    var cur = activeTank();
    if (state.phase === 'aim' && cur && !cur.isAi) {
      // 绘制当前受坡度限制的合法射角扇区（淡白虚线弧）
      var aMin = cur.facing === 1 ? (cur.slope - (cur.cls.maxRelAng * Math.PI) / 180) : (Math.PI + cur.slope + (cur.cls.minRelAng * Math.PI) / 180);
      var aMax = cur.facing === 1 ? (cur.slope - (cur.cls.minRelAng * Math.PI) / 180) : (Math.PI + cur.slope + (cur.cls.maxRelAng * Math.PI) / 180);
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cur.x, cur.y - 12, 34, aMin, aMax);
      ctx.stroke();
      ctx.restore();

      if ((isDragging || isCharging) && chargePower > 0) {
        var ang = tankWorldAngle(cur);
        var spd = Math.max(130, (chargePower / 100) * MAX_SPEED);
        var px = cur.x + Math.cos(ang) * 20;
        var py = cur.y - 12 + Math.sin(ang) * 20;
        var pvx = Math.cos(ang) * spd;
        var pvy = Math.sin(ang) * spd;
        var wepPrev = (cur.weaponSlot === 2 && cur.wep2Left > 0) ? cur.cls.wep2 : cur.cls.wep1;
        var landX = px;
        var landY = py;
        var landed = false;

        ctx.save();
        ctx.fillStyle = cur.armedItem === 'tp' ? '#63e6be' : '#ff9a45';
        // 逐步积分含风力，直到撞地/撞水，画出完整预估弧线
        for (var d = 0; d < 90; d++) {
          var dt = 0.035;
          pvx += state.wind * effectiveWindAccel() * dt;
          pvy += GRAVITY * dt;
          px += pvx * dt;
          py += pvy * dt;
          if (px < -20 || px > W + 20 || py > WATER_Y) {
            landX = px; landY = Math.min(py, WATER_Y); landed = true;
            break;
          }
          if (isSolid(px, py)) {
            landX = px; landY = py; landed = true;
            break;
          }
          if (d % 2 === 0) {
            ctx.globalAlpha = Math.max(0.15, 0.85 - d / 100);
            ctx.beginPath();
            ctx.arc(px, py, Math.max(1.6, 4.2 - d * 0.03), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        if (landed && cur.armedItem !== 'tp') {
          ctx.globalAlpha = 0.35;
          ctx.strokeStyle = wepPrev.color || '#ffe066';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(landX, landY, wepPrev.radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = '#ffe3b0';
          ctx.beginPath();
          ctx.arc(landX, landY, 7.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ff6a2a';
          ctx.beginPath();
          ctx.arc(landX, landY, 4.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // 6. 角色（Canvas 造型，按种类区分）
    state.tanks.forEach(function (t, idx) {
      if (!t.alive) return;
      var isCurrent = (idx === state.turnIdx && !state.ended);
      ctx.save();
      ctx.translate(t.x, t.y);
      drawTankVisual(ctx, t, { scale: t.isBoss ? 1.22 : 1 });

      if (isCurrent) {
        var bob = Math.sin(performance.now() * 0.008) * 3;
        ctx.strokeStyle = 'rgba(255,224,102,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 3, 27, 5.5, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffe066';
        ctx.strokeStyle = 'rgba(120,80,0,0.75)';
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(0, -45 + bob);
        ctx.lineTo(-7, -56 + bob);
        ctx.lineTo(7, -56 + bob);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      var bw = t.isBoss ? 50 : 38, bh = 6, bx = -bw / 2, by = -37;
      var ratio = Math.max(0, Math.min(1, t.hp / t.maxHp));
      ctx.fillStyle = 'rgba(12,20,32,0.72)';
      ctx.beginPath(); ctx.roundRect(bx - 1.5, by - 1.5, bw + 3, bh + 3, 4.5); ctx.fill();
      if (ratio > 0) {
        var hg = ctx.createLinearGradient(0, by, 0, by + bh);
        if (t.team === 0) { hg.addColorStop(0, '#7af0cf'); hg.addColorStop(1, '#16a57e'); }
        else { hg.addColorStop(0, '#ff9b9b'); hg.addColorStop(1, '#d6334a'); }
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.roundRect(bx, by, Math.max(3, bw * ratio), bh, 3); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath(); ctx.roundRect(bx + 1, by + 0.8, Math.max(1, bw * ratio - 2), 1.8, 1); ctx.fill();
      }
      ctx.restore();
    });

    // 7. 球体：加色发光拖尾 + 高光
    state.projectiles.forEach(function (pr) {
      var n = pr.trail.length;
      var R = pr.special === 'heavy' ? 7 : 5.5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = pr.color;
      for (var k = 0; k < n; k++) {
        var f = k / n;
        ctx.globalAlpha = f * 0.5;
        ctx.beginPath();
        ctx.arc(pr.trail[k].x, pr.trail[k].y, 1.5 + f * 3.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.18;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, R * 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.32;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, R * 1.55, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      ctx.save();
      var bg = ctx.createRadialGradient(pr.x - R * 0.4, pr.y - R * 0.4, 0.5, pr.x, pr.y, R);
      bg.addColorStop(0, '#ffffff');
      bg.addColorStop(0.45, pr.color);
      bg.addColorStop(1, 'rgba(24,32,52,0.75)');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1a2530';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
    });

    // 8. 落点效果、粒子、飘字
    state.explosions.forEach(function (ex) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ex.life / 0.32);
      var grad = ctx.createRadialGradient(ex.x, ex.y, 2, ex.x, ex.y, ex.r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.4, '#ffd166');
      grad.addColorStop(1, 'rgba(255, 77, 109, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, ex.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, ex.r * (1.25 - ex.life * 0.8), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });

    state.particles.forEach(function (p) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    state.floats.forEach(function (fl) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, fl.life);
      ctx.fillStyle = fl.color;
      ctx.font = '700 14px "Avenir Next", "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(15,25,40,0.75)';
      ctx.strokeText(fl.text, fl.x, fl.y);
      ctx.fillText(fl.text, fl.x, fl.y);
      ctx.restore();
    });

    ctx.restore();
  }

  function loop(ts) {
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.035, (ts - lastTs) / 1000);
    lastTs = ts;
    if (!paused) {
      step(dt);
      draw();
    }
    requestAnimationFrame(loop);
  }

  // --- 画布拖动瞄准 ---
  function pointerLogical(ev) {
    var r = canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / viewScale, y: (ev.clientY - r.top) / viewScale };
  }

  canvas.addEventListener('pointerdown', function (ev) {
    var cur = activeTank();
    if (ev.button || state.phase !== 'aim' || !cur || cur.isAi) return;
    ev.preventDefault();
    ensureAudio();
    canvas.setPointerCapture(ev.pointerId);
    isDragging = true;
    dragStart = pointerLogical(ev);
  });

  canvas.addEventListener('pointermove', function (ev) {
    var cur = activeTank();
    if (!isDragging || state.phase !== 'aim' || !cur || cur.isAi) return;
    var pt = pointerLogical(ev);
    var dx = pt.x - cur.x;
    var dy = pt.y - (cur.y - 12);
    if (dy > 16) { dx = -dx; dy = -dy; }
    cur.facing = dx >= 0 ? 1 : -1;
    var desiredWorld = Math.atan2(dy, dx);
    var relRad = cur.facing === 1 ? (cur.slope - desiredWorld) : (desiredWorld - Math.PI - cur.slope);
    var relDeg = relRad * (180 / Math.PI);
    cur.relAngle = Math.max(cur.cls.minRelAng, Math.min(cur.cls.maxRelAng, relDeg));
    if (!touchAimOnly) {
      var dist = Math.hypot(pt.x - dragStart.x, pt.y - dragStart.y);
      chargePower = Math.max(15, Math.min(100, (dist / 160) * 100));
    } else if (!isCharging) {
      // 触控拖拽时用预览力度画辅助线（不抛出）
      chargePower = Math.max(28, Math.min(70, 40 + Math.abs(dx) / 8));
    }
    updateCockpitReadout();
  });

  function cancelAimDrag() {
    if (!isDragging && chargePower <= 0) return;
    isDragging = false;
    if (!isCharging) chargePower = 0;
    updateCockpitReadout();
    if (els.hint) els.hint.textContent = '已取消本次抛出';
  }

  function endDrag(ev) {
    if (!isDragging) return;
    isDragging = false;
    var cur = activeTank();
    if (touchAimOnly) {
      if (!isCharging) chargePower = 0;
      updateCockpitReadout();
      if (els.hint) els.hint.textContent = '角度已调好 · 按住下方「抛出」蓄力，松手抛出（滑向取消区可取消）';
      return;
    }
    var cancel = ev && (ev.button === 2 || ev.altKey);
    if (!cancel && state.phase === 'aim' && cur && !cur.isAi && chargePower >= 15) {
      fireTank(cur, chargePower);
    } else if (els.hint) {
      els.hint.textContent = '已取消本次抛出';
    }
    chargePower = 0;
  }

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', function () {
    isDragging = false;
    if (!touchAimOnly) chargePower = 0;
  });

  // 禁止长按弹出浏览器「复制/查询/打开」等系统菜单（别人小游戏一般也会拦）
  document.addEventListener('contextmenu', function (ev) {
    ev.preventDefault();
    if (isDragging) cancelAimDrag();
    if (isCharging) stopCharge(false);
  }, { capture: true });
  document.addEventListener('selectstart', function (ev) {
    ev.preventDefault();
  }, { capture: true });

  // --- 控制台与键盘 ---
  var firePointerId = null;

  function syncHoldBtn() {
    if (activeHolds.left != null) holdBtn = 'left';
    else if (activeHolds.right != null) holdBtn = 'right';
    else if (activeHolds.angUp != null) holdBtn = 'angUp';
    else if (activeHolds.angDown != null) holdBtn = 'angDown';
    else holdBtn = null;
  }

  function clearHold() {
    activeHolds = Object.create(null);
    holdBtn = null;
  }

  function clearHoldByPointer(pointerId) {
    var changed = false;
    Object.keys(activeHolds).forEach(function (k) {
      if (activeHolds[k] === pointerId) {
        delete activeHolds[k];
        changed = true;
      }
    });
    if (changed) syncHoldBtn();
  }

  /** @param {boolean} shouldFire 松手抛出；取消/中断则 false */
  function stopCharge(shouldFire) {
    if (!isCharging) {
      els.btnThrow.classList.remove('charging');
      setChargeUi(false);
      return;
    }
    var power = chargePower;
    var cancel = chargeWillCancel || !shouldFire;
    isCharging = false;
    firePointerId = null;
    chargePower = 0;
    chargeWillCancel = false;
    els.btnThrow.classList.remove('charging');
    setChargeUi(false);
    updateCockpitReadout();
    if (!cancel) {
      var cur = activeTank();
      if (state.phase === 'aim' && cur && !cur.isAi) fireTank(cur, Math.max(15, power));
    } else if (els.hint) {
      els.hint.textContent = '已取消蓄力，没有抛出';
    }
  }

  function bindHold(btn, name) {
    // 左右/调角：不用 setPointerCapture，避免取消手势后丢 up 事件导致一直走
    btn.addEventListener('pointerdown', function (ev) {
      if (ev.button) return;
      ev.preventDefault();
      ensureAudio();
      activeHolds[name] = ev.pointerId;
      syncHoldBtn();
    });
    function endHold(ev) {
      if (activeHolds[name] == null) return;
      if (ev && ev.pointerId != null && activeHolds[name] !== ev.pointerId) return;
      delete activeHolds[name];
      syncHoldBtn();
    }
    btn.addEventListener('pointerup', endHold);
    btn.addEventListener('pointercancel', endHold);
    btn.addEventListener('pointerleave', function (ev) {
      // 手指滑出按钮即停，避免“松手了还在走”
      if (activeHolds[name] == null) return;
      if (ev.pointerId != null && activeHolds[name] !== ev.pointerId) return;
      delete activeHolds[name];
      syncHoldBtn();
    });
  }
  bindHold(els.btnLeft, 'left');
  bindHold(els.btnRight, 'right');
  bindHold(els.btnAngUp, 'angUp');
  bindHold(els.btnAngDown, 'angDown');

  // 窗口兜底：松手/取消一定清掉对应 pointer 的按住
  // 蓄力松手：只要不在取消区就抛出（不必落回按钮上，否则略一偏就当取消）
  window.addEventListener('pointermove', function (ev) {
    if (isCharging && (firePointerId === null || ev.pointerId === firePointerId)) {
      updateChargeCancelFromEvent(ev);
    }
  }, true);

  window.addEventListener('pointerup', function (ev) {
    clearHoldByPointer(ev.pointerId);
    // 仅处理按钮蓄力的 pointer；空格蓄力靠 keyup，避免任意点击误触发
    if (isCharging && firePointerId !== null && ev.pointerId === firePointerId) {
      updateChargeCancelFromEvent(ev);
      stopCharge(!chargeWillCancel);
    }
  }, true);
  window.addEventListener('pointercancel', function (ev) {
    if (ev && ev.pointerId != null) clearHoldByPointer(ev.pointerId);
    else clearHold();
    if (isCharging && firePointerId !== null && (!ev || ev.pointerId === firePointerId)) {
      stopCharge(false);
    }
  }, true);

  els.btnThrow.addEventListener('pointerdown', function (ev) {
    if (ev.button) return;
    ev.preventDefault();
    var cur = activeTank();
    if (state.phase !== 'aim' || !cur || cur.isAi) return;
    ensureAudio();
    firePointerId = ev.pointerId;
    try { els.btnThrow.setPointerCapture(ev.pointerId); } catch (_) {}
    isCharging = true;
    chargeWillCancel = false;
    chargePower = 12;
    chargeDir = 1;
    els.btnThrow.classList.add('charging');
    setChargeUi(true);
    updateCockpitReadout();
  });
  els.btnThrow.addEventListener('pointerup', function (ev) {
    if (firePointerId !== null && ev.pointerId !== firePointerId) return;
    if (!isCharging) return;
    updateChargeCancelFromEvent(ev);
    stopCharge(!chargeWillCancel);
  });
  els.btnThrow.addEventListener('pointercancel', function (ev) {
    if (firePointerId !== null && ev.pointerId !== firePointerId) return;
    stopCharge(false);
  });
  els.btnThrow.addEventListener('lostpointercapture', function () {
    // 系统手势/滚动抢走捕获时：取消蓄力，不抛出
    if (isCharging) stopCharge(false);
  });

  window.addEventListener('keydown', function (ev) {
    keys[ev.code] = true;
    if (ev.code === 'Escape') {
      ev.preventDefault();
      if (isDragging) cancelAimDrag();
      if (isCharging) stopCharge(false);
      return;
    }
    if (ev.code === 'Space') {
      var cur = activeTank();
      if (state.phase === 'aim' && cur && !cur.isAi && !isCharging) {
        ev.preventDefault();
        ensureAudio();
        firePointerId = null;
        isCharging = true;
        chargeWillCancel = false;
        chargePower = 12;
        chargeDir = 1;
        els.btnThrow.classList.add('charging');
        setChargeUi(true);
      }
    }
  });

  window.addEventListener('keyup', function (ev) {
    keys[ev.code] = false;
    if (ev.code === 'Space' && isCharging && firePointerId === null) {
      ev.preventDefault();
      stopCharge(!chargeWillCancel);
    }
  });

  // 切后台 / 失焦时清掉卡住的按住状态
  window.addEventListener('blur', function () {
    clearHold();
    if (isCharging) stopCharge(false);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      clearHold();
      if (isCharging) stopCharge(false);
    }
  });

  // 招式切换
  els.btnWep1.addEventListener('click', function () {
    var cur = activeTank();
    if (!cur || cur.isAi || state.phase !== 'aim') return;
    cur.weaponSlot = 1;
    updateHud();
  });

  els.btnWep2.addEventListener('click', function () {
    var cur = activeTank();
    if (!cur || cur.isAi || state.phase !== 'aim' || cur.wep2Left <= 0) return;
    cur.weaponSlot = 2;
    updateHud();
  });

  // 经典道具栏点击
  document.querySelectorAll('.item-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var cur = activeTank();
      if (!cur || cur.isAi || state.phase !== 'aim') return;
      var k = btn.dataset.item;
      if (cur.items[k] <= 0) return;
      ensureAudio();

      if (k === 'heal') {
        cur.items.heal -= 1;
        var add = Math.min(40, cur.maxHp - cur.hp);
        cur.hp += add;
        sfxHeal();
        spawnFloat(cur.x, cur.y - 38, '💊 +' + add, '#69db7c');
        updateHud();
        return;
      }

      cur.armedItem = (cur.armedItem === k) ? null : k;
      if (cur.armedItem === 'tp') els.hint.textContent = '🌀 已装填瞬移：下一发落到哪里就移到哪里！';
      else if (cur.armedItem === 'power') els.hint.textContent = '⚡ 已激活加强：下一发效果提升 75%！';
      else if (cur.armedItem === 'double') els.hint.textContent = '✨ 已激活连抛：本回合将连续抛出两次！';
      updateHud();
    });
  });

  // 选车切换
  document.querySelectorAll('.role-card').forEach(function (btn) {
    btn.addEventListener('click', function () {
      selectedClass = btn.dataset.role;
      document.querySelectorAll('.role-card').forEach(function (b) {
        b.classList.toggle('active', b.dataset.role === selectedClass);
      });
      persistProgress();
      initGame();
    });
  });

  // --- HUD 与榜单 ---
  function updateCockpitReadout() {
    var cur = activeTank();
    if (!cur) return;
    var worldDeg = Math.round(Math.abs(tankWorldAngle(cur) * 180 / Math.PI));
    if (cur.facing === -1) worldDeg = Math.round(Math.abs((Math.PI - tankWorldAngle(cur)) * 180 / Math.PI));
    els.angleReadout.textContent = '仰角 ' + Math.round(cur.relAngle) + '° (坡' + Math.round(cur.slope * 180 / Math.PI) + '°)';
    els.fuelReadout.textContent = cur.fuel <= 0
      ? '燃料 耗尽'
      : ('燃料 ' + Math.round(cur.fuel) + '%');
    if (els.fuelReadout) {
      els.fuelReadout.style.color = cur.fuel <= 0 ? '#e03131' : '';
    }
    els.powerReadout.textContent = '力度 ' + Math.round(chargePower) + '%';
    if (els.btnLeft) els.btnLeft.disabled = state.phase !== 'aim' || cur.isAi || cur.fuel <= 0;
    if (els.btnRight) els.btnRight.disabled = state.phase !== 'aim' || cur.isAi || cur.fuel <= 0;
    els.powerFill.style.width = Math.round(chargePower) + '%';
    if (isCharging && els.chargePct) els.chargePct.textContent = Math.round(chargePower) + '%';
    if (cur.lastPower > 0) {
      els.powerLastMark.classList.remove('hidden');
      els.powerLastMark.style.left = Math.round(cur.lastPower) + '%';
    } else {
      els.powerLastMark.classList.add('hidden');
    }
  }

  function updateHud() {
    var cur = activeTank();
    if (!state || !state.tanks) return;
    els.meterWind.textContent = state.wind === 0 ? '无风 0' : (state.wind > 0 ? ('右风 +' + state.wind) : ('左风 ' + state.wind));
    if (els.meterWeather) {
      els.meterWeather.textContent = (state.weather && state.weather.name) || '天气';
      els.meterWeather.title = (state.weather && state.weather.tip) || '';
    }
    els.meterTurn.textContent = cur ? (cur.name + '回合') : '—';
    els.meterScore.textContent = '本局 ' + state.score;
    if (els.meterWave) {
      if (mode === 'survival') {
        els.meterWave.classList.remove('hidden');
        els.meterWave.textContent = '波 ' + (state.wave || 1);
      } else {
        els.meterWave.classList.add('hidden');
      }
    }
    if (els.meterShots) {
      if (mode === 'snipe') {
        els.meterShots.classList.remove('hidden');
        els.meterShots.textContent = '发 ' + Math.max(0, state.shotsLeft || 0);
      } else {
        els.meterShots.classList.add('hidden');
      }
    }
    updateBossHud();
    if (els.meterRun) {
      if (mode === 'campaign') {
        els.meterRun.classList.remove('hidden');
        els.meterRun.textContent = '累计 ' + (progress.campaignRunScore || 0);
      } else {
        els.meterRun.classList.add('hidden');
      }
    }

    var lvLabel = state.levelName ? (state.levelName + ' · 第 ' + state.level + '/' + TOTAL_LEVELS + ' 关') : ('第 ' + state.level + ' 关');
    els.modeSub.textContent = mode === 'daily'
      ? ('每日同种 · ' + todayKey())
      : (mode === 'pvp'
        ? '双人同屏'
        : (mode === 'survival'
          ? ('耐力无尽 · 第 ' + (state.wave || 1) + ' 波')
          : (mode === 'snipe'
            ? ('落点练习 · 次 ' + Math.max(0, state.shotsLeft || 0) + ' · 环 ' + (SNIPE_TARGETS - snipeTargetsLeft()) + '/' + SNIPE_TARGETS)
            : (mode === 'boss' ? ('章末关 · ' + (state.levelName || lvLabel)) : ('闯关 · ' + lvLabel)))));
    els.modeDesc.textContent = mode === 'daily'
      ? ('北京时间日榜 · ' + ((state.mapName || '') + ' / ' + ((state.weather && state.weather.name) || '')) + ' · 可反复刷最高分')
      : (mode === 'pvp'
        ? '蓝方 P1 与红方 P2 轮流操作，挖开悬空桥让对方落入水区！'
        : (mode === 'survival'
          ? '清波后三选一强化；榜优先比波次。靠近中心加分更高，一次碰上多人算多目标，挖穿落水算出局。'
          : (mode === 'snipe'
            ? ('限 ' + SNIPE_SHOTS + ' 发打完 ' + SNIPE_TARGETS + ' 个圆环。圆心 100 / 中环 60 / 外环 30。榜 ID：tank-v2-snipe')
            : (mode === 'boss'
              ? ('轮换章末关卡；通过后进下一位。榜 ID：tank-v2-boss · ' + ((state.mapName || '') + ' / ' + ((state.weather && state.weather.name) || '')))
              : ((state.mapName || '') + ' · ' + ((state.weather && state.weather.name) || '') +
                ' · 三星：通关 + 生命>50% + 回合≤' + (state.maxTurns || 12))))));

    var mine = state.tanks.filter(function (t) { return t.team === 0 && t.alive; })[0] || state.tanks[0];
    var foes = state.tanks.filter(function (t) { return t.team === 1 && t.alive; });
    var foe = foes[0];
    if (els.hudMineName && mine) {
      els.hudMineName.textContent = mine.name;
      var mp = Math.max(0, Math.round(100 * mine.hp / mine.maxHp));
      els.hudMineHp.style.width = mp + '%';
      els.hudMineHpText.textContent = Math.round(mine.hp) + '/' + mine.maxHp;
    }
    if (els.hudFoeName) {
      if (mode === 'snipe') {
        var hitN = SNIPE_TARGETS - snipeTargetsLeft();
        els.hudFoeName.textContent = '环点';
        els.hudFoeHp.style.width = Math.round(100 * hitN / SNIPE_TARGETS) + '%';
        els.hudFoeHpText.textContent = hitN + '/' + SNIPE_TARGETS;
      } else if (foe) {
        els.hudFoeName.textContent = foes.length > 1 ? (foe.name + ' 等' + foes.length + '人') : foe.name;
        var fp = Math.max(0, Math.round(100 * foe.hp / foe.maxHp));
        els.hudFoeHp.style.width = fp + '%';
        els.hudFoeHpText.textContent = Math.round(foe.hp) + '/' + foe.maxHp;
      } else {
        els.hudFoeName.textContent = '对方';
        els.hudFoeHp.style.width = '0%';
        els.hudFoeHpText.textContent = '已清';
      }
    }
    if (els.hudRound) {
      els.hudRound.textContent = mode === 'snipe'
        ? ('次 ' + Math.max(0, state.shotsLeft || 0) + '/' + SNIPE_SHOTS)
        : ('回合 ' + (state.turnsUsed || 0));
    }

    if (cur && !cur.isAi) {
      els.wep1Name.textContent = '1号 ' + cur.cls.wep1.name;
      els.wep2Name.textContent = '2号 ' + cur.cls.wep2.name;
      els.wep2Cnt.textContent = String(cur.wep2Left);
      els.btnWep1.classList.toggle('active', cur.weaponSlot === 1);
      els.btnWep2.classList.toggle('active', cur.weaponSlot === 2);
      els.btnWep1.disabled = state.phase !== 'aim';
      els.btnWep2.disabled = state.phase !== 'aim' || cur.wep2Left <= 0;

      els.cntTp.textContent = String(cur.items.tp);
      els.cntHeal.textContent = String(cur.items.heal);
      els.cntPower.textContent = String(cur.items.power);
      els.cntDouble.textContent = String(cur.items.double);
      document.querySelectorAll('.item-btn').forEach(function (b) {
        var k = b.dataset.item;
        b.classList.toggle('armed', cur.armedItem === k);
        b.disabled = state.phase !== 'aim' || cur.items[k] <= 0;
      });
    }

    els.btnThrow.disabled = !cur || cur.isAi || state.phase !== 'aim';
    document.querySelectorAll('.role-card').forEach(function (b) {
      b.classList.toggle('active', b.dataset.role === selectedClass);
    });
    els.btnCampaign.classList.toggle('active', mode === 'campaign');
    els.btnDaily.classList.toggle('active', mode === 'daily');
    if (els.btnSurvival) els.btnSurvival.classList.toggle('active', mode === 'survival');
    if (els.btnSnipe) els.btnSnipe.classList.toggle('active', mode === 'snipe');
    if (els.btnLeader) els.btnLeader.classList.toggle('active', mode === 'boss');
    els.btnPvp.classList.toggle('active', mode === 'pvp');
    if (platformMuted) {
      els.btnSound.textContent = '静音';
      els.btnSound.setAttribute('aria-pressed', 'false');
      els.btnSound.title = '本次为静音进入；需重新打开应用并选择「开启声音」';
    } else {
      els.btnSound.textContent = soundOn ? '音效开' : '音效关';
      els.btnSound.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
      els.btnSound.title = '音效开关';
    }
    els.btnAutoSubmit.classList.toggle('active', autoSubmit);
    els.btnAutoSubmit.setAttribute('aria-pressed', autoSubmit ? 'true' : 'false');
    updateCockpitReadout();
  }

  function layoutCanvas() {
    var wrap = canvas.parentElement;
    var rect = wrap.getBoundingClientRect();
    var availW = Math.max(120, rect.width);
    var availH = Math.max(120, rect.height);
    var scale = Math.min(availW / W, availH / H);
    // 手机允许更小缩放，优先完整入画
    scale = Math.max(touchAimOnly ? 0.22 : 0.35, scale);
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

  function currentBoardId() {
    if (mode === 'daily') return BOARD_ID_DAILY + todayKey();
    if (mode === 'survival') return BOARD_ID_SURVIVAL;
    if (mode === 'snipe') return BOARD_ID_SNIPE;
    if (mode === 'boss') return BOARD_ID_BOSS;
    return BOARD_ID_CAMPAIGN;
  }

  function formatBoardScore(raw) {
    if (mode === 'survival') return formatSurvivalScore(raw);
    return (Math.max(0, Math.floor(Number(raw) || 0)) + ' 分');
  }

  async function persistProgress() {
    progress.version = SAVE_VERSION;
    progress.settings = { soundOn: soundOn, autoSubmit: autoSubmit, tankClass: selectedClass };
    try { await sdk.storage.set(SAVE_KEY, progress); } catch (_) {}
  }

  async function loadProgress() {
    try {
      var saved = await sdk.storage.get(SAVE_KEY);
      if (!saved || typeof saved !== 'object') return;
      progress.level = Math.max(1, Math.min(TOTAL_LEVELS, Number(saved.level) || 1));
      progress.bestCampaign = Number(saved.bestCampaign) || 0;
      progress.bestRunScore = Number(saved.bestRunScore) || progress.bestCampaign || 0;
      progress.campaignRunScore = Number(saved.campaignRunScore) || 0;
      progress.stars = saved.stars && typeof saved.stars === 'object' ? saved.stars : {};
      progress.bestDaily = saved.bestDaily || {};
      progress.bestSurvival = Number(saved.bestSurvival) || 0;
      progress.bestSnipe = Number(saved.bestSnipe) || 0;
      progress.bestBoss = Number(saved.bestBoss) || 0;
      progress.bossIndex = Math.max(0, Number(saved.bossIndex) || 0);
      progress.version = SAVE_VERSION;
      if (saved.settings) {
        soundOn = saved.settings.soundOn !== false;
        autoSubmit = !!saved.settings.autoSubmit;
        if (saved.settings.tankClass && TANK_CLASSES[saved.settings.tankClass]) {
          selectedClass = saved.settings.tankClass;
        }
      }
    } catch (_) {}
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
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
        '<span>' + escapeHtml(formatBoardScore(row.score)) + '</span>';
      els.boardList.appendChild(li);
    });
    els.boardMine.textContent = mineLabel || '';
  }

  function localBest() {
    if (mode === 'daily') return progress.bestDaily[todayKey()] || 0;
    if (mode === 'survival') return progress.bestSurvival || 0;
    if (mode === 'snipe') return progress.bestSnipe || 0;
    if (mode === 'boss') return progress.bestBoss || 0;
    return progress.bestCampaign || 0;
  }

  async function refreshBoard() {
    els.boardMeta.textContent = mode === 'daily'
      ? ('每日榜 ' + todayKey() + ' · 按得分排行')
      : (mode === 'survival'
        ? '生存榜 · 先比波次再比分'
        : (mode === 'snipe'
          ? '落点练习榜 · 按得分排行'
          : (mode === 'boss'
            ? '章末关榜 · 按得分排行'
            : '单人闯关榜 · 按得分排行')));
    try {
      var me = await sdk.scores.me();
      if (!me.loggedIn) els.boardMeta.textContent += '（游客可看榜）';
      var list = await sdk.scores.list({ boardId: currentBoardId(), verified: false, limit: 15 });
      var items = list.items || [];
      if (items.length) {
        var self = items.filter(function (x) { return x.isMe; })[0];
        var mine = self ? ('我的名次 #' + self.rank + ' · ' + formatBoardScore(self.score)) : '';
        renderBoard(items, mine);
      } else {
        var lb = localBest();
        renderBoard(lb ? [{ rank: 1, displayName: '我（本地）', score: lb, isMe: true }] : [], lb ? '本地最佳' : '');
      }
    } catch (_) {
      var lb2 = localBest();
      renderBoard(lb2 ? [{ rank: 1, displayName: '我（本地）', score: lb2, isMe: true }] : [], lb2 ? '本地预览最佳' : '胜利后显示');
      els.boardMeta.textContent = '本地预览榜（上线后为社区公开榜）';
    }
  }

  async function submitScore(options) {
    options = options || {};
    if (!state.won || state.submitted || mode === 'pvp') return;
    els.btnSubmit.disabled = true;
    els.btnModalSubmit.disabled = true;
    try {
      var me = await sdk.scores.me();
      if (!me.loggedIn) {
        els.hint.textContent = options.auto ? '自动提交跳过：未登录' : '请先登录再提交公开榜';
        els.btnSubmit.disabled = false;
        els.btnModalSubmit.disabled = false;
        return;
      }
      // 闯关榜提交「本轮累计」；每日榜提交本局分；生存榜=波次优先编码
      var score = mode === 'campaign'
        ? Math.max(state.score, progress.campaignRunScore || 0, progress.bestRunScore || 0)
        : (mode === 'survival'
          ? encodeSurvivalScore(state.wave, state.score)
          : state.score);
      await sdk.scores.submit({ boardId: currentBoardId(), score: score });
      state.submitted = true;
      els.hint.textContent = options.auto ? '已自动提交成绩' : '成绩已提交！';
      await refreshBoard();
    } catch (_) {
      await refreshBoard();
      els.hint.textContent = '公开提交暂不可用，已记录本地最佳';
    }
  }

  function switchMode(next) {
    if (mode === next) return;
    mode = next;
    initGame();
    renderLevelList();
    refreshBoard();
  }

  els.btnCampaign.addEventListener('click', function () { switchMode('campaign'); });
  els.btnDaily.addEventListener('click', function () { switchMode('daily'); });
  if (els.btnSurvival) els.btnSurvival.addEventListener('click', function () { switchMode('survival'); });
  if (els.btnSnipe) els.btnSnipe.addEventListener('click', function () { switchMode('snipe'); });
  if (els.btnLeader) els.btnLeader.addEventListener('click', function () { switchMode('boss'); });
  els.btnPvp.addEventListener('click', function () { switchMode('pvp'); });
  els.btnRestart.addEventListener('click', initGame);
  els.btnModalRetry.addEventListener('click', initGame);
  els.btnModalPrimary.addEventListener('click', function () {
    if (state.won && mode === 'campaign') {
      progress.level = Math.min(TOTAL_LEVELS, progress.level + 1);
      persistProgress();
      renderLevelList();
    }
    initGame();
  });
  els.btnSubmit.addEventListener('click', function () { submitScore(); });
  els.btnModalSubmit.addEventListener('click', function () { submitScore(); });
  els.btnRefreshBoard.addEventListener('click', refreshBoard);
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
  els.btnAutoSubmit.addEventListener('click', function () {
    autoSubmit = !autoSubmit;
    persistProgress();
    updateHud();
  });
  function openTutorial() {
    sdk.ui.showTutorial().catch(function () {
      els.hint.textContent = playerAimHint() + ' 闯关有三星评价。';
    });
  }
  els.btnTutorial.addEventListener('click', openTutorial);

  // --- 启动 ---
  try {
    var context = await sdk.ready();
    document.documentElement.dataset.theme = (context && context.theme) || 'light';
    sdk.on('themechange', function (theme) {
      document.documentElement.dataset.theme = theme;
    });
    sdk.on('pause', function () { paused = true; });
    sdk.on('resume', function () { paused = false; lastTs = 0; });
    if (sdk.ui && sdk.ui.onViewportChange) {
      sdk.ui.onViewportChange(layoutCanvas);
    } else {
      window.addEventListener('resize', layoutCanvas);
    }

    await loadProgress();
    await syncPlatformAudioPref();
    if (platformMuted) soundOn = false;

    if (els.btnMenu) {
      els.btnMenu.addEventListener('click', function () {
        var open = !(els.appRoot && els.appRoot.classList.contains('side-open'));
        setSideOpen(open);
      });
    }
    if (els.sideBackdrop) {
      els.sideBackdrop.addEventListener('click', function () { setSideOpen(false); });
    }
    if (els.sidePanel) {
      els.sidePanel.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        if (t.closest('.role-card, .level-btn, #btnCampaign, #btnDaily, #btnSurvival, #btnSnipe, #btnLeader, #btnPvp, #btnRestart')) {
          setSideOpen(false);
          layoutCanvas();
        }
      });
    }
    setSideOpen(false);

    layoutCanvas();
    paintTankCards();
    initGame();
    renderLevelList();
    refreshBoard();
    clearInterval(pollTimer);
    pollTimer = setInterval(refreshBoard, POLL_MS);
    requestAnimationFrame(loop);
    setTimeout(layoutCanvas, 50);
    setTimeout(layoutCanvas, 300);
  } catch (err) {
    console.error(err);
    if (els.hint) els.hint.textContent = '初始化异常，请刷新重试。';
  }
})();