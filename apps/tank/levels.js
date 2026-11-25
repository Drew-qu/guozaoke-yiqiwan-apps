/* 抛物线乐园 · 关卡 / 地图 / 天气配置（不进战斗引擎细节） */
(function (global) {
  'use strict';

  var WEATHER = {
    calm: { id: 'calm', name: '晴朗', windAbs: 2, windMul: 1, tip: '风力微弱' },
    breeze: { id: 'breeze', name: '微风', windAbs: 5, windMul: 1, tip: '注意风向' },
    gale: { id: 'gale', name: '强风', windAbs: 9, windMul: 1.25, tip: '弧线会被明显吹偏' },
    storm: { id: 'storm', name: '狂风', windAbs: 11, windMul: 1.4, tip: '每回合风力剧烈变化' },
    ice: { id: 'ice', name: '冰霜', windAbs: 4, windMul: 1, slip: 1.55, tip: '移动会打滑' },
    toxic: { id: 'toxic', name: '迷雾', windAbs: 3, windMul: 1, toxicDps: 8, tip: '低洼处持续掉体力' }
  };

  var MAPS = {
    hills: { id: 'hills', name: '连绵丘陵', terrain: 2, palette: 'grass' },
    arch: { id: 'arch', name: '拱桥峡谷', terrain: 0, palette: 'grass' },
    islands: { id: 'islands', name: '浮空群岛', terrain: 1, palette: 'grass' },
    canyon: { id: 'canyon', name: '深谷', terrain: 2, palette: 'canyon', relief: 1.35 },
    desert: { id: 'desert', name: '沙漠', terrain: 2, palette: 'desert', relief: 0.55 },
    frost: { id: 'frost', name: '冰雪峡谷', terrain: 2, palette: 'ice', relief: 1.25 },
    frostArch: { id: 'frostArch', name: '冰桥', terrain: 0, palette: 'ice', relief: 1.1 },
    lava: { id: 'lava', name: '熔岩台地', terrain: 0, palette: 'lava', relief: 1.1 },
    lavaHills: { id: 'lavaHills', name: '熔岩丘陵', terrain: 2, palette: 'lava', relief: 0.95 }
  };

  var LEVELS = [
    // —— 第一章 · 绿色丘陵（1–10）——
    { id: 'c1l01', chapter: 1, name: '初识抛物线', map: 'hills', weather: 'calm', enemies: 1, hpScale: 0.72, maxTurns: 8, seedSalt: 'intro' },
    { id: 'c1l02', chapter: 1, name: '微风试抛', map: 'hills', weather: 'breeze', enemies: 1, hpScale: 0.8, maxTurns: 8, seedSalt: 'breeze' },
    { id: 'c1l03', chapter: 1, name: '拱桥落差', map: 'arch', weather: 'calm', enemies: 1, hpScale: 0.85, maxTurns: 9, seedSalt: 'arch' },
    { id: 'c1l04', chapter: 1, name: '双影丘陵', map: 'hills', weather: 'breeze', enemies: 2, hpScale: 0.82, maxTurns: 12, seedSalt: 'twin' },
    { id: 'c1l05', chapter: 1, name: '浮空试炼', map: 'islands', weather: 'calm', enemies: 2, hpScale: 0.88, maxTurns: 12, seedSalt: 'isle' },
    { id: 'c1l06', chapter: 1, name: '穿洞落点', map: 'arch', weather: 'breeze', enemies: 2, hpScale: 0.92, maxTurns: 12, seedSalt: 'tunnel' },
    { id: 'c1l07', chapter: 1, name: '强风丘陵', map: 'hills', weather: 'gale', enemies: 2, hpScale: 0.95, maxTurns: 13, seedSalt: 'gale' },
    { id: 'c1l08', chapter: 1, name: '三岛合围', map: 'islands', weather: 'breeze', enemies: 3, hpScale: 0.9, maxTurns: 14, seedSalt: 'tri' },
    { id: 'c1l09', chapter: 1, name: '精英守点', map: 'canyon', weather: 'gale', enemies: 3, hpScale: 1.05, maxTurns: 15, seedSalt: 'elite', elite: true },
    {
      id: 'c1l10', chapter: 1, name: '岩石巨兽', map: 'canyon', weather: 'breeze', enemies: 1, hpScale: 1.55, maxTurns: 18, seedSalt: 'boss',
      boss: {
        id: 'rock_beast', name: '岩石巨兽', classKey: 'cannon',
        phases: [
          { hp: 1.0, label: '磐石', ai: 'tactical' },
          { hp: 0.7, label: '落石', ai: 'boss', quake: true },
          { hp: 0.35, label: '盛怒', ai: 'boss', berserk: true, weakness: 1.28 }
        ]
      }
    },

    // —— 第二章 · 浮空与狂风（11–20）——
    { id: 'c2l01', chapter: 2, name: '群岛初航', map: 'islands', weather: 'calm', enemies: 2, hpScale: 0.95, maxTurns: 12, seedSalt: 'c2a' },
    { id: 'c2l02', chapter: 2, name: '悬空对抛', map: 'islands', weather: 'breeze', enemies: 2, hpScale: 1.0, maxTurns: 13, seedSalt: 'c2b' },
    { id: 'c2l03', chapter: 2, name: '狂风群岛', map: 'islands', weather: 'storm', enemies: 2, hpScale: 1.02, maxTurns: 13, seedSalt: 'c2c' },
    { id: 'c2l04', chapter: 2, name: '迷雾洼地', map: 'canyon', weather: 'toxic', enemies: 2, hpScale: 1.05, maxTurns: 14, seedSalt: 'c2d' },
    { id: 'c2l05', chapter: 2, name: '冰脊滑移', map: 'hills', weather: 'ice', enemies: 2, hpScale: 1.05, maxTurns: 14, seedSalt: 'c2e' },
    { id: 'c2l06', chapter: 2, name: '沙漠试风', map: 'desert', weather: 'gale', enemies: 2, hpScale: 1.08, maxTurns: 14, seedSalt: 'c2f' },
    { id: 'c2l07', chapter: 2, name: '沙尘合围', map: 'desert', weather: 'storm', enemies: 3, hpScale: 1.05, maxTurns: 15, seedSalt: 'c2g' },
    { id: 'c2l08', chapter: 2, name: '熔岩桥', map: 'lava', weather: 'breeze', enemies: 2, hpScale: 1.12, maxTurns: 15, seedSalt: 'c2h', erupt: true },
    { id: 'c2l09', chapter: 2, name: '天空卫队', map: 'islands', weather: 'gale', enemies: 3, hpScale: 1.15, maxTurns: 16, seedSalt: 'c2i', elite: true },
    {
      id: 'c2l10', chapter: 2, name: '天空守卫', map: 'islands', weather: 'storm', enemies: 1, hpScale: 1.7, maxTurns: 18, seedSalt: 'c2boss',
      boss: {
        id: 'sky_guard', name: '天空守卫', classKey: 'meteor',
        phases: [
          { hp: 1.0, label: '巡航', ai: 'sniper' },
          { hp: 0.65, label: '横扫', ai: 'aggressive' },
          { hp: 0.3, label: '锁定', ai: 'boss', berserk: true, weakness: 1.22 }
        ]
      }
    },

    // —— 第三章 · 沙漠狂风（21–30）——
    { id: 'c3l01', chapter: 3, name: '沙丘初遇', map: 'desert', weather: 'calm', enemies: 2, hpScale: 1.05, maxTurns: 12, seedSalt: 'c3a' },
    { id: 'c3l02', chapter: 3, name: '热风侧移', map: 'desert', weather: 'breeze', enemies: 2, hpScale: 1.08, maxTurns: 13, seedSalt: 'c3b' },
    { id: 'c3l03', chapter: 3, name: '沙脊双影', map: 'desert', weather: 'gale', enemies: 2, hpScale: 1.1, maxTurns: 13, seedSalt: 'c3c' },
    { id: 'c3l04', chapter: 3, name: '峡谷伏沙', map: 'canyon', weather: 'breeze', enemies: 2, hpScale: 1.12, maxTurns: 14, seedSalt: 'c3d' },
    { id: 'c3l05', chapter: 3, name: '三方沙影', map: 'desert', weather: 'gale', enemies: 3, hpScale: 1.08, maxTurns: 15, seedSalt: 'c3e' },
    { id: 'c3l06', chapter: 3, name: '沙尘走廊', map: 'desert', weather: 'storm', enemies: 2, hpScale: 1.15, maxTurns: 14, seedSalt: 'c3f' },
    { id: 'c3l07', chapter: 3, name: '迷沙洼地', map: 'desert', weather: 'toxic', enemies: 2, hpScale: 1.15, maxTurns: 15, seedSalt: 'c3g' },
    { id: 'c3l08', chapter: 3, name: '狂风合围', map: 'canyon', weather: 'storm', enemies: 3, hpScale: 1.12, maxTurns: 16, seedSalt: 'c3h' },
    { id: 'c3l09', chapter: 3, name: '沙丘精英', map: 'desert', weather: 'gale', enemies: 3, hpScale: 1.22, maxTurns: 16, seedSalt: 'c3i', elite: true },
    {
      id: 'c3l10', chapter: 3, name: '沙海巨蜥', map: 'desert', weather: 'storm', enemies: 1, hpScale: 1.85, maxTurns: 18, seedSalt: 'c3boss',
      boss: {
        id: 'sand_wyrm', name: '沙海巨蜥', classKey: 'cross',
        phases: [
          { hp: 1.0, label: '潜沙', ai: 'tactical' },
          { hp: 0.65, label: '沙尘', ai: 'aggressive' },
          { hp: 0.3, label: '疾冲', ai: 'boss', berserk: true, weakness: 1.25 }
        ]
      }
    },

    // —— 第四章 · 冰雪峡谷（31–40）——
    { id: 'c4l01', chapter: 4, name: '初入冰谷', map: 'frost', weather: 'calm', enemies: 2, hpScale: 1.1, maxTurns: 13, seedSalt: 'c4a' },
    { id: 'c4l02', chapter: 4, name: '霜面打滑', map: 'frost', weather: 'ice', enemies: 2, hpScale: 1.12, maxTurns: 13, seedSalt: 'c4b' },
    { id: 'c4l03', chapter: 4, name: '冰桥对望', map: 'frostArch', weather: 'breeze', enemies: 2, hpScale: 1.14, maxTurns: 14, seedSalt: 'c4c' },
    { id: 'c4l04', chapter: 4, name: '寒风合围', map: 'frost', weather: 'gale', enemies: 2, hpScale: 1.16, maxTurns: 14, seedSalt: 'c4d' },
    { id: 'c4l05', chapter: 4, name: '三线冰脊', map: 'frost', weather: 'ice', enemies: 3, hpScale: 1.12, maxTurns: 15, seedSalt: 'c4e' },
    { id: 'c4l06', chapter: 4, name: '冰桥裂隙', map: 'frostArch', weather: 'ice', enemies: 2, hpScale: 1.18, maxTurns: 15, seedSalt: 'c4f' },
    { id: 'c4l07', chapter: 4, name: '大风雪', map: 'frost', weather: 'storm', enemies: 3, hpScale: 1.15, maxTurns: 16, seedSalt: 'c4g' },
    { id: 'c4l08', chapter: 4, name: '迷雾寒谷', map: 'canyon', weather: 'toxic', enemies: 2, hpScale: 1.2, maxTurns: 15, seedSalt: 'c4h' },
    { id: 'c4l09', chapter: 4, name: '霜卫精英', map: 'frost', weather: 'gale', enemies: 3, hpScale: 1.28, maxTurns: 16, seedSalt: 'c4i', elite: true },
    {
      id: 'c4l10', chapter: 4, name: '霜晶巨像', map: 'frostArch', weather: 'storm', enemies: 1, hpScale: 1.95, maxTurns: 18, seedSalt: 'c4boss',
      boss: {
        id: 'frost_colossus', name: '霜晶巨像', classKey: 'cannon',
        phases: [
          { hp: 1.0, label: '封冻', ai: 'defensive' },
          { hp: 0.6, label: '裂冰', ai: 'tactical', quake: true },
          { hp: 0.28, label: '崩碎', ai: 'boss', berserk: true, weakness: 1.3 }
        ]
      }
    },

    // —— 第五章 · 熔岩地带（41–50）——
    { id: 'c5l01', chapter: 5, name: '熔岩边缘', map: 'lavaHills', weather: 'breeze', enemies: 2, hpScale: 1.15, maxTurns: 13, seedSalt: 'c5a', erupt: true },
    { id: 'c5l02', chapter: 5, name: '灼热台地', map: 'lava', weather: 'calm', enemies: 2, hpScale: 1.18, maxTurns: 14, seedSalt: 'c5b', erupt: true },
    { id: 'c5l03', chapter: 5, name: '喷发试炼', map: 'lavaHills', weather: 'gale', enemies: 2, hpScale: 1.2, maxTurns: 14, seedSalt: 'c5c', erupt: true },
    { id: 'c5l04', chapter: 5, name: '熔桥合围', map: 'lava', weather: 'breeze', enemies: 3, hpScale: 1.16, maxTurns: 15, seedSalt: 'c5d', erupt: true },
    { id: 'c5l05', chapter: 5, name: '热浪狂风', map: 'lavaHills', weather: 'storm', enemies: 2, hpScale: 1.22, maxTurns: 15, seedSalt: 'c5e', erupt: true },
    { id: 'c5l06', chapter: 5, name: '硫磺迷雾', map: 'lava', weather: 'toxic', enemies: 2, hpScale: 1.22, maxTurns: 15, seedSalt: 'c5f', erupt: true },
    { id: 'c5l07', chapter: 5, name: '三焰围攻', map: 'lavaHills', weather: 'gale', enemies: 3, hpScale: 1.2, maxTurns: 16, seedSalt: 'c5g', erupt: true },
    { id: 'c5l08', chapter: 5, name: '岩浆拱门', map: 'lava', weather: 'storm', enemies: 3, hpScale: 1.25, maxTurns: 16, seedSalt: 'c5h', erupt: true },
    { id: 'c5l09', chapter: 5, name: '炎卫精英', map: 'lavaHills', weather: 'gale', enemies: 3, hpScale: 1.35, maxTurns: 17, seedSalt: 'c5i', elite: true, erupt: true },
    {
      id: 'c5l10', chapter: 5, name: '熔核领主', map: 'lava', weather: 'storm', enemies: 1, hpScale: 2.1, maxTurns: 20, seedSalt: 'c5boss', erupt: true,
      boss: {
        id: 'magma_lord', name: '熔核领主', classKey: 'dragon',
        phases: [
          { hp: 1.0, label: '熔流', ai: 'tactical' },
          { hp: 0.62, label: '喷发', ai: 'aggressive', quake: true },
          { hp: 0.28, label: '熔核', ai: 'boss', berserk: true, weakness: 1.32 }
        ]
      }
    }
  ];

  var CHAPTER_META = {
    1: { name: '第一章 · 绿色丘陵', short: '丘陵', range: [1, 10] },
    2: { name: '第二章 · 浮空与狂风', short: '浮空', range: [11, 20] },
    3: { name: '第三章 · 沙漠狂风', short: '沙漠', range: [21, 30] },
    4: { name: '第四章 · 冰雪峡谷', short: '冰雪', range: [31, 40] },
    5: { name: '第五章 · 熔岩地带', short: '熔岩', range: [41, 50] }
  };

  function getLevel(index1) {
    var i = Math.max(0, Math.min(LEVELS.length - 1, (index1 || 1) - 1));
    return LEVELS[i];
  }

  function resolveLevel(raw) {
    if (!raw) return null;
    var map = MAPS[raw.map] || MAPS.hills;
    var weather = WEATHER[raw.weather] || WEATHER.calm;
    return {
      id: raw.id,
      chapter: raw.chapter || 1,
      name: raw.name,
      map: map,
      weather: weather,
      terrain: map.terrain,
      enemies: raw.enemies || 1,
      hpScale: raw.hpScale != null ? raw.hpScale : 1,
      maxTurns: raw.maxTurns || 12,
      seedSalt: raw.seedSalt || raw.id,
      elite: !!raw.elite,
      boss: raw.boss || null,
      erupt: !!raw.erupt,
      windAbs: weather.windAbs
    };
  }

  function listBossIndexes() {
    var out = [];
    for (var i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].boss) out.push(i + 1);
    }
    return out;
  }

  function listChapters() {
    return Object.keys(CHAPTER_META).map(Number).sort(function (a, b) { return a - b; });
  }

  global.ParabolaLevels = {
    WEATHER: WEATHER,
    MAPS: MAPS,
    LEVELS: LEVELS,
    CHAPTER_META: CHAPTER_META,
    total: LEVELS.length,
    getLevel: getLevel,
    resolve: resolveLevel,
    listBossIndexes: listBossIndexes,
    listChapters: listChapters,
    chapterOf: function (index1) {
      var lv = getLevel(index1);
      return lv ? lv.chapter : 1;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
