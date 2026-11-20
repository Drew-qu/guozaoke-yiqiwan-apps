import { createView } from './gfx.js';
import * as Logic from './logic.js';

const BOARD_ID = 'canglan-sortie-v1';
const SAVE_KEY = 'canglan.progress.v1';
const POLL_MS = 25000;
const TEST_MODE = /(?:\?|&)test=1(?:&|$)/.test(location.search);

const canvas = document.getElementById('board');
const els = {
  modeSub: document.getElementById('modeSub'),
  hpPill: document.getElementById('hpPill'),
  hpFill: document.getElementById('hpFill'),
  hpText: document.getElementById('hpText'),
  meterScore: document.getElementById('meterScore'),
  meterWave: document.getElementById('meterWave'),
  meterStealth: document.getElementById('meterStealth'),
  btnSound: document.getElementById('btnSound'),
  hint: document.getElementById('hint'),
  banner: document.getElementById('banner'),
  bossHud: document.getElementById('bossHud'),
  vignette: document.getElementById('vignette'),
  stick: document.getElementById('stick'),
  btnAir: document.getElementById('btnAir'),
  btnSea: document.getElementById('btnSea'),
  btnStealth: document.getElementById('btnStealth'),
  startOverlay: document.getElementById('startOverlay'),
  helpOverlay: document.getElementById('helpOverlay'),
  pauseOverlay: document.getElementById('pauseOverlay'),
  endOverlay: document.getElementById('endOverlay'),
  endKicker: document.getElementById('endKicker'),
  endTitle: document.getElementById('endTitle'),
  endSummary: document.getElementById('endSummary'),
  btnStart: document.getElementById('btnStart'),
  btnStartHelp: document.getElementById('btnStartHelp'),
  btnHelpClose: document.getElementById('btnHelpClose'),
  btnResume: document.getElementById('btnResume'),
  btnPauseRestart: document.getElementById('btnPauseRestart'),
  btnEndSubmit: document.getElementById('btnEndSubmit'),
  btnEndRestart: document.getElementById('btnEndRestart'),
  btnPause: document.getElementById('btnPause'),
  btnRestart: document.getElementById('btnRestart'),
  btnTutorial: document.getElementById('btnTutorial'),
  btnSubmit: document.getElementById('btnSubmit'),
  btnAutoSubmit: document.getElementById('btnAutoSubmit'),
  btnRefreshBoard: document.getElementById('btnRefreshBoard'),
  bestLine: document.getElementById('bestLine'),
  boardList: document.getElementById('boardList'),
  boardMeta: document.getElementById('boardMeta'),
  boardMine: document.getElementById('boardMine'),
  testPanel: document.getElementById('testPanel'),
  btnTestTargets: document.getElementById('btnTestTargets'),
  btnTestBoss: document.getElementById('btnTestBoss'),
  btnTestPhase: document.getElementById('btnTestPhase')
};

const hasSdk = !!window.Yiqiwan;
const sdk = hasSdk ? window.Yiqiwan : {
  ready: () => Promise.resolve({ theme: 'light', sound: 'enabled' }),
  on: () => {},
  storage: {
    get: (k) => {
      try { return Promise.resolve(JSON.parse(localStorage.getItem(k) || 'null')); }
      catch (err) { return Promise.resolve(null); }
    },
    set: (k, v) => {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (err) {}
      return Promise.resolve();
    }
  },
  scores: {
    me: () => Promise.resolve({ loggedIn: false }),
    list: () => Promise.reject(new Error('offline')),
    submit: () => Promise.reject(new Error('offline'))
  },
  ui: { showTutorial: () => Promise.reject(new Error('offline')) },
  audio: { getPreference: () => Promise.resolve('enabled') }
};

const game = Logic.createGame({ seed: 1 });
const locks = { user: false, platform: false, hidden: false, help: false };
const keys = new Set();
const held = { air: false, sea: false };
let stealthQueued = false;
let prevStealth = false;
let stick = null;
let soundOn = true;
let platformMuted = false;
let autoSubmit = false;
let submitted = false;
let endShown = false;
let bossBuilt = false;
let audioCtx = null;
let engine = null;
let noiseBuf = null;
let lastAirSfx = 0;
let pollTimer = 0;
const progress = { best: 0, settings: {} };

