(async function () {
  'use strict';

  var BOARD_ID_CAMPAIGN = 'tank-v2-campaign';
  var BOARD_ID_DAILY = 'tank-v2-daily-';
  var SAVE_KEY = 'tank.v2.progress';
  var POLL_MS = 25000;

  var W = 840;
  var H = 470;
  var WATER_Y = H - 24;
  var GRAVITY = 420;
  var MAX_SPEED = 680;
  var WIND_ACCEL = 16;

  // 四种角色（普通 + 进阶）
  var TANK_CLASSES = {
    cannon: {
      id: 'cannon', name: '夯夯', color: '#2b8a3e', accent: '#69db7c',
      hp: 145, speed: 64, minRelAng: 12, maxRelAng: 72,
      wep1: { name: '重抛', dmg: 38, radius: 34, color: '#ffffff' },
      wep2: { name: '大范围', dmg: 64, radius: 60, color: '#ff4d6d', special: 'heavy' }
    },
    cross: {
      id: 'cross', name: '闪闪', color: '#228be6', accent: '#74c0fc',
      hp: 120, speed: 86, minRelAng: 8, maxRelAng: 78,
      wep1: { name: '尖抛', dmg: 34, radius: 28, color: '#ffffff' },
      wep2: { name: '三连', dmg: 26, radius: 26, color: '#ffd166', special: 'triple' }
    },
    meteor: {
      id: 'meteor', name: '星轨', color: '#7950f2', accent: '#b197fc',
      hp: 115, speed: 78, minRelAng: 10, maxRelAng: 80,
      wep1: { name: '星屑', dmg: 34, radius: 28, color: '#d0bfff' },
      wep2: { name: '寻踪', dmg: 44, radius: 30, color: '#4cc9f0', special: 'homing' }
    },
    dragon: {
      id: 'dragon', name: '焰焰', color: '#e8590c', accent: '#ffa94d',
      hp: 130, speed: 72, minRelAng: 10, maxRelAng: 75,
      wep1: { name: '火团', dmg: 36, radius: 30, color: '#ffc078' },
      wep2: { name: '持续区', dmg: 32, radius: 38, color: '#ff6b6b', special: 'napalm' }
    }
  };
  var CLASS_KEYS = ['cannon', 'cross', 'meteor', 'dragon'];

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
    meterTurn: document.getElementById('meterTurn'),
    meterScore: document.getElementById('meterScore'),
    btnSound: document.getElementById('btnSound'),
    btnMenu: document.getElementById('btnMenu'),
    sideBackdrop: document.getElementById('sideBackdrop'),
    sidePanel: document.getElementById('sidePanel'),
    hint: document.getElementById('hint'),
    appRoot: document.getElementById('app'),
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
    btnFire: document.getElementById('btnFire'),
    btnCampaign: document.getElementById('btnCampaign'),
    btnDaily: document.getElementById('btnDaily'),
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

  function generatePixelTerrain(rng, dark) {
    terrCtx.clearRect(0, 0, W, H);
    terrCtx.globalCompositeOperation = 'source-over';

    // 1. 生成主地形（含中央拱桥/山洞或浮空岛）
    var style = Math.floor(rng() * 3); // 0=双峰拱桥, 1=浮空三岛, 2=连绵丘陵+隧道
    var dirtGrad = terrCtx.createLinearGradient(0, 140, 0, H);
    dirtGrad.addColorStop(0, dark ? '#56473a' : '#9c7b5c');
    dirtGrad.addColorStop(0.55, dark ? '#3e3229' : '#73573f');
    dirtGrad.addColorStop(1, dark ? '#241d17' : '#4a3625');

    terrCtx.fillStyle = dirtGrad;

    if (style === 1) {
      // 浮空三岛（左右主岛 + 中央悬空岛，下面直接是海！）
      function drawIsland(cx, cy, rx, ry) {
        terrCtx.beginPath();
        terrCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        terrCtx.fill();
      }
      drawIsland(165, 315, 138, 62);
      drawIsland(420, 265, 118, 46);
      drawIsland(675, 315, 138, 62);
    } else {
      // 连续山脉
      var p1 = rng() * Math.PI * 2;
      var p2 = rng() * Math.PI * 2;
      terrCtx.beginPath();
      terrCtx.moveTo(0, H);
      for (var x = 0; x <= W; x += 4) {
        var t = x / W;
        var y = 292 + Math.sin(t * Math.PI * 2.4 + p1) * 48 + Math.cos(t * Math.PI * 5.2 + p2) * 24;
        if (t < 0.12 || t > 0.88) y -= 16;
        terrCtx.lineTo(x, Math.max(175, Math.min(WATER_Y - 46, y)));
      }
      terrCtx.lineTo(W, H);
      terrCtx.closePath();
      terrCtx.fill();

      // 挖出经典天然拱洞 / 悬空桥！
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

    // 草皮：单次 ImageData 扫描，避免逐像素 fillRect
    rebuildMaskFromCanvas();
    var grass = terrCtx.getImageData(0, 0, W, H);
    var gd = grass.data;
    var gr = dark ? 47 : 67;
    var gg = dark ? 143 : 190;
    var gb = dark ? 94 : 109;
    for (var gx = 0; gx < W; gx++) {
      var gy = 40;
      while (gy < H - 8) {
        var midx = gy * W + gx;
        if (terrMask[midx] === 1 && terrMask[midx - W] === 0) {
          for (var gh = 0; gh < 7 && gy + gh < H; gh++) {
            if (terrMask[(gy + gh) * W + gx] !== 1) break;
            var pi = ((gy + gh) * W + gx) * 4;
            gd[pi] = gr; gd[pi + 1] = gg; gd[pi + 2] = gb; gd[pi + 3] = 255;
          }
          gy += 8;
          while (gy < H - 8 && terrMask[gy * W + gx] === 1) gy++;
        } else {
          gy++;
        }
      }
    }
    terrCtx.putImageData(grass, 0, 0);
    rebuildMaskFromCanvas();
  }

  function carvePixelCrater(cx, cy, radius) {
    terrCtx.save();
    terrCtx.globalCompositeOperation = 'destination-out';
    terrCtx.beginPath();
    terrCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    terrCtx.fill();
    terrCtx.restore();

    // 弹坑边缘留一圈焦黑灼痕
    terrCtx.save();
    terrCtx.globalCompositeOperation = 'source-atop';
    terrCtx.strokeStyle = 'rgba(20, 14, 10, 0.55)';
    terrCtx.lineWidth = 4;
    terrCtx.beginPath();
    terrCtx.arc(cx, cy, radius + 1, 0, Math.PI * 2);
    terrCtx.stroke();
    terrCtx.restore();

    // 只更新局部掩码（略大于可视半径，减少锯齿薄片）
    var x0 = Math.max(0, Math.floor(cx - radius - 4));
    var x1 = Math.min(W - 1, Math.ceil(cx + radius + 4));
    var y0 = Math.max(0, Math.floor(cy - radius - 4));
    var y1 = Math.min(H - 1, Math.ceil(cy + radius + 4));
    var r2 = (radius + 0.75) * (radius + 0.75);
    for (var y = y0; y <= y1; y++) {
      var dy = y - cy;
      var row = y * W;
      for (var x = x0; x <= x1; x++) {
        var dx = x - cx;
        if (dx * dx + dy * dy <= r2) terrMask[row + x] = 0;
      }
    }

    // 清掉坑边悬空薄片，避免角色踩在“一条绿线”上
    cleanupThinDebris(x0, y0, x1, y1);
    // 炸点附近角色若嵌进土里，立刻顶出
    if (state && state.tanks) {
      state.tanks.forEach(function (t) {
        if (!t.alive) return;
        if (Math.hypot(t.x - cx, t.y - cy) <= radius + 28) ejectTankFromTerrain(t);
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
  var mode = 'campaign'; // 'campaign' | 'daily' | 'pvp'
  var selectedClass = 'cannon';
  var autoSubmit = false;
  var progress = {
    level: 1,
    bestCampaign: 0,
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
  var isDragging = false;
  var dragStart = null;
  var paused = false;
  var lastTs = 0;
  var pollTimer = 0;
  var dpr = 1;
  var viewScale = 1;
  // 粗指针/触控：拖动画布只调瞄准，松手不发射（避免误触）
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

  function makeTank(id, team, name, x, classKey, isAi, hpScale) {
    var cls = TANK_CLASSES[classKey] || TANK_CLASSES.cannon;
    var y = findTopSurface(x);
    var maxHp = Math.round(cls.hp * (hpScale || 1));
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
      relAngle: 42, // 相对车身的仰角（受坡度影响！）
      hp: maxHp,
      maxHp: maxHp,
      isAi: isAi,
      alive: true,
      fuel: 100,
      lastPower: 0,
      weaponSlot: 1, // 1=普攻, 2=大招
      wep2Left: 3,
      items: { tp: 1, heal: 1, power: 1, double: 1 },
      armedItem: null // 'tp' | 'power' | 'double' | null
    };
  }

  // 根据车身坡度计算真实世界发射角（埋坑会压射角）
  function tankWorldAngle(tank) {
    var relRad = (tank.relAngle * Math.PI) / 180;
    if (tank.facing === 1) {
      return tank.slope - relRad;
    }
    return Math.PI + tank.slope + relRad;
  }

  function initGame() {
    var lv = mode === 'daily' ? 3 : (mode === 'pvp' ? 1 : progress.level);
    var seed = mode === 'daily'
      ? hashString('tank-v2-daily-' + todayKey())
      : hashString('tank-v2-' + mode + '-' + lv + '-' + Date.now());
    var rng = mulberry32(seed);
    var dark = document.documentElement.dataset.theme === 'dark';

    generatePixelTerrain(rng, dark);

    var clouds = [];
    for (var i = 0; i < 6; i++) {
      clouds.push({ x: rng() * W, y: 30 + rng() * 90, w: 54 + rng() * 54 });
    }

    state = {
      level: lv,
      rng: rng,
      clouds: clouds,
      tanks: [],
      turnIdx: 0,
      wind: 0,
      phase: 'aim',
      aiTimer: 0,
      pendingShots: [],
      projectiles: [],
      fires: [], // 焰雾灼烧区 { x, y, r, turnsLeft }
      particles: [],
      explosions: [],
      floats: [],
      shake: 0,
      score: 0,
      turnsUsed: 0,
      ended: false,
      won: false,
      submitted: false,
      aiCursor: 0
    };

    if (mode === 'pvp') {
      var p2Cls = CLASS_KEYS[(CLASS_KEYS.indexOf(selectedClass) + 1) % CLASS_KEYS.length];
      state.tanks.push(makeTank('p1', 0, 'P1 ' + TANK_CLASSES[selectedClass].name, 115 + rng() * 75, selectedClass, false, 1));
      state.tanks.push(makeTank('p2', 1, 'P2 ' + TANK_CLASSES[p2Cls].name, W - 115 - rng() * 75, p2Cls, false, 1));
    } else {
      state.tanks.push(makeTank('p1', 0, '我方·' + TANK_CLASSES[selectedClass].name, 105 + rng() * 75, selectedClass, false, 1));
      var enemyCount = lv === 1 ? 1 : (lv <= 3 ? 2 : 3);
      var hpScale = 0.78 + lv * 0.12;
      for (var e = 0; e < enemyCount; e++) {
        var eCls = CLASS_KEYS[Math.floor(rng() * CLASS_KEYS.length)];
        var span = (W - 320) / enemyCount;
        var ex = 320 + e * span + rng() * Math.max(20, span - 60);
        state.tanks.push(makeTank('ai_' + e, 1, '对手·' + TANK_CLASSES[eCls].name, ex, eCls, true, hpScale));
      }
    }

    rollWind();
    isCharging = false;
    chargePower = 0;
    isDragging = false;
    els.modalOverlay.classList.add('hidden');
    els.btnSubmit.disabled = true;
    updateHud();
    els.hint.textContent = touchAimOnly
      ? '拖动画布调角度，按住「抛出」蓄力松手发射。右上角「菜单」可选角换模式。'
      : '拖动画面瞄准发射，或按住「抛出」/ 空格蓄力。可用瞬移/回复/加强道具。';
  }

  function activeTank() {
    return state.tanks[state.turnIdx];
  }

  function rollWind() {
    state.wind = Math.floor(state.rng() * 21) - 10;
  }

  function checkBattleOutcome() {
    if (state.ended) return true;
    var alive0 = state.tanks.filter(function (t) { return t.alive && t.team === 0; });
    var alive1 = state.tanks.filter(function (t) { return t.alive && t.team === 1; });
    if (alive0.length === 0 || alive1.length === 0) {
      finishBattle(alive0.length > 0);
      return true;
    }
    return false;
  }

  function nextTurn() {
    if (state.ended) return;

    // 烈焰灼烧区结算与衰减
    for (var f = state.fires.length - 1; f >= 0; f--) {
      var fire = state.fires[f];
      state.tanks.forEach(function (t) {
        if (t.alive && Math.hypot(t.x - fire.x, t.y - fire.y) <= fire.r + 14) {
          t.hp = Math.max(0, t.hp - 12);
          spawnFloat(t.x, t.y - 36, '🔥 -12', '#ff922b');
          if (t.hp <= 0) {
            t.alive = false;
            if (t.team === 1) state.score += 150;
          }
        }
      });
      fire.turnsLeft -= 1;
      if (fire.turnsLeft <= 0) state.fires.splice(f, 1);
    }

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
      // 闯关/每日：你打一发，只轮到一名对手，再回到你。避免第二关两名对手连打。
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
    rollWind();
    isCharging = false;
    chargePower = 0;

    if (cur.isAi) {
      state.phase = 'ai_think';
      state.aiTimer = 0.8;
      els.hint.textContent = cur.name + ' 正在测算风向与坡度…';
    } else {
      state.phase = 'aim';
      state.turnsUsed += 1;
      els.hint.textContent = cur.name + ' 回合：拖动画面瞄准，或按住抛出键蓄力！';
    }
    updateHud();
  }

  function finishBattle(playerWon) {
    state.ended = true;
    state.won = playerWon;
    state.phase = 'over';

    if (mode === 'pvp') {
      sfxWin();
      els.modalKicker.textContent = '双人同屏结束';
      els.modalTitle.textContent = playerWon ? '🏆 蓝方 P1 获胜！' : '🏆 红方 P2 获胜！';
      els.modalSummary.textContent = '精彩一局！点击下方立即开启下一局新地形。';
      els.btnModalPrimary.textContent = '再来一局';
      els.btnSubmit.disabled = true;
      els.btnModalSubmit.disabled = true;
    } else {
      if (playerWon) {
        var p1 = state.tanks[0];
        state.score += Math.round(p1.hp * 3) + Math.max(0, 280 - state.turnsUsed * 20);
        sfxWin();
        if (mode === 'campaign' && state.score > progress.bestCampaign) progress.bestCampaign = state.score;
        if (mode === 'daily') {
          var k = todayKey();
          if (!progress.bestDaily[k] || state.score > progress.bestDaily[k]) progress.bestDaily[k] = state.score;
        }
        persistProgress();
      } else {
        sfxLose();
      }

      els.modalKicker.textContent = playerWon ? (mode === 'daily' ? '每日挑战通关' : '第 ' + state.level + ' 关完成') : '本局结束';
      els.modalTitle.textContent = playerWon ? '🎉 挑战成功！' : '💨 再试一次';
      els.modalSummary.textContent =
        '本局得分：' + state.score + ' · 回合数：' + state.turnsUsed +
        (playerWon ? ' · 漂亮的抛物线！' : ' · 善用瞬移离开凹地、回复体力，再来一局！');
      els.btnModalPrimary.textContent = playerWon ? (mode === 'daily' ? '再刷一次' : '下一关') : '重新挑战';
      els.btnSubmit.disabled = !playerWon;
      els.btnModalSubmit.disabled = !playerWon;
      if (playerWon && autoSubmit) submitScore({ auto: true });
    }

    els.modalOverlay.classList.remove('hidden');
    updateHud();
    refreshBoard();
  }

  // --- 发射系统（支持 4 种战车大招 + 瞬移/增伤/双发道具） ---
  function fireTank(tank, powerPct) {
    if (state.phase !== 'aim' && state.phase !== 'ai_think') return;
    tank.lastPower = powerPct;
    state.phase = 'firing';

    var baseAng = tankWorldAngle(tank);
    var speed = Math.max(130, (powerPct / 100) * MAX_SPEED);
    var mx = tank.x + Math.cos(baseAng) * 20;
    var my = tank.y - 12 + Math.sin(baseAng) * 20;

    // 如果装备了瞬移弹
    if (tank.armedItem === 'tp') {
      tank.items.tp -= 1;
      tank.armedItem = null;
      state.pendingShots.push({
        delay: 0, x: mx, y: my,
        vx: Math.cos(baseAng) * speed, vy: Math.sin(baseAng) * speed,
        dmg: 0, radius: 0, color: '#63e6be', special: 'tp',
        ownerId: tank.id, ownerTeam: tank.team
      });
      updateHud();
      return;
    }

    var isBig = (tank.weaponSlot === 2 && tank.wep2Left > 0);
    if (isBig) tank.wep2Left -= 1;
    var wep = isBig ? tank.cls.wep2 : tank.cls.wep1;

    var dmgMul = 1;
    var volleys = 1;
    if (tank.armedItem === 'power') {
      tank.items.power -= 1;
      dmgMul = 1.75;
    } else if (tank.armedItem === 'double') {
      tank.items.double -= 1;
      volleys = 2;
    }
    tank.armedItem = null;

    for (var v = 0; v < volleys; v++) {
      var vDelay = v * 0.28;
      if (wep.special === 'triple') {
        [-0.1, 0, 0.1].forEach(function (da, idx) {
          state.pendingShots.push({
            delay: vDelay + idx * 0.04, x: mx, y: my,
            vx: Math.cos(baseAng + da) * speed * (0.96 + idx * 0.04),
            vy: Math.sin(baseAng + da) * speed * (0.96 + idx * 0.04),
            dmg: Math.round(wep.dmg * dmgMul), radius: wep.radius, color: wep.color,
            special: 'normal', ownerId: tank.id, ownerTeam: tank.team
          });
        });
      } else {
        state.pendingShots.push({
          delay: vDelay, x: mx, y: my,
          vx: Math.cos(baseAng) * speed, vy: Math.sin(baseAng) * speed,
          dmg: Math.round(wep.dmg * dmgMul), radius: wep.radius, color: wep.color,
          special: wep.special || 'normal', ownerId: tank.id, ownerTeam: tank.team
        });
      }
    }

    if (tank.weaponSlot === 2 && tank.wep2Left <= 0) tank.weaponSlot = 1;
    updateHud();
  }

  // --- AI 炮手（对射 + 埋脚/砸桥坠海 + 道具） ---
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
    // 直击车身额外加分
    if (body <= 18) score *= 0.55;
    return score;
  }

  function aiUseItems(ai, bestErr) {
    if (ai.hp / ai.maxHp < 0.42 && ai.items.heal > 0 && state.rng() < 0.72) {
      ai.items.heal -= 1;
      ai.hp = Math.min(ai.maxHp, ai.hp + 40);
      sfxHeal();
      spawnFloat(ai.x, ai.y - 30, '💊 +40', '#69db7c');
    }
    if (bestErr < 48 && ai.items.power > 0 && state.rng() < 0.45) {
      ai.armedItem = 'power';
    } else if (bestErr < 70 && ai.items.double > 0 && state.rng() < 0.28) {
      ai.armedItem = 'double';
    } else if (bestErr > 110 && ai.items.tp > 0 && state.rng() < 0.18) {
      // 远弹打不准时偶尔瞬移换位（朝目标方向半程）
      ai.armedItem = 'tp';
    }
  }

  function aiNudgePosition(ai, target) {
    if (ai.fuel < 28) return;
    var desire = target.x >= ai.x ? 1 : -1;
    // 略微侧移，躲开正对陡坡或贴近悬崖
    var thick = terrainThicknessUnder(ai.x, ai.y);
    var steps = thick < 18 ? -desire : (state.rng() < 0.55 ? desire : 0);
    if (!steps) return;
    for (var i = 0; i < 10 && ai.fuel > 20; i++) {
      var nx = Math.max(18, Math.min(W - 18, ai.x + steps * 6));
      var ny = findSurfaceNear(nx, ai.y);
      if (ny === null || ny > WATER_Y - 8) break;
      ai.x = nx;
      ai.y = ny;
      ai.fuel -= 6;
      ai.facing = steps;
    }
    ai.slope = measureSlope(ai.x, ai.y);
  }

  function runAiTurn() {
    var ai = activeTank();
    var target = state.tanks.filter(function (t) { return t.alive && t.team === 0; })[0];
    if (!ai || !target) { nextTurn(); return; }

    aiNudgePosition(ai, target);
    ai.facing = target.x >= ai.x ? 1 : -1;

    var underThin = terrainThicknessUnder(target.x, target.y) < 34;
    // 薄地形优先大招挖坑；否则常规概率开大
    if (ai.wep2Left > 0 && (underThin ? state.rng() < 0.72 : state.rng() < 0.3)) {
      ai.weaponSlot = 2;
    } else {
      ai.weaponSlot = 1;
    }

    var wep = ai.weaponSlot === 2 && ai.wep2Left > 0 ? ai.cls.wep2 : ai.cls.wep1;
    var bestRel = 42, bestPow = 55, bestErr = 99999;
    var relList = [18, 28, 38, 48, 58, 68, 76];
    for (var a = 0; a < relList.length; a++) {
      ai.relAngle = Math.max(ai.cls.minRelAng, Math.min(ai.cls.maxRelAng, relList[a]));
      var wang = tankWorldAngle(ai);
      for (var p = 22; p <= 98; p += 5) {
        var spd = (p / 100) * MAX_SPEED;
        var sx = ai.x + Math.cos(wang) * 20;
        var sy = ai.y - 12 + Math.sin(wang) * 20;
        var vx = Math.cos(wang) * spd;
        var vy = Math.sin(wang) * spd;
        for (var st = 0; st < 160; st++) {
          var dt = 0.03;
          vx += state.wind * WIND_ACCEL * dt;
          vy += GRAVITY * dt;
          sx += vx * dt;
          sy += vy * dt;
          if (sx < -20 || sx >= W + 20 || sy >= WATER_Y) break;
          var hitTank = Math.hypot(sx - target.x, sy - (target.y - 10)) <= 16;
          if (isSolid(sx, sy) || hitTank) {
            var err = scoreAiImpact(sx, sy, target, wep.radius);
            if (err < bestErr) { bestErr = err; bestRel = ai.relAngle; bestPow = p; }
            break;
          }
        }
      }
    }

    aiUseItems(ai, bestErr);
    // 若选了瞬移，瞄准目标脚下前方落点
    if (ai.armedItem === 'tp') {
      bestRel = Math.max(ai.cls.minRelAng, Math.min(ai.cls.maxRelAng, 50 + (state.rng() - 0.5) * 16));
      bestPow = 48 + Math.abs(target.x - ai.x) / W * 40;
    }

    var jitter = Math.max(2, 11 - state.level * 1.5);
    ai.relAngle = Math.max(ai.cls.minRelAng, Math.min(ai.cls.maxRelAng, Math.round(bestRel + (state.rng() - 0.5) * jitter)));
    var finalPow = Math.max(18, Math.min(98, bestPow + (state.rng() - 0.5) * jitter));
    fireTank(ai, finalPow);
  }

  // --- 爆炸、瞬移与灼烧 ---
  function onShellImpact(pr, x, y) {
    if (pr.special === 'tp') {
      var owner = state.tanks.filter(function (t) { return t.id === pr.ownerId; })[0];
      if (owner && owner.alive) {
        owner.x = Math.max(20, Math.min(W - 20, x));
        owner.y = Math.max(20, y - 14);
        owner.vy = 0;
        sfxTeleport();
        spawnFloat(owner.x, owner.y - 26, '🌀 瞬移到达！', '#63e6be');
      }
      return;
    }

    carvePixelCrater(x, y, pr.radius);
    sfxExplode(pr.radius >= 45);
    state.shake = Math.min(13, pr.radius * 0.22);

    if (pr.special === 'napalm') {
      state.fires.push({ x: x, y: y, r: 34, turnsLeft: 3 });
      spawnFloat(x, y - 24, '🔥 持续区域！', '#ff922b');
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

    state.tanks.forEach(function (t) {
      if (!t.alive) return;
      var dist = Math.hypot(t.x - x, (t.y - 10) - y);
      var hitRange = pr.radius + 18;
      if (dist <= hitRange) {
        var factor = 1 - (dist / hitRange) * 0.62;
        var dmg = Math.max(8, Math.round(pr.dmg * factor));
        t.hp = Math.max(0, t.hp - dmg);
        spawnFloat(t.x, t.y - 34, '-' + dmg, '#ff6b6b');
        if (pr.ownerTeam === 0 && t.team === 1) state.score += dmg * 2;
        if (t.hp <= 0) {
          t.alive = false;
          spawnFloat(t.x, t.y - 52, '✨ 完成！', '#ffd166');
          if (pr.ownerTeam === 0 && t.team === 1) state.score += 160;
        }
      }
    });
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

    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 28);

    // 炮车重力贴地（悬空桥挖穿后可落入水区）
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

      if (t.y >= WATER_Y) {
        t.alive = false;
        t.hp = 0;
        sfxSplash();
        spawnFloat(t.x, WATER_Y - 24, '🌊 落入水区！', '#72efdd');
        if (t.team === 1) state.score += 240;
      }
    });
    if (checkBattleOutcome()) return;
    // 当前操作炮车已出局（如自挖落水）则跳过到下一家
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
      if (moveDir !== 0 && cur.fuel > 0) {
        cur.facing = moveDir;
        var nx = Math.max(18, Math.min(W - 18, cur.x + moveDir * cur.cls.speed * dt));
        var ny = findSurfaceNear(nx, cur.y);
        if (ny !== null && ny <= WATER_Y + 6) {
          cur.x = nx;
          if (ny <= cur.y + 8) cur.y = ny;
          cur.fuel = Math.max(0, cur.fuel - 36 * dt);
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

    // 发射队列
    for (var q = state.pendingShots.length - 1; q >= 0; q--) {
      var ps = state.pendingShots[q];
      ps.delay -= dt;
      if (ps.delay <= 0) {
        sfxFire();
        state.projectiles.push({
          x: ps.x, y: ps.y, vx: ps.vx, vy: ps.vy,
          dmg: ps.dmg, radius: ps.radius, color: ps.color,
          special: ps.special, ownerId: ps.ownerId, ownerTeam: ps.ownerTeam,
          age: 0, trail: []
        });
        state.pendingShots.splice(q, 1);
      }
    }

    // 炮弹飞行与像素级碰撞
    for (var i = state.projectiles.length - 1; i >= 0; i--) {
      var pr = state.projectiles[i];
      pr.age += dt;
      pr.trail.push({ x: pr.x, y: pr.y });
      if (pr.trail.length > 16) pr.trail.shift();

      // 寻踪弹：接近对手时轻微制导
      if (pr.special === 'homing' && pr.age > 0.25) {
        var nearest = null, bestD = 260;
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
          pr.vx += (dx / len) * 620 * dt;
          pr.vy += (dy / len) * 620 * dt;
        }
      }

      pr.vx += state.wind * WIND_ACCEL * dt;
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

        // 命中炮车
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

        // 命中 2D 像素地形
        if (isSolid(pr.x, pr.y)) {
          onShellImpact(pr, pr.x, pr.y);
          state.projectiles.splice(i, 1);
          impacted = true;
          break;
        }
      }
    }

    // 爆炸、粒子、飘字
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
      if (!anyFalling) nextTurn();
    }
  }

  // --- 绘制 ---
  function draw() {
    var dark = document.documentElement.dataset.theme === 'dark';
    ctx.save();
    if (state.shake > 0) {
      ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }

    // 1. 天空
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    if (dark) {
      sky.addColorStop(0, '#0f1b2d');
      sky.addColorStop(0.65, '#1b2e47');
      sky.addColorStop(1, '#102033');
    } else {
      sky.addColorStop(0, '#6bb6f5');
      sky.addColorStop(0.65, '#c8e6fc');
      sky.addColorStop(1, '#e6f4ff');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // 云朵
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.72)';
    state.clouds.forEach(function (cl) {
      ctx.beginPath();
      ctx.arc(cl.x, cl.y, cl.w * 0.28, 0, Math.PI * 2);
      ctx.arc(cl.x + cl.w * 0.25, cl.y - 6, cl.w * 0.34, 0, Math.PI * 2);
      ctx.arc(cl.x + cl.w * 0.52, cl.y, cl.w * 0.25, 0, Math.PI * 2);
      ctx.fill();
    });

    // 2. 贴上 2D 像素级可破坏地形
    ctx.drawImage(terrCanvas, 0, 0);

    // 3. 焰雾灼烧区
    state.fires.forEach(function (f) {
      var pulse = 0.75 + Math.sin(performance.now() * 0.015) * 0.25;
      var grad = ctx.createRadialGradient(f.x, f.y, 4, f.x, f.y, f.r);
      grad.addColorStop(0, 'rgba(255, 224, 102, ' + (0.65 * pulse) + ')');
      grad.addColorStop(0.6, 'rgba(255, 107, 107, ' + (0.45 * pulse) + ')');
      grad.addColorStop(1, 'rgba(255, 107, 107, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // 4. 海水
    var wave = Math.sin(performance.now() * 0.004) * 3;
    ctx.fillStyle = dark ? 'rgba(18, 95, 145, 0.8)' : 'rgba(34, 152, 230, 0.74)';
    ctx.fillRect(0, WATER_Y + wave, W, H - WATER_Y + 10);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(0, WATER_Y + wave, W, 3);

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

        ctx.save();
        ctx.fillStyle = cur.armedItem === 'tp' ? '#63e6be' : '#ffffff';
        // 逐步积分含风力，移动端更好估落点
        for (var d = 0; d < 18; d++) {
          var dt = 0.04;
          pvx += state.wind * WIND_ACCEL * dt;
          pvy += GRAVITY * dt;
          px += pvx * dt;
          py += pvy * dt;
          if (px < -20 || px > W + 20 || py > WATER_Y) break;
          ctx.globalAlpha = 1 - d / 20;
          ctx.beginPath();
          ctx.arc(px, py, 3.1 - d * 0.08, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // 6. 炮车绘制
    state.tanks.forEach(function (t, idx) {
      if (!t.alive) return;
      var isCurrent = (idx === state.turnIdx && !state.ended);

      ctx.save();
      ctx.translate(t.x, t.y);

      // 炮管（按真实受坡度影响的世界仰角）
      var wang = tankWorldAngle(t);
      ctx.save();
      ctx.translate(0, -11);
      ctx.rotate(wang);
      ctx.fillStyle = '#242d38';
      ctx.fillRect(0, -3.5, 22, 7);
      ctx.fillStyle = t.cls.accent;
      ctx.fillRect(15, -4.5, 7, 9);
      ctx.restore();

      // 车身随坡度倾斜
      ctx.save();
      ctx.rotate(t.slope);
      ctx.fillStyle = '#1f2730';
      ctx.beginPath();
      ctx.roundRect(-16, -7, 32, 8, 4);
      ctx.fill();
      ctx.fillStyle = t.cls.color;
      ctx.beginPath();
      ctx.roundRect(-13, -15, 26, 10, 5);
      ctx.fill();
      ctx.fillStyle = t.cls.accent;
      ctx.beginPath();
      ctx.arc(0, -14, 8, Math.PI, 0);
      ctx.fill();
      ctx.restore();

      // 当前回合箭头
      if (isCurrent) {
        var bob = Math.sin(performance.now() * 0.008) * 3;
        ctx.fillStyle = '#ffe066';
        ctx.beginPath();
        ctx.moveTo(0, -38 + bob);
        ctx.lineTo(-6, -47 + bob);
        ctx.lineTo(6, -47 + bob);
        ctx.closePath();
        ctx.fill();
      }

      // 血条
      var bw = 36;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(-bw / 2, -30, bw, 5);
      ctx.fillStyle = t.team === 0 ? '#38d9a9' : '#ff6b6b';
      ctx.fillRect(-bw / 2, -30, bw * Math.max(0, t.hp / t.maxHp), 5);
      ctx.restore();
    });

    // 7. 炮弹
    state.projectiles.forEach(function (pr) {
      ctx.save();
      for (var k = 0; k < pr.trail.length; k++) {
        ctx.globalAlpha = (k / pr.trail.length) * 0.65;
        ctx.fillStyle = pr.color;
        ctx.beginPath();
        ctx.arc(pr.trail[k].x, pr.trail[k].y, 2 + (k / pr.trail.length) * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = pr.color;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.special === 'heavy' ? 6.5 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1a2530';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    });

    // 8. 爆炸、粒子、飘字
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
      // 触控拖拽时用预览力度画辅助线（不发射）
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
      if (els.hint) els.hint.textContent = '角度已调好 · 按住「抛出」蓄力。滑出按钮或按 Esc 可取消';
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

  /** @param {boolean} shouldFire 松手发射；取消/中断则 false */
  function stopCharge(shouldFire) {
    if (!isCharging) {
      els.btnFire.classList.remove('charging');
      return;
    }
    var power = chargePower;
    isCharging = false;
    firePointerId = null;
    chargePower = 0;
    els.btnFire.classList.remove('charging');
    updateCockpitReadout();
    if (shouldFire) {
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
  function releaseOnFireButton(ev) {
    var r = els.btnFire.getBoundingClientRect();
    return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
  }

  window.addEventListener('pointerup', function (ev) {
    clearHoldByPointer(ev.pointerId);
    if (isCharging && (firePointerId === null || ev.pointerId === firePointerId)) {
      stopCharge(releaseOnFireButton(ev));
    }
  }, true);
  window.addEventListener('pointercancel', function (ev) {
    if (ev && ev.pointerId != null) clearHoldByPointer(ev.pointerId);
    else clearHold();
    if (isCharging && (firePointerId === null || !ev || ev.pointerId === firePointerId)) {
      stopCharge(false);
    }
  }, true);

  els.btnFire.addEventListener('pointerdown', function (ev) {
    if (ev.button) return;
    ev.preventDefault();
    var cur = activeTank();
    if (state.phase !== 'aim' || !cur || cur.isAi) return;
    ensureAudio();
    firePointerId = ev.pointerId;
    try { els.btnFire.setPointerCapture(ev.pointerId); } catch (_) {}
    isCharging = true;
    chargePower = 12;
    chargeDir = 1;
    els.btnFire.classList.add('charging');
    updateCockpitReadout();
  });
  els.btnFire.addEventListener('pointerup', function (ev) {
    if (firePointerId !== null && ev.pointerId !== firePointerId) return;
    if (!isCharging) return;
    stopCharge(releaseOnFireButton(ev));
  });
  els.btnFire.addEventListener('pointercancel', function (ev) {
    if (firePointerId !== null && ev.pointerId !== firePointerId) return;
    stopCharge(false);
  });
  els.btnFire.addEventListener('lostpointercapture', function () {
    // 系统手势/滚动抢走捕获时：取消蓄力，不发射
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
        chargePower = 12;
        chargeDir = 1;
        els.btnFire.classList.add('charging');
      }
    }
  });

  window.addEventListener('keyup', function (ev) {
    keys[ev.code] = false;
    if (ev.code === 'Space' && isCharging && firePointerId === null) {
      ev.preventDefault();
      stopCharge(true);
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

  // 武器切换
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
      if (cur.armedItem === 'tp') els.hint.textContent = '🌀 已装填瞬移弹：下一发打到哪里就飞到哪里！';
      else if (cur.armedItem === 'power') els.hint.textContent = '⚡ 已激活加强：下一发效果提升 75%！';
      else if (cur.armedItem === 'double') els.hint.textContent = '✨ 已激活双发：本回合将连续抛出两次！';
      updateHud();
    });
  });

  // 选车切换
  document.querySelectorAll('.tank-card').forEach(function (btn) {
    btn.addEventListener('click', function () {
      selectedClass = btn.dataset.tank;
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
    els.fuelReadout.textContent = '燃料 ' + Math.round(cur.fuel) + '%';
    els.powerReadout.textContent = '力度 ' + Math.round(chargePower) + '%';
    els.powerFill.style.width = Math.round(chargePower) + '%';
    if (cur.lastPower > 0) {
      els.powerLastMark.classList.remove('hidden');
      els.powerLastMark.style.left = Math.round(cur.lastPower) + '%';
    } else {
      els.powerLastMark.classList.add('hidden');
    }
  }

  function updateHud() {
    var cur = activeTank();
    els.meterWind.textContent = state.wind === 0 ? '🍃 无风 0' : (state.wind > 0 ? ('💨 右风 +' + state.wind) : ('💨 左风 ' + state.wind));
    els.meterTurn.textContent = cur ? (cur.name + '回合') : '—';
    els.meterScore.textContent = '得分 ' + state.score;

    els.modeSub.textContent = mode === 'daily'
      ? ('每日同种 · ' + todayKey())
      : (mode === 'pvp' ? '双人同屏' : ('单人闯关 · 第 ' + state.level + ' 关'));
    els.modeDesc.textContent = mode === 'daily'
      ? '今日全服同地形同风向序列，公平冲榜！'
      : (mode === 'pvp' ? '蓝方 P1 与红方 P2 轮流操作，挖开悬空桥让对方落入水区！' : '悬空桥可挖开，把对方送进凹地或落入水区！');

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

    els.btnFire.disabled = !cur || cur.isAi || state.phase !== 'aim';
    document.querySelectorAll('.tank-card').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tank === selectedClass);
    });
    els.btnCampaign.classList.toggle('active', mode === 'campaign');
    els.btnDaily.classList.toggle('active', mode === 'daily');
    els.btnPvp.classList.toggle('active', mode === 'pvp');
    if (platformMuted) {
      els.btnSound.textContent = '🔇';
      els.btnSound.setAttribute('aria-pressed', 'false');
      els.btnSound.title = '本次为静音进入；需重新打开应用并选择「开启声音」';
    } else {
      els.btnSound.textContent = soundOn ? '🔊' : '🔇';
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
    return mode === 'daily' ? (BOARD_ID_DAILY + todayKey()) : BOARD_ID_CAMPAIGN;
  }

  async function persistProgress() {
    progress.settings = { soundOn: soundOn, autoSubmit: autoSubmit, tankClass: selectedClass };
    try { await sdk.storage.set(SAVE_KEY, progress); } catch (_) {}
  }

  async function loadProgress() {
    try {
      var saved = await sdk.storage.get(SAVE_KEY);
      if (!saved || typeof saved !== 'object') return;
      progress.level = Math.max(1, Number(saved.level) || 1);
      progress.bestCampaign = Number(saved.bestCampaign) || 0;
      progress.bestDaily = saved.bestDaily || {};
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
        '<span>' + row.score + ' 分</span>';
      els.boardList.appendChild(li);
    });
    els.boardMine.textContent = mineLabel || '';
  }

  function localBest() {
    return mode === 'daily' ? (progress.bestDaily[todayKey()] || 0) : (progress.bestCampaign || 0);
  }

  async function refreshBoard() {
    els.boardMeta.textContent = (mode === 'daily' ? '每日榜 ' + todayKey() : '单人闯关榜') + ' · 按得分排行';
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
      await sdk.scores.submit({ boardId: currentBoardId(), score: state.score });
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
    refreshBoard();
  }

  els.btnCampaign.addEventListener('click', function () { switchMode('campaign'); });
  els.btnDaily.addEventListener('click', function () { switchMode('daily'); });
  els.btnPvp.addEventListener('click', function () { switchMode('pvp'); });
  els.btnRestart.addEventListener('click', initGame);
  els.btnModalRetry.addEventListener('click', initGame);
  els.btnModalPrimary.addEventListener('click', function () {
    if (state.won && mode === 'campaign') {
      progress.level += 1;
      persistProgress();
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
  els.btnTutorial.addEventListener('click', function () {
    sdk.ui.showTutorial().catch(function () {
      els.hint.textContent = '选择4种角色，善用瞬移/回复/加强与悬空落差完成挑战！';
    });
  });

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
    // 选角/切模式后收起抽屉，避免挡住画布
    if (els.sidePanel) {
      els.sidePanel.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        if (t.closest('.tank-card, #btnCampaign, #btnDaily, #btnPvp, #btnRestart')) {
          setSideOpen(false);
          layoutCanvas();
        }
      });
    }
    setSideOpen(false);

    layoutCanvas();
    initGame();
    if (touchAimOnly && els.hint) {
      els.hint.textContent = '拖动画布调角度，按住下方「抛出」蓄力松手发射。点右上角「菜单」选角。';
    }
    refreshBoard();
    clearInterval(pollTimer);
    pollTimer = setInterval(refreshBoard, POLL_MS);
    requestAnimationFrame(loop);
    // 首帧后再量一次，避免移动端地址栏导致高度不准
    setTimeout(layoutCanvas, 50);
    setTimeout(layoutCanvas, 300);
  } catch (err) {
    console.error(err);
    els.hint.textContent = '初始化异常，请刷新重试。';
  }
})();
