(async function () {
  'use strict';

  var BOARD_ID_CAMPAIGN = 'luosi-v1-campaign-';
  var BOARD_ID_DAILY = 'luosi-v1-daily-';
  var SAVE_KEY = 'luosi.v1.progress';
  var POLL_MS = 25000;

  // 简单 / 复杂 / 地狱：叠板密度、颜色、孔位与道具配额
  var DIFFS = {
    easy: {
      id: 'easy',
      label: '简单',
      plateScale: 0.55,
      plateCap: 10,
      colorBoost: -1,
      warmupUntil: 2,
      dockSize: 6,
      unlockedBoxes: 3,
      props: { slot: 3, box: 3, hammer: 2, magnet: 2 },
      scoreMul: 0.85,
      desc: '板少色少、孔位宽裕、道具充足，适合上手与解压。'
    },
    complex: {
      id: 'complex',
      label: '复杂',
      plateScale: 1,
      plateCap: 16,
      colorBoost: 0,
      warmupUntil: 1,
      dockSize: 5,
      unlockedBoxes: 2,
      props: { slot: 2, box: 2, hammer: 1, magnet: 1 },
      scoreMul: 1,
      desc: '标准多层机械叠板与道具配额，闯关主难度。'
    },
    hell: {
      id: 'hell',
      label: '地狱',
      plateScale: 1.4,
      plateCap: 20,
      colorBoost: 2,
      warmupUntil: 0,
      dockSize: 4,
      unlockedBoxes: 1,
      props: { slot: 1, box: 1, hammer: 0, magnet: 1 },
      scoreMul: 1.55,
      desc: '无热身、叠板更密、孔位更紧、道具更少，冲分向难度。'
    }
  };

  var W = 440;
  var H = 640;
  var BOX_Y = 20;
  var BOX_H = 74;
  var DOCK_Y = 108;
  var DOCK_H = 54;
  var PLAY_TOP = 180;
  var PLAY_BOTTOM = H - 20;
  var SCREW_R = 14.5;

  // 7 种高饱和糖果/工业质感色板（原版打螺丝辨识度配色）
  var COLORS = [
    { id: 0, name: '绯红', fill: '#f03e5e', dark: '#a61e3a', rim: '#ff9ebb', plate: 'rgba(240, 62, 94, 0.42)', stroke: 'rgba(255, 130, 155, 0.92)' },
    { id: 1, name: '天蓝', fill: '#1992e8', dark: '#0d5894', rim: '#8ed4ff', plate: 'rgba(25, 146, 232, 0.40)', stroke: 'rgba(116, 202, 255, 0.92)' },
    { id: 2, name: '翠绿', fill: '#14c986', dark: '#0b7c52', rim: '#8df7cb', plate: 'rgba(20, 201, 134, 0.38)', stroke: 'rgba(105, 240, 188, 0.90)' },
    { id: 3, name: '明黄', fill: '#f5b014', dark: '#a87005', rim: '#ffe799', plate: 'rgba(245, 176, 20, 0.40)', stroke: 'rgba(255, 215, 102, 0.94)' },
    { id: 4, name: '魅紫', fill: '#9754e8', dark: '#5c289e', rim: '#d9b8ff', plate: 'rgba(151, 84, 232, 0.40)', stroke: 'rgba(196, 150, 255, 0.92)' },
    { id: 5, name: '亮橙', fill: '#f77328', dark: '#ab430b', rim: '#ffc199', plate: 'rgba(247, 115, 40, 0.40)', stroke: 'rgba(255, 165, 112, 0.92)' },
    { id: 6, name: '桃粉', fill: '#ec52b6', dark: '#9e2273', rim: '#ffb3e6', plate: 'rgba(236, 82, 182, 0.40)', stroke: 'rgba(255, 148, 218, 0.92)' }
  ];

  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');

  var els = {
    modeSub: document.getElementById('modeSub'),
    modeDesc: document.getElementById('modeDesc'),
    meterLeft: document.getElementById('meterLeft'),
    meterScore: document.getElementById('meterScore'),
    meterTime: document.getElementById('meterTime'),
    btnSound: document.getElementById('btnSound'),
    hint: document.getElementById('hint'),
    btnPropSlot: document.getElementById('btnPropSlot'),
    btnPropBox: document.getElementById('btnPropBox'),
    btnPropHammer: document.getElementById('btnPropHammer'),
    btnPropMagnet: document.getElementById('btnPropMagnet'),
    cntSlot: document.getElementById('cntSlot'),
    cntBox: document.getElementById('cntBox'),
    cntHammer: document.getElementById('cntHammer'),
    cntMagnet: document.getElementById('cntMagnet'),
    btnCampaign: document.getElementById('btnCampaign'),
    btnDaily: document.getElementById('btnDaily'),
    btnDiffEasy: document.getElementById('btnDiffEasy'),
    btnDiffComplex: document.getElementById('btnDiffComplex'),
    btnDiffHell: document.getElementById('btnDiffHell'),
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

  // --- SDK 兼容层 ---
  var hasSdk = !!window.Yiqiwan;
  var sdk = hasSdk ? window.Yiqiwan : {
    ready: function () { return Promise.resolve({ theme: 'light', sound: 'enabled' }); },
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

  // --- Web Audio 拟真音效 ---
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

  function tone(freq, dur, type, vol, endFreq) {
    var ac = ensureAudio();
    if (!ac) return;
    try {
      var osc = ac.createOscillator();
      var g = ac.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, ac.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.055, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0008, ac.currentTime + dur);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + dur);
    } catch (_) {}
  }

  function sfxUnscrew() {
    // 拧动电动螺丝刀 + 咔哒弹起
    tone(420, 0.07, 'triangle', 0.045, 920);
    setTimeout(function () { tone(1180, 0.05, 'sine', 0.045, 1480); }, 55);
  }
  function sfxSnapIn() { tone(880, 0.045, 'sine', 0.045, 1220); }
  function sfxLocked() { tone(175, 0.08, 'sawtooth', 0.04, 130); }
  function sfxSwing() { tone(360, 0.11, 'sine', 0.03, 240); }
  function sfxDrop() {
    tone(310, 0.14, 'triangle', 0.05, 140);
    setTimeout(function () { tone(190, 0.15, 'sine', 0.04, 95); }, 80);
  }
  function sfxShatter() {
    [1600, 1280, 2100, 920, 1450].forEach(function (f, i) {
      setTimeout(function () { tone(f, 0.08, 'triangle', 0.05, f * 0.6); }, i * 22);
    });
  }
  function sfxPack() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      setTimeout(function () { tone(f, 0.12, 'triangle', 0.055); }, i * 48);
    });
  }
  function sfxFail() {
    tone(250, 0.24, 'sawtooth', 0.06, 170);
    setTimeout(function () { tone(170, 0.3, 'sawtooth', 0.05, 110); }, 130);
  }

  // --- 工具 ---
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

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // --- 几何碰撞与坐标变换（支持旋转摆动后的实时精确遮挡判定） ---
  function worldToPlateLocal(pl, wx, wy) {
    var dx = wx - pl.cx;
    var dy = wy - pl.cy;
    var cos = Math.cos(-pl.rot);
    var sin = Math.sin(-pl.rot);
    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos
    };
  }

  function pointInPlateLocal(pl, lx, ly, margin) {
    margin = margin || 0;
    if (pl.shape === 'circle') {
      var r = pl.r + margin;
      return (lx * lx + ly * ly) <= r * r;
    }
    if (pl.shape === 'triangle') {
      // 等腰三角形，顶点在 (0, -h/2)，底边在 (-w/2, h/2) 到 (w/2, h/2)
      var hw = pl.w / 2 + margin;
      var hh = pl.h / 2 + margin;
      if (ly < -hh || ly > hh) return false;
      var t = (ly + hh) / (2 * hh); // 0 在顶部，1 在底部
      return Math.abs(lx) <= hw * t;
    }
    // rect 或 pill
    return Math.abs(lx) <= (pl.w / 2 + margin) && Math.abs(ly) <= (pl.h / 2 + margin);
  }

  function pointHitsPlate(pl, wx, wy, margin) {
    var loc = worldToPlateLocal(pl, wx, wy);
    return pointInPlateLocal(pl, loc.x, loc.y, margin);
  }

  // --- 关卡蓝图生成（包含第1关极速热身造型 + 多层对称/交错机械结构） ---
  function makePlateObj(id, layer, shape, cx, cy, w, h, colorIdx, screwLocalPts) {
    var pl = {
      id: id,
      layer: layer,
      shape: shape, // 'rect' | 'pill' | 'circle' | 'triangle'
      cx: cx,
      cy: cy,
      w: w,
      h: h,
      r: shape === 'circle' ? w / 2 : 0,
      rot: 0,
      colorIdx: colorIdx,
      state: 'fixed', // 'fixed' | 'swing' | 'falling' | 'removed'
      // 单摆状态参数
      pivotX: 0,
      pivotY: 0,
      pivotDist: 0,
      swingAngle: 0,
      pivotBaseRot: 0,
      angVel: 0,
      // 自由落体参数
      vx: 0,
      vy: 0,
      vrot: 0,
      screwLocalPts: screwLocalPts
    };
    return pl;
  }

  function currentDiff() {
    return DIFFS[difficulty] || DIFFS.complex;
  }

  function generateLevel(levelNum, seed, diff) {
    diff = diff || currentDiff();
    var rng = mulberry32(seed);
    var plates = [];
    var colorCount;
    var useWarmup = levelNum <= diff.warmupUntil;

    if (useWarmup) {
      // 热身：经典对称造型（简单可到第2关；地狱无热身）
      colorCount = Math.max(2, 3 + Math.min(0, diff.colorBoost));
      plates.push(
        makePlateObj('p0', 0, 'rect', 220, 410, 240, 120, 1, [[-82, -32], [82, -32], [0, 32]]),
        makePlateObj('p1', 1, 'circle', 165, 360, 130, 130, 0, [[-34, 0], [34, 0]]),
        makePlateObj('p2', 2, 'circle', 275, 360, 130, 130, 2 % colorCount, [[-34, 0], [34, 0]]),
        makePlateObj('p3', 3, 'pill', 220, 315, 210, 56, Math.min(3, colorCount - 1), [[-74, 0], [74, 0]])
      );
      if (diff.id === 'easy' && levelNum === 1) {
        plates.pop(); // 简单第1关再少一块板
      }
    } else {
      // 多层机械几何叠板：难度缩放板数与颜色
      var effectiveLv = Math.max(1, Math.round(levelNum * (diff.id === 'easy' ? 0.7 : diff.id === 'hell' ? 1.35 : 1)));
      colorCount = Math.min(
        COLORS.length,
        Math.max(2, 3 + Math.min(4, Math.floor((effectiveLv + 1) / 2)) + diff.colorBoost)
      );
      var plateCount = Math.min(
        diff.plateCap,
        Math.max(4, Math.round((6 + Math.floor(effectiveLv * 1.15)) * diff.plateScale))
      );
      var shapes = ['rect', 'pill', 'circle', 'triangle'];
      var centerX = W / 2;
      var centerY = (PLAY_TOP + PLAY_BOTTOM) / 2;

      for (var i = 0; i < plateCount; i++) {
        var shape = shapes[Math.floor(rng() * shapes.length)];
        var pw, ph, cx, cy, pts = [];

        if (shape === 'circle') {
          pw = ph = Math.round(108 + rng() * 54);
          var rr = pw * 0.29;
          var nPts = rng() > (diff.id === 'hell' ? 0.25 : 0.4) ? 3 : 2;
          var baseA = rng() * Math.PI * 2;
          for (var a = 0; a < nPts; a++) {
            var ang = baseA + (a * Math.PI * 2) / nPts;
            pts.push([Math.round(Math.cos(ang) * rr), Math.round(Math.sin(ang) * rr)]);
          }
        } else if (shape === 'triangle') {
          pw = Math.round(146 + rng() * 68);
          ph = Math.round(126 + rng() * 54);
          pts = [[0, -Math.round(ph * 0.22)], [-Math.round(pw * 0.24), Math.round(ph * 0.28)], [Math.round(pw * 0.24), Math.round(ph * 0.28)]];
        } else if (shape === 'pill') {
          var horiz = rng() > 0.42;
          pw = horiz ? Math.round(170 + rng() * 95) : Math.round(54 + rng() * 14);
          ph = horiz ? Math.round(54 + rng() * 14) : Math.round(170 + rng() * 95);
          if (horiz) {
            pts = [[-Math.round(pw * 0.34), 0], [Math.round(pw * 0.34), 0]];
            if (rng() > 0.55) pts.push([0, 0]);
          } else {
            pts = [[0, -Math.round(ph * 0.34)], [0, Math.round(ph * 0.34)]];
            if (rng() > 0.55) pts.push([0, 0]);
          }
        } else {
          pw = Math.round(135 + rng() * 95);
          ph = Math.round(92 + rng() * 68);
          var ox = Math.round(pw * 0.32);
          var oy = Math.round(ph * 0.28);
          pts = rng() > 0.45
            ? [[-ox, -oy], [ox, -oy], [0, oy]]
            : [[-ox, -oy], [ox, oy]];
        }

        // 让板子围绕盘面中心有机叠放，既有交错遮挡又不至于出界
        var spreadX = Math.max(10, (W - 60 - pw) / 2);
        var spreadY = Math.max(10, (PLAY_BOTTOM - PLAY_TOP - ph) / 2);
        cx = Math.round(centerX + (rng() * 2 - 1) * spreadX);
        cy = Math.round(centerY + (rng() * 2 - 1) * spreadY);

        plates.push(makePlateObj('p' + i, i, shape, cx, cy, pw, ph, i % colorCount, pts));
      }
    }

    // 收集全部螺丝规格，并把总数凑成 3 的倍数
    var specs = [];
    plates.forEach(function (pl) {
      pl.screwLocalPts.forEach(function (pt) {
        specs.push({ pl: pl, lx: pt[0], ly: pt[1], x: pl.cx + pt[0], y: pl.cy + pt[1] });
      });
    });

    while (specs.length % 3 !== 0) {
      var topPl = plates[plates.length - 1];
      // 在顶层板安全位置补一颗
      var extraLx = specs.length % 2 === 0 ? 0 : 22;
      var extraLy = specs.length % 2 === 0 ? 12 : -12;
      specs.push({ pl: topPl, lx: extraLx, ly: extraLy, x: topPl.cx + extraLx, y: topPl.cy + extraLy });
    }

    // 分配颜色：保证每种颜色总数严格为 3 的倍数
    var groups = specs.length / 3;
    var colorBag = [];
    for (var g = 0; g < groups; g++) {
      var cid = g % colorCount;
      colorBag.push(cid, cid, cid);
    }
    shuffle(colorBag, rng);

    var screws = specs.map(function (sp, idx) {
      return {
        id: 'sc_' + idx,
        plateId: sp.pl.id,
        layer: sp.pl.layer,
        x: sp.x,
        y: sp.y,
        colorIdx: colorBag[idx],
        removed: false,
        unscrewing: 0, // >0 表示正在原地拧出动画
        shake: 0
      };
    });

    return { plates: plates, screws: screws, rng: rng };
  }

  // --- 游戏状态 ---
  var mode = 'campaign';
  var difficulty = 'complex';
  var autoSubmit = false;
  var progress = {
    levels: { easy: 1, complex: 1, hell: 1 },
    bestCampaign: { easy: 0, complex: 0, hell: 0 },
    bestDaily: { easy: {}, complex: {}, hell: {} },
    settings: { soundOn: true, autoSubmit: false, difficulty: 'complex' }
  };

  function campaignLevel() {
    return Math.max(1, Number(progress.levels[difficulty]) || 1);
  }

  function setCampaignLevel(n) {
    progress.levels[difficulty] = Math.max(1, n);
  }

  function addScore(base) {
    state.score += Math.round(base * (state.scoreMul || 1));
  }

  var state = {};
  var paused = false;
  var lastTs = 0;
  var pollTimer = 0;
  var dpr = 1;
  var viewScale = 1;

  function initGame() {
    var diff = currentDiff();
    var lv = mode === 'daily' ? (diff.id === 'easy' ? 3 : diff.id === 'hell' ? 8 : 5) : campaignLevel();
    var seed = mode === 'daily'
      ? hashString('luosi-v1-daily-' + diff.id + '-' + todayKey())
      : hashString('luosi-v1-' + diff.id + '-lv-' + lv + '-' + (lv <= diff.warmupUntil ? 777 : Date.now()));

    var gen = generateLevel(lv, seed, diff);

    state = {
      level: lv,
      difficulty: diff.id,
      rng: gen.rng,
      plates: gen.plates,
      screws: gen.screws,
      boxes: [],      // 顶部收纳盒，最多 4 个槽位
      unlockedBoxes: diff.unlockedBoxes,
      maxBoxSlots: 4,
      packingBoxes: [], // 正在合盖飞走的满盒动画
      dock: [],       // 下方暂存孔位
      dockSize: diff.dockSize,
      flying: [],     // 拧出并飞向盒子/暂存槽的螺丝
      shards: [],     // 砸板玻璃碎片
      particles: [],
      floats: [],
      props: {
        slot: diff.props.slot,
        box: diff.props.box,
        hammer: diff.props.hammer,
        magnet: diff.props.magnet
      },
      hammerMode: false,
      score: 0,
      scoreMul: diff.scoreMul,
      startedAt: performance.now(),
      elapsedSec: 0,
      ended: false,
      won: false,
      submitted: false
    };

    for (var i = 0; i < state.dockSize; i++) state.dock.push(null);

    refillBoxes();
    canvas.classList.remove('hammer-cursor');
    els.modalOverlay.classList.add('hidden');
    els.btnSubmit.disabled = true;
    updateHud();
    els.hint.textContent = lv <= diff.warmupUntil
      ? (diff.label + '热身：点击亮起的螺丝，感受板子单点下垂摆动！')
      : '点击亮起的螺丝拧下，凑齐 3 颗同色打包消除！';
  }

  // --- 遮挡与颜色调度 ---
  function isScrewBlocked(sc) {
    if (sc.removed) return true;
    for (var i = 0; i < state.plates.length; i++) {
      var pl = state.plates[i];
      if (pl.state === 'removed' || pl.state === 'falling') continue;
      if (pl.layer <= sc.layer) continue;
      // 实时用旋转逆变换判定是否被上层（包括摆动中的）亚克力板盖住
      if (pointHitsPlate(pl, sc.x, sc.y, 2)) {
        return true;
      }
    }
    return false;
  }

  function remainingColorCounts() {
    var counts = {};
    state.screws.forEach(function (s) {
      if (!s.removed) counts[s.colorIdx] = (counts[s.colorIdx] || 0) + 1;
    });
    state.dock.forEach(function (c) {
      if (c !== null) counts[c] = (counts[c] || 0) + 1;
    });
    state.flying.forEach(function (f) {
      if (f.toDock) counts[f.colorIdx] = (counts[f.colorIdx] || 0) + 1;
    });
    state.boxes.forEach(function (b) {
      var need = 3 - b.reserved;
      counts[b.colorIdx] = Math.max(0, (counts[b.colorIdx] || 0) - need);
    });
    return counts;
  }

  function pickNextBoxColor() {
    var counts = remainingColorCounts();
    var candidates = [];
    Object.keys(counts).forEach(function (k) {
      if (counts[k] >= 3) candidates.push(Number(k));
    });
    if (!candidates.length) {
      Object.keys(counts).forEach(function (k) {
        if (counts[k] > 0) candidates.push(Number(k));
      });
    }
    if (!candidates.length) return null;

    // 优先匹配暂存槽里堆积最多的颜色，其次匹配场上已露出的颜色
    var dockCount = {};
    state.dock.forEach(function (c) { if (c !== null) dockCount[c] = (dockCount[c] || 0) + 1; });
    var bestDockCol = null, bestDockN = 0;
    candidates.forEach(function (c) {
      if ((dockCount[c] || 0) > bestDockN) { bestDockN = dockCount[c]; bestDockCol = c; }
    });
    if (bestDockCol !== null) return bestDockCol;

    var exposed = {};
    state.screws.forEach(function (s) {
      if (!s.removed && !isScrewBlocked(s)) exposed[s.colorIdx] = true;
    });
    var good = candidates.filter(function (c) { return exposed[c]; });
    var pool = good.length ? good : candidates;
    return pool[Math.floor(state.rng() * pool.length)];
  }

  function boxSlotRect(slotIdx) {
    var gap = 8;
    var totalSlot = state.maxBoxSlots; // 4
    var bw = (W - 28 - gap * (totalSlot - 1)) / totalSlot;
    return {
      x: 14 + slotIdx * (bw + gap),
      y: BOX_Y,
      w: bw,
      h: BOX_H
    };
  }

  function boxHolePos(slotIdx, k) {
    var r = boxSlotRect(slotIdx);
    var pad = 18;
    var step = (r.w - pad * 2) / 2;
    return { x: r.x + pad + k * step, y: r.y + r.h * 0.62 };
  }

  function dockHolePos(idx) {
    var n = state.dockSize;
    var span = Math.min(54, (W - 40) / n);
    var startX = (W - span * (n - 1)) / 2;
    return { x: startX + idx * span, y: DOCK_Y + DOCK_H / 2 };
  }

  function refillBoxes() {
    while (state.boxes.length < state.unlockedBoxes) {
      var col = pickNextBoxColor();
      if (col === null) break;
      state.boxes.push({
        id: 'bx_' + Math.random().toString(36).slice(2, 7),
        colorIdx: col,
        filled: 0,    // 已实际落入的颗数
        reserved: 0,  // 已预订飞来的颗数
        slideIn: 1.0  // 从右侧滑入动画 1->0
      });
    }
    pullFromDockToBoxes();
  }

  function findAvailableBox(colorIdx) {
    for (var i = 0; i < state.boxes.length; i++) {
      if (state.boxes[i].colorIdx === colorIdx && state.boxes[i].reserved < 3) return i;
    }
    return -1;
  }

  function pullFromDockToBoxes() {
    for (var i = 0; i < state.dock.length; i++) {
      var col = state.dock[i];
      if (col === null) continue;
      var bIdx = findAvailableBox(col);
      if (bIdx !== -1) {
        state.dock[i] = null;
        var box = state.boxes[bIdx];
        var slotK = box.reserved;
        box.reserved += 1;
        var from = dockHolePos(i);
        var to = boxHolePos(bIdx, slotK);
        spawnFlyingScrew(from.x, from.y, to.x, to.y, col, false, box.id, -1, 0);
      }
    }
  }

  function spawnFlyingScrew(x0, y0, x1, y1, colorIdx, toDock, targetBoxId, targetDockIdx, spinDelay) {
    state.flying.push({
      x0: x0, y0: y0, x1: x1, y1: y1,
      x: x0, y: y0,
      delay: spinDelay || 0,
      t: 0, dur: 0.24,
      colorIdx: colorIdx,
      toDock: toDock,
      targetBoxId: targetBoxId,
      targetDockIdx: targetDockIdx
    });
  }

  // --- 关键：拆掉螺丝后更新亚克力板的真实物理状态（固定 -> 单点摆动 -> 自由落体） ---
  function updatePlatePhysicsState(plateId) {
    var pl = null;
    for (var i = 0; i < state.plates.length; i++) {
      if (state.plates[i].id === plateId) { pl = state.plates[i]; break; }
    }
    if (!pl || pl.state === 'removed' || pl.state === 'falling') return;

    var leftScrews = state.screws.filter(function (s) {
      return !s.removed && s.plateId === plateId;
    });

    if (leftScrews.length === 1 && pl.state === 'fixed') {
      // 只剩 1 颗螺丝！切换为单点支点重力摆动模式！
      var pv = leftScrews[0];
      pl.state = 'swing';
      pl.pivotX = pv.x;
      pl.pivotY = pv.y;
      var rx = pl.cx - pv.x;
      var ry = pl.cy - pv.y;
      var dist = Math.hypot(rx, ry);
      if (dist < 4) {
        // 螺丝正好在中心时给一点微小偏心让它轻轻歪斜
        rx = 6; ry = -2; dist = Math.hypot(rx, ry);
      }
      pl.pivotDist = dist;
      pl.swingAngle = Math.atan2(ry, rx);
      pl.pivotBaseRot = pl.rot - pl.swingAngle;
      pl.angVel = (rx >= 0 ? 0.5 : -0.5);
      sfxSwing();
    } else if (leftScrews.length === 0) {
      // 所有螺丝拆空！自由落体飞出屏幕
      pl.state = 'falling';
      pl.vy = -70;
      pl.vx = (state.rng() - 0.5) * 110;
      pl.vrot = pl.angVel || ((state.rng() - 0.5) * 4.5);
      addScore(60);
      sfxDrop();
      spawnFloat(pl.cx, pl.cy, '拆板 +' + Math.round(60 * (state.scoreMul || 1)), '#ffe799');
    }
  }

  function shatterPlate(pl) {
    if (!pl || pl.state === 'removed' || pl.state === 'falling') return;
    pl.state = 'removed';
    addScore(40);
    sfxShatter();
    var col = COLORS[pl.colorIdx];
    // 生成 22 块半透明玻璃碎片
    for (var i = 0; i < 22; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 80 + Math.random() * 230;
      state.shards.push({
        x: pl.cx + (Math.random() - 0.5) * pl.w * 0.65,
        y: pl.cy + (Math.random() - 0.5) * pl.h * 0.65,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 90,
        size: 8 + Math.random() * 14,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 10,
        color: col.plate,
        stroke: col.stroke,
        life: 0.75 + Math.random() * 0.35
      });
    }
    spawnFloat(pl.cx, pl.cy, '💥 玻璃粉碎！', '#ffd166');
  }

  function onClickScrew(sc) {
    if (state.ended || sc.removed) return;
    if (isScrewBlocked(sc)) {
      sc.shake = 0.24;
      sfxLocked();
      els.hint.textContent = '这颗螺丝被上层亚克力板压住了，先拆上面的或让上层板荡开！';
      return;
    }

    var bIdx = findAvailableBox(sc.colorIdx);
    if (bIdx !== -1) {
      sc.removed = true;
      sfxUnscrew();
      var box = state.boxes[bIdx];
      var slotK = box.reserved;
      box.reserved += 1;
      var to = boxHolePos(bIdx, slotK);
      addScore(20);
      spawnFlyingScrew(sc.x, sc.y, to.x, to.y, sc.colorIdx, false, box.id, -1, 0.09);
      updatePlatePhysicsState(sc.plateId);
    } else {
      var dockIdx = state.dock.indexOf(null);
      if (dockIdx === -1) {
        sfxFail();
        els.hint.textContent = '临时孔位已满！可用下方道具救急';
        checkLose();
        return;
      }
      sc.removed = true;
      sfxUnscrew();
      // 先占位防止连点溢出
      state.dock[dockIdx] = sc.colorIdx;
      var dp = dockHolePos(dockIdx);
      addScore(10);
      spawnFlyingScrew(sc.x, sc.y, dp.x, dp.y, sc.colorIdx, true, '', dockIdx, 0.09);
      updatePlatePhysicsState(sc.plateId);
    }
    updateHud();
  }

  function onScrewLanded(f) {
    sfxSnapIn();
    if (!f.toDock && f.targetBoxId) {
      for (var i = 0; i < state.boxes.length; i++) {
        if (state.boxes[i].id === f.targetBoxId) {
          state.boxes[i].filled += 1;
          if (state.boxes[i].filled >= 3) {
            packBox(i);
          }
          break;
        }
      }
    }
    checkWinOrLose();
  }

  function packBox(idx) {
    var box = state.boxes[idx];
    var r = boxSlotRect(idx);
    var col = COLORS[box.colorIdx];
    addScore(120);
    sfxPack();
    spawnBurst(r.x + r.w / 2, r.y + r.h / 2, col.fill, 16);
    spawnFloat(r.x + r.w / 2, r.y + r.h / 2 + 8, '打包 +' + Math.round(120 * (state.scoreMul || 1)), col.rim);

    // 放入合盖飞走动画队列
    state.packingBoxes.push({
      x: r.x, y: r.y, w: r.w, h: r.h,
      colorIdx: box.colorIdx,
      t: 0 // 0~0.35 合盖，0.35~0.75 向上飞走
    });

    state.boxes.splice(idx, 1);
    refillBoxes();
  }

  function checkWinOrLose() {
    if (state.ended) return;
    var leftScrews = state.screws.filter(function (s) { return !s.removed; }).length;
    var leftDock = state.dock.filter(function (c) { return c !== null; }).length;
    if (leftScrews === 0 && leftDock === 0 && state.flying.length === 0) {
      finishGame(true);
      return;
    }
    checkLose();
  }

  function checkLose() {
    if (state.ended || state.flying.length > 0) return;
    if (state.dock.indexOf(null) !== -1) return;
    // 槽位已满，看场上露出的螺丝还有没有能进活跃盒子的
    var hasMove = state.screws.some(function (s) {
      return !s.removed && !isScrewBlocked(s) && findAvailableBox(s.colorIdx) !== -1;
    });
    if (!hasMove) {
      finishGame(false);
    }
  }

  function finishGame(won) {
    state.ended = true;
    state.won = won;
    state.hammerMode = false;
    canvas.classList.remove('hammer-cursor');

    if (won) {
      var bonus = Math.max(0, 350 - Math.floor(state.elapsedSec) * 3);
      addScore(bonus);
      sfxPack();
      var dKey = difficulty;
      if (mode === 'campaign') {
        if (state.score > (progress.bestCampaign[dKey] || 0)) progress.bestCampaign[dKey] = state.score;
      } else {
        var k = todayKey();
        var dailyMap = progress.bestDaily[dKey] || (progress.bestDaily[dKey] = {});
        if (!dailyMap[k] || state.score > dailyMap[k]) dailyMap[k] = state.score;
      }
      persistProgress();
    } else {
      sfxFail();
    }

    var diffLabel = currentDiff().label;
    els.modalKicker.textContent = won
      ? (mode === 'daily' ? (diffLabel + ' · 每日同种达成') : (diffLabel + ' · 第 ' + state.level + ' 关通关'))
      : '孔位已满';
    els.modalTitle.textContent = won ? '🎉 完美拆解！' : '😅 临时孔位爆满';
    els.modalSummary.textContent =
      '难度：' + diffLabel + ' · 本关得分：' + state.score + ' · 用时：' + formatTime(state.elapsedSec) +
      (won ? ' · 所有机械亚克力板已全部清空！' : ' · 可以善用「砸碎板」「开新盒」「磁吸」道具破局。');

    els.btnModalPrimary.textContent = won ? (mode === 'daily' ? '再刷一次' : '下一关') : '再试一次';
    els.btnSubmit.disabled = !won;
    els.btnModalSubmit.disabled = !won;
    els.modalOverlay.classList.remove('hidden');

    updateHud();
    refreshBoard();
    if (won && autoSubmit) submitScore({ auto: true });
  }

  function spawnBurst(x, y, color, count) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 45 + Math.random() * 140;
      state.particles.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: 2.5 + Math.random() * 2.5, color: color, life: 0.35 + Math.random() * 0.2
      });
    }
  }

  function spawnFloat(x, y, text, color) {
    state.floats.push({ x: x, y: y, text: text, color: color || '#ffffff', life: 0.9 });
  }

  // --- 4大道具交互 ---
  els.btnPropSlot.addEventListener('click', function () {
    if (state.ended || state.props.slot <= 0 || state.dockSize >= 7) return;
    state.hammerMode = false;
    canvas.classList.remove('hammer-cursor');
    state.props.slot -= 1;
    state.dockSize += 1;
    state.dock.push(null);
    sfxPack();
    spawnFloat(W / 2, DOCK_Y, '临时孔位 +1', '#8ed4ff');
    updateHud();
  });

  els.btnPropBox.addEventListener('click', function () {
    if (state.ended || state.props.box <= 0 || state.unlockedBoxes >= state.maxBoxSlots) return;
    state.hammerMode = false;
    canvas.classList.remove('hammer-cursor');
    state.props.box -= 1;
    state.unlockedBoxes += 1;
    refillBoxes();
    sfxPack();
    spawnFloat(W / 2, BOX_Y + 40, '📦 解锁新收纳盒！', '#ffe799');
    updateHud();
  });

  els.btnPropHammer.addEventListener('click', function () {
    if (state.ended || state.props.hammer <= 0) return;
    state.hammerMode = !state.hammerMode;
    canvas.classList.toggle('hammer-cursor', state.hammerMode);
    els.hint.textContent = state.hammerMode
      ? '🔨 砸板模式已开启：点击任意一块亚克力板直接粉碎！'
      : '已取消砸板模式';
    updateHud();
  });

  els.btnPropMagnet.addEventListener('click', function () {
    if (state.ended || state.props.magnet <= 0 || !state.boxes.length) return;
    state.hammerMode = false;
    canvas.classList.remove('hammer-cursor');
    var targetIdx = 0;
    var box = state.boxes[targetIdx];
    var need = 3 - box.reserved;
    if (need <= 0) return;

    var pulled = 0;
    // 先吸暂存槽
    for (var i = 0; i < state.dock.length && pulled < need; i++) {
      if (state.dock[i] === box.colorIdx) {
        state.dock[i] = null;
        var dp = dockHolePos(i);
        var to1 = boxHolePos(targetIdx, box.reserved);
        box.reserved += 1;
        spawnFlyingScrew(dp.x, dp.y, to1.x, to1.y, box.colorIdx, false, box.id, -1, 0);
        pulled += 1;
      }
    }
    // 再吸场上任意同色螺丝（无视遮挡）
    for (var j = 0; j < state.screws.length && pulled < need; j++) {
      var s = state.screws[j];
      if (!s.removed && s.colorIdx === box.colorIdx) {
        s.removed = true;
        var to2 = boxHolePos(targetIdx, box.reserved);
        box.reserved += 1;
        spawnFlyingScrew(s.x, s.y, to2.x, to2.y, s.colorIdx, false, box.id, -1, 0.05);
        pulled += 1;
        updatePlatePhysicsState(s.plateId);
      }
    }
    if (pulled > 0) {
      state.props.magnet -= 1;
      sfxPack();
      spawnFloat(W / 2, PLAY_TOP + 10, '🧲 磁吸补齐 ' + pulled + ' 颗！', '#8df7cb');
      updateHud();
    }
  });

  // --- 物理步进 ---
  function step(dt) {
    if (!state.ended) {
      state.elapsedSec = (performance.now() - state.startedAt) / 1000;
    }

    // 1. 亚克力板单摆 & 自由落体物理
    state.plates.forEach(function (pl) {
      if (pl.state === 'swing') {
        // 单摆动力学：平衡点在 +PI/2（正下方）
        var gEff = 1400;
        var alpha = (gEff / Math.max(28, pl.pivotDist)) * Math.cos(pl.swingAngle);
        pl.angVel = (pl.angVel + alpha * dt) * Math.pow(0.28, dt); // 阻尼
        pl.swingAngle += pl.angVel * dt;
        pl.cx = pl.pivotX + Math.cos(pl.swingAngle) * pl.pivotDist;
        pl.cy = pl.pivotY + Math.sin(pl.swingAngle) * pl.pivotDist;
        pl.rot = pl.pivotBaseRot + pl.swingAngle;
      } else if (pl.state === 'falling') {
        pl.vy += 1320 * dt;
        pl.cx += pl.vx * dt;
        pl.cy += pl.vy * dt;
        pl.rot += pl.vrot * dt;
        if (pl.cy > H + 220) pl.state = 'removed';
      }
    });

    // 2. 螺丝抖动
    state.screws.forEach(function (s) {
      if (s.shake > 0) s.shake = Math.max(0, s.shake - dt);
    });

    // 3. 盒子滑入动画
    state.boxes.forEach(function (b) {
      if (b.slideIn > 0) b.slideIn = Math.max(0, b.slideIn - dt * 5);
    });

    // 4. 合盖飞走盒子动画
    state.packingBoxes.forEach(function (pb) {
      pb.t += dt;
    });
    state.packingBoxes = state.packingBoxes.filter(function (pb) { return pb.t < 0.65; });

    // 5. 飞行螺丝（先原地旋转拧出 delay，再抛物线飞入）
    for (var i = state.flying.length - 1; i >= 0; i--) {
      var f = state.flying[i];
      if (f.delay > 0) {
        f.delay -= dt;
        continue;
      }
      f.t += dt / f.dur;
      var ease = 1 - Math.pow(1 - Math.min(1, f.t), 3);
      f.x = f.x0 + (f.x1 - f.x0) * ease;
      f.y = f.y0 + (f.y1 - f.y0) * ease - Math.sin(ease * Math.PI) * 32;
      if (f.t >= 1) {
        state.flying.splice(i, 1);
        onScrewLanded(f);
      }
    }

    // 6. 玻璃碎片、粒子、飘字
    state.shards.forEach(function (sh) {
      sh.vy += 900 * dt;
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      sh.rot += sh.vrot * dt;
      sh.life -= dt;
    });
    state.shards = state.shards.filter(function (sh) { return sh.life > 0; });

    state.particles.forEach(function (p) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 240 * dt; p.life -= dt;
    });
    state.particles = state.particles.filter(function (p) { return p.life > 0; });

    state.floats.forEach(function (fl) { fl.y -= 34 * dt; fl.life -= dt; });
    state.floats = state.floats.filter(function (fl) { return fl.life > 0; });

    els.meterTime.textContent = formatTime(state.elapsedSec);
  }

  // --- 高质感绘制 ---
  function roundRectPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
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

  function tracePlatePath(pl) {
    if (pl.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, pl.r, 0, Math.PI * 2);
    } else if (pl.shape === 'triangle') {
      var hw = pl.w / 2, hh = pl.h / 2;
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.lineTo(hw, hh);
      ctx.lineTo(-hw, hh);
      ctx.closePath();
    } else if (pl.shape === 'pill') {
      roundRectPath(-pl.w / 2, -pl.h / 2, pl.w, pl.h, Math.min(pl.w, pl.h) / 2);
    } else {
      roundRectPath(-pl.w / 2, -pl.h / 2, pl.w, pl.h, 16);
    }
  }

  function drawScrew(x, y, colorIdx, blocked, spinAngle, scale) {
    var col = COLORS[colorIdx];
    ctx.save();
    ctx.translate(x, y);
    if (scale) ctx.scale(scale, scale);
    if (spinAngle) ctx.rotate(spinAngle);
    if (blocked) ctx.globalAlpha = 0.42;

    // 底部阴影
    ctx.beginPath();
    ctx.arc(0, 2.5, SCREW_R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fill();

    // 立体球面渐变
    var grad = ctx.createRadialGradient(-4, -5, 2, 0, 0, SCREW_R);
    grad.addColorStop(0, col.rim);
    grad.addColorStop(0.45, col.fill);
    grad.addColorStop(1, col.dark);

    ctx.beginPath();
    ctx.arc(0, 0, SCREW_R, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = blocked ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.75)';
    ctx.stroke();

    // 十字金属凹槽
    ctx.strokeStyle = 'rgba(15, 20, 28, 0.62)';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-5.8, 0); ctx.lineTo(5.8, 0);
    ctx.moveTo(0, -5.8); ctx.lineTo(0, 5.8);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-5.2, -1.2); ctx.lineTo(5.2, -1.2);
    ctx.stroke();

    ctx.restore();
  }

  function drawBoxVisual(x, y, w, h, colorIdx, filledCount, lidProgress) {
    var dark = document.documentElement.dataset.theme === 'dark';
    var col = COLORS[colorIdx];
    ctx.save();
    ctx.translate(x, y);

    // 盒身
    roundRectPath(0, 0, w, h, 14);
    ctx.fillStyle = dark ? '#1d2936' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = col.fill;
    ctx.stroke();

    // 顶部色彩顶盖条
    roundRectPath(6, 5, w - 12, 13, 6);
    ctx.fillStyle = col.fill;
    ctx.fill();

    // 3 个螺孔
    for (var k = 0; k < 3; k++) {
      var pad = 18;
      var step = (w - pad * 2) / 2;
      var hx = pad + k * step;
      var hy = h * 0.62;
      ctx.beginPath();
      ctx.arc(hx, hy, 11.5, 0, Math.PI * 2);
      ctx.fillStyle = dark ? 'rgba(0,0,0,0.45)' : 'rgba(20,34,52,0.1)';
      ctx.fill();
      if (k < filledCount) {
        drawScrew(hx, hy, colorIdx, false, 0, 0.8);
      }
    }

    // 合盖打包膜
    if (lidProgress > 0) {
      roundRectPath(0, 0, w, h * Math.min(1, lidProgress), 14);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    var dark = document.documentElement.dataset.theme === 'dark';

    // 工作台底色
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    if (dark) {
      bg.addColorStop(0, '#161f2a');
      bg.addColorStop(1, '#0e151d');
    } else {
      bg.addColorStop(0, '#edf3f8');
      bg.addColorStop(1, '#d6e2ee');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 洞洞板金属孔点阵
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.045)' : 'rgba(25,40,58,0.075)';
    for (var gy = PLAY_TOP; gy < PLAY_BOTTOM; gy += 24) {
      for (var gx = 24; gx < W - 16; gx += 24) {
        ctx.beginPath();
        ctx.arc(gx, gy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 1. 顶部 4 个收纳盒位（活跃盒 + 带锁空位）
    for (var s = 0; s < state.maxBoxSlots; s++) {
      var sr = boxSlotRect(s);
      if (s < state.boxes.length) {
        var box = state.boxes[s];
        var slideOffset = box.slideIn * 40;
        drawBoxVisual(sr.x + slideOffset, sr.y, sr.w, sr.h, box.colorIdx, box.filled, 0);
      } else if (s < state.unlockedBoxes) {
        // 已解锁但暂时无色可补
        roundRectPath(sr.x, sr.y, sr.w, sr.h, 14);
        ctx.fillStyle = dark ? 'rgba(255,255,255,0.03)' : 'rgba(25,40,58,0.05)';
        ctx.fill();
      } else {
        // 带锁盒位
        roundRectPath(sr.x, sr.y, sr.w, sr.h, 14);
        ctx.fillStyle = dark ? 'rgba(255,255,255,0.04)' : 'rgba(25,40,58,0.06)';
        ctx.fill();
        ctx.strokeStyle = dark ? 'rgba(255,255,255,0.12)' : 'rgba(25,40,58,0.14)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔒', sr.x + sr.w / 2, sr.y + sr.h / 2 - 6);
        ctx.fillStyle = dark ? '#7e93a8' : '#64768a';
        ctx.font = '600 10px "PingFang SC", sans-serif';
        ctx.fillText('开新盒', sr.x + sr.w / 2, sr.y + sr.h / 2 + 17);
      }
    }

    // 合盖飞走的满盒动画
    state.packingBoxes.forEach(function (pb) {
      var lid = Math.min(1, pb.t / 0.22);
      var lift = pb.t > 0.22 ? Math.pow((pb.t - 0.22) / 0.43, 2) * 140 : 0;
      ctx.save();
      ctx.globalAlpha = pb.t > 0.35 ? Math.max(0, 1 - (pb.t - 0.35) / 0.3) : 1;
      drawBoxVisual(pb.x, pb.y - lift, pb.w, pb.h, pb.colorIdx, 3, lid);
      ctx.restore();
    });

    // 2. 下方暂存孔位槽
    roundRectPath(14, DOCK_Y, W - 28, DOCK_H, 14);
    ctx.fillStyle = dark ? 'rgba(0,0,0,0.34)' : 'rgba(25,40,58,0.075)';
    ctx.fill();
    for (var d = 0; d < state.dockSize; d++) {
      var dp = dockHolePos(d);
      ctx.beginPath();
      ctx.arc(dp.x, dp.y, 16, 0, Math.PI * 2);
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.82)';
      ctx.fill();
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.16)' : 'rgba(25,40,58,0.16)';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // 如果该槽位有已落地的螺丝（排除正在飞向该槽的）
      var incoming = state.flying.some(function (f) { return f.toDock && f.targetDockIdx === d; });
      if (state.dock[d] !== null && !incoming) {
        drawScrew(dp.x, dp.y, state.dock[d], false, 0, 0.92);
      }
    }

    // 3. 按层级从底到顶绘制亚克力板 & 螺丝
    state.plates.forEach(function (pl) {
      if (pl.state === 'removed') return;
      var col = COLORS[pl.colorIdx];
      ctx.save();
      ctx.translate(pl.cx, pl.cy);
      ctx.rotate(pl.rot);

      // 立体投影
      ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 6;

      tracePlatePath(pl);
      ctx.fillStyle = col.plate;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // 亚克力高光斜带（裁剪在板子内部）
      ctx.save();
      ctx.clip();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.rotate(-0.45);
      ctx.fillRect(-pl.w, -pl.h * 0.42, pl.w * 2, 18);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.fillRect(-pl.w, -pl.h * 0.42 + 24, pl.w * 2, 7);
      ctx.restore();

      // 玻璃厚边框
      tracePlatePath(pl);
      ctx.lineWidth = state.hammerMode ? 3.2 : 2.2;
      ctx.strokeStyle = state.hammerMode ? '#ffe066' : col.stroke;
      ctx.stroke();

      // 螺丝孔金属铆钉环
      pl.screwLocalPts.forEach(function (pt) {
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      ctx.restore();

      // 绘制附着在当前层的螺丝（未移除）
      state.screws.forEach(function (sc) {
        if (sc.removed || sc.plateId !== pl.id) return;
        var blocked = isScrewBlocked(sc);
        var sx = sc.x + (sc.shake > 0 ? Math.sin(performance.now() * 0.09) * 4.5 : 0);
        drawScrew(sx, sc.y, sc.colorIdx, blocked, 0, 1);
      });
    });

    // 砸碎玻璃板后遗留在底板上的无主螺丝
    state.screws.forEach(function (sc) {
      if (sc.removed) return;
      var host = state.plates.filter(function (p) { return p.id === sc.plateId; })[0];
      if (!host || host.state === 'removed') {
        var blocked = isScrewBlocked(sc);
        var sx = sc.x + (sc.shake > 0 ? Math.sin(performance.now() * 0.09) * 4.5 : 0);
        drawScrew(sx, sc.y, sc.colorIdx, blocked, 0, 1);
      }
    });

    // 4. 飞行/拧出中的螺丝
    state.flying.forEach(function (f) {
      var spin = f.delay > 0 ? (0.09 - f.delay) * 45 : (4 + f.t * Math.PI * 5);
      var sc = f.delay > 0 ? (1 + (0.09 - f.delay) * 2.2) : (1.15 - f.t * 0.25);
      drawScrew(f.x, f.y, f.colorIdx, false, spin, sc);
    });

    // 5. 玻璃碎片
    state.shards.forEach(function (sh) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, sh.life);
      ctx.translate(sh.x, sh.y);
      ctx.rotate(sh.rot);
      ctx.beginPath();
      ctx.moveTo(0, -sh.size / 2);
      ctx.lineTo(sh.size / 2, sh.size / 3);
      ctx.lineTo(-sh.size / 2, sh.size / 2);
      ctx.closePath();
      ctx.fillStyle = sh.color;
      ctx.fill();
      ctx.strokeStyle = sh.stroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    });

    // 6. 粒子与飘字
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
      ctx.globalAlpha = Math.max(0, fl.life / 0.9);
      ctx.fillStyle = fl.color;
      ctx.font = '700 14px "Avenir Next", "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(fl.text, fl.x, fl.y);
      ctx.restore();
    });
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

  // --- 点击交互 ---
  canvas.addEventListener('pointerdown', function (ev) {
    if (ev.button || state.ended) return;
    ensureAudio();
    var rect = canvas.getBoundingClientRect();
    var lx = (ev.clientX - rect.left) / viewScale;
    var ly = (ev.clientY - rect.top) / viewScale;

    // 砸板模式：从顶层向下找点中的亚克力板
    if (state.hammerMode) {
      for (var p = state.plates.length - 1; p >= 0; p--) {
        var pl = state.plates[p];
        if (pl.state === 'removed' || pl.state === 'falling') continue;
        if (pointHitsPlate(pl, lx, ly, 4)) {
          state.props.hammer -= 1;
          state.hammerMode = false;
          canvas.classList.remove('hammer-cursor');
          shatterPlate(pl);
          els.hint.textContent = '已粉碎该亚克力板，下层螺丝已解放！';
          updateHud();
          return;
        }
      }
      return;
    }

    // 点中顶部带锁盒子可以直接触发「开新盒」道具
    for (var s = state.unlockedBoxes; s < state.maxBoxSlots; s++) {
      var sr = boxSlotRect(s);
      if (lx >= sr.x && lx <= sr.x + sr.w && ly >= sr.y && ly <= sr.y + sr.h) {
        if (state.props.box > 0) els.btnPropBox.click();
        return;
      }
    }

    // 找命中的螺丝（高层优先）
    var hit = null;
    for (var i = state.screws.length - 1; i >= 0; i--) {
      var sc = state.screws[i];
      if (sc.removed) continue;
      if (Math.hypot(lx - sc.x, ly - sc.y) <= SCREW_R + 7) {
        if (!hit || sc.layer > hit.layer) hit = sc;
      }
    }
    if (hit) onClickScrew(hit);
  });

  function layoutCanvas() {
    var wrap = canvas.parentElement;
    var rect = wrap.getBoundingClientRect();
    var scale = Math.min(rect.width / W, rect.height / H);
    scale = Math.max(0.36, scale);
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

  // --- HUD 与榜单 ---
  function formatTime(sec) {
    var s = Math.max(0, Math.floor(sec));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function updateHud() {
    var diff = currentDiff();
    var left = state.screws.filter(function (s) { return !s.removed; }).length;
    els.meterLeft.textContent = '剩余 ' + left + ' 颗';
    els.meterScore.textContent = '得分 ' + state.score;
    els.modeSub.textContent = mode === 'daily'
      ? (diff.label + ' · 每日同种 · ' + todayKey())
      : (diff.label + ' · 闯关 · 第 ' + state.level + ' 关');
    els.modeDesc.textContent = (mode === 'daily'
      ? '今日同难度全服同一套叠板；'
      : '') + diff.desc;

    els.cntSlot.textContent = String(state.props.slot);
    els.cntBox.textContent = String(state.props.box);
    els.cntHammer.textContent = String(state.props.hammer);
    els.cntMagnet.textContent = String(state.props.magnet);

    els.btnPropSlot.disabled = state.ended || state.props.slot <= 0 || state.dockSize >= 7;
    els.btnPropBox.disabled = state.ended || state.props.box <= 0 || state.unlockedBoxes >= state.maxBoxSlots;
    els.btnPropHammer.disabled = state.ended || state.props.hammer <= 0;
    els.btnPropHammer.classList.toggle('active-tool', !!state.hammerMode);
    els.btnPropMagnet.disabled = state.ended || state.props.magnet <= 0 || !state.boxes.length;

    els.btnCampaign.classList.toggle('active', mode === 'campaign');
    els.btnDaily.classList.toggle('active', mode === 'daily');
    els.btnDiffEasy.classList.toggle('active', difficulty === 'easy');
    els.btnDiffComplex.classList.toggle('active', difficulty === 'complex');
    els.btnDiffHell.classList.toggle('active', difficulty === 'hell');
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
  }

  function currentBoardId() {
    var d = difficulty;
    return mode === 'daily'
      ? (BOARD_ID_DAILY + d + '-' + todayKey())
      : (BOARD_ID_CAMPAIGN + d);
  }

  async function persistProgress() {
    progress.settings = { soundOn: soundOn, autoSubmit: autoSubmit, difficulty: difficulty };
    try { await sdk.storage.set(SAVE_KEY, progress); } catch (_) {}
  }

  async function loadProgress() {
    try {
      var saved = await sdk.storage.get(SAVE_KEY);
      if (!saved || typeof saved !== 'object') return;
      progress.levels = {
        easy: Math.max(1, Number((saved.levels && saved.levels.easy) || saved.level) || 1),
        complex: Math.max(1, Number((saved.levels && saved.levels.complex) || saved.level) || 1),
        hell: Math.max(1, Number((saved.levels && saved.levels.hell) || 1) || 1)
      };
      if (saved.bestCampaign && typeof saved.bestCampaign === 'object') {
        progress.bestCampaign = {
          easy: Number(saved.bestCampaign.easy) || 0,
          complex: Number(saved.bestCampaign.complex) || 0,
          hell: Number(saved.bestCampaign.hell) || 0
        };
      } else if (typeof saved.bestCampaign === 'number') {
        progress.bestCampaign.complex = saved.bestCampaign;
      }
      if (saved.bestDaily && typeof saved.bestDaily === 'object') {
        if (saved.bestDaily.easy || saved.bestDaily.complex || saved.bestDaily.hell) {
          progress.bestDaily = {
            easy: saved.bestDaily.easy || {},
            complex: saved.bestDaily.complex || {},
            hell: saved.bestDaily.hell || {}
          };
        } else {
          progress.bestDaily.complex = saved.bestDaily;
        }
      }
      if (saved.settings) {
        soundOn = saved.settings.soundOn !== false;
        autoSubmit = !!saved.settings.autoSubmit;
        if (DIFFS[saved.settings.difficulty]) difficulty = saved.settings.difficulty;
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
    var d = difficulty;
    if (mode === 'daily') {
      return ((progress.bestDaily[d] || {})[todayKey()]) || 0;
    }
    return progress.bestCampaign[d] || 0;
  }

  async function refreshBoard() {
    var diff = currentDiff();
    els.boardMeta.textContent = (mode === 'daily'
      ? (diff.label + '每日榜 ' + todayKey())
      : (diff.label + '闯关榜')) + ' · 按得分排行';
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
      renderBoard(lb2 ? [{ rank: 1, displayName: '我（本地）', score: lb2, isMe: true }] : [], lb2 ? '本地预览最佳' : '过关后显示');
      els.boardMeta.textContent = '本地预览榜（上线后为社区公开榜）';
    }
  }

  async function submitScore(options) {
    options = options || {};
    if (!state.won || state.submitted) return;
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

  // --- 按钮事件 ---
  els.btnCampaign.addEventListener('click', function () {
    if (mode === 'campaign') return;
    mode = 'campaign';
    initGame();
    refreshBoard();
  });

  els.btnDaily.addEventListener('click', function () {
    if (mode === 'daily') return;
    mode = 'daily';
    initGame();
    refreshBoard();
  });

  function switchDifficulty(id) {
    if (!DIFFS[id] || difficulty === id) return;
    difficulty = id;
    persistProgress();
    initGame();
    refreshBoard();
  }
  els.btnDiffEasy.addEventListener('click', function () { switchDifficulty('easy'); });
  els.btnDiffComplex.addEventListener('click', function () { switchDifficulty('complex'); });
  els.btnDiffHell.addEventListener('click', function () { switchDifficulty('hell'); });

  els.btnRestart.addEventListener('click', initGame);
  els.btnModalRetry.addEventListener('click', initGame);
  els.btnModalPrimary.addEventListener('click', function () {
    if (state.won && mode === 'campaign') {
      setCampaignLevel(campaignLevel() + 1);
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
      els.hint.textContent = '点击亮起螺丝凑3消！只剩1颗螺丝的板子会自动下垂摆动露出下层。';
    });
  });

  // --- 启动 ---
  try {
    var context = await sdk.ready();
    document.documentElement.dataset.theme = (context && context.theme) || 'light';
    await applyPlatformSoundPref(context);
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
    if (platformMuted) soundOn = false;
    layoutCanvas();
    initGame();
    refreshBoard();
    clearInterval(pollTimer);
    pollTimer = setInterval(refreshBoard, POLL_MS);
    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    els.hint.textContent = '初始化异常，请刷新重试。';
  }
})();