let view = null;
try {
  view = createView(canvas);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  view.setReduced(reduce.matches);
  reduce.addEventListener?.('change', () => view.setReduced(reduce.matches));
} catch (err) {
  els.hint.textContent = '这台设备没能创建三维画面。';
  els.btnStart.disabled = true;
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function ensureAudio() {
  if (!soundOn || platformMuted) return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function stopAudioNow() {
  if (engine) {
    try { engine.gain.gain.value = 0; } catch (err) {}
  }
  if (audioCtx && audioCtx.state === 'running') audioCtx.suspend().catch(() => {});
}

function startEngine() {
  const ac = ensureAudio();
  if (!ac || game.phase !== 'play') return;
  if (!engine) {
    const len = ac.sampleRate;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + (Math.random() * 2 - 1) * 0.2) * 0.96;
      data[i] = last;
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    const gain = ac.createGain();
    gain.gain.value = 0.0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    src.start();
    engine = { gain };
  }
  engine.gain.gain.setTargetAtTime(0.03, ac.currentTime, 0.08);
}

function pokeAudio() {
  if (game.phase === 'play') startEngine();
  else ensureAudio();
}

function tone(freq, dur, type, vol, slide) {
  const ac = ensureAudio();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slide), ac.currentTime + dur);
    gain.gain.setValueAtTime(vol || 0.05, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0008, ac.currentTime + dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + dur + 0.02);
  } catch (err) {}
}

function noiseBurst(dur, freq, vol) {
  const ac = ensureAudio();
  if (!ac) return;
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.45), ac.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = freq;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(vol, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0008, ac.currentTime + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  src.start();
  src.stop(ac.currentTime + dur + 0.02);
}

function sfxAir() { tone(880, 0.045, 'triangle', 0.03); }
function sfxSea() { tone(240, 0.16, 'sine', 0.05, 90); }
function sfxBoom(power) { noiseBurst(0.22 + (power || 1) * 0.05, 420, 0.08); tone(140, 0.12, 'triangle', 0.03); }
function sfxStealth() { tone(620, 0.18, 'sine', 0.04, 980); }
function sfxWin() {
  [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.05), i * 90));
}
function sfxOver() { tone(220, 0.22, 'sawtooth', 0.04, 90); }

function watchSfx() {
  const now = performance.now();
  for (let i = 0; i < game.fx.length; i++) {
    const fx = game.fx[i];
    if (fx._heard) continue;
    fx._heard = true;
    if (fx.kind === 'boom' || fx.kind === 'splash') sfxBoom(fx.power);
    else if (fx.kind === 'muzzle-air' && now - lastAirSfx > 80) { lastAirSfx = now; sfxAir(); }
    else if (fx.kind === 'muzzle-sea') sfxSea();
    else if (fx.kind === 'ping' && fx.power > 0.7) sfxStealth();
  }
}

async function applyPlatformSoundPref(context) {
  let pref = null;
  try {
    if (sdk.audio && typeof sdk.audio.getPreference === 'function') pref = await sdk.audio.getPreference();
    else if (context && context.sound) pref = context.sound;
  } catch (err) {}
  platformMuted = pref === 'muted';
  if (platformMuted) {
    soundOn = false;
    stopAudioNow();
  }
}

function updateSoundButton() {
  if (platformMuted) {
    els.btnSound.textContent = '🔇 平台静音';
    els.btnSound.setAttribute('aria-pressed', 'false');
    els.btnSound.title = '本次为静音进入；需重新打开应用并选择「开启声音」';
  } else {
    els.btnSound.textContent = soundOn ? '🔊 音效' : '🔇 静音';
    els.btnSound.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    els.btnSound.title = '音效开关';
  }
  els.btnAutoSubmit.setAttribute('aria-pressed', autoSubmit ? 'true' : 'false');
  els.bestLine.textContent = progress.best ? ('本地最佳 ' + progress.best) : '本地最佳 —';
}

async function persistProgress() {
  progress.settings = { soundOn, autoSubmit };
  try { await sdk.storage.set(SAVE_KEY, progress); } catch (err) {}
}

