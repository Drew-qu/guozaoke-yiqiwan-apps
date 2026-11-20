(async function () {
  'use strict';

  var BOARD_ID_CAMPAIGN = 'path-progress-v3-';
  var BOARD_ID_DAILY = 'path-dailypack-v3-';
  var POLL_MS = 20000;
  var SAVE_KEY = 'progress.v5';
  var AUTO_NEXT_DELAY = 800;
  var DAILY_PACK = 3;
  var SCORE_PROGRESS = 1000000000;
  var GEOM_EPS = 0.75;
  var PENTATONIC = [0, 2, 4, 7, 9];
  var RULES = {
    free: { id: 'free', label: '折线', hint: '自由连线，不交叉；可有墙与起终点' },
    euler: { id: 'euler', label: '描边', hint: '沿灰色轨道走完每条边，点可重复' },
    grid: { id: 'grid', label: '填格', hint: '只能上下左右相邻，一笔填满空格' }
  };
  var DIFFICULTY = {
    easy: { id: 'easy', label: '简单', hitMin: 16, hitRatio: 0.038, dailyMin: 6, dailySpan: 3, minSep: 90 },
    normal: { id: 'normal', label: '一般', hitMin: 13, hitRatio: 0.03, dailyMin: 9, dailySpan: 5, minSep: 58 },
    hard: { id: 'hard', label: '困难', hitMin: 11, hitRatio: 0.024, dailyMin: 13, dailySpan: 7, minSep: 36 }
  };

  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  var els = {
    levelName: document.getElementById('levelName'),
    meterCover: document.getElementById('meterCover'),
    meterStars: document.getElementById('meterStars'),
    meterUndo: document.getElementById('meterUndo'),
    meterTime: document.getElementById('meterTime'),
    meterDiff: document.getElementById('meterDiff'),
    hint: document.getElementById('hint'),
    levelIndex: document.getElementById('levelIndex'),
    levelPoolHint: document.getElementById('levelPoolHint'),
    boardList: document.getElementById('boardList'),
    boardMeta: document.getElementById('boardMeta'),
    boardMine: document.getElementById('boardMine'),
    winBanner: document.getElementById('winBanner'),
    winStars: document.getElementById('winStars'),
    winDetail: document.getElementById('winDetail'),
    btnRuleFree: document.getElementById('btnRuleFree'),
    btnRuleEuler: document.getElementById('btnRuleEuler'),
    btnRuleGrid: document.getElementById('btnRuleGrid'),
    btnCampaign: document.getElementById('btnCampaign'),
    btnDaily: document.getElementById('btnDaily'),
    btnDiffEasy: document.getElementById('btnDiffEasy'),
    btnDiffNormal: document.getElementById('btnDiffNormal'),
    btnDiffHard: document.getElementById('btnDiffHard'),
    btnAutoNext: document.getElementById('btnAutoNext'),
    btnAutoSubmit: document.getElementById('btnAutoSubmit'),
    btnPrev: document.getElementById('btnPrev'),
    btnNext: document.getElementById('btnNext'),
    btnUndo: document.getElementById('btnUndo'),
    btnClear: document.getElementById('btnClear'),
    btnSubmit: document.getElementById('btnSubmit'),
    btnTutorial: document.getElementById('btnTutorial'),
    btnRefreshBoard: document.getElementById('btnRefreshBoard'),
    btnWinNext: document.getElementById('btnWinNext')
  };

  var allLevels = [];
  var levels = [];
  var mode = 'campaign';
  var rulePack = 'free';
  var difficulty = 'normal';
  var autoNext = false;
  var autoSubmit = false;
  var dailySeq = 0;
  var autoTimer = 0;
  var levelIndex = 0;
  var points = [];
  var path = [];
  var usedEdges = {};
  var hover = null;
  var dragging = false;
  var rejectFlash = 0;
  var undos = 0;
  var startedAt = 0;
  var elapsedMs = 0;
  var running = false;
  var paused = false;
  var won = false;
  var levelMeta = emptyMeta();
  var lastStars = 0;
  var revealT = 0;
  var revealTimer = 0;
  var audioCtx = null;
  var theme = {
    stroke: '#d4573c',
    strokeGlow: 'rgba(212,87,60,0.35)',
    strokeDim: 'rgba(31,143,134,0.45)',
    point: '#24353a',
    done: '#2f9e78',
    accent: '#1f8f86',
    danger: '#c23b3b',
    dark: false
  };
  var progress = {
    unlocked: blankUnlock(),
    best: {},
    dailyBest: {},
    campaignStats: blankStats(),
    dailyPack: null,
    settings: { rulePack: 'free', difficulty: 'normal', autoNext: false, autoSubmit: false }
  };
  var pollTimer = 0;
  var clockTimer = 0;
  var dpr = 1;
  var cssSize = 0;

  function emptyMeta() {
    return {
      id: '', name: '', title: '', rule: 'free', start: null, end: null, par: 0,
      outline: null, edges: [], _raw: [], _walls: [], _wallsPx: [],
      cols: 0, rows: 0, blocked: [], cells: [], startCell: null, cellKey: {}
    };
  }

  function blankUnlock() {
    return {
      free: { easy: 0, normal: 0, hard: 0 },
      euler: { easy: 0, normal: 0, hard: 0 },
      grid: { easy: 0, normal: 0, hard: 0 }
    };
  }

  function blankStats() {
    function one() { return { totalMs: 0, totalUndos: 0, clears: 0 }; }
    return {
      free: { easy: one(), normal: one(), hard: one() },
      euler: { easy: one(), normal: one(), hard: one() },
      grid: { easy: one(), normal: one(), hard: one() }
    };
  }

  function ruleCfg() { return RULES[rulePack] || RULES.free; }
  function diffCfg() { return DIFFICULTY[difficulty] || DIFFICULTY.normal; }

  function unlockedForDiff() {
    return (((progress.unlocked[rulePack] || {})[difficulty]) || 0);
  }

  function setUnlocked(value) {
    if (!progress.unlocked[rulePack]) progress.unlocked[rulePack] = { easy: 0, normal: 0, hard: 0 };
    progress.unlocked[rulePack][difficulty] = value;
  }

  function campaignStats() {
    if (!progress.campaignStats[rulePack]) progress.campaignStats[rulePack] = blankStats()[rulePack];
    if (!progress.campaignStats[rulePack][difficulty]) {
      progress.campaignStats[rulePack][difficulty] = { totalMs: 0, totalUndos: 0, clears: 0 };
    }
    return progress.campaignStats[rulePack][difficulty];
  }

  function cancelAutoNext() {
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = 0; }
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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

  function edgeKey(a, b) {
    return a < b ? a + '-' + b : b + '-' + a;
  }

  function filterLevelsForDifficulty() {
    levels = allLevels.filter(function (lvl) {
      if ((lvl.rule || 'free') !== rulePack) return false;
      return (lvl.diff || 'normal') === difficulty;
    });
    if (!levels.length) {
      levels = allLevels.filter(function (lvl) { return (lvl.rule || 'free') === rulePack; });
    }
  }

  function dist2d(a, b) {
    var dx = a[0] - b[0];
    var dy = a[1] - b[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  function estimatePar(pts) {
    if (!pts || pts.length < 2) return 0;
    var used = {};
    var order = [0];
    used[0] = true;
    var i, j, best, bestD, cur, d;
    while (order.length < pts.length) {
      cur = order[order.length - 1];
      best = -1; bestD = 1e9;
      for (j = 0; j < pts.length; j++) {
        if (used[j]) continue;
        d = dist2d(pts[cur], pts[j]);
        if (d < bestD) { bestD = d; best = j; }
      }
      if (best < 0) break;
      used[best] = true;
      order.push(best);
    }
    var len = 0;
    for (i = 0; i < order.length - 1; i++) len += dist2d(pts[order[i]], pts[order[i + 1]]);
    return Math.round(len * 100) / 100;
  }

  function scatterPoints(rand, count, minSep) {
    var pts = [];
    var i, x, y, ok, j, dx, dy, tries;
    for (i = 0; i < count; i++) {
      for (tries = 0; tries < 60; tries++) {
        x = 12 + rand() * 76;
        y = 12 + rand() * 76;
        ok = true;
        for (j = 0; j < pts.length; j++) {
          dx = pts[j][0] - x; dy = pts[j][1] - y;
          if (dx * dx + dy * dy < minSep) { ok = false; break; }
        }
        if (ok) {
          pts.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
          break;
        }
      }
    }
    return pts;
  }

  function makeProcWalls(rand, pts, count) {
    var walls = [];
    var tries, a, b, mid, ang, len, ax, ay, bx, by, ok, i, j, t, px, py, dx, dy, near;
    for (tries = 0; tries < count * 18 && walls.length < count; tries++) {
      a = pts[Math.floor(rand() * pts.length)];
      b = pts[Math.floor(rand() * pts.length)];
      if (a === b) continue;
      mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
      len = 6 + rand() * 10;
      ax = mid[0] + Math.cos(ang) * len;
      ay = mid[1] + Math.sin(ang) * len;
      bx = mid[0] - Math.cos(ang) * len;
      by = mid[1] - Math.sin(ang) * len;
      if (ax < 8 || ax > 92 || ay < 8 || ay > 92 || bx < 8 || bx > 92 || by < 8 || by > 92) continue;
      ok = true;
      for (i = 0; i < pts.length; i++) {
        px = pts[i][0]; py = pts[i][1];
        dx = bx - ax; dy = by - ay;
        if (dx * dx + dy * dy < 1) { ok = false; break; }
        t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
        if (t < 0) t = 0; if (t > 1) t = 1;
        near = (px - (ax + t * dx)) * (px - (ax + t * dx)) + (py - (ay + t * dy)) * (py - (ay + t * dy));
        if (near < 36) { ok = false; break; }
      }
      if (!ok) continue;
      for (j = 0; j < walls.length; j++) {
        if (properIntersect(
          { x: ax, y: ay }, { x: bx, y: by },
          { x: walls[j][0][0], y: walls[j][0][1] },
          { x: walls[j][1][0], y: walls[j][1][1] }
        )) { ok = false; break; }
      }
      if (!ok) continue;
      walls.push([
        [Math.round(ax * 10) / 10, Math.round(ay * 10) / 10],
        [Math.round(bx * 10) / 10, Math.round(by * 10) / 10]
      ]);
    }
    return walls;
  }

  function makeDailyFree(dateStr, seq) {
    var cfg = diffCfg();
    var seed = 'daily-free-' + dateStr + '-' + difficulty + '-' + seq;
    var rand = mulberry32(hashString(seed));
    var pts = scatterPoints(rand, cfg.dailyMin + Math.floor(rand() * cfg.dailySpan), cfg.minSep);
    var lvl = { id: seed, name: '每日折线 ' + (seq + 1), rule: 'free', points: pts, motif: '散点', diff: difficulty };
    lvl.par = estimatePar(pts);
    if (pts.length >= 5) {
      lvl.start = 0;
      lvl.end = pts.length - 1;
      lvl.walls = makeProcWalls(rand, pts, difficulty === 'hard' ? 2 : 1);
    }
    return lvl;
  }

  function makeDailyEuler(dateStr, seq) {
    var seed = 'daily-euler-' + dateStr + '-' + difficulty + '-' + seq;
    var rand = mulberry32(hashString(seed));
    var n = difficulty === 'easy' ? 5 : (difficulty === 'hard' ? 8 : 6);
    var pts = [];
    var i, a;
    for (i = 0; i < n; i++) {
      a = (Math.PI * 2 * i) / n - Math.PI / 2;
      pts.push([
        Math.round((50 + Math.cos(a) * 32) * 10) / 10,
        Math.round((50 + Math.sin(a) * 32) * 10) / 10
      ]);
    }
    pts.push([50, 50]);
    var edges = [];
    for (i = 0; i < n; i++) {
      edges.push([i, (i + 1) % n]);
      edges.push([i, n]);
    }
    if (rand() > 0.4) edges.push([0, Math.floor(n / 2)]);
    return {
      id: seed, name: '每日描边 ' + (seq + 1), rule: 'euler', points: pts, edges: edges,
      motif: '日轨', par: edges.length, diff: difficulty, start: 0
    };
  }

  function makeDailyGrid(dateStr, seq) {
    var seed = 'daily-grid-' + dateStr + '-' + difficulty + '-' + seq;
    var rand = mulberry32(hashString(seed));
    var cols = difficulty === 'easy' ? 4 : (difficulty === 'hard' ? 6 : 5);
    var rows = cols;
    var blocked = [];
    var holes = difficulty === 'easy' ? 2 : (difficulty === 'hard' ? 8 : 5);
    var r, c, k, seen = {};
    for (k = 0; k < holes; k++) {
      r = Math.floor(rand() * rows);
      c = Math.floor(rand() * cols);
      if ((r === 0 && c === 0) || seen[r + ',' + c]) continue;
      seen[r + ',' + c] = true;
      blocked.push([r, c]);
    }
    var cells = [];
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        if (!seen[r + ',' + c]) cells.push([r, c]);
      }
    }
    return {
      id: seed, name: '每日填格 ' + (seq + 1), rule: 'grid', cols: cols, rows: rows,
      blocked: blocked, cells: cells, startCell: [0, 0], motif: '日格',
      par: Math.max(0, cells.length - 1), diff: difficulty
    };
  }

  function makeDailyLevel(dateStr, seq) {
    if (rulePack === 'euler') return makeDailyEuler(dateStr, seq);
    if (rulePack === 'grid') return makeDailyGrid(dateStr, seq);
    return makeDailyFree(dateStr, seq);
  }

  function makeEndlessLevel(index) {
    var seq = index - levels.length;
    return makeDailyLevel('endless-' + rulePack + '-' + difficulty, seq);
  }

  function campaignLevelAt(index) {
    if (index < levels.length) return levels[index];
    return makeEndlessLevel(index);
  }

  function formatTime(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }

  function encodeScore(ms, undoCount) {
    return Math.max(0, 200 - undoCount) * 1000000 + Math.max(0, 999999 - Math.min(ms, 999999));
  }

  function decodeScore(score) {
    var rest = score % SCORE_PROGRESS;
    return {
      progress: Math.floor(score / SCORE_PROGRESS),
      undos: 200 - Math.floor(rest / 1000000),
      ms: 999999 - (rest % 1000000)
    };
  }

  function encodeLeaderScore(progressPart, ms, undoCount) {
    return Math.max(0, progressPart) * SCORE_PROGRESS + encodeScore(ms, undoCount);
  }

  function currentBoardId() {
    if (mode === 'daily') return BOARD_ID_DAILY + todayKey() + '-' + rulePack + '-' + difficulty;
    return BOARD_ID_CAMPAIGN + rulePack + '-' + difficulty;
  }

  function ensureDailyPack() {
    var key = todayKey() + ':' + rulePack + ':' + difficulty;
    if (!progress.dailyPack || progress.dailyPack.key !== key) {
      progress.dailyPack = { key: key, cleared: {}, totalMs: 0, totalUndos: 0 };
    }
    return progress.dailyPack;
  }

  function dailyClearedCount(pack) {
    return Object.keys(pack.cleared || {}).length;
  }

  function refreshThemeCache() {
    var ink = getComputedStyle(document.documentElement);
    theme.stroke = ink.getPropertyValue('--stroke').trim() || theme.stroke;
    theme.strokeGlow = ink.getPropertyValue('--stroke-glow').trim() || theme.strokeGlow;
    theme.strokeDim = ink.getPropertyValue('--stroke-dim').trim() || theme.strokeDim;
    theme.point = ink.getPropertyValue('--point').trim() || theme.point;
    theme.done = ink.getPropertyValue('--point-done').trim() || theme.done;
    theme.accent = ink.getPropertyValue('--accent').trim() || theme.accent;
    theme.danger = ink.getPropertyValue('--danger').trim() || theme.danger;
    theme.dark = document.documentElement.dataset.theme === 'dark';
  }

  function hitRadius() {
    var cfg = diffCfg();
    return Math.max(cfg.hitMin, cssSize * cfg.hitRatio);
  }

  function cross(ax, ay, bx, by) { return ax * by - ay * bx; }
  function nearlyZero(v) { return Math.abs(v) <= GEOM_EPS * Math.max(1, cssSize) * 0.002; }

  function pointOnSegment(p, a, b) {
    var abx = b.x - a.x, aby = b.y - a.y;
    var apx = p.x - a.x, apy = p.y - a.y;
    if (!nearlyZero(cross(abx, aby, apx, apy))) return false;
    var dot = apx * abx + apy * aby;
    if (dot < -GEOM_EPS) return false;
    var len2 = abx * abx + aby * aby;
    if (dot > len2 + GEOM_EPS) return false;
    var t = len2 === 0 ? 0 : dot / len2;
    return t > 0.02 && t < 0.98;
  }

  function projectOverlap(a, b, c, d) {
    var abx = b.x - a.x, aby = b.y - a.y;
    if (Math.abs(abx) >= Math.abs(aby)) {
      return Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) > GEOM_EPS;
    }
    return Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) > GEOM_EPS;
  }

  function properIntersect(a, b, c, d) {
    var abx = b.x - a.x, aby = b.y - a.y;
    var acx = c.x - a.x, acy = c.y - a.y;
    var adx = d.x - a.x, ady = d.y - a.y;
    var cdx = d.x - c.x, cdy = d.y - c.y;
    var cax = a.x - c.x, cay = a.y - c.y;
    var cbx = b.x - c.x, cby = b.y - c.y;
    var d1 = cross(abx, aby, acx, acy);
    var d2 = cross(abx, aby, adx, ady);
    var d3 = cross(cdx, cdy, cax, cay);
    var d4 = cross(cdx, cdy, cbx, cby);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    if (nearlyZero(d1) && nearlyZero(d2) && nearlyZero(d3) && nearlyZero(d4)) {
      return projectOverlap(a, b, c, d);
    }
    return false;
  }

  function edgePassesThroughPoint(fromIdx, toIdx) {
    var a = points[fromIdx];
    var b = points[toIdx];
    var i;
    for (i = 0; i < points.length; i++) {
      if (i === fromIdx || i === toIdx) continue;
      if (pointOnSegment(points[i], a, b)) return true;
    }
    return false;
  }

  function edgeCrossesPath(fromIdx, toIdx) {
    var a = points[fromIdx];
    var b = points[toIdx];
    var i, c, d;
    for (i = 0; i < path.length - 1; i++) {
      c = points[path[i]];
      d = points[path[i + 1]];
      if (properIntersect(a, b, c, d)) return true;
    }
    return false;
  }

  function edgeCrossesWalls(fromIdx, toIdx) {
    var walls = levelMeta._wallsPx || [];
    var a = points[fromIdx];
    var b = points[toIdx];
    var i;
    for (i = 0; i < walls.length; i++) {
      if (properIntersect(a, b, walls[i].a, walls[i].b)) return true;
    }
    return false;
  }

  function respectsEndpoints(toIdx, nextLen) {
    if (levelMeta.rule !== 'free') return true;
    if (levelMeta.end != null) {
      if (toIdx === levelMeta.end && nextLen < points.length) return false;
      if (nextLen === points.length && toIdx !== levelMeta.end) return false;
    }
    return true;
  }

  function isGridAdjacent(a, b) {
    var ca = levelMeta.cells[a];
    var cb = levelMeta.cells[b];
    if (!ca || !cb) return false;
    return Math.abs(ca[0] - cb[0]) + Math.abs(ca[1] - cb[1]) === 1;
  }

  function hasEulerEdge(a, b) {
    return !!(levelMeta.edgeSet && levelMeta.edgeSet[edgeKey(a, b)]);
  }

  function canConnect(fromIdx, toIdx) {
    if (fromIdx === toIdx) return false;
    var rule = levelMeta.rule;
    if (rule === 'euler') {
      return hasEulerEdge(fromIdx, toIdx) && !usedEdges[edgeKey(fromIdx, toIdx)];
    }
    if (rule === 'grid') {
      if (pathHasPoint(toIdx)) return false;
      return isGridAdjacent(fromIdx, toIdx);
    }
    if (pathHasPoint(toIdx)) return false;
    if (edgePassesThroughPoint(fromIdx, toIdx)) return false;
    if (edgeCrossesPath(fromIdx, toIdx)) return false;
    if (edgeCrossesWalls(fromIdx, toIdx)) return false;
    if (!respectsEndpoints(toIdx, path.length + 1)) return false;
    return true;
  }

  function pathHasPoint(idx) { return path.indexOf(idx) !== -1; }

  function coverTotal() {
    if (levelMeta.rule === 'euler') return (levelMeta.edges || []).length;
    return points.length;
  }

  function coverNow() {
    if (levelMeta.rule === 'euler') return Object.keys(usedEdges).length;
    return path.length;
  }

  function isComplete() {
    if (levelMeta.rule === 'euler') return coverNow() >= coverTotal() && coverTotal() > 0;
    return path.length === points.length && points.length > 0;
  }

  function hasAnyMove() {
    if (!path.length) return true;
    if (isComplete()) return true;
    var last = path[path.length - 1];
    var i;
    for (i = 0; i < points.length; i++) {
      if (canConnect(last, i)) return true;
    }
    return false;
  }

  function markDeadEndUi(dead) {
    if (els.btnUndo) els.btnUndo.classList.toggle('nudge', !!dead);
  }

  function nearestPoint(x, y) {
    var r = hitRadius();
    var best = -1;
    var bestDist = r * r;
    var i, p, dx, dy, d2;
    for (i = 0; i < points.length; i++) {
      p = points[i];
      dx = p.x - x; dy = p.y - y;
      d2 = dx * dx + dy * dy;
      if (d2 <= bestDist) { bestDist = d2; best = i; }
    }
    return best;
  }

  function currentElapsed() {
    if (!running || paused || !startedAt) return elapsedMs;
    return elapsedMs + (Date.now() - startedAt);
  }

  function ensureClock() {
    clearInterval(clockTimer);
    clockTimer = setInterval(function () {
      if (!won) els.meterTime.textContent = formatTime(currentElapsed());
      if (rejectFlash > 0) {
        rejectFlash -= 1;
        if (!rejectFlash) draw();
      }
    }, 200);
  }

  function syncSettingsUi() {
    if (els.btnRuleFree) els.btnRuleFree.classList.toggle('active', rulePack === 'free');
    if (els.btnRuleEuler) els.btnRuleEuler.classList.toggle('active', rulePack === 'euler');
    if (els.btnRuleGrid) els.btnRuleGrid.classList.toggle('active', rulePack === 'grid');
    els.btnDiffEasy.classList.toggle('active', difficulty === 'easy');
    els.btnDiffNormal.classList.toggle('active', difficulty === 'normal');
    els.btnDiffHard.classList.toggle('active', difficulty === 'hard');
    els.btnAutoNext.classList.toggle('active', autoNext);
    els.btnAutoNext.setAttribute('aria-pressed', autoNext ? 'true' : 'false');
    els.btnAutoSubmit.classList.toggle('active', autoSubmit);
    els.btnAutoSubmit.setAttribute('aria-pressed', autoSubmit ? 'true' : 'false');
    els.btnCampaign.classList.toggle('active', mode === 'campaign');
    els.btnDaily.classList.toggle('active', mode === 'daily');
    if (els.levelPoolHint) {
      els.levelPoolHint.textContent = ruleCfg().hint + ' · 每日 3 题 · 三玩法分榜';
    }
  }

  function updateHud() {
    els.levelName.textContent = levelMeta.name || '—';
    if (levelMeta.rule === 'euler') {
      els.meterCover.textContent = '边 ' + coverNow() + '/' + coverTotal();
    } else {
      els.meterCover.textContent = path.length + '/' + points.length;
    }
    if (els.meterStars) {
      els.meterStars.textContent = won ? starsGlyph(lastStars) : '☆☆☆';
    }
    els.meterUndo.textContent = '撤销 ' + undos;
    els.meterTime.textContent = formatTime(currentElapsed());
    els.meterDiff.textContent = ruleCfg().label + '·' + diffCfg().label;
    if (mode === 'campaign') {
      els.levelIndex.textContent = levelIndex < levels.length
        ? ((levelIndex + 1) + ' / ' + levels.length)
        : ('无尽 #' + (levelIndex - levels.length + 1));
      els.btnPrev.disabled = levelIndex <= 0;
      els.btnNext.disabled = levelIndex >= unlockedForDiff() && !(won && levelIndex === unlockedForDiff());
    } else {
      els.levelIndex.textContent = (dailySeq + 1) + ' / ' + DAILY_PACK;
      els.btnPrev.disabled = dailySeq <= 0;
      els.btnNext.disabled = dailySeq >= DAILY_PACK - 1;
    }
    syncSettingsUi();
  }

  function normToPx(n) {
    var pad = cssSize * 0.07;
    return pad + (n / 100) * (cssSize - pad * 2);
  }

  function gridToNorm(r, c, rows, cols) {
    var x = cols <= 1 ? 50 : (12 + (c / (cols - 1)) * 76);
    var y = rows <= 1 ? 50 : (12 + (r / (rows - 1)) * 76);
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  }

  function stopReveal() {
    if (revealTimer) { clearInterval(revealTimer); revealTimer = 0; }
    revealT = 0;
  }

  function startReveal() {
    stopReveal();
    revealT = 0.08;
    revealTimer = setInterval(function () {
      revealT = Math.min(1, revealT + 0.07);
      draw();
      if (revealT >= 1) { clearInterval(revealTimer); revealTimer = 0; }
    }, 32);
  }

  function resetBoardState() {
    cancelAutoNext();
    stopReveal();
    path = [];
    usedEdges = {};
    hover = null;
    rejectFlash = 0;
    undos = 0;
    won = false;
    lastStars = 0;
    running = false;
    startedAt = 0;
    elapsedMs = 0;
    els.winBanner.classList.add('hidden');
    els.btnSubmit.disabled = true;
  }

  function adoptLevel(lvl, nameOverride) {
    var rule = lvl.rule || 'free';
    var title = lvl.motif || lvl.name || '';
    var meta = emptyMeta();
    meta.id = lvl.id;
    meta.name = nameOverride || lvl.name;
    meta.title = title;
    meta.rule = rule;
    meta.par = Number(lvl.par) || 0;
    meta.outline = Array.isArray(lvl.outline) ? lvl.outline.slice() : null;
    meta._walls = Array.isArray(lvl.walls) ? lvl.walls : [];
    meta.start = (lvl.start == null ? null : Number(lvl.start));
    meta.end = (lvl.end == null ? null : Number(lvl.end));

    if (rule === 'grid') {
      meta.cols = lvl.cols || 4;
      meta.rows = lvl.rows || 4;
      meta.blocked = lvl.blocked || [];
      meta.cells = (lvl.cells && lvl.cells.length)
        ? lvl.cells.slice()
        : (function () {
            var out = [];
            var blocked = {};
            (lvl.blocked || []).forEach(function (b) { blocked[b[0] + ',' + b[1]] = true; });
            var r, c;
            for (r = 0; r < meta.rows; r++) {
              for (c = 0; c < meta.cols; c++) {
                if (!blocked[r + ',' + c]) out.push([r, c]);
              }
            }
            return out;
          })();
      meta._raw = meta.cells.map(function (cell) {
        return gridToNorm(cell[0], cell[1], meta.rows, meta.cols);
      });
      meta.cellKey = {};
      meta.cells.forEach(function (cell, i) { meta.cellKey[cell[0] + ',' + cell[1]] = i; });
      if (lvl.startCell) {
        meta.start = meta.cellKey[lvl.startCell[0] + ',' + lvl.startCell[1]];
        if (meta.start == null) meta.start = 0;
      } else {
        meta.start = 0;
      }
      meta.end = null;
      if (!meta.par) meta.par = Math.max(0, meta._raw.length - 1);
    } else {
      meta._raw = lvl.points || [];
      if (rule === 'euler') {
        meta.edges = (lvl.edges || []).map(function (e) { return [e[0], e[1]]; });
        meta.edgeSet = {};
        meta.edges.forEach(function (e) { meta.edgeSet[edgeKey(e[0], e[1])] = true; });
        if (!meta.par) meta.par = meta.edges.length;
      } else if (!meta.par) {
        meta.par = estimatePar(meta._raw);
      }
    }

    levelMeta = meta;
    lastStars = 0;
  }

  function rescalePoints() {
    var src = levelMeta._raw || [];
    points = src.map(function (p) {
      return { x: normToPx(p[0]), y: normToPx(p[1]) };
    });
    levelMeta._wallsPx = (levelMeta._walls || []).map(function (w) {
      return {
        a: { x: normToPx(w[0][0]), y: normToPx(w[0][1]) },
        b: { x: normToPx(w[1][0]), y: normToPx(w[1][1]) }
      };
    });
  }

  function remapPoints() {
    rescalePoints();
    resetBoardState();
    markDeadEndUi(false);
    updateHud();
    draw();
  }

  function layout(resetLevel) {
    var parent = canvas.parentElement;
    var rect = parent ? parent.getBoundingClientRect() : canvas.getBoundingClientRect();
    var next = Math.max(160, Math.floor(Math.min(rect.width - 16, rect.height - 36)));
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cssSize = next;
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    canvas.style.width = cssSize + 'px';
    canvas.style.height = cssSize + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (resetLevel) remapPoints();
    else { rescalePoints(); draw(); }
  }

  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(function () {});
    return audioCtx;
  }

  function playTone(semitone, dur, type, peak) {
    var ac = ensureAudio();
    if (!ac) return;
    var now = ac.currentTime;
    var osc = ac.createOscillator();
    var gain = ac.createGain();
    osc.type = type || 'triangle';
    osc.frequency.value = 246.94 * Math.pow(2, semitone / 12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak || 0.07, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (dur || 0.16));
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(now);
    osc.stop(now + (dur || 0.16) + 0.03);
  }

  function playConnectNote(step) {
    var deg = PENTATONIC[step % PENTATONIC.length];
    var oct = Math.floor(step / PENTATONIC.length) % 2;
    playTone(deg + oct * 12, 0.15, 'triangle', 0.065);
  }

  function playRejectSound() { playTone(-10, 0.2, 'sine', 0.05); }
  function playWinChime() {
    playTone(0, 0.12, 'triangle', 0.06);
    setTimeout(function () { playTone(4, 0.12, 'triangle', 0.06); }, 70);
    setTimeout(function () { playTone(7, 0.18, 'triangle', 0.07); }, 140);
  }

  function starsGlyph(n) {
    n = Math.max(0, Math.min(3, n | 0));
    return '★'.repeat(n) + '☆'.repeat(3 - n);
  }

  function pathLengthNorm() {
    var raw = levelMeta._raw || [];
    var len = 0, i, a, b;
    for (i = 0; i < path.length - 1; i++) {
      a = raw[path[i]]; b = raw[path[i + 1]];
      if (!a || !b) continue;
      len += dist2d(a, b);
    }
    return Math.round(len * 10) / 10;
  }

  function rateStars() {
    if (levelMeta.rule === 'euler') {
      if (undos === 0) return 3;
      if (undos <= 2) return 2;
      return 1;
    }
    if (levelMeta.rule === 'grid') {
      if (undos === 0) return 3;
      if (undos <= 3) return 2;
      return 1;
    }
    var len = pathLengthNorm();
    var par = Number(levelMeta.par) || 0;
    if (!(par > 0)) return 3;
    if (len <= par * 1.03) return 3;
    if (len <= par * 1.2) return 2;
    return 1;
  }

  function drawAtmosphere() {
    var g = ctx.createLinearGradient(0, 0, 0, cssSize);
    var dark = theme.dark;
    if (dark) {
      g.addColorStop(0, '#1a2a30'); g.addColorStop(0.45, '#152328'); g.addColorStop(1, '#10191d');
    } else {
      g.addColorStop(0, '#eaf4f1'); g.addColorStop(0.42, '#f4efe4'); g.addColorStop(1, '#d7ebe6');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssSize, cssSize);
    var sun = ctx.createRadialGradient(cssSize * 0.18, cssSize * 0.1, 0, cssSize * 0.18, cssSize * 0.1, cssSize * 0.42);
    sun.addColorStop(0, dark ? 'rgba(255,210,140,0.18)' : 'rgba(255,236,180,0.55)');
    sun.addColorStop(1, 'rgba(255,236,180,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, cssSize, cssSize);
  }

  function drawWalls() {
    var walls = levelMeta._wallsPx || [];
    var i, w;
    if (!walls.length) return;
    ctx.save();
    for (i = 0; i < walls.length; i++) {
      w = walls[i];
      ctx.beginPath();
      ctx.moveTo(w.a.x, w.a.y);
      ctx.lineTo(w.b.x, w.b.y);
      ctx.strokeStyle = 'rgba(194,59,59,0.55)';
      ctx.lineWidth = Math.max(7, cssSize * 0.018);
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w.a.x, w.a.y);
      ctx.lineTo(w.b.x, w.b.y);
      ctx.strokeStyle = theme.danger;
      ctx.lineWidth = Math.max(3, cssSize * 0.008);
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawEulerTracks() {
    var edges = levelMeta.edges || [];
    var i, a, b, key;
    ctx.save();
    for (i = 0; i < edges.length; i++) {
      a = points[edges[i][0]];
      b = points[edges[i][1]];
      if (!a || !b) continue;
      key = edgeKey(edges[i][0], edges[i][1]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      if (usedEdges[key]) {
        ctx.strokeStyle = theme.stroke;
        ctx.lineWidth = Math.max(4, cssSize * 0.012);
        ctx.globalAlpha = 0.95;
      } else {
        ctx.strokeStyle = theme.dark ? 'rgba(200,220,230,0.28)' : 'rgba(40,60,70,0.22)';
        ctx.lineWidth = Math.max(3, cssSize * 0.01);
        ctx.globalAlpha = 1;
      }
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGridBlocks() {
    if (levelMeta.rule !== 'grid') return;
    var blocked = levelMeta.blocked || [];
    var cols = levelMeta.cols;
    var rows = levelMeta.rows;
    var i, cell, p, r;
    r = Math.max(10, cssSize * 0.03);
    ctx.save();
    for (i = 0; i < blocked.length; i++) {
      cell = blocked[i];
      p = {
        x: normToPx(gridToNorm(cell[0], cell[1], rows, cols)[0]),
        y: normToPx(gridToNorm(cell[0], cell[1], rows, cols)[1])
      };
      ctx.fillStyle = theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(30,50,50,0.12)';
      ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  function drawPathGlow(color, width) {
    if (path.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[path[0]].x, points[path[0]].y);
    for (var i = 1; i < path.length; i++) {
      ctx.lineTo(points[path[i]].x, points[path[i]].y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  function silhouetteIndices() {
    if (levelMeta.rule !== 'free') return path.length >= 3 ? path : null;
    if (levelMeta.outline && levelMeta.outline.length >= 3) return levelMeta.outline;
    if (path.length >= 3) return path;
    return null;
  }

  function drawRevealSilhouette() {
    var idxs = silhouetteIndices();
    var alpha = Math.min(1, revealT);
    var title = levelMeta.title || '';
    if (idxs && idxs.length >= 3) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(points[idxs[0]].x, points[idxs[0]].y);
      for (var i = 1; i < idxs.length; i++) ctx.lineTo(points[idxs[i]].x, points[idxs[i]].y);
      ctx.closePath();
      ctx.fillStyle = theme.dark
        ? ('rgba(255,210,140,' + (0.1 + 0.16 * alpha) + ')')
        : ('rgba(212,87,60,' + (0.08 + 0.14 * alpha) + ')');
      ctx.fill();
      ctx.restore();
    }
    if (!title) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, (alpha - 0.25) / 0.75);
    ctx.fillStyle = theme.dark ? 'rgba(255,246,230,0.92)' : 'rgba(29,42,46,0.88)';
    ctx.font = '600 ' + Math.max(16, cssSize * 0.048) + 'px "Songti SC","Noto Serif SC",serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('「' + title + '」', cssSize / 2, cssSize * 0.92);
    ctx.restore();
  }

  function drawEndpointBadge(idx, label, color) {
    if (idx == null || idx < 0 || idx >= points.length) return;
    var pt = points[idx];
    var r = Math.max(10, cssSize * 0.024);
    ctx.save();
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r + 6, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = 'bold ' + Math.max(11, cssSize * 0.028) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, pt.x, pt.y - r - 6);
    ctx.restore();
  }

  function draw() {
    var i, pt, idx, tip, dark, r;
    tip = path.length ? points[path[path.length - 1]] : null;
    dark = theme.dark;
    ctx.clearRect(0, 0, cssSize, cssSize);
    drawAtmosphere();
    drawGridBlocks();
    drawWalls();
    if (levelMeta.rule === 'euler') drawEulerTracks();
    if (won && revealT > 0) drawRevealSilhouette();

    if (levelMeta.rule !== 'euler' && path.length >= 2) {
      ctx.save();
      ctx.shadowColor = rejectFlash ? theme.danger : theme.strokeGlow;
      ctx.shadowBlur = Math.max(10, cssSize * 0.028);
      drawPathGlow(rejectFlash ? theme.danger : theme.stroke, Math.max(5, cssSize * 0.014));
      ctx.shadowBlur = 0;
      drawPathGlow(rejectFlash ? theme.danger : '#fff6f1', Math.max(2.2, cssSize * 0.006));
      ctx.restore();
    }

    if (tip && hover && !won) {
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(hover.x, hover.y);
      ctx.strokeStyle = theme.strokeDim;
      ctx.lineWidth = Math.max(2, cssSize * 0.006);
      ctx.setLineDash([7, 7]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    r = Math.max(7, cssSize * 0.018);
    for (i = 0; i < points.length; i++) {
      pt = points[i];
      idx = path.indexOf(i);
      ctx.save();
      if (idx >= 0) {
        ctx.shadowColor = idx === path.length - 1 ? theme.strokeGlow : 'rgba(47,158,120,0.35)';
        ctx.shadowBlur = Math.max(8, cssSize * 0.02);
      }
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      if (idx === 0) ctx.fillStyle = theme.stroke;
      else if (idx === path.length - 1 && path.length > 1) ctx.fillStyle = theme.done;
      else if (idx >= 0) ctx.fillStyle = theme.done;
      else if (levelMeta.rule === 'euler' && path.length && canConnect(path[path.length - 1], i)) ctx.fillStyle = theme.accent;
      else ctx.fillStyle = dark ? '#d5e4e8' : theme.point;
      ctx.fill();
      ctx.shadowBlur = 0;
      if (idx < 0) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(31,143,134,0.28)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (idx === path.length - 1 && path.length) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r + 7, 0, Math.PI * 2);
        ctx.strokeStyle = theme.accent;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    if (levelMeta.start != null) drawEndpointBadge(levelMeta.start, 'S', theme.stroke);
    if (levelMeta.end != null) drawEndpointBadge(levelMeta.end, 'E', theme.accent);
  }

  function flashReject(msg) {
    els.hint.textContent = msg;
    rejectFlash = 5;
    playRejectSound();
    draw();
  }

  function hintForLevel(fallback) {
    var bits = [ruleCfg().label];
    if (levelMeta.rule === 'free') {
      if (levelMeta.start != null) bits.push('从 S 出发');
      if (levelMeta.end != null) bits.push('以 E 收尾');
      if ((levelMeta._walls || []).length) bits.push('避开红墙');
    } else if (levelMeta.rule === 'euler') {
      bits.push('走完 ' + coverTotal() + ' 条边');
    } else {
      bits.push('填满 ' + points.length + ' 格');
    }
    return bits.length ? bits.join(' · ') : fallback;
  }

  function tryAddPoint(idx, opts) {
    opts = opts || {};
    if (won || idx < 0) return false;
    ensureAudio();
    if (!path.length) {
      if (levelMeta.start != null && idx !== levelMeta.start) {
        if (!opts.fromDrag) flashReject('本关必须从 S 点出发');
        return false;
      }
      path = [idx];
      markDeadEndUi(false);
      if (!running) { running = true; startedAt = Date.now(); }
      playConnectNote(0);
      els.hint.textContent = hintForLevel('开始');
      updateHud();
      draw();
      return true;
    }
    if (path[path.length - 1] === idx) return false;
    if (path.length >= 2 && path[path.length - 2] === idx) {
      if (opts.fromDrag) {
        undoOneEdgeOrPoint(false);
        markDeadEndUi(false);
        updateHud();
        draw();
        els.hint.textContent = '已回退一步';
        return true;
      }
    }

    var last = path[path.length - 1];
    var rule = levelMeta.rule;

    if (rule === 'euler') {
      if (!hasEulerEdge(last, idx)) {
        if (!opts.fromDrag) flashReject('只能沿着灰色轨道走');
        return false;
      }
      if (usedEdges[edgeKey(last, idx)]) {
        if (!opts.fromDrag) flashReject('这条边已经走过了');
        return false;
      }
      if (levelMeta.end != null && coverTotal() - coverNow() === 1 && idx !== levelMeta.end) {
        flashReject('最后应走到终点 E');
        return false;
      }
      usedEdges[edgeKey(last, idx)] = true;
      path.push(idx);
      playConnectNote(coverNow());
    } else if (rule === 'grid') {
      if (pathHasPoint(idx)) {
        if (!opts.fromDrag) flashReject('格子不能重复经过');
        return false;
      }
      if (!isGridAdjacent(last, idx)) {
        if (!opts.fromDrag) flashReject('只能上下左右相邻');
        return false;
      }
      path.push(idx);
      playConnectNote(path.length - 1);
    } else {
      if (pathHasPoint(idx)) {
        if (!opts.fromDrag) flashReject('这个点已经连过了');
        return false;
      }
      if (levelMeta.end != null && idx === levelMeta.end && path.length + 1 < points.length) {
        flashReject('终点 E 必须最后经过');
        return false;
      }
      if (levelMeta.end != null && path.length + 1 === points.length && idx !== levelMeta.end) {
        flashReject('最后一步必须连到终点 E');
        return false;
      }
      if (edgePassesThroughPoint(last, idx)) {
        flashReject('不能穿过其他点');
        return false;
      }
      if (edgeCrossesPath(last, idx)) {
        flashReject('会交叉或重叠');
        return false;
      }
      if (edgeCrossesWalls(last, idx)) {
        flashReject('不能穿越障碍墙');
        return false;
      }
      path.push(idx);
      playConnectNote(path.length - 1);
    }

    if (!running) { running = true; startedAt = Date.now(); }
    updateHud();
    draw();
    if (isComplete()) {
      markDeadEndUi(false);
      checkWin();
      return true;
    }
    if (!hasAnyMove()) {
      markDeadEndUi(true);
      els.hint.textContent = '已无路可走，请撤销或重来';
    } else {
      markDeadEndUi(false);
      els.hint.textContent = levelMeta.rule === 'euler'
        ? ('已描 ' + coverNow() + '/' + coverTotal())
        : ('已连 ' + path.length + '/' + points.length);
    }
    return true;
  }

  function undoOneEdgeOrPoint(countUndo) {
    if (path.length < 2) {
      path = [];
      usedEdges = {};
      return;
    }
    var a = path[path.length - 2];
    var b = path[path.length - 1];
    path.pop();
    if (levelMeta.rule === 'euler') delete usedEdges[edgeKey(a, b)];
    if (countUndo) undos += 1;
  }

  function checkWin() {
    won = true;
    dragging = false;
    running = false;
    elapsedMs = currentElapsed();
    startedAt = 0;
    lastStars = rateStars();
    playWinChime();
    startReveal();
    var detailExtra = levelMeta.rule === 'free'
      ? ('长 ' + pathLengthNorm() + (levelMeta.par ? (' / 标杆 ' + levelMeta.par) : ''))
      : (levelMeta.rule === 'euler' ? ('边 ' + coverTotal()) : ('格 ' + points.length));
    if (els.winStars) els.winStars.textContent = starsGlyph(lastStars);
    els.winDetail.textContent =
      (levelMeta.title ? ('「' + levelMeta.title + '」 · ') : '') +
      starsGlyph(lastStars) + ' · ' + detailExtra +
      ' · ' + formatTime(elapsedMs) + ' · 撤 ' + undos;
    els.winBanner.classList.remove('hidden');
    els.btnSubmit.disabled = false;
    els.hint.textContent = '过关 · ' + (levelMeta.title || ruleCfg().label) + ' · ' + lastStars + ' 星';
    if (mode === 'campaign' && levelIndex >= unlockedForDiff()) setUnlocked(levelIndex + 1);
    recordWinStats(elapsedMs, undos);
    saveBest();
    persistProgress();
    updateHud();
    afterWinFlow();
  }

  function recordWinStats(ms, undoCount) {
    if (mode === 'campaign') {
      var stats = campaignStats();
      stats.totalMs += ms;
      stats.totalUndos += undoCount;
      stats.clears += 1;
      return;
    }
    var pack = ensureDailyPack();
    var prev = pack.cleared[String(dailySeq)];
    if (!prev || encodeScore(ms, undoCount) > encodeScore(prev.ms, prev.undos)) {
      pack.cleared[String(dailySeq)] = { ms: ms, undos: undoCount };
    }
    pack.totalMs = 0;
    pack.totalUndos = 0;
    Object.keys(pack.cleared).forEach(function (k) {
      pack.totalMs += pack.cleared[k].ms;
      pack.totalUndos += pack.cleared[k].undos;
    });
  }

  function currentLeaderScore() {
    if (mode === 'campaign') {
      var stats = campaignStats();
      return encodeLeaderScore(unlockedForDiff(), stats.totalMs, stats.totalUndos);
    }
    var pack = ensureDailyPack();
    return encodeLeaderScore(dailyClearedCount(pack), pack.totalMs, pack.totalUndos);
  }

  function afterWinFlow() {
    var chain = Promise.resolve();
    if (autoSubmit) chain = chain.then(function () { return submitScore({ auto: true }); });
    if (autoNext) {
      chain = chain.then(function () {
        cancelAutoNext();
        autoTimer = setTimeout(function () {
          autoTimer = 0;
          goAutoNext();
        }, AUTO_NEXT_DELAY);
      });
    }
    chain.catch(function () {});
  }

  function goAutoNext() {
    if (mode === 'campaign') {
      var next = levelIndex + 1;
      setUnlocked(Math.max(unlockedForDiff(), next));
      persistProgress();
      loadCampaignLevel(next);
      return;
    }
    if (dailySeq >= DAILY_PACK - 1) {
      els.hint.textContent = '今日题已打完';
      return;
    }
    loadDaily(dailySeq + 1);
  }

  function saveBest() {
    var score = currentLeaderScore();
    if (mode === 'campaign') {
      var key = 'campaign:' + rulePack + ':' + difficulty;
      var prev = progress.best[key];
      if (!prev || score > prev.score) progress.best[key] = { score: score };
    } else {
      var dkey = todayKey() + ':' + rulePack + ':' + difficulty;
      var dprev = progress.dailyBest[dkey];
      if (!dprev || score > dprev.score) progress.dailyBest[dkey] = { score: score };
    }
  }

  async function persistProgress() {
    progress.settings = {
      rulePack: rulePack, difficulty: difficulty, autoNext: autoNext, autoSubmit: autoSubmit
    };
    try { await window.Yiqiwan.storage.set(SAVE_KEY, progress); }
    catch (_) { els.hint.textContent = '存档暂不可用，本局仍可继续'; }
  }

  function migrateUnlock(saved) {
    var u = blankUnlock();
    if (!saved) return u;
    if (saved.free || saved.euler || saved.grid) {
      ['free', 'euler', 'grid'].forEach(function (r) {
        if (saved[r]) {
          u[r].easy = Math.max(0, Number(saved[r].easy) || 0);
          u[r].normal = Math.max(0, Number(saved[r].normal) || 0);
          u[r].hard = Math.max(0, Number(saved[r].hard) || 0);
        }
      });
      return u;
    }
    u.free.easy = Math.max(0, Number(saved.easy) || 0);
    u.free.normal = Math.max(0, Number(saved.normal) || 0);
    u.free.hard = Math.max(0, Number(saved.hard) || 0);
    return u;
  }

  async function loadProgress() {
    try {
      var saved = await window.Yiqiwan.storage.get(SAVE_KEY);
      if (!saved || typeof saved !== 'object') return;
      progress.unlocked = migrateUnlock(saved.unlocked);
      progress.best = saved.best || {};
      progress.dailyBest = saved.dailyBest || {};
      progress.campaignStats = saved.campaignStats || blankStats();
      progress.dailyPack = saved.dailyPack || null;
      if (saved.settings) {
        if (RULES[saved.settings.rulePack]) rulePack = saved.settings.rulePack;
        if (DIFFICULTY[saved.settings.difficulty]) difficulty = saved.settings.difficulty;
        autoNext = !!saved.settings.autoNext;
        autoSubmit = !!saved.settings.autoSubmit;
      }
    } catch (_) {}
  }

  function applyCampaignLevel(index) {
    levelIndex = Math.max(0, index);
    var lvl = campaignLevelAt(levelIndex);
    var suffix = levelIndex < levels.length
      ? (' · ' + (levelIndex + 1) + '/' + levels.length)
      : ' · 无尽';
    adoptLevel(lvl, lvl.name + suffix);
  }

  function loadCampaignLevel(index) {
    mode = 'campaign';
    applyCampaignLevel(index);
    layout(true);
    refreshBoard();
    els.hint.textContent = hintForLevel('生涯');
  }

  function loadDaily(seq) {
    mode = 'daily';
    dailySeq = Math.max(0, Math.min(seq || 0, DAILY_PACK - 1));
    adoptLevel(makeDailyLevel(todayKey(), dailySeq));
    layout(true);
    refreshBoard();
    els.hint.textContent = hintForLevel('每日精选');
  }

  function setRulePack(next) {
    if (!RULES[next] || next === rulePack) { syncSettingsUi(); return; }
    rulePack = next;
    filterLevelsForDifficulty();
    persistProgress();
    loadCampaignLevel(Math.min(levelIndex, unlockedForDiff()));
    els.hint.textContent = '玩法：' + ruleCfg().label + ' · ' + ruleCfg().hint;
  }

  function setDifficulty(next) {
    if (!DIFFICULTY[next] || next === difficulty) { syncSettingsUi(); return; }
    difficulty = next;
    filterLevelsForDifficulty();
    persistProgress();
    if (mode === 'campaign') loadCampaignLevel(Math.min(levelIndex, unlockedForDiff()));
    else loadDaily(Math.min(dailySeq, DAILY_PACK - 1));
  }

  function toggleAutoNext() {
    autoNext = !autoNext; persistProgress(); syncSettingsUi();
  }

  function toggleAutoSubmit() {
    autoSubmit = !autoSubmit; persistProgress(); syncSettingsUi();
  }

  function undoStep() {
    cancelAutoNext();
    if (won) {
      won = false;
      stopReveal();
      els.winBanner.classList.add('hidden');
      els.btnSubmit.disabled = true;
      if (!running) { running = true; startedAt = Date.now(); }
    }
    if (!path.length) return;
    undoOneEdgeOrPoint(true);
    markDeadEndUi(path.length > 0 && !hasAnyMove());
    updateHud();
    draw();
    els.hint.textContent = path.length ? '已撤销' : '已清空，重新选起点';
  }

  function clearBoard() {
    cancelAutoNext();
    resetBoardState();
    markDeadEndUi(false);
    updateHud();
    draw();
    els.hint.textContent = hintForLevel('重来');
  }

  function goNextFromUi() {
    if (mode === 'daily') {
      if (dailySeq < DAILY_PACK - 1) loadDaily(dailySeq + 1);
      return;
    }
    if (levelIndex < unlockedForDiff()) loadCampaignLevel(levelIndex + 1);
    else if (won) {
      setUnlocked(Math.max(unlockedForDiff(), levelIndex + 1));
      persistProgress();
      loadCampaignLevel(levelIndex + 1);
    }
  }

  function pointerPos(ev) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) * (cssSize / Math.max(1, rect.width)),
      y: (ev.clientY - rect.top) * (cssSize / Math.max(1, rect.height))
    };
  }

  function onPointerDown(ev) {
    if (ev.button) return;
    dragging = true;
    canvas.setPointerCapture(ev.pointerId);
    var p = pointerPos(ev);
    tryAddPoint(nearestPoint(p.x, p.y));
  }

  function onPointerMove(ev) {
    if (won) { hover = null; return; }
    var p = pointerPos(ev);
    hover = path.length ? p : null;
    if (dragging && (ev.buttons === 1 || ev.pressure > 0)) {
      var idx = nearestPoint(p.x, p.y);
      if (idx >= 0) tryAddPoint(idx, { fromDrag: true });
    }
    draw();
  }

  function onPointerUp() { dragging = false; hover = null; draw(); }

  function renderBoard(items, mineLabel) {
    els.boardList.innerHTML = '';
    if (!items || !items.length) {
      var empty = document.createElement('li');
      empty.textContent = '暂无成绩';
      empty.style.gridTemplateColumns = '1fr';
      els.boardList.appendChild(empty);
      els.boardMine.textContent = mineLabel || '';
      return;
    }
    items.forEach(function (row) {
      var li = document.createElement('li');
      if (row.isMe) li.className = 'me';
      var decoded = decodeScore(row.score);
      var rank = document.createElement('span');
      rank.textContent = '#' + row.rank;
      var name = document.createElement('span');
      name.textContent = row.displayName || '社友';
      var score = document.createElement('span');
      score.textContent = (mode === 'daily' ? ('清' + decoded.progress) : ('进度' + decoded.progress)) +
        ' · ' + formatTime(decoded.ms) + ' / 撤' + decoded.undos;
      li.appendChild(rank); li.appendChild(name); li.appendChild(score);
      els.boardList.appendChild(li);
    });
    els.boardMine.textContent = mineLabel || '';
  }

  function localPreviewBoard() {
    var key = mode === 'daily'
      ? (todayKey() + ':' + rulePack + ':' + difficulty)
      : ('campaign:' + rulePack + ':' + difficulty);
    var val = mode === 'daily' ? progress.dailyBest[key] : progress.best[key];
    var entries = val ? [{ rank: 1, displayName: '我（本地）', score: val.score, isMe: true }] : [];
    return { items: entries, mine: entries.length ? '本地最佳' : '通关后显示' };
  }

  async function refreshBoard() {
    els.boardMeta.textContent = ruleCfg().label + ' · ' + diffCfg().label + ' · 进度优先';
    try {
      var me = await window.Yiqiwan.scores.me();
      if (!me.loggedIn) els.boardMeta.textContent += '（游客可看榜）';
      var list = await window.Yiqiwan.scores.list({ boardId: currentBoardId(), verified: false, limit: 20 });
      var items = list.items || [];
      if (items.length) {
        var self = items.filter(function (x) { return x.isMe; })[0];
        var mine = '';
        if (self) {
          var d = decodeScore(self.score);
          mine = '我的 #' + self.rank + ' · 进度' + d.progress + ' · ' + formatTime(d.ms);
        }
        renderBoard(items, mine);
      } else {
        var localEmpty = localPreviewBoard();
        renderBoard(localEmpty.items, localEmpty.mine);
      }
    } catch (_) {
      var local = localPreviewBoard();
      renderBoard(local.items, local.mine);
      els.boardMeta.textContent = '本地预览榜';
    }
  }

  async function submitScore(options) {
    options = options || {};
    if (!won) return;
    var score = currentLeaderScore();
    els.btnSubmit.disabled = true;
    try {
      var me = await window.Yiqiwan.scores.me();
      if (!me.loggedIn) {
        els.hint.textContent = options.auto ? '自动提交跳过：未登录' : '请先登录再提交';
        els.btnSubmit.disabled = false;
        return;
      }
      await window.Yiqiwan.scores.submit({ boardId: currentBoardId(), score: score });
      els.hint.textContent = options.auto ? '已自动提交' : '已提交';
      await refreshBoard();
    } catch (_) {
      saveBest();
      await refreshBoard();
      els.hint.textContent = '公开提交暂不可用，本地已记';
    } finally {
      els.btnSubmit.disabled = !won;
    }
  }

  function onUiClick(ev) {
    var t = ev.target;
    if (!t || !t.id) return;
    switch (t.id) {
      case 'btnUndo': undoStep(); break;
      case 'btnClear': clearBoard(); break;
      case 'btnSubmit': submitScore(); break;
      case 'btnRefreshBoard': refreshBoard(); break;
      case 'btnWinNext': goNextFromUi(); break;
      case 'btnTutorial':
        window.Yiqiwan.ui.showTutorial().catch(function () {
          els.hint.textContent = ruleCfg().hint;
        });
        break;
      case 'btnRuleFree': setRulePack('free'); break;
      case 'btnRuleEuler': setRulePack('euler'); break;
      case 'btnRuleGrid': setRulePack('grid'); break;
      case 'btnCampaign': loadCampaignLevel(Math.min(levelIndex, unlockedForDiff())); break;
      case 'btnDaily': loadDaily(0); break;
      case 'btnDiffEasy': setDifficulty('easy'); break;
      case 'btnDiffNormal': setDifficulty('normal'); break;
      case 'btnDiffHard': setDifficulty('hard'); break;
      case 'btnAutoNext': toggleAutoNext(); break;
      case 'btnAutoSubmit': toggleAutoSubmit(); break;
      case 'btnPrev':
        if (mode === 'campaign' && levelIndex > 0) loadCampaignLevel(levelIndex - 1);
        else if (mode === 'daily' && dailySeq > 0) loadDaily(dailySeq - 1);
        break;
      case 'btnNext': goNextFromUi(); break;
      default: break;
    }
  }

  function onKeyDown(ev) {
    var tag = (ev.target && ev.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if ((ev.key === 'z' || ev.key === 'Z') && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); undoStep(); return; }
    if (ev.key === 'Backspace') { ev.preventDefault(); undoStep(); return; }
    if (ev.key === 'r' || ev.key === 'R') { ev.preventDefault(); clearBoard(); return; }
    if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      if (mode === 'campaign' && levelIndex > 0) loadCampaignLevel(levelIndex - 1);
      else if (mode === 'daily' && dailySeq > 0) loadDaily(dailySeq - 1);
      return;
    }
    if (ev.key === 'ArrowRight') { ev.preventDefault(); goNextFromUi(); }
  }

  function bind() {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    document.getElementById('app').addEventListener('click', onUiClick);
    window.addEventListener('keydown', onKeyDown);
  }

  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(refreshBoard, POLL_MS);
  }

  try {
    var context = await window.Yiqiwan.ready();
    document.documentElement.dataset.theme = context.theme || 'light';
    refreshThemeCache();
    window.Yiqiwan.on('themechange', function (nextTheme) {
      document.documentElement.dataset.theme = nextTheme;
      refreshThemeCache();
      draw();
    });
    window.Yiqiwan.on('pause', function () {
      if (running && startedAt) { elapsedMs += Date.now() - startedAt; startedAt = 0; }
      paused = true;
    });
    window.Yiqiwan.on('resume', function () {
      paused = false;
      if (running && !won) startedAt = Date.now();
      draw();
    });
    if (window.Yiqiwan.ui && window.Yiqiwan.ui.onViewportChange) {
      window.Yiqiwan.ui.onViewportChange(function () { layout(false); });
    } else {
      window.addEventListener('resize', function () { layout(false); });
    }

    var res = await fetch('levels.json');
    var data = await res.json();
    allLevels = data.levels || [];
    await loadProgress();
    filterLevelsForDifficulty();
    bind();
    syncSettingsUi();
    ensureClock();
    loadCampaignLevel(unlockedForDiff());
    startPolling();
  } catch (err) {
    els.hint.textContent = '请从一起玩平台启动，或使用开发工具包本地预览。';
    console.error(err);
  }
})();
