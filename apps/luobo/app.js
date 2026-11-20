(async function () {
  'use strict';

  // 榜 ID 必须长期固定！随版本改号 = 旧成绩全消失（曾误改为 v3 导致榜空）
  var BOARD_ID_ENDLESS = 'luobo-endless-v2';
  var BOARD_ID_DAILY = 'luobo-daily-v2-';
  var BOARD_ID_MAP = 'luobo-map-v2-';
  // 误用过的历史榜，仅读榜合并展示，不再作为提交主榜
  var BOARD_LEGACY_ENDLESS = ['luobo-endless-v3'];
  var BOARD_LEGACY_DAILY = ['luobo-daily-v3-'];
  var BOARD_LEGACY_MAP = ['luobo-map-v3-'];
  var SAVE_KEY = 'luobo.progress.v2';
  var POLL_MS = 25000;
  /** 无尽/每日榜：高位波次优先，低位质量分次排序（防清障/囤金币刷分） */
  var SCORE_WAVE_UNIT = 1000000;

  var COLS = 12;
  var ROWS = 8;
  var CELL = 56;
  var W = COLS * CELL; // 672
  var H = ROWS * CELL; // 448

  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  var canvasWrap = document.getElementById('canvasWrap');

  var els = {
    modeSub: document.getElementById('modeSub'),
    meterGold: document.getElementById('meterGold'),
    meterWave: document.getElementById('meterWave'),
    meterHp: document.getElementById('meterHp'),
    meterScore: document.getElementById('meterScore'),
    btnSound: document.getElementById('btnSound'),
    hint: document.getElementById('hint'),
    btnNextWave: document.getElementById('btnNextWave'),
    btnSpeed: document.getElementById('btnSpeed'),
    btnPause: document.getElementById('btnPause'),
    tileMenu: document.getElementById('tileMenu'),
    endOverlay: document.getElementById('endOverlay'),
    endKicker: document.getElementById('endKicker'),
    endTitle: document.getElementById('endTitle'),
    endSummary: document.getElementById('endSummary'),
    btnEndSubmit: document.getElementById('btnEndSubmit'),
    btnEndNext: document.getElementById('btnEndNext'),
    btnEndRestart: document.getElementById('btnEndRestart'),
    btnMap0: document.getElementById('btnMap0'),
    btnMap1: document.getElementById('btnMap1'),
    btnMap2: document.getElementById('btnMap2'),
    btnEndless: document.getElementById('btnEndless'),
    btnDaily: document.getElementById('btnDaily'),
    modeDesc: document.getElementById('modeDesc'),
    boardTitle: document.getElementById('boardTitle'),
    endStats: document.getElementById('endStats'),
    mapRecord: document.getElementById('mapRecord'),
    towerLegend: document.getElementById('towerLegend'),
    btnRestart: document.getElementById('btnRestart'),
    btnTutorial: document.getElementById('btnTutorial'),
    btnSubmit: document.getElementById('btnSubmit'),
    btnAutoSubmit: document.getElementById('btnAutoSubmit'),
    btnRefreshBoard: document.getElementById('btnRefreshBoard'),
    boardList: document.getElementById('boardList'),
    boardMeta: document.getElementById('boardMeta'),
    boardMine: document.getElementById('boardMine')
  };

  // --- SDK 兼容层（平台沙盒内用 Yiqiwan；本地无 SDK 时降级） ---
  var hasSdk = !!window.Yiqiwan;
  var platformMuted = false;
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

  // --- 合成音效 ---
  var audioCtx = null;
  var soundOn = true;

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

  function playTone(freq, dur, type, vol) {
    var ac = ensureAudio();
    if (!ac) return;
    try {
      var osc = ac.createOscillator();
      var gain = ac.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      gain.gain.setValueAtTime(vol || 0.05, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0008, ac.currentTime + dur);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + dur);
    } catch (_) {}
  }

  function sfxShoot(kind) {
    if (kind === 'bottle' || kind === 'molten') playTone(620, 0.045, 'triangle', 0.03);
    else if (kind === 'frost' || kind === 'blizzard') playTone(880, 0.09, 'sine', 0.035);
    else if (kind === 'sun' || kind === 'solar') playTone(440, 0.09, 'sawtooth', 0.025);
    else if (kind === 'rocket' || kind === 'nuke') playTone(260, 0.11, 'square', 0.03);
  }

  function sfxBoom() { playTone(150, 0.14, 'sawtooth', 0.05); }
  function sfxCoin() {
    playTone(987.77, 0.06, 'sine', 0.045);
    setTimeout(function () { playTone(1318.5, 0.09, 'sine', 0.045); }, 45);
  }
  function sfxBuild() { playTone(523.25, 0.08, 'triangle', 0.05); }
  function sfxBite() { playTone(190, 0.2, 'sawtooth', 0.06); }
  function sfxWin() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      setTimeout(function () { playTone(f, 0.16, 'triangle', 0.06); }, i * 80);
    });
  }

  // --- 随机与日期 ---
  /** 北京时间日历日（UTC+8），保证每日挑战全服同日；静态包无服务器日 */
  function todayKey() {
    var ms = Date.now() + 8 * 3600 * 1000;
    var d = new Date(ms);
    return d.getUTCFullYear() + '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(d.getUTCDate()).padStart(2, '0');
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

  // --- 炮塔配置（4种×3级 + 4种满级合成体） ---
  // 合成锚点：相对「两座同系 3 级」单目标理论 DPS ≥ 约 1.05×（连环靠连发）
  var TOWERS = {
    bottle: {
      id: 'bottle', name: '瓶子炮', icon: '🟢', color: '#2ecc71',
      fire: 'shot', maxLevel: 2, fuseTo: 'molten',
      role: '持续单体 · 前期经济输出',
      fit: '适合集火关键怪、清障碍',
      cost: [100, 160, 240],
      dmg: [18, 34, 62],
      rate: [0.46, 0.36, 0.26],
      range: [135, 155, 180]
    },
    frost: {
      id: 'frost', name: '冰冻星', icon: '❄️', color: '#4cc9f0',
      fire: 'aura', maxLevel: 2, fuseTo: 'blizzard',
      role: '群体减速 · 控场',
      fit: '怪多、需要拖时间时优先',
      cost: [120, 180, 260],
      dmg: [11, 20, 34],
      rate: [1.22, 1.08, 0.92],
      range: [118, 136, 156],
      slow: [0.55, 0.48, 0.40],
      slowDur: 2.3
    },
    sun: {
      id: 'sun', name: '太阳花', icon: '☀️', color: '#ff9f1c',
      fire: 'aura', maxLevel: 2, fuseTo: 'solar',
      role: '群体持续伤害',
      fit: '路径拐弯、怪物扎堆处',
      cost: [160, 220, 320],
      dmg: [22, 42, 74],
      rate: [1.02, 0.88, 0.74],
      range: [112, 130, 152]
    },
    rocket: {
      id: 'rocket', name: '火箭炮', icon: '🚀', color: '#ef476f',
      fire: 'shot', maxLevel: 2, fuseTo: 'nuke',
      role: '远程溅射爆发',
      fit: '坦克怪、Boss、集群',
      cost: [200, 260, 380],
      dmg: [48, 86, 155],
      rate: [1.32, 1.12, 0.94],
      range: [195, 222, 255],
      splash: 62
    },
    molten: {
      id: 'molten', name: '熔岩瓶', icon: '🌋', color: '#e85d04',
      fire: 'shot', maxLevel: 0, isFusion: true,
      role: '范围爆炸 + 灼烧',
      fit: '命中后持续掉血，省一座塔位',
      special: '灼烧',
      cost: [0], dmg: [145], rate: [0.28], range: [180], splash: 85,
      burnDps: 28, burnDur: 2.2
    },
    blizzard: {
      id: 'blizzard', name: '暴风雪', icon: '🌨️', color: '#48cae4',
      fire: 'aura', maxLevel: 0, isFusion: true,
      role: '强减速 + 短暂冻结',
      fit: '卡住冲线怪，给输出塔时间',
      special: '冻结',
      cost: [0], dmg: [52], rate: [0.65], range: [158],
      slow: [0.22], slowDur: 2.8,
      freezeDur: 0.65, freezeCd: 3.2
    },
    solar: {
      id: 'solar', name: '烈日塔', icon: '🔆', color: '#f4a261',
      fire: 'aura', maxLevel: 0, isFusion: true,
      role: '群体灼烧叠层',
      fit: '怪越密收益越高',
      special: '叠层灼烧',
      cost: [0], dmg: [125], rate: [0.58], range: [155],
      burnPerHit: 14, burnDur: 2.4, burnStackMax: 4
    },
    nuke: {
      id: 'nuke', name: '连环炮', icon: '💥', color: '#9b2226',
      fire: 'shot', maxLevel: 0, isFusion: true,
      role: '多弹连发 + 大溅射',
      fit: 'Boss 与高血量怪',
      special: '三连发',
      cost: [0], dmg: [120], rate: [0.78], range: [250], splash: 125,
      volley: 3
    }
  };

  var TOWER_ORDER = ['bottle', 'frost', 'sun', 'rocket'];
  var FUSION_ORDER = ['molten', 'blizzard', 'solar', 'nuke'];

  function towerDps(cfg, lv) {
    var rate = cfg.rate[lv];
    if (!rate) return 0;
    var mult = cfg.volley || 1;
    return (cfg.dmg[lv] * mult) / rate;
  }

  function towerStatLine(cfg, lv) {
    var dmg = cfg.dmg[lv];
    var rate = cfg.rate[lv];
    var dps = Math.round(towerDps(cfg, lv));
    var bits = [
      '伤' + dmg,
      '间隔' + rate.toFixed(2) + 's',
      '≈' + dps + '/秒',
      '射程' + cfg.range[lv]
    ];
    if (cfg.volley) bits.push(cfg.volley + '连发');
    if (cfg.splash) bits.push('溅射' + cfg.splash);
    if (cfg.slow) bits.push('减速×' + cfg.slow[Math.min(lv, cfg.slow.length - 1)]);
    if (cfg.burnDps) bits.push('灼烧' + cfg.burnDps + '/秒');
    if (cfg.freezeDur) bits.push('冻结' + cfg.freezeDur + 's');
    if (cfg.burnPerHit) bits.push('叠灼烧');
    return bits.join(' · ');
  }

  function emptyStats() {
    return {
      totalDmg: 0,
      kills: 0,
      fusions: 0,
      leaks: 0,
      controlSec: 0,
      byKind: {}
    };
  }

  function noteShot(kind) {
    if (!state.stats) return;
    if (!state.stats.byKind[kind]) state.stats.byKind[kind] = { dmg: 0, kills: 0, shots: 0 };
    state.stats.byKind[kind].shots += 1;
  }

  function noteDamage(kind, amount, killed) {
    if (!state.stats || !(amount > 0)) return;
    if (!state.stats.byKind[kind]) state.stats.byKind[kind] = { dmg: 0, kills: 0, shots: 0 };
    state.stats.byKind[kind].dmg += amount;
    state.stats.totalDmg += amount;
    if (killed) {
      state.stats.byKind[kind].kills += 1;
      state.stats.kills += 1;
    }
  }

  function renderTowerLegend() {
    if (!els.towerLegend) return;
    var html = '';
    TOWER_ORDER.forEach(function (id) {
      var cfg = TOWERS[id];
      var fuse = cfg.fuseTo ? TOWERS[cfg.fuseTo] : null;
      var twoDps = Math.round(towerDps(cfg, 2) * 2);
      var fuseDps = fuse ? Math.round(towerDps(fuse, 0)) : 0;
      html +=
        '<div class="legend-item"><span>' + cfg.icon + ' ' + cfg.name +
        '（' + cfg.cost[0] + '金）</span><em>' + cfg.role +
        '<br>3级：' + towerStatLine(cfg, 2) +
        '<br>' + cfg.fit +
        (fuse
          ? ('<br>合成' + fuse.icon + fuse.name + '：' + towerStatLine(fuse, 0) +
            '<br>对比两座3级 ≈' + twoDps + '/秒 → 合成 ≈' + fuseDps + '/秒' +
            (fuse.special ? (' · ' + fuse.special) : ''))
          : '') +
        '</em></div>';
    });
    html +=
      '<div class="legend-item"><span>✨ 相邻合成</span>' +
      '<em>同种同级相邻→免费升1级；两座3级→合成体。合成占1格，理论输出≥两座3级约1.05倍，并带专属机制。</em></div>';
    els.towerLegend.innerHTML = html;
  }

  // --- 障碍物类型 ---
  var OBSTACLE_KINDS = [
    { kind: 'bush', emoji: '🌿', hp: 70, reward: 55, color: '#4aa96c' },
    { kind: 'mushroom', emoji: '🍄', hp: 110, reward: 85, color: '#e76f51' },
    { kind: 'tree', emoji: '🌲', hp: 160, reward: 120, color: '#2a7f62' },
    { kind: 'chest', emoji: '🧰', hp: 230, reward: 220, color: '#e9c46a' }
  ];

  // --- 3张主题地图定义（网格拐点坐标，自动展开为格子路径） ---
  var MAPS = [
    {
      id: 'map0',
      name: '青草弯道',
      waves: 10,
      startGold: 420,
      waypoints: [[0, 1], [3, 1], [3, 6], [8, 6], [8, 1], [11, 1]],
      seed: 101
    },
    {
      id: 'map1',
      name: '蘑菇回廊',
      waves: 12,
      startGold: 440,
      waypoints: [[0, 6], [2, 6], [2, 1], [6, 1], [6, 4], [4, 4], [4, 6], [9, 6], [9, 2], [11, 2]],
      seed: 202
    },
    {
      id: 'map2',
      name: '蛇形长廊',
      waves: 15,
      startGold: 460,
      waypoints: [[0, 1], [10, 1], [10, 3], [1, 3], [1, 5], [10, 5], [10, 7], [1, 7]],
      seed: 303
    }
  ];

  // --- 状态 ---
  var mode = 'map0'; // 'map0' | 'map1' | 'map2' | 'endless' | 'daily'
  var autoSubmit = false;
  var progress = {
    medals: {}, // mapId: 'gold' | 'silver' | 'clear'
    best: {},   // boardId: score
    settings: { soundOn: true, autoSubmit: false }
  };

  var state = {};
  var paused = false;
  var userPaused = false;
  var lastTs = 0;
  var pollTimer = 0;
  var dpr = 1;
  var viewScale = 1;

  function expandPath(waypoints) {
    var cells = [];
    var set = {};
    for (var i = 0; i < waypoints.length - 1; i++) {
      var x0 = waypoints[i][0], y0 = waypoints[i][1];
      var x1 = waypoints[i + 1][0], y1 = waypoints[i + 1][1];
      var dx = Math.sign(x1 - x0);
      var dy = Math.sign(y1 - y0);
      var cx = x0, cy = y0;
      while (true) {
        var key = cx + ',' + cy;
        if (!set[key]) {
          set[key] = true;
          cells.push([cx, cy]);
        }
        if (cx === x1 && cy === y1) break;
        cx += dx;
        cy += dy;
      }
    }
    return { cells: cells, set: set };
  }

  function cellCenter(c, r) {
    return { x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 };
  }

  function currentMapDef() {
    if (mode === 'map0') return MAPS[0];
    if (mode === 'map1') return MAPS[1];
    if (mode === 'map2') return MAPS[2];
    if (mode === 'daily') {
      var h = hashString('luobo-daily-map-' + todayKey());
      var base = MAPS[h % MAPS.length];
      return {
        id: 'daily',
        name: '每日挑战 · ' + base.name,
        waves: 15,
        startGold: 480,
        waypoints: base.waypoints,
        seed: h
      };
    }
    // 无尽模式使用青草弯道/蘑菇回廊中路径较长的地图
    return {
      id: 'endless',
      name: '无尽守卫',
      waves: 999,
      startGold: 520,
      waypoints: MAPS[1].waypoints,
      seed: (Date.now() & 0xfffffff)
    };
  }

  function initGame() {
    var def = currentMapDef();
    var pathInfo = expandPath(def.waypoints);
    var rng = mulberry32(def.seed);

    // 生成像素路径点
    var pixelPath = pathInfo.cells.map(function (pt) {
      return cellCenter(pt[0], pt[1]);
    });

    // 生成障碍物（贴近路径且留出 3~4 个初始空位）
    var obstacles = [];
    var freeCount = 0;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (pathInfo.set[c + ',' + r]) continue;
        // 计算到路径的曼哈顿距离
        var nearPath = false;
        for (var k = 0; k < pathInfo.cells.length; k++) {
          var dist = Math.abs(pathInfo.cells[k][0] - c) + Math.abs(pathInfo.cells[k][1] - r);
          if (dist === 1) { nearPath = true; break; }
        }
        // 留一些贴近路径的黄金空位给开局造塔
        if (nearPath && freeCount < 4 && rng() < 0.34) {
          freeCount += 1;
          continue;
        }
        var prob = nearPath ? 0.56 : 0.68;
        if (rng() < prob) {
          var roll = rng();
          var tpl = roll < 0.35 ? OBSTACLE_KINDS[0]
            : (roll < 0.65 ? OBSTACLE_KINDS[1]
            : (roll < 0.88 ? OBSTACLE_KINDS[2] : OBSTACLE_KINDS[3]));
          var pos = cellCenter(c, r);
          obstacles.push({
            id: 'ob_' + c + '_' + r,
            col: c, row: r,
            x: pos.x, y: pos.y,
            kind: tpl.kind,
            emoji: tpl.emoji,
            color: tpl.color,
            hp: tpl.hp,
            maxHp: tpl.hp,
            reward: tpl.reward,
            flash: 0
          });
        }
      }
    }

    state = {
      mapDef: def,
      pathCells: pathInfo.cells,
      pathSet: pathInfo.set,
      pixelPath: pixelPath,
      rng: rng,
      gold: def.startGold,
      hp: 10,
      maxHp: 10,
      carrotShake: 0,
      score: 0,
      wave: 0,
      maxWaves: def.waves,
      inWave: false,
      autoWaveTimer: 4.5,
      spawnQueue: [],
      spawnTimer: 0,
      speedMult: 1,
      towers: [],
      obstacles: obstacles,
      monsters: [],
      projectiles: [],
      rings: [],
      particles: [],
      floats: [],
      selectedCell: null, // { col, row }
      focusObstacle: null,
      focusMonster: null,
      ended: false,
      won: false,
      submitted: false,
      kills: 0,
      stats: emptyStats()
    };

    userPaused = false;
    els.btnPause.textContent = '⏸ 暂停';
    els.btnPause.classList.remove('active');
    els.btnSpeed.textContent = '⏩ 1x';
    els.btnSpeed.classList.remove('active');
    els.endOverlay.classList.add('hidden');
    els.btnSubmit.disabled = true;
    closeTileMenu();
    updateHud();
    els.hint.textContent = '建塔升级；相邻同种同级可免费合成，满级再合变强力塔！';
  }

  // --- 波次生成 ---
  /** 闯关难度档：青草0 / 蘑菇1 / 蛇形2 */
  function mapDifficultyTier() {
    if (mode === 'map1') return 1;
    if (mode === 'map2') return 2;
    return 0;
  }

  function calcBaseHp(waveNum) {
    if (isProgressMode()) {
      var hpE = 48 + waveNum * 28 + Math.pow(waveNum, 2.05) * 4.8;
      if (waveNum >= 10) hpE *= 1 + (waveNum - 9) * 0.065;
      if (waveNum >= 20) hpE *= 1 + (waveNum - 19) * 0.055;
      if (waveNum >= 30) hpE *= 1 + (waveNum - 29) * 0.045;
      return Math.round(hpE);
    }
    // 闯关：整体加厚，三张图递进加压
    var tier = mapDifficultyTier();
    var hp = 40 + waveNum * 22 + Math.pow(waveNum, 1.85) * 6.4;
    hp *= 1 + tier * 0.14;
    if (waveNum >= 5) hp *= 1 + (waveNum - 4) * (0.032 + tier * 0.01);
    if (waveNum >= 9) hp *= 1 + (waveNum - 8) * (0.04 + tier * 0.012);
    return Math.round(hp);
  }

  function buildWaveQueue(waveNum) {
    var q = [];
    var endless = isProgressMode();
    var tier = endless ? 0 : mapDifficultyTier();
    var isBossWave = (waveNum % 5 === 0);
    var countCap = endless ? 22 : (16 + tier * 2);
    var countScale = endless ? 1.55 : (1.35 + tier * 0.08);
    var count = 7 + Math.min(countCap, Math.floor(waveNum * countScale));
    var baseHp = calcBaseHp(waveNum);
    var tankGate = endless
      ? (0.72 - Math.min(0.2, waveNum * 0.008))
      : (0.76 - tier * 0.04 - Math.min(0.08, waveNum * 0.006));

    for (var i = 0; i < count; i++) {
      var r = state.rng();
      var type = 'normal';
      if (waveNum >= 2 && r < (0.28 + tier * 0.03)) type = 'fast';
      else if (waveNum >= 3 && r > tankGate) type = 'tank';

      var hp = baseHp;
      var speed = 64 + Math.min(endless ? 36 : (28 + tier * 3), waveNum * (endless ? 1.55 : (1.35 + tier * 0.1)));
      var reward = endless
        ? (10 + Math.min(12, Math.floor(waveNum * 0.65)))
        : (12 + Math.min(14, Math.floor(waveNum * 0.75)));
      var radius = 14;
      var color = '#ff6b6b';
      var face = '👾';
      var bite = 1;

      if (type === 'fast') {
        hp = Math.round(baseHp * (endless ? 0.72 : (0.68 + tier * 0.02)));
        speed *= 1.42 + tier * 0.04;
        radius = 12;
        color = '#ffd166';
        face = '🦇';
      } else if (type === 'tank') {
        hp = Math.round(baseHp * (endless ? 2.15 : (1.95 + tier * 0.12)));
        speed *= 0.72;
        reward = Math.round(reward * 1.5);
        radius = 17;
        color = '#8338ec';
        face = '🪲';
        if (endless && waveNum >= 18) bite = 2;
        else if (!endless && tier >= 1 && waveNum >= 8) bite = 2;
      }

      q.push({
        type: type, hp: hp, maxHp: hp, speed: speed,
        reward: reward, radius: radius, color: color, face: face,
        dmgToCarrot: bite,
        interval: type === 'fast' ? (0.52 - tier * 0.02) : 0.78
      });
    }

    if (isBossWave) {
      var bossMul = endless
        ? (7.8 + Math.min(4, waveNum * 0.12))
        : (7.0 + tier * 0.55 + waveNum * 0.08);
      var bossHp = Math.round(baseHp * bossMul);
      var bossBite = 2;
      if (endless && waveNum >= 15) bossBite = 3;
      else if (!endless && (tier >= 2 || waveNum >= 10)) bossBite = 3;
      q.push({
        type: 'boss',
        hp: bossHp,
        maxHp: bossHp,
        speed: 44 + Math.min(endless ? 18 : (14 + tier * 2), waveNum * 0.6),
        reward: endless ? (70 + waveNum * 5) : (75 + waveNum * 6),
        radius: 22,
        color: '#d90429',
        face: '👹',
        dmgToCarrot: bossBite,
        interval: 1.2
      });
    }
    return q;
  }

  function startNextWave(earlyBonus) {
    if (state.ended || state.inWave) return;
    if (state.wave >= state.maxWaves) return;

    if (earlyBonus && state.wave > 0 && state.autoWaveTimer > 0.8) {
      var bonus = Math.round(state.autoWaveTimer * 6);
      state.gold += bonus;
      spawnFloat(state.pixelPath[0].x + 28, state.pixelPath[0].y, '提前出怪 +' + bonus + '💰', '#ffd166');
      sfxCoin();
    }

    state.wave += 1;
    state.inWave = true;
    state.spawnQueue = buildWaveQueue(state.wave);
    state.spawnTimer = 0.25;
    updateHud();
    els.hint.textContent = (state.wave % 5 === 0)
      ? ('⚠️ 第 ' + state.wave + ' 波：巨型大魔王来袭！')
      : ('第 ' + state.wave + ' 波怪物进攻中…');
  }

  // --- 伤害与特效 ---
  function spawnBurst(x, y, color, count) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 40 + Math.random() * 110;
      state.particles.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: 2 + Math.random() * 2.5, color: color, life: 0.3 + Math.random() * 0.18
      });
    }
  }

  function spawnFloat(x, y, text, color) {
    state.floats.push({ x: x, y: y, text: text, color: color || '#ffffff', life: 0.85 });
  }

  function isProgressMode() {
    return mode === 'endless' || mode === 'daily';
  }

  function killPoints(type) {
    var base = type === 'boss' ? 55 : (type === 'tank' ? 12 : 7);
    var waveBoost = Math.min(18, Math.floor(state.wave * 0.55));
    return base + waveBoost;
  }

  function obstaclePoints() {
    // 障碍主收益是金币与建塔位；榜分权重压低，避免开局清图刷分
    return isProgressMode() ? 3 : 10;
  }

  function waveClearPoints() {
    // 清波有奖但不随波次线性爆炸
    if (isProgressMode()) return 20 + Math.min(state.wave, 28) * 5;
    return 35 + Math.min(state.wave, 16) * 8;
  }

  function winBonusPoints() {
    // 通关看血量效率，不再把剩余金币折进总分
    return state.hp * 100;
  }

  function leaderScore() {
    if (isProgressMode()) {
      var quality = Math.min(SCORE_WAVE_UNIT - 1, state.score + state.hp * 600);
      return state.wave * SCORE_WAVE_UNIT + quality;
    }
    return state.score;
  }

  function formatLeaderScore(raw) {
    raw = Math.max(0, Math.floor(Number(raw) || 0));
    if (!isProgressMode()) return raw + ' 分';
    var w = Math.floor(raw / SCORE_WAVE_UNIT);
    var q = raw % SCORE_WAVE_UNIT;
    return '波' + w + ' · ' + q;
  }

  function leaderScoreParts(raw) {
    raw = Math.max(0, Math.floor(Number(raw) || 0));
    if (isProgressMode()) {
      return {
        wave: String(Math.floor(raw / SCORE_WAVE_UNIT)),
        score: String(raw % SCORE_WAVE_UNIT)
      };
    }
    return { wave: '', score: String(raw) };
  }

  function applyBurn(m, dps, dur, stacksAdd, stackMax, kind) {
    if (!(dps > 0) || !(dur > 0)) return;
    m.burnKind = kind || m.burnKind || 'molten';
    m.burnStacks = Math.min((stackMax || 1), (m.burnStacks || 0) + (stacksAdd || 1));
    m.burnDps = dps * (m.burnStacks || 1);
    m.burnTimer = Math.max(m.burnTimer || 0, dur);
  }

  function damageMonster(m, dmg, slowFactor, slowDur, meta) {
    if (m.dead) return;
    meta = meta || {};
    var dealt = Math.min(m.hp, dmg);
    m.hp -= dmg;
    m.flash = 0.1;
    if (slowFactor && slowDur) {
      m.slowFactor = Math.min(m.slowFactor || 1, slowFactor);
      m.slowTimer = Math.max(m.slowTimer || 0, slowDur);
    }
    if (meta.freezeDur && meta.freezeDur > 0) {
      m.freezeTimer = Math.max(m.freezeTimer || 0, meta.freezeDur);
    }
    if (meta.burnDps) {
      applyBurn(m, meta.burnDps, meta.burnDur || 2, 1, 1, meta.kind);
    }
    if (meta.burnPerHit) {
      applyBurn(m, meta.burnPerHit, meta.burnDur || 2.4, 1, meta.burnStackMax || 4, meta.kind);
    }
    var killed = m.hp <= 0;
    if (meta.kind) noteDamage(meta.kind, dealt, killed);
    if (killed) {
      m.dead = true;
      state.gold += m.reward;
      state.kills += 1;
      state.score += killPoints(m.type);
      spawnBurst(m.x, m.y, m.color, m.type === 'boss' ? 18 : 8);
      spawnFloat(m.x, m.y - 10, '+' + m.reward + '💰', '#ffd166');
      if (state.focusMonster === m) state.focusMonster = null;
      if (m.type === 'boss') sfxCoin();
    }
  }

  function damageObstacle(ob, dmg) {
    if (ob.hp <= 0) return;
    ob.hp -= dmg;
    ob.flash = 0.1;
    if (ob.hp <= 0) {
      state.gold += ob.reward;
      state.score += obstaclePoints();
      sfxCoin();
      spawnBurst(ob.x, ob.y, ob.color, 12);
      spawnFloat(ob.x, ob.y - 8, '+' + ob.reward + '💰', '#ffd166');
      if (state.focusObstacle === ob) state.focusObstacle = null;
      state.obstacles = state.obstacles.filter(function (o) { return o !== ob; });
    }
  }

  // --- 主循环物理更新 ---
  function step(dt) {
    if (state.ended || userPaused) return;
    var simDt = dt * state.speedMult;

    if (state.carrotShake > 0) state.carrotShake = Math.max(0, state.carrotShake - dt);

    // 粒子、波纹、飘字
    state.particles.forEach(function (p) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    });
    state.particles = state.particles.filter(function (p) { return p.life > 0; });

    state.floats.forEach(function (f) { f.y -= 28 * dt; f.life -= dt; });
    state.floats = state.floats.filter(function (f) { return f.life > 0; });

    state.rings.forEach(function (rg) {
      rg.r += (rg.maxR - rg.r) * Math.min(1, dt * 11);
      rg.life -= dt;
    });
    state.rings = state.rings.filter(function (rg) { return rg.life > 0; });

    state.obstacles.forEach(function (ob) {
      if (ob.flash > 0) ob.flash = Math.max(0, ob.flash - dt);
    });

    // 波次间隔倒计时
    if (!state.inWave) {
      if (state.wave < state.maxWaves) {
        state.autoWaveTimer -= simDt;
        if (state.autoWaveTimer <= 0) {
          startNextWave(false);
        }
      }
    } else {
      // 出怪队列
      if (state.spawnQueue.length > 0) {
        state.spawnTimer -= simDt;
        if (state.spawnTimer <= 0) {
          var next = state.spawnQueue.shift();
          var startPos = state.pixelPath[0];
          state.monsters.push({
            type: next.type,
            hp: next.hp, maxHp: next.maxHp,
            speed: next.speed, reward: next.reward,
            radius: next.radius, color: next.color, face: next.face,
            dmgToCarrot: next.dmgToCarrot,
            x: startPos.x, y: startPos.y,
            segIdx: 0, progress: 0,
            slowTimer: 0, slowFactor: 1,
            flash: 0, dead: false
          });
          state.spawnTimer = next.interval;
        }
      }
    }

    // 怪物移动
    for (var i = state.monsters.length - 1; i >= 0; i--) {
      var m = state.monsters[i];
      if (m.dead) { state.monsters.splice(i, 1); continue; }
      if (m.flash > 0) m.flash = Math.max(0, m.flash - dt);
      if (m.slowTimer > 0) {
        m.slowTimer -= simDt;
        if (m.slowTimer <= 0) m.slowFactor = 1;
      }
      if (m.freezeTimer > 0) {
        m.freezeTimer -= simDt;
        if (state.stats) state.stats.controlSec += simDt;
      }
      if (m.burnTimer > 0 && m.burnDps > 0) {
        var burnHit = m.burnDps * simDt;
        m.burnTimer -= simDt;
        damageMonster(m, burnHit, null, null, { kind: m.burnKind || 'molten' });
        if (m.dead) {
          state.monsters.splice(i, 1);
          continue;
        }
        if (m.burnTimer <= 0) {
          m.burnDps = 0;
          m.burnStacks = 0;
        }
      }
      var move = (m.freezeTimer > 0) ? 0 : (m.speed * m.slowFactor * simDt);
      m.progress += move;

      while (move > 0 && m.segIdx < state.pixelPath.length - 1) {
        var target = state.pixelPath[m.segIdx + 1];
        var dx = target.x - m.x;
        var dy = target.y - m.y;
        var dist = Math.hypot(dx, dy);
        if (dist <= move) {
          m.x = target.x;
          m.y = target.y;
          move -= dist;
          m.segIdx += 1;
        } else {
          m.x += (dx / dist) * move;
          m.y += (dy / dist) * move;
          move = 0;
        }
      }

      // 到达萝卜终点
      if (m.segIdx >= state.pixelPath.length - 1) {
        state.hp = Math.max(0, state.hp - m.dmgToCarrot);
        state.carrotShake = 0.45;
        if (state.stats) state.stats.leaks += 1;
        sfxBite();
        spawnFloat(m.x, m.y - 18, '-' + m.dmgToCarrot + ' ❤️', '#ff595e');
        if (state.focusMonster === m) state.focusMonster = null;
        state.monsters.splice(i, 1);
        if (state.hp <= 0) {
          finishGame(false);
          return;
        }
      }
    }

    // 炮塔索敌与开火
    state.towers.forEach(function (t) {
      var cfg = TOWERS[t.kind];
      if (!cfg) return;
      var lv = Math.min(t.level, (cfg.dmg.length - 1));
      var range = cfg.range[lv];
      if (t.cd > 0) t.cd -= simDt;
      if (t.specialCd > 0) t.specialCd -= simDt;
      if (t.cd > 0) return;

      // 范围光环塔（太阳花 / 冰冻星 / 合成体）
      if (cfg.fire === 'aura') {
        var inRangeMonsters = state.monsters.filter(function (m) {
          return !m.dead && Math.hypot(m.x - t.x, m.y - t.y) <= range + m.radius;
        });
        var inRangeObs = state.obstacles.filter(function (ob) {
          return ob.hp > 0 && Math.hypot(ob.x - t.x, ob.y - t.y) <= range + 20;
        });

        var shouldFire = inRangeMonsters.length > 0 ||
          (state.focusObstacle && inRangeObs.indexOf(state.focusObstacle) !== -1);

        if (shouldFire) {
          var dmg = cfg.dmg[lv];
          var slowF = cfg.slow ? cfg.slow[Math.min(lv, cfg.slow.length - 1)] : null;
          var doFreeze = cfg.freezeDur && (!(t.specialCd > 0));
          if (doFreeze) t.specialCd = cfg.freezeCd || 3;
          noteShot(t.kind);
          inRangeMonsters.forEach(function (m) {
            damageMonster(m, dmg, slowF, cfg.slowDur, {
              kind: t.kind,
              freezeDur: doFreeze ? cfg.freezeDur : 0,
              burnPerHit: cfg.burnPerHit || 0,
              burnDur: cfg.burnDur || 0,
              burnStackMax: cfg.burnStackMax || 0
            });
          });
          inRangeObs.forEach(function (ob) {
            damageObstacle(ob, slowF != null ? Math.round(dmg * 0.6) : dmg);
          });
          state.rings.push({
            x: t.x, y: t.y, r: 14, maxR: range,
            color: cfg.color,
            life: 0.3
          });
          t.cd = cfg.rate[lv];
          sfxShoot(t.kind);
        }
        return;
      }

      // 单体/爆破塔（瓶子炮 / 火箭炮 / 合成体）
      var aimTarget = null;
      var isObs = false;

      if (state.focusObstacle && state.focusObstacle.hp > 0 &&
          Math.hypot(state.focusObstacle.x - t.x, state.focusObstacle.y - t.y) <= range + 20) {
        aimTarget = state.focusObstacle;
        isObs = true;
      } else if (state.focusMonster && !state.focusMonster.dead &&
          Math.hypot(state.focusMonster.x - t.x, state.focusMonster.y - t.y) <= range + state.focusMonster.radius) {
        aimTarget = state.focusMonster;
      } else {
        var best = null;
        for (var j = 0; j < state.monsters.length; j++) {
          var mon = state.monsters[j];
          if (mon.dead) continue;
          if (Math.hypot(mon.x - t.x, mon.y - t.y) <= range + mon.radius) {
            if (!best || mon.progress > best.progress) best = mon;
          }
        }
        aimTarget = best;
      }

      if (aimTarget) {
        t.angle = Math.atan2(aimTarget.y - t.y, aimTarget.x - t.x);
        t.cd = cfg.rate[lv];
        sfxShoot(t.kind);
        noteShot(t.kind);
        var volley = cfg.volley || 1;
        var targets = [aimTarget];
        if (volley > 1 && !isObs) {
          var extras = state.monsters
            .filter(function (m) {
              return m !== aimTarget && !m.dead &&
                Math.hypot(m.x - t.x, m.y - t.y) <= range + m.radius;
            })
            .sort(function (a, b) { return b.progress - a.progress; });
          for (var v = 0; v < volley - 1; v++) {
            targets.push(extras[v] || aimTarget);
          }
        }
        for (var vi = 0; vi < targets.length; vi++) {
          var tgt = targets[vi];
          var ang = Math.atan2(tgt.y - t.y, tgt.x - t.x) + (vi - (targets.length - 1) / 2) * 0.08;
          state.projectiles.push({
            kind: t.kind,
            x: t.x + Math.cos(ang) * 14,
            y: t.y + Math.sin(ang) * 14,
            tx: tgt.x, ty: tgt.y,
            target: tgt,
            isObs: isObs && vi === 0,
            dmg: cfg.dmg[lv],
            splash: cfg.splash || 0,
            speed: cfg.splash ? 370 : 480,
            color: cfg.color,
            burnDps: cfg.burnDps || 0,
            burnDur: cfg.burnDur || 0
          });
        }
      }
    });

    // 子弹飞行与命中
    for (var p = state.projectiles.length - 1; p >= 0; p--) {
      var pr = state.projectiles[p];
      if (pr.target && ((!pr.isObs && !pr.target.dead) || (pr.isObs && pr.target.hp > 0))) {
        pr.tx = pr.target.x;
        pr.ty = pr.target.y;
      }
      var pdx = pr.tx - pr.x;
      var pdy = pr.ty - pr.y;
      var pdist = Math.hypot(pdx, pdy);
      var pstep = pr.speed * simDt;

      if (pdist <= pstep + 8) {
        var hitMeta = {
          kind: pr.kind,
          burnDps: pr.burnDps || 0,
          burnDur: pr.burnDur || 0
        };
        if (pr.splash > 0) {
          sfxBoom();
          state.rings.push({ x: pr.tx, y: pr.ty, r: 10, maxR: pr.splash, color: pr.color || '#ef476f', life: 0.24 });
          state.monsters.forEach(function (m) {
            if (!m.dead && Math.hypot(m.x - pr.tx, m.y - pr.ty) <= pr.splash + m.radius) {
              damageMonster(m, pr.dmg, null, null, hitMeta);
            }
          });
          state.obstacles.forEach(function (ob) {
            if (ob.hp > 0 && Math.hypot(ob.x - pr.tx, ob.y - pr.ty) <= pr.splash + 20) {
              damageObstacle(ob, pr.dmg);
            }
          });
        } else if (pr.target) {
          if (pr.isObs) damageObstacle(pr.target, pr.dmg);
          else damageMonster(pr.target, pr.dmg, null, null, hitMeta);
        }
        state.projectiles.splice(p, 1);
      } else {
        pr.x += (pdx / pdist) * pstep;
        pr.y += (pdy / pdist) * pstep;
      }
    }

    // 清理死亡怪物
    state.monsters = state.monsters.filter(function (m) { return !m.dead; });

    // 检查波次是否结束
    if (state.inWave && state.spawnQueue.length === 0 && state.monsters.length === 0) {
      state.inWave = false;
      state.score += waveClearPoints();
      if (state.wave >= state.maxWaves) {
        finishGame(true);
        return;
      }
      state.autoWaveTimer = 5.0;
      els.hint.textContent = '第 ' + state.wave + ' 波已清空！可点「▶ 出怪」提前开战赚金币';
    }

    updateHud();
  }

  function finishGame(won) {
    state.ended = true;
    state.won = won;
    closeTileMenu();

    // 结算额外加分（不折算剩余金币，减少囤金刷分）
    if (won) {
      state.score += winBonusPoints();
      sfxWin();
    }

    var boardScore = leaderScore();

    // 记录奖杯与最高分（无尽/每日存编码榜分）
    var bid = currentBoardId();
    if (!progress.best[bid] || boardScore > progress.best[bid]) {
      progress.best[bid] = boardScore;
    }
    if (won && (mode === 'map0' || mode === 'map1' || mode === 'map2')) {
      var medal = state.hp >= state.maxHp ? 'gold' : (state.hp >= 6 ? 'silver' : 'clear');
      var prev = progress.medals[mode];
      var rank = { clear: 1, silver: 2, gold: 3 };
      if (!prev || rank[medal] > rank[prev]) {
        progress.medals[mode] = medal;
      }
    }
    persistProgress();

    // 弹窗展示
    if (won) {
      els.endKicker.textContent = state.mapDef.name + ' · 通关';
      els.endTitle.textContent = state.hp >= state.maxHp ? '🏆 金萝卜达成！' : '🥕 守卫成功！';
    } else {
      els.endKicker.textContent = state.mapDef.name + ' · 结束';
      els.endTitle.textContent = '😭 萝卜被啃光啦';
    }

    els.endSummary.textContent =
      '守住波次：' + state.wave + (state.maxWaves < 900 ? ' / ' + state.maxWaves : '') +
      ' · 消灭怪物：' + state.kills +
      ' · 萝卜剩余：' + state.hp + '/' + state.maxHp +
      ' · 榜分：' + formatLeaderScore(boardScore);

    if (els.endStats) {
      var st = state.stats || emptyStats();
      var rows = Object.keys(st.byKind).map(function (k) {
        return { k: k, dmg: st.byKind[k].dmg || 0, kills: st.byKind[k].kills || 0 };
      }).sort(function (a, b) { return b.dmg - a.dmg; });
      var html = '<strong>本局战斗统计</strong>';
      html += '<div class="stat-row"><span>总伤害</span><span>' + Math.round(st.totalDmg) + '</span></div>';
      html += '<div class="stat-row"><span>击杀 / 漏怪 / 合成</span><span>' +
        state.kills + ' / ' + st.leaks + ' / ' + st.fusions + '</span></div>';
      if (st.controlSec > 0) {
        html += '<div class="stat-row"><span>冻结控制</span><span>' + st.controlSec.toFixed(1) + ' 秒</span></div>';
      }
      rows.slice(0, 6).forEach(function (row) {
        var cfg = TOWERS[row.k];
        var name = cfg ? (cfg.icon + ' ' + cfg.name) : row.k;
        var pct = st.totalDmg > 0 ? ((row.dmg / st.totalDmg) * 100).toFixed(1) : '0.0';
        html += '<div class="stat-row"><span>' + name + '</span><span>' +
          Math.round(row.dmg) + '（' + pct + '%）</span></div>';
      });
      els.endStats.innerHTML = html;
    }

    // 关卡模式通关时显示下一关按钮
    var hasNextMap = won && (mode === 'map0' || mode === 'map1');
    els.btnEndNext.classList.toggle('hidden', !hasNextMap);
    els.btnSubmit.disabled = false;
    els.btnEndSubmit.disabled = false;
    els.endOverlay.classList.remove('hidden');

    updateHud();
    refreshBoard();
    if (autoSubmit) submitScore({ auto: true });
  }

  // --- 绘制 ---
  function drawRoundRect(x, y, w, h, r) {
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

  function draw() {
    var dark = document.documentElement.dataset.theme === 'dark';

    // 草地棋盘背景
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var even = (r + c) % 2 === 0;
        if (dark) {
          ctx.fillStyle = even ? '#1c2d23' : '#18271e';
        } else {
          ctx.fillStyle = even ? '#b7e4a8' : '#a8db99';
        }
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
      }
    }

    // 泥土道路
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    state.pixelPath.forEach(function (pt, idx) {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.strokeStyle = dark ? '#3a3026' : '#e6cc9c';
    ctx.lineWidth = CELL * 0.78;
    ctx.stroke();

    ctx.strokeStyle = dark ? '#4d4033' : '#f2deb6';
    ctx.lineWidth = CELL * 0.62;
    ctx.stroke();

    // 路径中心虚线方向
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.1)' : 'rgba(170,130,75,0.28)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 10]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // 选中格子高亮 & 炮塔射程圈
    if (state.selectedCell) {
      var sc = state.selectedCell;
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      drawRoundRect(sc.col * CELL + 3, sc.row * CELL + 3, CELL - 6, CELL - 6, 8);
      ctx.stroke();

      var selTower = getTowerAt(sc.col, sc.row);
      if (selTower) {
        var rngR = TOWERS[selTower.kind].range[selTower.level];
        ctx.beginPath();
        ctx.arc(selTower.x, selTower.y, rngR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([6, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    // 出怪口传送门
    var startPt = state.pixelPath[0];
    ctx.save();
    ctx.beginPath();
    ctx.arc(startPt.x, startPt.y, 19, 0, Math.PI * 2);
    ctx.fillStyle = '#5a189a';
    ctx.fill();
    ctx.strokeStyle = '#c77dff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🌀', startPt.x, startPt.y + 1);
    ctx.restore();

    // 终点大萝卜
    var endPt = state.pixelPath[state.pixelPath.length - 1];
    var wiggle = Math.sin(performance.now() * 0.005) * 2;
    var shakeX = state.carrotShake > 0 ? Math.sin(performance.now() * 0.06) * 5 : 0;
    ctx.save();
    ctx.translate(endPt.x + shakeX, endPt.y + wiggle);
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fillStyle = state.carrotShake > 0 ? 'rgba(239, 71, 111, 0.45)' : 'rgba(255, 255, 255, 0.25)';
    ctx.fill();
    ctx.font = '30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🥕', 0, 1);
    // 萝卜血量小牌
    drawRoundRect(-16, 13, 32, 14, 6);
    ctx.fillStyle = state.hp <= 3 ? '#e63946' : '#2b9348';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 10px sans-serif';
    ctx.fillText('♥' + state.hp, 0, 20.5);
    ctx.restore();

    // 障碍物
    state.obstacles.forEach(function (ob) {
      ctx.save();
      if (ob.flash > 0) ctx.globalAlpha = 0.7;
      // 底座阴影
      ctx.beginPath();
      ctx.ellipse(ob.x, ob.y + 14, 17, 7, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
      ctx.fill();

      ctx.font = '26px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ob.emoji, ob.x, ob.y);

      // 受伤后显示血条
      if (ob.hp < ob.maxHp) {
        var bw = 34;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(ob.x - bw / 2, ob.y - 22, bw, 5);
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(ob.x - bw / 2, ob.y - 22, bw * Math.max(0, ob.hp / ob.maxHp), 5);
      }

      // 集火准星
      if (state.focusObstacle === ob) {
        drawReticle(ob.x, ob.y, 20);
      }
      ctx.restore();
    });

    // 炮塔
    state.towers.forEach(function (t) {
      var cfg = TOWERS[t.kind];
      if (!cfg) return;
      ctx.save();
      ctx.translate(t.x, t.y);
      // 底座
      drawRoundRect(-21, -21, 42, 42, 11);
      ctx.fillStyle = dark ? '#24352c' : '#f4f8ec';
      ctx.fill();
      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = cfg.isFusion ? 3.2 : 2.5;
      ctx.stroke();

      // 旋转炮管（射击型）
      if (cfg.fire === 'shot') {
        ctx.save();
        ctx.rotate(t.angle || 0);
        ctx.fillStyle = cfg.color;
        drawRoundRect(0, -5, 18 + t.level * 2, 10, 4);
        ctx.fill();
        ctx.restore();
      }

      // 中心图标
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cfg.icon, 0, 1);

      // 等级星标 / 合成标记
      ctx.fillStyle = '#ffd166';
      ctx.font = '700 10px sans-serif';
      var stars = cfg.isFusion ? '合' : '★'.repeat(t.level + 1);
      ctx.fillText(stars, 0, 16);
      ctx.restore();
    });

    // 范围波纹（太阳花/冰冻星/火箭溅射）
    state.rings.forEach(function (rg) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, rg.life * 2.5);
      ctx.beginPath();
      ctx.arc(rg.x, rg.y, rg.r, 0, Math.PI * 2);
      ctx.strokeStyle = rg.color;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    });

    // 怪物
    state.monsters.forEach(function (m) {
      ctx.save();
      var bob = Math.sin(performance.now() * 0.012 + m.progress * 0.1) * 2.5;
      // 阴影
      ctx.beginPath();
      ctx.ellipse(m.x, m.y + m.radius - 2, m.radius * 0.8, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fill();

      // 本体
      ctx.beginPath();
      ctx.arc(m.x, m.y + bob, m.radius, 0, Math.PI * 2);
      ctx.fillStyle = m.flash > 0
        ? '#ffffff'
        : (m.freezeTimer > 0
          ? '#a0e7ff'
          : (m.burnTimer > 0
            ? '#ff7b54'
            : (m.slowTimer > 0 ? '#64dfdf' : m.color)));
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = (m.type === 'boss' ? '22px' : '15px') + ' sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.face, m.x, m.y + bob + 1);

      // 血条
      var bw = m.radius * 2.1;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(m.x - bw / 2, m.y - m.radius - 9, bw, 5);
      ctx.fillStyle = m.type === 'boss' ? '#ff4d6d' : '#52e5a8';
      ctx.fillRect(m.x - bw / 2, m.y - m.radius - 9, bw * Math.max(0, m.hp / m.maxHp), 5);

      if (state.focusMonster === m) {
        drawReticle(m.x, m.y + bob, m.radius + 6);
      }
      ctx.restore();
    });

    // 子弹
    state.projectiles.forEach(function (pr) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.kind === 'rocket' ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = pr.color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    });

    // 粒子
    state.particles.forEach(function (p) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life * 2.5);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 飘字
    state.floats.forEach(function (f) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.life / 0.85);
      ctx.fillStyle = f.color;
      ctx.font = '700 13px "Avenir Next", "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    });
  }

  function drawReticle(x, y, r) {
    var pulse = r + Math.sin(performance.now() * 0.012) * 3;
    ctx.save();
    ctx.strokeStyle = '#ff4d6d';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(x, y, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function loop(ts) {
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.04, (ts - lastTs) / 1000);
    lastTs = ts;
    if (!paused) {
      step(dt);
      draw();
    }
    requestAnimationFrame(loop);
  }

  // --- 格子交互与悬浮菜单 ---
  function getTowerAt(col, row) {
    for (var i = 0; i < state.towers.length; i++) {
      if (state.towers[i].col === col && state.towers[i].row === row) return state.towers[i];
    }
    return null;
  }

  /** 相邻同种同级可合成（基础塔）；合成体不可再合 */
  function findAdjacentMergePartner(tower) {
    var cfg = TOWERS[tower.kind];
    if (!cfg || cfg.isFusion) return null;
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < dirs.length; i++) {
      var other = getTowerAt(tower.col + dirs[i][0], tower.row + dirs[i][1]);
      if (!other) continue;
      if (other.kind === tower.kind && other.level === tower.level) return other;
    }
    return null;
  }

  function mergeTowers(keep, partner) {
    var cfg = TOWERS[keep.kind];
    if (!cfg || cfg.isFusion) return false;
    var invested = (keep.invested || 0) + (partner.invested || 0);
    state.towers = state.towers.filter(function (x) { return x !== partner; });

    if (keep.level < cfg.maxLevel) {
      keep.level += 1;
      keep.invested = invested;
      spawnBurst(keep.x, keep.y, '#ffd166', 14);
      spawnFloat(keep.x, keep.y, '合成 → Lv.' + (keep.level + 1), '#ffd166');
      sfxBuild();
      return true;
    }

    if (cfg.fuseTo && TOWERS[cfg.fuseTo]) {
      var fused = TOWERS[cfg.fuseTo];
      keep.kind = fused.id;
      keep.level = 0;
      keep.invested = invested;
      keep.cd = 0;
      keep.specialCd = 0;
      if (state.stats) state.stats.fusions += 1;
      spawnBurst(keep.x, keep.y, fused.color, 18);
      spawnFloat(keep.x, keep.y, '合成 ' + fused.name + '！', fused.color);
      sfxWin();
      return true;
    }
    return false;
  }

  function getObstacleAt(col, row) {
    for (var i = 0; i < state.obstacles.length; i++) {
      if (state.obstacles[i].col === col && state.obstacles[i].row === row) return state.obstacles[i];
    }
    return null;
  }

  function closeTileMenu() {
    state.selectedCell = null;
    els.tileMenu.classList.add('hidden');
    els.tileMenu.innerHTML = '';
  }

  function openTileMenu(col, row, tower) {
    state.selectedCell = { col: col, row: row };
    els.tileMenu.innerHTML = '';

    if (!tower) {
      // 建造菜单
      TOWER_ORDER.forEach(function (kind) {
        var cfg = TOWERS[kind];
        var cost = cfg.cost[0];
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tm-btn';
        btn.disabled = state.gold < cost;
        btn.innerHTML =
          '<span class="tm-ico">' + cfg.icon + '</span>' +
          '<span class="tm-name">' + cfg.name + '</span>' +
          '<span class="tm-cost">' + cost + '</span>';
        btn.addEventListener('click', function () {
          if (state.gold < cost) return;
          state.gold -= cost;
          var pos = cellCenter(col, row);
          state.towers.push({
            col: col, row: row, x: pos.x, y: pos.y,
            kind: kind, level: 0, cd: 0, angle: 0, invested: cost
          });
          sfxBuild();
          spawnBurst(pos.x, pos.y, cfg.color, 8);
          closeTileMenu();
          updateHud();
        });
        els.tileMenu.appendChild(btn);
      });
    } else {
      // 升级 / 合成 / 拆除
      var cfg = TOWERS[tower.kind];
      var isFusion = !!cfg.isFusion;
      var maxLv = cfg.maxLevel != null ? cfg.maxLevel : 2;
      var isMax = isFusion || tower.level >= maxLv;
      var upCost = isMax ? 0 : cfg.cost[tower.level + 1];
      var partner = findAdjacentMergePartner(tower);
      var lvNow = isFusion ? 0 : tower.level;
      var dpsNow = Math.round(towerDps(cfg, lvNow));

      var info = document.createElement('p');
      info.className = 'tm-info';
      var infoBits = cfg.name + (isFusion ? '（合成体）' : (' Lv.' + (tower.level + 1)));
      infoBits += '\n' + towerStatLine(cfg, lvNow);
      if (cfg.role) infoBits += '\n' + cfg.role;
      if (!isFusion && !isMax) {
        var nextLv = tower.level + 1;
        var dpsNext = Math.round(towerDps(cfg, nextLv));
        infoBits += '\n升级→伤' + cfg.dmg[nextLv] + ' · ≈' + dpsNext + '/秒（+' +
          (dpsNext - dpsNow) + '）· 花费 ' + upCost + '金';
      }
      if (isFusion && cfg.special) infoBits += '\n专属：' + cfg.special;
      info.textContent = infoBits;
      els.tileMenu.appendChild(info);

      if (!isFusion) {
        var upBtn = document.createElement('button');
        upBtn.type = 'button';
        upBtn.className = 'tm-btn';
        upBtn.disabled = isMax || state.gold < upCost;
        upBtn.innerHTML =
          '<span class="tm-ico">⬆️</span>' +
          '<span class="tm-name">' + (isMax ? '已满级' : '升 Lv.' + (tower.level + 2)) + '</span>' +
          '<span class="tm-cost">' + (isMax ? 'MAX' : upCost) + '</span>';
        upBtn.addEventListener('click', function () {
          if (isMax || state.gold < upCost) return;
          state.gold -= upCost;
          tower.level += 1;
          tower.invested += upCost;
          sfxBuild();
          spawnBurst(tower.x, tower.y, '#ffd166', 10);
          closeTileMenu();
          updateHud();
        });
        els.tileMenu.appendChild(upBtn);
      }

      if (partner) {
        var fuseCfg = isMax && cfg.fuseTo ? TOWERS[cfg.fuseTo] : null;
        if (fuseCfg) {
          var prevDps = Math.round(towerDps(cfg, 2) * 2);
          var nextDps = Math.round(towerDps(fuseCfg, 0));
          var preview = document.createElement('p');
          preview.className = 'tm-preview';
          preview.textContent =
            '合成预览：2座→1座 · 投入不变 · 占格 2→1\n' +
            '单目标 ≈' + prevDps + '/秒 → ≈' + nextDps + '/秒' +
            (fuseCfg.special ? (' · ' + fuseCfg.special) : '');
          els.tileMenu.appendChild(preview);
        }
        var mergeBtn = document.createElement('button');
        mergeBtn.type = 'button';
        mergeBtn.className = 'tm-btn';
        mergeBtn.innerHTML =
          '<span class="tm-ico">✨</span>' +
          '<span class="tm-name">' +
            (fuseCfg
              ? ('合成 ' + fuseCfg.name)
              : ('合成升 Lv.' + (tower.level + 2))) +
          '</span>' +
          '<span class="tm-cost">免费</span>';
        mergeBtn.addEventListener('click', function () {
          var p = findAdjacentMergePartner(tower);
          if (!p) return;
          var toName = fuseCfg ? fuseCfg.name : null;
          mergeTowers(tower, p);
          closeTileMenu();
          updateHud();
          els.hint.textContent = toName
            ? ('相邻满级塔合成了「' + toName + '」！')
            : '相邻同级塔已合成升级';
        });
        els.tileMenu.appendChild(mergeBtn);
      }

      var refund = Math.round(tower.invested * 0.8);
      var sellBtn = document.createElement('button');
      sellBtn.type = 'button';
      sellBtn.className = 'tm-btn sell';
      sellBtn.innerHTML =
        '<span class="tm-ico">💰</span>' +
        '<span class="tm-name">拆除·退80%</span>' +
        '<span class="tm-cost">+' + refund + '</span>';
      sellBtn.addEventListener('click', function () {
        state.gold += refund;
        sfxCoin();
        spawnFloat(tower.x, tower.y, '+' + refund + '💰', '#8ff0b8');
        state.towers = state.towers.filter(function (x) { return x !== tower; });
        closeTileMenu();
        updateHud();
      });
      els.tileMenu.appendChild(sellBtn);
    }

    els.tileMenu.classList.remove('hidden');

    // 定位到格子上方或下方，并确保不出界
    var wrapRect = canvasWrap.getBoundingClientRect();
    var cRect = canvas.getBoundingClientRect();
    var offsetX = cRect.left - wrapRect.left;
    var offsetY = cRect.top - wrapRect.top;
    var cellPxX = offsetX + (col + 0.5) * CELL * viewScale;
    var cellPxY = offsetY + row * CELL * viewScale;

    var menuW = els.tileMenu.offsetWidth;
    var menuH = els.tileMenu.offsetHeight;
    var left = Math.max(6, Math.min(wrapRect.width - menuW - 6, cellPxX - menuW / 2));
    var top = cellPxY - menuH - 8;
    if (top < 6) top = offsetY + (row + 1) * CELL * viewScale + 8;
    top = Math.min(wrapRect.height - menuH - 6, top);

    els.tileMenu.style.left = left + 'px';
    els.tileMenu.style.top = top + 'px';
  }

  canvas.addEventListener('pointerdown', function (ev) {
    if (ev.button || state.ended) return;
    ensureAudio();
    var rect = canvas.getBoundingClientRect();
    var lx = (ev.clientX - rect.left) / viewScale;
    var ly = (ev.clientY - rect.top) / viewScale;

    // 先检查是否点中怪物（集火怪物）
    for (var i = 0; i < state.monsters.length; i++) {
      var m = state.monsters[i];
      if (Math.hypot(lx - m.x, ly - m.y) <= m.radius + 8) {
        state.focusMonster = (state.focusMonster === m) ? null : m;
        state.focusObstacle = null;
        closeTileMenu();
        els.hint.textContent = state.focusMonster ? '已锁定怪物集火！' : '已取消集火';
        return;
      }
    }

    var col = Math.floor(lx / CELL);
    var row = Math.floor(ly / CELL);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) {
      closeTileMenu();
      return;
    }

    // 点中障碍物：切换集火清理
    var ob = getObstacleAt(col, row);
    if (ob) {
      state.focusObstacle = (state.focusObstacle === ob) ? null : ob;
      state.focusMonster = null;
      closeTileMenu();
      els.hint.textContent = state.focusObstacle
        ? ('已标记 ' + ob.emoji + ' 优先清理（奖励 ' + ob.reward + ' 金币）')
        : '已取消清理标记';
      return;
    }

    // 点中道路：关闭菜单
    if (state.pathSet[col + ',' + row]) {
      closeTileMenu();
      return;
    }

    // 点中已有炮塔或空草地
    if (state.selectedCell && state.selectedCell.col === col && state.selectedCell.row === row) {
      closeTileMenu();
    } else {
      openTileMenu(col, row, getTowerAt(col, row));
    }
  });

  // --- 画布自适应 ---
  function layoutCanvas() {
    var rect = canvasWrap.getBoundingClientRect();
    var scale = Math.min(rect.width / W, rect.height / H);
    scale = Math.max(0.35, scale);
    viewScale = scale;
    var cssW = Math.floor(W * scale);
    var cssH = Math.floor(H * scale);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    closeTileMenu();
  }

  // --- HUD 与排行榜 ---
  function updateHud() {
    els.meterGold.textContent = '💰 ' + state.gold;
    els.meterWave.textContent = state.maxWaves < 900
      ? ('波次 ' + state.wave + ' / ' + state.maxWaves)
      : ('无尽第 ' + state.wave + ' 波');
    els.meterHp.textContent = '🥕 ' + state.hp;
    els.meterScore.textContent = '得分 ' + state.score;
    els.modeSub.textContent = state.mapDef.name + (state.maxWaves < 900 ? (' · ' + state.maxWaves + ' 波守卫') : ' · 无限波次');

    if (els.modeDesc) {
      if (mode === 'map0') {
        els.modeDesc.textContent = '新手推荐 · 10波 · 熟悉造塔/升级/合成 · 本图长期榜';
      } else if (mode === 'map1') {
        els.modeDesc.textContent = '进阶 · 12波 · 路线更绕、怪更厚 · 本图长期榜';
      } else if (mode === 'map2') {
        els.modeDesc.textContent = '高难 · 15波 · 最长路径 · 通关三图徽章齐全 · 本图长期榜';
      } else if (mode === 'endless') {
        els.modeDesc.textContent = '无限波次 · 长期排行榜 · 先比波次再比质量分';
      } else {
        els.modeDesc.textContent =
          '北京时间 ' + todayKey() + ' · 全服同图同种子 · 15波 · 仅今日榜（零点换榜）';
      }
    }

    els.btnNextWave.disabled = state.ended || state.inWave || state.wave >= state.maxWaves;
    els.btnNextWave.textContent = (!state.inWave && state.wave < state.maxWaves && !state.ended)
      ? ('▶ 出怪 (' + Math.ceil(Math.max(0, state.autoWaveTimer)) + 's)')
      : '▶ 进攻中';

    els.btnMap0.classList.toggle('active', mode === 'map0');
    els.btnMap1.classList.toggle('active', mode === 'map1');
    els.btnMap2.classList.toggle('active', mode === 'map2');
    els.btnEndless.classList.toggle('active', mode === 'endless');
    els.btnDaily.classList.toggle('active', mode === 'daily');

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

    var m0 = progress.medals.map0 === 'gold' ? '🏆' : (progress.medals.map0 ? '✅' : '—');
    var m1 = progress.medals.map1 === 'gold' ? '🏆' : (progress.medals.map1 ? '✅' : '—');
    var m2 = progress.medals.map2 === 'gold' ? '🏆' : (progress.medals.map2 ? '✅' : '—');
    els.mapRecord.textContent = '通关徽章：1关 ' + m0 + ' · 2关 ' + m1 + ' · 3关 ' + m2;
  }

  function currentBoardId() {
    if (mode === 'endless') return BOARD_ID_ENDLESS;
    if (mode === 'daily') return BOARD_ID_DAILY + todayKey();
    return BOARD_ID_MAP + mode;
  }

  /** 当前模式要查询的全部榜（主榜 + 历史误改榜），用于读榜合并 */
  function boardIdsForRead() {
    var primary = currentBoardId();
    var ids = [primary];
    if (mode === 'endless') {
      BOARD_LEGACY_ENDLESS.forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
    } else if (mode === 'daily') {
      var day = todayKey();
      BOARD_LEGACY_DAILY.forEach(function (prefix) {
        var id = prefix + day;
        if (ids.indexOf(id) < 0) ids.push(id);
      });
    } else {
      BOARD_LEGACY_MAP.forEach(function (prefix) {
        var id = prefix + mode;
        if (ids.indexOf(id) < 0) ids.push(id);
      });
    }
    return ids;
  }

  function mergeBoardItems(lists) {
    var best = {};
    lists.forEach(function (items) {
      (items || []).forEach(function (row) {
        var key = row.isMe ? '__me__' : ('n:' + (row.displayName || ''));
        var prev = best[key];
        if (!prev || Number(row.score) > Number(prev.score)) {
          best[key] = {
            displayName: row.displayName,
            score: row.score,
            isMe: !!row.isMe
          };
        }
      });
    });
    var merged = Object.keys(best).map(function (k) { return best[k]; });
    merged.sort(function (a, b) {
      return Number(b.score) - Number(a.score);
    });
    return merged.map(function (row, i) {
      return {
        rank: i + 1,
        displayName: row.displayName,
        score: row.score,
        isMe: row.isMe
      };
    });
  }

  async function persistProgress() {
    progress.settings = { soundOn: soundOn, autoSubmit: autoSubmit };
    try { await sdk.storage.set(SAVE_KEY, progress); } catch (_) {}
  }

  async function loadProgress() {
    try {
      var saved = await sdk.storage.get(SAVE_KEY);
      if (!saved || typeof saved !== 'object') return;
      progress.medals = saved.medals || {};
      progress.best = saved.best || {};
      if (saved.settings) {
        soundOn = saved.settings.soundOn !== false;
        autoSubmit = !!saved.settings.autoSubmit;
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
    var progressBoard = isProgressMode();
    els.boardList.classList.toggle('with-wave', progressBoard);

    if (!items || !items.length) {
      var empty = document.createElement('li');
      empty.className = 'board-empty';
      empty.textContent = '暂无成绩';
      els.boardList.appendChild(empty);
      els.boardMine.textContent = mineLabel || '';
      return;
    }

    items.forEach(function (row) {
      var parts = leaderScoreParts(row.score);
      var li = document.createElement('li');
      if (row.isMe) li.className = 'me';
      li.innerHTML =
        '<span class="br-rank">#' + row.rank + '</span>' +
        '<span class="br-name" title="' + escapeHtml(row.displayName || '社友') + '">' +
          escapeHtml(row.displayName || '社友') +
        '</span>' +
        (progressBoard
          ? ('<span class="br-wave">波' + parts.wave + '</span>')
          : '') +
        '<span class="br-score">' + parts.score + '</span>';
      els.boardList.appendChild(li);
    });
    els.boardMine.textContent = mineLabel || '';
  }

  async function refreshBoard() {
    var bid = currentBoardId();
    if (els.boardTitle) {
      if (mode === 'daily') els.boardTitle.textContent = '当前榜：每日挑战';
      else if (isProgressMode()) els.boardTitle.textContent = '当前榜：无尽生存';
      else els.boardTitle.textContent = '当前榜：' + state.mapDef.name;
    }
    if (mode === 'daily') {
      els.boardMeta.textContent = '每日挑战 · ' + todayKey() + '（北京时间）· 仅今日 · 先比波次';
    } else if (isProgressMode()) {
      els.boardMeta.textContent = '长期榜 · 先比波次再比质量分 · 不随版本清空';
    } else {
      els.boardMeta.textContent = '闯关长期榜 · 不按天刷新 · 不随版本清空';
    }
    try {
      var me = await sdk.scores.me();
      if (!me.loggedIn) els.boardMeta.textContent += '（游客可看榜）';
      var ids = boardIdsForRead();
      var lists = [];
      for (var i = 0; i < ids.length; i++) {
        try {
          var list = await sdk.scores.list({ boardId: ids[i], verified: false, limit: 15 });
          lists.push(list.items || []);
        } catch (_) {
          lists.push([]);
        }
      }
      var items = mergeBoardItems(lists);
      if (items.length) {
        var self = items.filter(function (x) { return x.isMe; })[0];
        var mine = self ? ('我的名次 #' + self.rank + ' · ' + formatLeaderScore(self.score)) : '';
        renderBoard(items, mine);
      } else {
        var lb = progress.best[bid] || 0;
        if (!lb && mode === 'endless') lb = progress.best['luobo-endless-v3'] || 0;
        if (!lb && mode === 'daily') lb = progress.best['luobo-daily-v3-' + todayKey()] || 0;
        if (!lb && mode.indexOf('map') === 0) lb = progress.best['luobo-map-v3-' + mode] || 0;
        renderBoard(lb ? [{ rank: 1, displayName: '我（本地）', score: lb, isMe: true }] : [], lb ? '本地最佳' : '');
      }
    } catch (_) {
      var lb2 = progress.best[bid] || 0;
      renderBoard(lb2 ? [{ rank: 1, displayName: '我（本地）', score: lb2, isMe: true }] : [], lb2 ? '本地预览最佳' : '结算后显示');
      els.boardMeta.textContent = '本地预览榜（上线后为社区公开榜）';
    }
  }

  async function submitScore(options) {
    options = options || {};
    if (!state.ended || state.submitted) return;
    els.btnSubmit.disabled = true;
    els.btnEndSubmit.disabled = true;
    try {
      var me = await sdk.scores.me();
      if (!me.loggedIn) {
        els.hint.textContent = options.auto ? '自动提交跳过：未登录' : '请先登录再提交公开榜';
        els.btnSubmit.disabled = false;
        els.btnEndSubmit.disabled = false;
        return;
      }
      var score = leaderScore();
      // 只写入稳定主榜；读榜时再合并历史榜，避免再改号丢成绩
      await sdk.scores.submit({ boardId: currentBoardId(), score: score });
      state.submitted = true;
      els.hint.textContent = options.auto ? '已自动提交成绩' : '成绩已提交！';
      await refreshBoard();
    } catch (_) {
      await refreshBoard();
      els.hint.textContent = '公开提交暂不可用，已记录本地最佳';
    }
  }

  // --- 按钮绑定 ---
  function switchMode(next) {
    if (mode === next) return;
    mode = next;
    initGame();
    refreshBoard();
  }

  els.btnMap0.addEventListener('click', function () { switchMode('map0'); });
  els.btnMap1.addEventListener('click', function () { switchMode('map1'); });
  els.btnMap2.addEventListener('click', function () { switchMode('map2'); });
  els.btnEndless.addEventListener('click', function () { switchMode('endless'); });
  els.btnDaily.addEventListener('click', function () { switchMode('daily'); });

  els.btnNextWave.addEventListener('click', function () { startNextWave(true); });

  els.btnSpeed.addEventListener('click', function () {
    state.speedMult = state.speedMult === 1 ? 2 : 1;
    els.btnSpeed.textContent = state.speedMult === 2 ? '⏩ 2x' : '⏩ 1x';
    els.btnSpeed.classList.toggle('active', state.speedMult === 2);
  });

  els.btnPause.addEventListener('click', function () {
    userPaused = !userPaused;
    els.btnPause.textContent = userPaused ? '▶ 继续' : '⏸ 暂停';
    els.btnPause.classList.toggle('active', userPaused);
  });

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

  els.btnRestart.addEventListener('click', initGame);
  els.btnEndRestart.addEventListener('click', initGame);
  els.btnEndNext.addEventListener('click', function () {
    if (mode === 'map0') switchMode('map1');
    else if (mode === 'map1') switchMode('map2');
  });

  els.btnSubmit.addEventListener('click', function () { submitScore(); });
  els.btnEndSubmit.addEventListener('click', function () { submitScore(); });
  els.btnRefreshBoard.addEventListener('click', refreshBoard);

  els.btnAutoSubmit.addEventListener('click', function () {
    autoSubmit = !autoSubmit;
    persistProgress();
    updateHud();
  });

  els.btnTutorial.addEventListener('click', function () {
    sdk.ui.showTutorial().catch(function () {
      els.hint.textContent = '点空地造炮塔，点树木/宝箱集火清理赚金币，守住大萝卜！';
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
    sdk.on('pause', function () {
      paused = true;
      stopAudioNow();
    });
    sdk.on('resume', function () {
      // 恢复可见时不自动发声，等用户再次点击
      paused = false;
      lastTs = 0;
    });
    if (sdk.ui && sdk.ui.onViewportChange) {
      sdk.ui.onViewportChange(layoutCanvas);
    } else {
      window.addEventListener('resize', layoutCanvas);
    }

    await loadProgress();
    if (platformMuted) soundOn = false;
    renderTowerLegend();
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