async function loadProgress() {
  try {
    const saved = await sdk.storage.get(SAVE_KEY);
    if (!saved || typeof saved !== 'object') return;
    progress.best = Number(saved.best) || 0;
    if (saved.settings) {
      soundOn = saved.settings.soundOn !== false;
      autoSubmit = !!saved.settings.autoSubmit;
    }
  } catch (err) {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderBoard(items, mineLabel) {
  els.boardList.innerHTML = '';
  if (!items || !items.length) {
    const li = document.createElement('li');
    li.textContent = '暂无成绩';
    li.style.gridTemplateColumns = '1fr';
    els.boardList.appendChild(li);
    els.boardMine.textContent = mineLabel || '';
    return;
  }
  items.forEach((row) => {
    const li = document.createElement('li');
    if (row.isMe) li.className = 'me';
    li.innerHTML = '<span>#' + row.rank + '</span><span>' + escapeHtml(row.displayName || '社友') + '</span><span>' + row.score + ' 分</span>';
    els.boardList.appendChild(li);
  });
  els.boardMine.textContent = mineLabel || '';
}

async function refreshBoard() {
  els.boardMeta.textContent = '单航道榜 · 按总分';
  try {
    const me = await sdk.scores.me();
    if (!me.loggedIn) els.boardMeta.textContent += '（游客可看榜）';
    const list = await sdk.scores.list({ boardId: BOARD_ID, verified: false, limit: 15 });
    const items = list.items || [];
    if (items.length) {
      const self = items.filter((x) => x.isMe)[0];
      renderBoard(items, self ? ('我的名次 #' + self.rank + ' · ' + self.score + ' 分') : '');
    } else {
      renderBoard(progress.best ? [{ rank: 1, displayName: '我（本地）', score: progress.best, isMe: true }] : [], progress.best ? '本地最佳' : '');
    }
  } catch (err) {
    renderBoard(progress.best ? [{ rank: 1, displayName: '我（本地）', score: progress.best, isMe: true }] : [], progress.best ? '本地预览最佳' : '结算后显示');
    els.boardMeta.textContent = '本地预览榜（上线后为社区公开榜）';
  }
}

async function submitScore(options) {
  options = options || {};
  if (game.phase !== 'over' && game.phase !== 'win') return;
  if (submitted) return;
  els.btnSubmit.disabled = true;
  els.btnEndSubmit.disabled = true;
  try {
    const me = await sdk.scores.me();
    if (!me.loggedIn) {
      els.hint.textContent = options.auto ? '自动提交跳过：未登录' : '请先登录再提交公开榜';
      els.btnSubmit.disabled = false;
      els.btnEndSubmit.disabled = false;
      return;
    }
    await sdk.scores.submit({ boardId: BOARD_ID, score: game.score | 0 });
    submitted = true;
    els.hint.textContent = options.auto ? '已自动提交成绩' : '成绩已提交！';
    await refreshBoard();
  } catch (err) {
    if (game.score > progress.best) progress.best = game.score | 0;
    await persistProgress();
    await refreshBoard();
    els.hint.textContent = '公开提交暂不可用，已记录本地最佳';
    els.btnSubmit.disabled = false;
    els.btnEndSubmit.disabled = false;
  }
}

function saveLocalBest() {
  if ((game.score | 0) > progress.best) {
    progress.best = game.score | 0;
    persistProgress();
  }
  updateSoundButton();
}

function readInput() {
  let moveX = 0;
  let moveY = 0;
  if (keys.has('arrowleft') || keys.has('a')) moveX -= 1;
  if (keys.has('arrowright') || keys.has('d')) moveX += 1;
  if (keys.has('arrowup') || keys.has('w')) moveY += 1;
  if (keys.has('arrowdown') || keys.has('s')) moveY -= 1;
  if (stick) {
    moveX = stick.x;
    moveY = stick.y;
  }
  const air = held.air || keys.has('j') || keys.has('z') || keys.has(' ');
  const sea = held.sea || keys.has('k') || keys.has('x');
  const stealthDown = keys.has('shift') || keys.has('c') || stealthQueued;
  const stealthEdge = stealthDown && !prevStealth;
  prevStealth = stealthDown;
  stealthQueued = false;
  return { moveX: clamp(moveX, -1, 1), moveY: clamp(moveY, -1, 1), air, sea, stealthEdge };
}

function showHelp() {
  els.helpOverlay.classList.remove('hidden');
  locks.help = true;
  syncLocks();
}

function hideHelp() {
  els.helpOverlay.classList.add('hidden');
  locks.help = false;
  syncLocks();
}

function syncLocks() {
  const locked = locks.user || locks.platform || locks.hidden || locks.help;
  if (game.phase === 'play' && locked) game.phase = 'pause';
  else if (game.phase === 'pause' && !locked) game.phase = 'play';
  if (game.phase !== 'play') {
    if (engine) engine.gain.gain.setTargetAtTime(0.0001, audioCtx ? audioCtx.currentTime : 0, 0.05);
  }
}

function toggleUserPause() {
  if (game.phase !== 'play' && game.phase !== 'pause') return;
  locks.user = !locks.user;
  syncLocks();
  if (game.phase === 'play') pokeAudio();
}

function beginRun() {
  Logic.startGame(game);
  locks.user = false;
  locks.help = false;
  submitted = false;
  endShown = false;
  bossBuilt = false;
  hideHelp();
  els.endOverlay.classList.add('hidden');
  els.btnSubmit.disabled = true;
  els.btnEndSubmit.disabled = false;
  pokeAudio();
  startEngine();
}

function showEnd() {
  const sum = Logic.summary(game);
  const win = game.phase === 'win';
  els.endKicker.textContent = win ? '航道贯通' : '折影受损';
  els.endTitle.textContent = win ? '潮垒核心舱沉寂' : '本局结束';
  els.endSummary.textContent = '得分 ' + sum.score + ' · 用时 ' + sum.time + ' 秒 · 击落 ' + sum.kills + ' · 拆解 ' + sum.parts + ' 个部件';
  els.endOverlay.classList.remove('hidden');
  els.btnSubmit.disabled = false;
  saveLocalBest();
  if (autoSubmit) submitScore({ auto: true });
  if (win) sfxWin();
  else sfxOver();
}

function renderBoss() {
  const b = game.boss;
  if (!b) {
    els.bossHud.classList.add('hidden');
    els.bossHud.innerHTML = '';
    bossBuilt = false;
    return;
  }
  if (!bossBuilt) {
    els.bossHud.innerHTML = b.parts.map((p) => (
      '<div class="part" data-id="' + p.id + '"><span>' + p.name + '</span><i><b></b></i></div>'
    )).join('') + '<p class="boss-phase" id="bossPhase"></p>';
    bossBuilt = true;
  }
  els.bossHud.classList.remove('hidden');
  b.parts.forEach((p) => {
    const row = els.bossHud.querySelector('[data-id="' + p.id + '"]');
    if (!row) return;
    row.querySelector('b').style.width = Math.max(0, (p.hp / p.maxHp) * 100) + '%';
    row.classList.toggle('open', p.phase === b.phase && p.hp > 0);
    row.classList.toggle('down', p.hp <= 0);
    row.classList.toggle('sealed', p.phase !== b.phase && p.hp > 0);
  });
  const phase = els.bossHud.querySelector('.boss-phase');
  if (phase) {
    const label = ['', '一阶段 · 舷炮', '二阶段 · 舰岛 / 弹射器', '三阶段 · 核心舱'][b.phase] || '';
    phase.textContent = b.dead ? '潮垒沉寂' : label;
  }
}

function renderHud() {
  const hp = Math.max(0, Math.ceil(game.hp));
  els.hpText.textContent = '生命 ' + hp;
  els.hpFill.style.width = (hp / game.maxHp * 100) + '%';
  els.hpPill.classList.toggle('low', hp <= 35);
  els.meterScore.textContent = '得分 ' + (game.score | 0);
  const wave = game.boss ? 4 : game.wave;
  els.meterWave.textContent = '波次 ' + wave + ' / 4 ' + (game.waveName || '');
  if (game.stealthT > 0) els.meterStealth.textContent = '隐身 ' + game.stealthT.toFixed(1) + 's';
  else if (game.stealthCd > 0) els.meterStealth.textContent = '隐身 ' + game.stealthCd.toFixed(1) + 's';
  else els.meterStealth.textContent = '隐身 就绪';
  const airCool = game.phase === 'play' ? Math.max(0, game.airCd / Logic.TUNE.airCd) : 0;
  const seaCool = game.phase === 'play' ? Math.max(0, game.seaCd / Logic.TUNE.seaCd) : 0;
  const stealthCool = game.stealthT > 0 ? 0 : Math.max(0, game.stealthCd / Logic.TUNE.stealthCd);
  els.btnAir.style.setProperty('--cool', airCool.toFixed(3));
  els.btnSea.style.setProperty('--cool', seaCool.toFixed(3));
  els.btnStealth.style.setProperty('--cool', stealthCool.toFixed(3));
  els.btnStealth.textContent = game.stealthT > 0 ? '隐身中' : '隐身';
  if (game.bannerT > 0 && game.banner) {
    els.banner.textContent = game.banner;
    els.banner.classList.remove('hidden');
  } else els.banner.classList.add('hidden');
  const hurt = game.invuln > 0 ? 0.45 : (hp < 35 ? 0.22 : 0);
  els.vignette.style.opacity = String(hurt);
  els.vignette.style.background = 'radial-gradient(circle at center, transparent 40%, rgba(120, 24, 16, ' + (0.35 + hurt) + ') 100%)';
  renderBoss();
  const helpOpen = !els.helpOverlay.classList.contains('hidden');
  els.startOverlay.classList.toggle('hidden', game.phase !== 'title' || helpOpen);
  els.pauseOverlay.classList.toggle('hidden', game.phase !== 'pause' || helpOpen);
  if ((game.phase === 'win' || game.phase === 'over') && !endShown) {
    endShown = true;
    showEnd();
  }
  els.modeSub.textContent = game.phase === 'win' ? '航道贯通' : game.phase === 'over' ? '折影受损' : '虚构碧潮航道 · ' + (game.waveName || '街机空海');
}

function bindHold(button, key) {
  const down = (e) => {
    e.preventDefault();
    held[key] = true;
    if (button.setPointerCapture) button.setPointerCapture(e.pointerId);
    pokeAudio();
  };
  const up = () => { held[key] = false; };
  button.addEventListener('pointerdown', down);
  button.addEventListener('pointerup', up);
  button.addEventListener('pointercancel', up);
  button.addEventListener('lostpointercapture', up);
}

bindHold(els.btnAir, 'air');
bindHold(els.btnSea, 'sea');
els.btnStealth.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  stealthQueued = true;
  pokeAudio();
});

function endStick(e) {
  if (!stick || (e && e.pointerId !== stick.id)) return;
  stick = null;
  els.stick.classList.add('hidden');
}

canvas.addEventListener('pointerdown', (e) => {
  if (game.phase !== 'play' || stick) return;
  stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
  canvas.setPointerCapture(e.pointerId);
  const rect = canvas.getBoundingClientRect();
  els.stick.style.left = (e.clientX - rect.left) + 'px';
  els.stick.style.top = (e.clientY - rect.top) + 'px';
  els.stick.classList.remove('hidden');
  pokeAudio();
});
canvas.addEventListener('pointermove', (e) => {
  if (!stick || e.pointerId !== stick.id) return;
  stick.x = clamp((e.clientX - stick.ox) / 72, -1, 1);
  stick.y = clamp(-(e.clientY - stick.oy) / 72, -1, 1);
});
canvas.addEventListener('pointerup', endStick);
canvas.addEventListener('pointercancel', endStick);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key) || e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  keys.add(key);
  if (e.code === 'Space') keys.add(' ');
  pokeAudio();
  if (key === 'p') toggleUserPause();
  if (key === 'escape') {
    if (!els.helpOverlay.classList.contains('hidden')) hideHelp();
    else toggleUserPause();
  }
  if (key === 'enter') {
    if (game.phase === 'title') beginRun();
    else if (game.phase === 'pause') { locks.user = false; syncLocks(); }
    else if (game.phase === 'over' || game.phase === 'win') beginRun();
  }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
  if (e.code === 'Space') keys.delete(' ');
});

els.btnStart.addEventListener('click', beginRun);
els.btnStartHelp.addEventListener('click', showHelp);
els.btnHelpClose.addEventListener('click', hideHelp);
els.btnTutorial.addEventListener('click', () => {
  showHelp();
  if (sdk.ui && sdk.ui.showTutorial) sdk.ui.showTutorial().catch(() => {});
});
els.btnPause.addEventListener('click', toggleUserPause);
els.btnResume.addEventListener('click', () => { locks.user = false; syncLocks(); pokeAudio(); });
els.btnRestart.addEventListener('click', beginRun);
els.btnPauseRestart.addEventListener('click', beginRun);
els.btnEndRestart.addEventListener('click', beginRun);
els.btnSubmit.addEventListener('click', () => submitScore());
els.btnEndSubmit.addEventListener('click', () => submitScore());
els.btnRefreshBoard.addEventListener('click', refreshBoard);
els.btnAutoSubmit.addEventListener('click', () => {
  autoSubmit = !autoSubmit;
  persistProgress();
  updateSoundButton();
});
els.btnSound.addEventListener('click', () => {
  if (platformMuted) {
    els.hint.textContent = '本次为平台静音进入，请关闭后重新打开并选择「开启声音」';
    return;
  }
  soundOn = !soundOn;
  if (!soundOn) stopAudioNow();
  else pokeAudio();
  persistProgress();
  updateSoundButton();
});

function ensurePlay() {
  if (game.phase !== 'play') beginRun();
}

if (TEST_MODE) {
  els.testPanel.classList.remove('hidden');
  els.btnTestTargets.addEventListener('click', () => {
    ensurePlay();
    const aim = Logic.bombImpact(game.player.y, Logic.TUNE.seaVy, game.player.x, 0);
    Logic.spawnEnemy(game, { kind: 'fighter', x: game.player.x, y: game.player.y, z: 18, weaveAmp: 0 });
    Logic.spawnEnemy(game, { kind: 'striker', x: game.player.x + 3.5, y: game.player.y + 1.2, z: 24, weaveAmp: 0 });
    Logic.spawnEnemy(game, { kind: 'escort', x: game.player.x, z: aim ? aim.z : 34, weaveAmp: 0 });
  });
  els.btnTestBoss.addEventListener('click', () => {
    ensurePlay();
    game.enemies.length = 0;
    game.shots.length = 0;
    game.time = 60;
    game.scriptIndex = (game.script || []).length;
    Logic.spawnBoss(game);
    game.boss.z = Logic.TUNE.bossHoldZ + 8;
    bossBuilt = false;
  });
  els.btnTestPhase.addEventListener('click', () => {
    if (!game.boss || game.phase !== 'play') return;
    const open = game.boss.parts.filter((p) => p.hp > 0 && p.phase === game.boss.phase);
    open.forEach((p) => {
      p.hp = Math.min(p.hp, 20);
      game.shots.push({
        team: 'player', mode: 'sea', kind: 'bomb', dmg: Logic.TUNE.seaDmg, r: 0.7, homing: 0,
        x: game.boss.x + p.x, y: 1.05, z: game.boss.z + p.z, vx: 0, vy: -12, vz: 0, life: 1
      });
    });
  });
  window.__canglan = {
    game,
    view,
    start: beginRun,
    snapshot() {
      return {
        phase: game.phase,
        hp: game.hp,
        score: game.score,
        wave: game.wave,
        waveName: game.waveName,
        bossPhase: game.boss && game.boss.phase,
        parts: game.boss ? game.boss.parts.map((p) => ({ id: p.id, hp: Math.ceil(p.hp) })) : [],
        enemies: game.enemies.map((e) => e.kind)
      };
    }
  };
}

document.addEventListener('visibilitychange', () => {
  locks.hidden = document.hidden;
  if (document.hidden) stopAudioNow();
  syncLocks();
});

let last = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, last ? (ts - last) / 1000 : 0.016);
  last = ts;
  if (view && game.phase === 'play') Logic.step(game, readInput(), dt);
  else readInput();
  if (view) view.update(game, dt);
  if (game.phase === 'play' && engine && audioCtx && audioCtx.state === 'running') {
    engine.gain.gain.setTargetAtTime(0.028, audioCtx.currentTime, 0.2);
  }
  watchSfx();
  renderHud();
}

async function boot() {
  try {
    const context = await sdk.ready();
    document.documentElement.dataset.theme = (context && context.theme) || 'light';
    await applyPlatformSoundPref(context);
    sdk.on('themechange', (theme) => { document.documentElement.dataset.theme = theme; });
    sdk.on('pause', () => { locks.platform = true; stopAudioNow(); syncLocks(); });
    sdk.on('resume', () => { locks.platform = false; syncLocks(); });
    if (sdk.ui && sdk.ui.onViewportChange) sdk.ui.onViewportChange(() => view && view.resize());
    else window.addEventListener('resize', () => view && view.resize());
    await loadProgress();
    if (platformMuted) soundOn = false;
    updateSoundButton();
    if (view) view.resize();
    refreshBoard();
    clearInterval(pollTimer);
    pollTimer = setInterval(refreshBoard, POLL_MS);
    requestAnimationFrame(frame);
  } catch (err) {
    console.error(err);
    els.hint.textContent = '初始化异常，请关闭后重试。';
  }
}

boot();
