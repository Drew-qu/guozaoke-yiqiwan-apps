import * as THREE from './vendor/three.module.min.js';
import { SPEC } from './logic.js';

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _cam = new THREE.Vector3();
const _look = new THREE.Vector3();
const _lookCur = new THREE.Vector3();

function phong(color, extra) {
  // 街机向 PBR：比 Phong 更有体积与边缘高光，仍兼容 vertexColors
  const opt = Object.assign({
    color,
    metalness: 0.28,
    roughness: 0.46,
    emissive: new THREE.Color(0x0b1016),
    flatShading: false
  }, extra || {});
  if (opt.shininess != null) {
    opt.roughness = Math.max(0.12, 1 - opt.shininess / 120);
    delete opt.shininess;
  }
  if (opt.specular) delete opt.specular;
  return new THREE.MeshStandardMaterial(opt);
}

function Builder() {
  this.pos = [];
  this.col = [];
  this.idx = [];
}

Builder.prototype.vertCount = function () { return this.pos.length / 3; };

Builder.prototype.v = function (x, y, z, color) {
  this.pos.push(x, y, z);
  this.col.push(color[0], color[1], color[2]);
  return this.vertCount() - 1;
};

Builder.prototype.tri = function (a, b, c) {
  this.idx.push(a, b, c);
};

Builder.prototype.flip = function (start, end) {
  const stop = end == null ? this.idx.length : end;
  for (let i = start; i < stop; i += 3) {
    const swap = this.idx[i + 1];
    this.idx[i + 1] = this.idx[i + 2];
    this.idx[i + 2] = swap;
  }
};

Builder.prototype.geometry = function (withColor) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos.slice(), 3));
  if (withColor !== false) geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col.slice(), 3));
  geo.setIndex(this.idx.slice());
  geo.computeVertexNormals();
  return geo;
};

function chineRing(hw, hh, lift, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    let x = Math.sin(ang);
    let y = Math.cos(ang);
    // 折线棱 + 微圆角：上表面更扁、下表面收窄，避免椭圆「香肠」
    const sharp = y >= 0 ? 0.42 : 0.62;
    x = Math.sign(x) * Math.pow(Math.abs(x), sharp) * hw;
    const py = y >= 0 ? 0.78 : 0.48;
    y = Math.sign(y) * Math.pow(Math.abs(y), py) * hh;
    if (y < 0) y *= 0.55;
    else y *= 0.92;
    pts.push([x, y + lift]);
  }
  return pts;
}

function fuseTone(x, y, z, hw, lift, pal) {
  if (z > pal.noseZ) return pal.radome;
  if (Math.abs(x) > hw * 0.84) return pal.chine;
  if (y < lift - 0.01) return pal.belly;
  return pal.upper;
}

function addLoft(b, sections, pal, segs) {
  const stations = sections.map((s) => ({
    z: s[3],
    hw: s[0],
    lift: s[2],
    ring: chineRing(s[0], s[1], s[2], segs)
  }));
  const n = segs;
  const rows = stations.map((st) => st.ring.map((p) => (
    b.v(p[0], p[1], st.z, fuseTone(p[0], p[1], st.z, st.hw, st.lift, pal))
  )));
  for (let s = 0; s < stations.length - 1; s++) {
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      const a = rows[s][i];
      const d = rows[s][i2];
      const c = rows[s + 1][i];
      const e = rows[s + 1][i2];
      b.tri(a, d, c);
      b.tri(d, e, c);
    }
  }
  const nose = stations[0];
  const noseI = b.v(0, nose.ring[0][1] * 0.2, nose.z + 0.06, pal.radome);
  for (let i = 0; i < n; i++) {
    b.tri(noseI, rows[0][(i + 1) % n], rows[0][i]);
  }
  const tail = stations[stations.length - 1];
  const tailI = b.v(0, tail.lift, tail.z - 0.05, pal.belly);
  const last = rows[rows.length - 1];
  for (let i = 0; i < n; i++) b.tri(tailI, last[i], last[(i + 1) % n]);
}

function radialScore(geo) {
  const p = geo.attributes.position;
  const nr = geo.attributes.normal;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const rad = Math.hypot(x, y);
    if (rad < 0.18) continue;
    sum += (x * nr.getX(i) + y * nr.getY(i)) / rad;
    count++;
  }
  return count ? sum / count : 1;
}

// 更密的翼型采样（近似层流前缘 + 收薄后缘），观感不再像「刀片」
const CHORD_U = [0, 0.015, 0.04, 0.08, 0.14, 0.22, 0.32, 0.44, 0.56, 0.68, 0.78, 0.86, 0.92, 0.96, 0.985, 1];
const CHORD_T = [0.02, 0.28, 0.55, 0.82, 0.98, 1, 0.96, 0.88, 0.76, 0.62, 0.48, 0.36, 0.24, 0.14, 0.07, 0.02];
const CHORD_C = [0, 0.02, 0.045, 0.07, 0.085, 0.09, 0.08, 0.06, 0.035, 0.01, -0.01, -0.03, -0.045, -0.055, -0.06, -0.065];

function addWing(b, stations, col, mirror) {
  const i0 = b.idx.length;
  const countS = stations.length;
  const countC = CHORD_U.length;
  const ids = [];
  for (let s = 0; s < countS; s++) {
    const st = stations[s];
    const row = [];
    const tipped = col.tip && Math.abs(st.x) >= col.tipAt;
    for (let c = 0; c < countC; c++) {
      const u = CHORD_U[c];
      const z = st.lead + (st.trail - st.lead) * u;
      const thick = st.thick * CHORD_T[c];
      const y = st.y + st.thick * CHORD_C[c];
      const top = tipped ? col.tip : (u < 0.06 ? col.le : col.upper);
      const bot = tipped ? col.tip : col.lower;
      row.push([b.v(st.x, y + thick, z, top), b.v(st.x, y - thick * 0.8, z, bot)]);
    }
    ids.push(row);
  }
  for (let s = 0; s < countS - 1; s++) {
    for (let c = 0; c < countC - 1; c++) {
      const a = ids[s][c];
      const d = ids[s + 1][c];
      const e = ids[s + 1][c + 1];
      const f = ids[s][c + 1];
      b.tri(a[0], d[0], e[0]);
      b.tri(a[0], e[0], f[0]);
      b.tri(a[1], e[1], d[1]);
      b.tri(a[1], f[1], e[1]);
    }
    const leA = ids[s][0];
    const leD = ids[s + 1][0];
    b.tri(leA[1], leD[1], leD[0]);
    b.tri(leA[1], leD[0], leA[0]);
    const teA = ids[s][countC - 1];
    const teD = ids[s + 1][countC - 1];
    b.tri(teA[0], teD[0], teD[1]);
    b.tri(teA[0], teD[1], teA[1]);
  }
  const tip = ids[countS - 1];
  const root = ids[0];
  for (let c = 0; c < countC - 1; c++) {
    b.tri(tip[c][0], tip[c][1], tip[c + 1][1]);
    b.tri(tip[c][0], tip[c + 1][1], tip[c + 1][0]);
    b.tri(root[c][0], root[c + 1][1], root[c][1]);
    b.tri(root[c][0], root[c + 1][0], root[c + 1][1]);
  }
  if (mirror) b.flip(i0);
}

function mirrorWing(stations) {
  return stations.map((st) => ({ x: -st.x, y: st.y, lead: st.lead, trail: st.trail, thick: st.thick }));
}

function addPair(b, stations, col) {
  addWing(b, stations, col, false);
  addWing(b, mirrorWing(stations), col, true);
}

function stitchRings(b, rows, inward) {
  const n = rows[0].length;
  for (let s = 0; s < rows.length - 1; s++) {
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      const a = rows[s][i];
      const d = rows[s][i2];
      const c = rows[s + 1][i];
      const e = rows[s + 1][i2];
      if (inward) {
        b.tri(a, c, d);
        b.tri(d, c, e);
      } else {
        b.tri(a, d, c);
        b.tri(d, e, c);
      }
    }
  }
}

function addNacelle(b, rings, color, reversed) {
  const n = 18;
  const rows = rings.map((ring) => {
    const ids = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const yScale = ring.flat || 0.86;
      ids.push(b.v(
        ring.x + Math.sin(ang) * ring.r,
        ring.y + Math.cos(ang) * ring.r * yScale,
        ring.z,
        color
      ));
    }
    return ids;
  });
  stitchRings(b, rows, reversed);
}

function transformFin(b, vStart, cant, ox, oy) {
  const c = Math.cos(cant);
  const s = Math.sin(cant);
  const count = b.vertCount();
  for (let i = vStart; i < count; i++) {
    const x = b.pos[i * 3];
    const y = b.pos[i * 3 + 1];
    b.pos[i * 3] = ox + y * c + x * s;
    b.pos[i * 3 + 1] = oy - y * s + x * c;
  }
}

function addSingleFin(b, spec, col) {
  const v0 = b.vertCount();
  addWing(b, spec.stations, col, false);
  transformFin(b, v0, 0.02, spec.ox, spec.oy);
}

function addFins(b, spec, col) {
  const v0 = b.vertCount();
  addWing(b, spec.stations, col, false);
  transformFin(b, v0, spec.cant, spec.ox, spec.oy);
  const v1 = b.vertCount();
  const i1 = b.idx.length;
  addWing(b, spec.stations, col, false);
  transformFin(b, v1, spec.cant, spec.ox, spec.oy);
  const count = b.vertCount();
  for (let i = v1; i < count; i++) b.pos[i * 3] *= -1;
  b.flip(i1);
  if (col.tip) {
    for (let i = v0; i < count; i++) {
      if (b.pos[i * 3 + 1] > spec.flashY) {
        b.col[i * 3] = col.tip[0];
        b.col[i * 3 + 1] = col.tip[1];
        b.col[i * 3 + 2] = col.tip[2];
      }
    }
  }
}

function bubbleStations(zNose, zTail, y, rx, ry, count) {
  const stations = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const arch = Math.sin(t * Math.PI);
    stations.push({
      z: zNose + (zTail - zNose) * t,
      rx: Math.max(0.025, rx * Math.pow(arch, 0.8)),
      ry: Math.max(0.02, ry * Math.pow(arch, 0.85)),
      y
    });
  }
  return stations;
}

function addCanopy(group, mat, tubMat, stations) {
  const b = new Builder();
  const seg = 18;
  const rows = stations.map((st) => {
    const row = [];
    for (let i = 0; i <= seg; i++) {
      const ang = Math.PI - (i / seg) * Math.PI;
      row.push(b.v(Math.cos(ang) * st.rx, Math.sin(ang) * st.ry + st.y, st.z, [1, 1, 1]));
    }
    return row;
  });
  for (let s = 0; s < rows.length - 1; s++) {
    for (let i = 0; i < seg; i++) {
      const a = rows[s][i];
      const d = rows[s][i + 1];
      const c = rows[s + 1][i];
      const e = rows[s + 1][i + 1];
      b.tri(a, d, c);
      b.tri(d, e, c);
    }
  }
  const glass = new THREE.Mesh(b.geometry(false), mat);
  group.add(glass);
  const mid = stations[Math.floor(stations.length / 2)];
  const len = Math.abs(stations[0].z - stations[stations.length - 1].z);
  const tub = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), tubMat);
  tub.scale.set((mid.rx / 0.22) * 0.82, (mid.ry / 0.22) * 0.62, (len * 0.36) / 0.22);
  tub.position.set(0, mid.y + mid.ry * 0.2, mid.z);
  group.add(tub);
  return glass;
}

function addIntake(group, mats, spec) {
  const holder = new THREE.Group();
  holder.position.set(spec.x, spec.y, spec.z);
  holder.rotation.y = spec.x > 0 ? -0.28 : 0.28;
  holder.scale.set(1.2, 0.52, 1);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(spec.r, spec.r * 0.2, 8, 20), mats.lip);
  holder.add(lip);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(spec.r * 0.76, 18), mats.hole);
  hole.position.z = -0.01;
  holder.add(hole);
  const duct = new THREE.Mesh(new THREE.CylinderGeometry(spec.r * 0.62, spec.r * 0.78, 0.42, 14), mats.dark);
  duct.rotation.x = Math.PI / 2;
  duct.position.z = -0.22;
  holder.add(duct);
  group.add(holder);
  const bump = new THREE.Mesh(new THREE.SphereGeometry(spec.bump, 18, 12), mats.bump);
  bump.scale.set(0.48, 0.22, 0.95);
  bump.position.set(spec.x * 0.78, spec.y + spec.bump * 0.08, spec.z + 0.16);
  group.add(bump);
}

function addNozzle(group, mats, x, y, z, r) {
  const b = new Builder();
  const n = 20;
  const white = [1, 1, 1];
  function ring(z0, radius, star) {
    const ids = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const m = star ? (i % 2 === 0 ? 1.1 : 0.66) : 1;
      ids.push(b.v(Math.cos(ang) * radius * m, Math.sin(ang) * radius * m, z0, white));
    }
    return ids;
  }
  stitchRings(b, [ring(0, r, false), ring(-0.22, r * 0.9, false), ring(-0.48, r * 0.98, true)], false);
  stitchRings(b, [ring(-0.02, r * 0.58, false), ring(-0.46, r * 0.4, false)], true);
  const throat = b.v(0, 0, -0.44, white);
  const back = ring(-0.46, r * 0.4, false);
  for (let i = 0; i < n; i++) b.tri(throat, back[i], back[(i + 1) % n]);
  const mesh = new THREE.Mesh(b.geometry(false), mats.metal);
  mesh.position.set(x, y, z);
  group.add(mesh);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(r * 0.48, r * 3.1, 10), mats.flame);
  flame.position.set(x, y, z - 0.85);
  flame.rotation.x = -Math.PI / 2;
  group.add(flame);
  const glow = new THREE.Mesh(new THREE.ConeGeometry(r * 0.85, r * 4.4, 8), mats.glow);
  glow.position.set(x, y, z - 0.95);
  glow.rotation.x = -Math.PI / 2;
  group.add(glow);
  return [flame, glow];
}

function addMesh(group, geo, mat, x, y, z) {
  const mesh = new THREE.Mesh(geo, mat);
  if (x) mesh.position.set(x, y || 0, z || 0);
  else if (y || z) mesh.position.set(0, y || 0, z || 0);
  group.add(mesh);
  return mesh;
}

const AIR = {
  j20: {
    upper: [0.16, 0.20, 0.28],
    belly: [0.30, 0.36, 0.46],
    chine: [0.48, 0.60, 0.68],
    radome: [0.11, 0.14, 0.18],
    noseZ: 3.95,
    canard: [0.18, 0.48, 0.52],
    le: [0.72, 0.86, 0.92],
    tail: [0.13, 0.16, 0.22],
    upperHex: 0x2a3448,
    canopy: 0x6ec4e8,
    canopyEmit: 0x142838,
    flame: 0x8ef7ff,
    glow: 0xc8fbff,
    light: 0x39e7ff
  },
  f35: {
    upper: [0.70, 0.75, 0.80],
    belly: [0.86, 0.89, 0.92],
    chine: [0.52, 0.57, 0.62],
    radome: [0.42, 0.46, 0.50],
    noseZ: 2.85,
    canard: [0.70, 0.75, 0.80],
    le: [0.32, 0.36, 0.40],
    tail: [0.58, 0.63, 0.68],
    tip: [0.82, 0.32, 0.16],
    upperHex: 0xb7c0c8,
    canopy: 0x9fd4ee,
    canopyEmit: 0x163040,
    flame: 0xffb15a,
    glow: 0xffd2a4,
    light: 0xff7a3c
  }
};

export function buildAircraft(kind) {
  const group = new THREE.Group();
  const j20 = kind === 'j20';
  const pal = j20 ? AIR.j20 : AIR.f35;
  const skinMat = phong(0xffffff, {
    vertexColors: true,
    transparent: true,
    opacity: 1,
    metalness: 0.42,
    roughness: 0.34,
    emissive: new THREE.Color(j20 ? 0x10161e : 0x1a1e22)
  });
  const bumpMat = phong(pal.upperHex, {
    transparent: true,
    opacity: 1,
    metalness: 0.38,
    roughness: 0.4,
    emissive: new THREE.Color(j20 ? 0x10161e : 0x1a1e22)
  });
  const dark = phong(0x14181e, { transparent: true, opacity: 1, metalness: 0.55, roughness: 0.55 });
  const lip = phong(j20 ? 0x1c2832 : 0x8e99a3, { transparent: true, opacity: 1, metalness: 0.5, roughness: 0.38 });
  const hole = new THREE.MeshBasicMaterial({ color: 0x07080a, transparent: true, opacity: 1 });
  const metal = phong(0x2c333a, {
    transparent: true,
    opacity: 1,
    metalness: 0.72,
    roughness: 0.28,
    emissive: new THREE.Color(0x101418)
  });
  const canopyMat = phong(pal.canopy, {
    transparent: true,
    opacity: 0.62,
    metalness: 0.05,
    roughness: 0.12,
    emissive: new THREE.Color(pal.canopyEmit)
  });
  const flameMat = new THREE.MeshBasicMaterial({ color: pal.flame });
  const glowMat = new THREE.MeshBasicMaterial({
    color: pal.glow,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const hot = new THREE.MeshBasicMaterial({ color: pal.light });
  const mats = {
    dark, lip, hole, bump: bumpMat, metal, flame: flameMat, glow: glowMat
  };

  const skin = new Builder();
  const body = j20
    ? [
      [0.01, 0.022, 0.01, 4.82],
      [0.05, 0.07, 0.03, 4.55],
      [0.1, 0.11, 0.045, 4.25],
      [0.18, 0.17, 0.055, 3.9],
      [0.28, 0.22, 0.05, 3.5],
      [0.4, 0.28, 0.045, 3.05],
      [0.54, 0.34, 0.035, 2.55],
      [0.7, 0.38, 0.02, 2.0],
      [0.88, 0.4, 0.005, 1.4],
      [1.0, 0.4, -0.01, 0.75],
      [1.06, 0.38, -0.02, 0.1],
      [1.02, 0.36, -0.02, -0.45],
      [0.9, 0.32, -0.01, -0.95],
      [0.72, 0.28, 0.0, -1.4],
      [0.52, 0.22, 0.015, -1.85],
      [0.34, 0.17, 0.03, -2.28]
    ]
    : [
      // 短钝机头、粗机身、单发收尾（对照长机头双发）
      [0.08, 0.1, 0.04, 2.55],
      [0.28, 0.22, 0.07, 2.15],
      [0.52, 0.38, 0.08, 1.6],
      [0.78, 0.5, 0.06, 0.95],
      [0.95, 0.54, 0.04, 0.25],
      [0.92, 0.5, 0.02, -0.4],
      [0.7, 0.4, 0.02, -1.05],
      [0.42, 0.28, 0.04, -1.65]
    ];
  addLoft(skin, body, pal, 32);
  let reversed = false;
  if (radialScore(skin.geometry()) < 0) {
    skin.flip(0);
    reversed = true;
  }

  const wingCol = { upper: pal.upper, lower: pal.belly, le: pal.le, tip: pal.tip, tipAt: j20 ? 99 : 2.45 };
  const main = j20
    ? [
      { x: 0.38, y: 0.05, lead: 1.78, trail: -1.38, thick: 0.125 },
      { x: 1.05, y: 0.02, lead: 1.2, trail: -1.45, thick: 0.105 },
      { x: 1.85, y: -0.02, lead: 0.55, trail: -1.5, thick: 0.082 },
      { x: 2.65, y: -0.08, lead: 0.0, trail: -1.48, thick: 0.06 },
      { x: 3.35, y: -0.14, lead: -0.38, trail: -1.4, thick: 0.042 },
      { x: 3.95, y: -0.19, lead: -0.68, trail: -1.26, thick: 0.028 },
      { x: 4.35, y: -0.23, lead: -0.88, trail: -1.08, thick: 0.016 }
    ]
    : [
      // 梯形翼：后掠比长三角小，翼根靠后
      { x: 0.45, y: 0.06, lead: 0.35, trail: -0.85, thick: 0.12 },
      { x: 1.15, y: 0.02, lead: 0.05, trail: -0.95, thick: 0.09 },
      { x: 1.9, y: -0.03, lead: -0.22, trail: -0.95, thick: 0.06 },
      { x: 2.55, y: -0.08, lead: -0.42, trail: -0.82, thick: 0.032 },
      { x: 2.95, y: -0.11, lead: -0.52, trail: -0.68, thick: 0.016 }
    ];
  addPair(skin, main, wingCol);

  if (j20) {
    addPair(skin, [
      { x: 0.28, y: 0.18, lead: 3.12, trail: 2.05, thick: 0.058 },
      { x: 0.85, y: 0.28, lead: 2.85, trail: 1.92, thick: 0.045 },
      { x: 1.45, y: 0.4, lead: 2.5, trail: 1.85, thick: 0.03 },
      { x: 2.05, y: 0.52, lead: 2.18, trail: 1.88, thick: 0.016 }
    ], { upper: pal.canard, lower: pal.canard, le: pal.le });
    addPair(skin, [
      { x: 0.04, y: 0.03, lead: -1.4, trail: -2.42, thick: 0.038 },
      { x: 0.22, y: 0.015, lead: -1.52, trail: -2.32, thick: 0.028 },
      { x: 0.4, y: 0.0, lead: -1.62, trail: -2.18, thick: 0.016 }
    ], wingCol);
    addNacelle(skin, [
      { x: 0.46, y: -0.03, z: -1.45, r: 0.16 },
      { x: 0.5, y: -0.04, z: -1.85, r: 0.24 },
      { x: 0.5, y: -0.045, z: -2.2, r: 0.28 },
      { x: 0.47, y: -0.03, z: -2.55, r: 0.24 },
      { x: 0.44, y: -0.02, z: -2.85, r: 0.18 }
    ], pal.upper, reversed);
    addNacelle(skin, [
      { x: -0.46, y: -0.03, z: -1.45, r: 0.16 },
      { x: -0.5, y: -0.04, z: -1.85, r: 0.24 },
      { x: -0.5, y: -0.045, z: -2.2, r: 0.28 },
      { x: -0.47, y: -0.03, z: -2.55, r: 0.24 },
      { x: -0.44, y: -0.02, z: -2.85, r: 0.18 }
    ], pal.upper, reversed);
  } else {
    addPair(skin, [
      { x: 0.2, y: 0.04, lead: -0.55, trail: -1.45, thick: 0.05 },
      { x: 0.7, y: 0.02, lead: -0.7, trail: -1.4, thick: 0.032 },
      { x: 1.15, y: 0.0, lead: -0.82, trail: -1.28, thick: 0.018 }
    ], wingCol);
    addNacelle(skin, [
      { x: 0, y: -0.02, z: -1.05, r: 0.28 },
      { x: 0, y: -0.03, z: -1.4, r: 0.38 },
      { x: 0, y: -0.02, z: -1.72, r: 0.32 }
    ], pal.tail, reversed);
  }

  const finCol = { upper: pal.tail, lower: pal.tail, le: pal.le, tip: pal.tip };
  if (j20) {
    addFins(skin, {
      cant: 0.62,
      ox: 0.28,
      oy: 0.12,
      flashY: 99,
      stations: [
        { x: 0.02, y: 0, lead: -0.85, trail: -2.15, thick: 0.07 },
        { x: 0.7, y: 0, lead: -1.15, trail: -2.28, thick: 0.05 },
        { x: 1.45, y: 0, lead: -1.45, trail: -2.38, thick: 0.03 },
        { x: 2.15, y: 0, lead: -1.7, trail: -2.42, thick: 0.012 }
      ]
    }, finCol);
  } else {
    addSingleFin(skin, {
      ox: 0,
      oy: 0.28,
      stations: [
        { x: 0.02, y: 0, lead: -0.35, trail: -1.55, thick: 0.07 },
        { x: 0.85, y: 0, lead: -0.55, trail: -1.62, thick: 0.05 },
        { x: 1.7, y: 0, lead: -0.78, trail: -1.55, thick: 0.028 },
        { x: 2.15, y: 0, lead: -0.95, trail: -1.35, thick: 0.012 }
      ]
    }, finCol);
  }

  const skinMesh = new THREE.Mesh(skin.geometry(), skinMat);
  group.add(skinMesh);

  addCanopy(
    group,
    canopyMat,
    dark,
    j20
      ? bubbleStations(2.65, 1.05, 0.38, 0.32, 0.42, 14)
      : bubbleStations(2.0, 0.65, 0.48, 0.38, 0.38, 14)
  );

  const intake = j20
    ? { x: 0.92, y: -0.02, z: 0.9, r: 0.21, bump: 0.36 }
    : { x: 0.72, y: 0.02, z: 1.18, r: 0.19, bump: 0.3 };
  addIntake(group, mats, intake);
  addIntake(group, mats, Object.assign({}, intake, { x: -intake.x }));

  const flames = [];
  if (j20) {
    flames.push(...addNozzle(group, mats, 0.48, -0.03, -2.82, 0.2));
    flames.push(...addNozzle(group, mats, -0.48, -0.03, -2.82, 0.2));
  } else {
    flames.push(...addNozzle(group, mats, 0, -0.02, -2.08, 0.33));
  }

  const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.016, j20 ? 0.58 : 0.34, 10), dark);
  pitot.rotation.x = Math.PI / 2;
  pitot.position.set(0, j20 ? 0.02 : 0.04, j20 ? 5.12 : 3.7);
  group.add(pitot);

  // 翼尖航行灯
  const span = j20 ? 4.2 : 2.9;
  const lightZ = j20 ? -0.95 : -0.55;
  const lightY = j20 ? -0.18 : -0.1;
  const tipR = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), hot);
  tipR.position.set(span, lightY, lightZ);
  group.add(tipR);
  const tipL = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff4d4d }));
  tipL.position.set(-span, lightY, lightZ);
  group.add(tipL);

  // 座舱框（两道环 + 细梁，贴合气泡盖）
  const frameY = j20 ? 0.52 : 0.56;
  const frames = j20
    ? [[2.55, 0.33], [1.95, 0.34], [1.35, 0.28]]
    : [[1.9, 0.36], [1.35, 0.37], [0.85, 0.3]];
  frames.forEach((fz) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(fz[1], 0.012, 5, 28, Math.PI * 0.92), dark);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, frameY, fz[0]);
    group.add(ring);
  });
  // 机腹整流鼓包（贴合机身，不伸出刺）
  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(j20 ? 0.28 : 0.32, 14, 10),
    bumpMat
  );
  belly.scale.set(0.55, 0.28, j20 ? 1.6 : 1.35);
  belly.position.set(0, j20 ? -0.18 : -0.24, j20 ? 0.35 : 0.15);
  group.add(belly);

  // 前缘条带感：两侧细金属棱
  const leMat = phong(j20 ? 0x8aa0b0 : 0x3a4048, { metalness: 0.65, roughness: 0.3 });
  [-1, 1].forEach((side) => {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.03, j20 ? 2.6 : 2.0),
      leMat
    );
    strip.position.set(side * (j20 ? 2.4 : 1.7), j20 ? -0.02 : 0.0, j20 ? 0.1 : -0.05);
    strip.rotation.y = side * 0.22;
    strip.rotation.z = side * -0.08;
    group.add(strip);
  });

  group.userData.skin = skinMesh;
  group.userData.mats = [skinMat, bumpMat, dark, lip, hole, metal, canopyMat, hot, leMat];
  group.userData.flames = flames;
  group.userData.kind = kind;
  return group;
}

/** 舰体横剖面：龙骨→舷→甲板边（半宽 ring，再镜像拼） */
function shipRing(halfBeam, keelY, deckY, flare, n) {
  const pts = [];
  const half = Math.max(4, Math.floor(n / 2));
  for (let i = 0; i <= half; i++) {
    const t = i / half;
    const ang = Math.PI * (0.08 + 0.84 * t);
    const x = Math.sin(ang) * halfBeam * (0.55 + 0.45 * Math.pow(t, 0.65));
    const y = keelY + (deckY - keelY) * (0.12 + 0.88 * Math.pow(Math.sin(t * Math.PI * 0.5), 1.15));
    const xf = x * (1 + flare * t * t);
    pts.push([xf, y]);
  }
  // 甲板横跨（略内收）
  const deckIn = halfBeam * (0.92 + flare * 0.2);
  pts.push([deckIn * 0.55, deckY + 0.02]);
  pts.push([0, deckY + 0.04]);
  // 镜像右舷（跳过中线点）
  const left = pts.slice();
  for (let i = pts.length - 2; i >= 0; i--) left.push([-pts[i][0], pts[i][1]]);
  return left;
}

function loftShipHull(stations, segs, hullCol, deckCol) {
  const b = new Builder();
  const rows = stations.map((st) => {
    const ring = shipRing(st.hw, st.keelY, st.deckY, st.flare || 0.08, segs);
    return ring.map((p, i) => {
      const onDeck = Math.abs(p[1] - st.deckY) < 0.08 && Math.abs(p[0]) < st.hw * 0.98;
      return b.v(p[0], p[1], st.z, onDeck ? deckCol : hullCol);
    });
  });
  const n = rows[0].length;
  for (let s = 0; s < rows.length - 1; s++) {
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      b.tri(rows[s][i], rows[s][i2], rows[s + 1][i]);
      b.tri(rows[s][i2], rows[s + 1][i2], rows[s + 1][i]);
    }
  }
  // 封闭艏艉
  const bow = stations[0];
  const tip = b.v(0, (bow.keelY + bow.deckY) * 0.55, bow.z - Math.max(0.35, bow.hw * 0.55), hullCol);
  for (let i = 0; i < n; i++) b.tri(tip, rows[0][(i + 1) % n], rows[0][i]);
  const stern = stations[stations.length - 1];
  const sternC = b.v(0, stern.keelY + (stern.deckY - stern.keelY) * 0.45, stern.z + 0.2, hullCol);
  const last = rows[rows.length - 1];
  for (let i = 0; i < n; i++) b.tri(sternC, last[i], last[(i + 1) % n]);
  const geo = b.geometry();
  if (radialScore(geo) < 0) {
    // 反转索引
    const idx = geo.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    geo.computeVertexNormals();
  }
  return geo;
}

function addGunMount(group, dark, metal, x, y, z, scale, markBarrel) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.scale.setScalar(scale || 1);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.28, 14), dark);
  g.add(base);
  const cupola = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), metal);
  cupola.position.y = 0.22;
  g.add(cupola);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 1.15, 10), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.28, -0.55);
  if (markBarrel) barrel.userData.barrel = true;
  g.add(barrel);
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.12, 8), metal);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, 0.28, -1.12);
  g.add(muzzle);
  group.add(g);
  return { group: g, barrel, base };
}

function buildEscort() {
  const group = new THREE.Group();
  const hullMat = phong(0xffffff, {
    vertexColors: true,
    shininess: 48,
    specular: new THREE.Color(0xb8d4dc),
    emissive: new THREE.Color(0x0a1c20)
  });
  const deckMat = phong(0xd5e0dc, { shininess: 28, emissive: new THREE.Color(0x1a2422) });
  const dark = phong(0x1a2228, { shininess: 22 });
  const metal = phong(0x3a4550, { shininess: 64, specular: new THREE.Color(0xe8eef2) });
  const glass = phong(0x7ec8e8, {
    transparent: true, opacity: 0.55, shininess: 90,
    emissive: new THREE.Color(0x123040)
  });
  const amber = new THREE.MeshBasicMaterial({ color: 0xffc14a });
  const hullCol = [0.22, 0.48, 0.52];
  const deckCol = [0.82, 0.88, 0.86];

  const stations = [
    { z: -4.55, hw: 0.12, keelY: 0.1, deckY: 0.62, flare: 0.01 },
    { z: -4.0, hw: 0.35, keelY: 0.04, deckY: 0.82, flare: 0.04 },
    { z: -3.35, hw: 0.62, keelY: 0.0, deckY: 0.95, flare: 0.07 },
    { z: -2.5, hw: 0.9, keelY: -0.03, deckY: 1.04, flare: 0.1 },
    { z: -1.4, hw: 1.02, keelY: -0.05, deckY: 1.08, flare: 0.12 },
    { z: -0.2, hw: 1.08, keelY: -0.06, deckY: 1.1, flare: 0.13 },
    { z: 1.0, hw: 1.05, keelY: -0.05, deckY: 1.08, flare: 0.12 },
    { z: 2.2, hw: 0.95, keelY: -0.02, deckY: 1.04, flare: 0.1 },
    { z: 3.2, hw: 0.72, keelY: 0.02, deckY: 0.98, flare: 0.07 },
    { z: 3.95, hw: 0.42, keelY: 0.08, deckY: 0.88, flare: 0.04 },
    { z: 4.45, hw: 0.18, keelY: 0.14, deckY: 0.74, flare: 0.015 }
  ];
  const hullMesh = new THREE.Mesh(loftShipHull(stations, 22, hullCol, deckCol), hullMat);
  group.add(hullMesh);

  // 主甲板铺板 + 舷墙
  addMesh(group, new THREE.BoxGeometry(1.62, 0.05, 6.0), deckMat, 0, 1.12, 0.0);
  addMesh(group, new THREE.BoxGeometry(0.05, 0.18, 5.4), dark, 0.78, 1.24, 0.05);
  addMesh(group, new THREE.BoxGeometry(0.05, 0.18, 5.4), dark, -0.78, 1.24, 0.05);
  // 舰桥分层
  addMesh(group, new THREE.BoxGeometry(0.98, 0.42, 1.45), dark, 0, 1.4, 0.55);
  addMesh(group, new THREE.BoxGeometry(0.82, 0.38, 1.05), metal, 0, 1.78, 0.45);
  addMesh(group, new THREE.BoxGeometry(0.7, 0.32, 0.72), phong(0x2a333a), 0, 2.1, 0.35);
  addMesh(group, new THREE.BoxGeometry(0.68, 0.22, 0.06), glass, 0, 1.95, -0.12);
  addMesh(group, new THREE.BoxGeometry(0.55, 0.16, 0.05), glass, 0, 2.2, -0.05);
  // 桅与雷达阵列
  addMesh(group, new THREE.CylinderGeometry(0.035, 0.05, 1.55, 10), dark, 0, 2.75, 0.5);
  addMesh(group, new THREE.BoxGeometry(0.35, 0.08, 0.08), metal, 0, 3.2, 0.5);
  const dish = addMesh(group, new THREE.CylinderGeometry(0.26, 0.26, 0.035, 16), metal, 0, 3.45, 0.5);
  dish.rotation.x = 0.55;
  addMesh(group, new THREE.SphereGeometry(0.06, 10, 8), amber, 0, 3.65, 0.5);

  const gun = addGunMount(group, dark, metal, 0, 1.18, -1.85, 1.0, true);
  addGunMount(group, dark, metal, 0, 1.18, 2.35, 0.72, false);
  // 烟囱组
  addMesh(group, new THREE.CylinderGeometry(0.14, 0.18, 0.62, 12), dark, -0.18, 1.58, 1.45);
  addMesh(group, new THREE.CylinderGeometry(0.14, 0.18, 0.62, 12), dark, 0.18, 1.58, 1.45);
  addMesh(group, new THREE.CylinderGeometry(0.1, 0.12, 0.16, 10), metal, -0.18, 1.95, 1.45);
  addMesh(group, new THREE.CylinderGeometry(0.1, 0.12, 0.16, 10), metal, 0.18, 1.95, 1.45);
  // 救生筏鼓包
  addMesh(group, new THREE.CapsuleGeometry(0.12, 0.35, 3, 8), phong(0xd8e6e2), 0.55, 1.28, 0.9);
  addMesh(group, new THREE.CapsuleGeometry(0.12, 0.35, 3, 8), phong(0xd8e6e2), -0.55, 1.28, 0.9);

  const wake = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 5.2),
    new THREE.MeshBasicMaterial({ color: 0xe8fff8, transparent: true, opacity: 0.3, depthWrite: false })
  );
  wake.rotation.x = -Math.PI / 2;
  wake.position.set(0, 0.16, 4.6);
  group.add(wake);
  group.userData.mats = [hullMat, deckMat, dark, metal, glass];
  group.userData.wake = wake;
  group.userData.barrel = gun.barrel;
  return group;
}

function buildCarrier() {
  const root = new THREE.Group();
  const hullMat = phong(0xffffff, {
    vertexColors: true,
    shininess: 36,
    specular: new THREE.Color(0xa8b4c0),
    emissive: new THREE.Color(0x0e141a)
  });
  const deckMat = phong(0x6a7580, { shininess: 18, emissive: new THREE.Color(0x1a2228) });
  const dark = phong(0x1e252c, { shininess: 20 });
  const metal = phong(0x3d4752, { shininess: 55, specular: new THREE.Color(0xdde6ee) });
  const chevMat = phong(0x35d0c4, { emissive: new THREE.Color(0x0c3c38) });
  const hullCol = [0.28, 0.34, 0.40];
  const deckCol = [0.45, 0.50, 0.55];

  const L = SPEC.carrier.length;
  const W = SPEC.carrier.width;
  const stations = [];
  const zs = [-L * 0.48, -L * 0.36, -L * 0.22, -L * 0.08, L * 0.08, L * 0.22, L * 0.36, L * 0.46];
  zs.forEach((z, i) => {
    const t = i / (zs.length - 1);
    const bowTaper = t < 0.18 ? (t / 0.18) : (t > 0.85 ? (1 - (t - 0.85) / 0.15) : 1);
    const hw = (W * 0.48) * (0.22 + 0.78 * Math.pow(Math.max(0.05, bowTaper), 0.55));
    stations.push({
      z,
      hw,
      keelY: -0.35 + (t > 0.9 ? 0.15 : 0),
      deckY: 2.05,
      flare: 0.14
    });
  });
  // 水线靴顶色带：在 loft 里用 deckCol/hullCol；额外加一条深色吃水
  const hullGeo = loftShipHull(stations, 28, hullCol, deckCol);
  const hull = new THREE.Mesh(hullGeo, hullMat);
  root.add(hull);
  // 吃水线装饰条
  addMesh(root, new THREE.BoxGeometry(W * 0.92, 0.12, L * 0.9), phong(0x14181c), 0, 0.55, 0.2);

  // 飞行甲板：略斜角 + 边缘
  const flight = addMesh(root, new THREE.BoxGeometry(W, 0.28, L), deckMat, 0, 2.22, 0);
  flight.rotation.y = -0.04;
  addMesh(root, new THREE.BoxGeometry(W * 0.98, 0.06, L * 0.98), phong(0x5a6570), 0, 2.38, 0).rotation.y = -0.04;
  // 跑道中线与人字
  for (let i = 0; i < 7; i++) {
    addMesh(root, new THREE.BoxGeometry(0.18, 0.04, 1.6), chevMat, 0.15, 2.42, -12 + i * 4.2);
  }
  for (let i = 0; i < 5; i++) {
    const chev = addMesh(root, new THREE.ConeGeometry(0.55, 1.2, 3), chevMat, 0.15, 2.44, -10 + i * 5);
    chev.rotation.x = Math.PI / 2;
    chev.rotation.z = Math.PI;
  }
  // 舷侧舷墙
  addMesh(root, new THREE.BoxGeometry(0.12, 0.45, L * 0.88), dark, W * 0.48, 2.55, 0.3);
  addMesh(root, new THREE.BoxGeometry(0.12, 0.45, L * 0.88), dark, -W * 0.48, 2.55, 0.3);

  const wake = new THREE.Mesh(
    new THREE.PlaneGeometry(7.2, 18),
    new THREE.MeshBasicMaterial({ color: 0xd9fff6, transparent: true, opacity: 0.24, depthWrite: false })
  );
  wake.rotation.x = -Math.PI / 2;
  wake.position.set(0, 0.18, L * 0.55 + 4);
  root.add(wake);

  const parts = {};
  function partGroup(id) {
    const spec = SPEC.carrier.parts[id];
    const g = new THREE.Group();
    g.position.set(spec.x, spec.y, spec.z);
    root.add(g);
    parts[id] = g;
    return g;
  }

  const port = partGroup('port');
  const star = partGroup('starboard');
  [port, star].forEach((g) => {
    const mount = addGunMount(g, dark, metal, 0, 0, 0, 1.35, false);
    g.userData.baseMat = mount.base.material;
  });

  const island = partGroup('island');
  const islandMat = phong(0xe2d8c8, { emissive: new THREE.Color(0x3a342c), shininess: 30 });
  // 分层舰岛
  addMesh(island, new THREE.BoxGeometry(2.6, 1.1, 5.8), islandMat, 0, -2.0, 0.1);
  addMesh(island, new THREE.BoxGeometry(2.35, 1.4, 4.6), phong(0xd8cebe), 0, -0.75, -0.15);
  addMesh(island, new THREE.BoxGeometry(2.0, 1.15, 3.2), phong(0xf0ebe0), 0, 0.45, -0.35);
  addMesh(island, new THREE.BoxGeometry(1.7, 0.85, 2.2), metal, 0, 1.35, -0.5);
  // 舰桥窗带
  addMesh(island, new THREE.BoxGeometry(1.85, 0.28, 0.08), phong(0x6ab0d0, {
    transparent: true, opacity: 0.7, emissive: new THREE.Color(0x1a3040)
  }), 0, 0.55, -1.95);
  addMesh(island, new THREE.CylinderGeometry(0.1, 0.14, 2.8, 8), dark, 0.55, 2.4, 0.2);
  addMesh(island, new THREE.CylinderGeometry(0.08, 0.1, 2.2, 8), dark, -0.35, 2.1, 0.6);
  const dish = addMesh(island, new THREE.CylinderGeometry(0.85, 0.85, 0.07, 16), chevMat.clone(), 0.55, 3.55, 0.2);
  dish.rotation.x = 0.5;
  addMesh(island, new THREE.SphereGeometry(0.18, 10, 8), chevMat, 0.55, 3.85, 0.2);
  // 烟囱
  addMesh(island, new THREE.BoxGeometry(0.7, 1.6, 1.1), dark, -0.7, 1.6, 1.4);
  island.userData.flashMat = islandMat;

  const cat = partGroup('catapult');
  const railMat = phong(0x1a2228, { emissive: new THREE.Color(0x12343a), shininess: 40 });
  addMesh(cat, new THREE.BoxGeometry(0.22, 0.08, 9.2), railMat, -0.9, 0.02, 0);
  addMesh(cat, new THREE.BoxGeometry(0.22, 0.08, 9.2), railMat, 0.9, 0.02, 0);
  addMesh(cat, new THREE.BoxGeometry(2.4, 0.06, 0.42), chevMat.clone(), 0, 0.08, -3.6);
  addMesh(cat, new THREE.BoxGeometry(2.4, 0.06, 0.42), chevMat.clone(), 0, 0.08, 2.8);
  // 弹射滑块
  addMesh(cat, new THREE.BoxGeometry(1.1, 0.16, 0.7), metal, 0, 0.14, -1.2);
  cat.userData.flashMat = railMat;

  const core = partGroup('core');
  const coreMat = new THREE.MeshPhongMaterial({
    color: 0xffb089,
    emissive: new THREE.Color(0x5a2618),
    specular: new THREE.Color(0xffd8c4),
    shininess: 48,
    transparent: true,
    opacity: 0.95
  });
  const coreMesh = addMesh(core, new THREE.CylinderGeometry(1.05, 1.28, 1.25, 16), coreMat, 0, 0, 0);
  addMesh(core, new THREE.TorusGeometry(1.4, 0.07, 8, 24), chevMat, 0, -0.15, 0).rotation.x = Math.PI / 2;
  addMesh(core, new THREE.TorusGeometry(1.15, 0.05, 6, 20), metal, 0, 0.35, 0).rotation.x = Math.PI / 2;
  addMesh(core, new THREE.SphereGeometry(0.35, 12, 10), chevMat, 0, 0.75, 0);
  core.userData.coreMesh = coreMesh;
  core.userData.coreMat = coreMat;

  root.userData.parts = parts;
  root.userData.hull = hull;
  root.userData.wake = wake;
  return root;
}

function makeOcean() {
  const geo = new THREE.PlaneGeometry(460, 560, 48, 64);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(0x0b5968) },
        uShallow: { value: new THREE.Color(0x1aa8ae) },
        uSun: { value: new THREE.Color(0xffe3b0) }
      }
    ]),
    vertexShader: `
      #include <fog_pars_vertex>
      uniform float uTime;
      varying float vH;
      varying vec3 vWorld;
      void main() {
        vec3 p = position;
        float h = sin(p.x * 0.055 + uTime * 1.15) * 0.28
          + sin(p.y * 0.042 - uTime * 0.85) * 0.36
          + sin((p.x + p.y) * 0.03 + uTime * 0.45) * 0.12;
        p.z += h;
        vH = h;
        vec4 worldPos = modelMatrix * vec4(p, 1.0);
        vWorld = worldPos.xyz;
        vec4 mvPosition = viewMatrix * worldPos;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSun;
      varying float vH;
      varying vec3 vWorld;
      void main() {
        float f = smoothstep(-0.28, 0.46, vH);
        vec3 col = mix(uDeep, uShallow, f);
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        float spec = pow(max(dot(n, normalize(vec3(-0.32, 0.86, -0.28))), 0.0), 40.0);
        col += uSun * spec * 0.62;
        col += uSun * smoothstep(0.2, 0.5, vH) * 0.18;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }
    `,
    fog: true
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0, 30);
  return mesh;
}

function makeSky() {
  const geo = new THREE.SphereGeometry(520, 24, 14);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x6eb6e4) },
      uHor: { value: new THREE.Color(0xf6d7b4) },
      uWarm: { value: new THREE.Color(0xf08a62) }
    },
    vertexShader: `
      varying vec3 vP;
      void main() {
        vP = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vP;
      uniform vec3 uTop;
      uniform vec3 uHor;
      uniform vec3 uWarm;
      void main() {
        float h = normalize(vP).y;
        vec3 col = mix(uHor, uTop, smoothstep(0.0, 0.58, h));
        float band = smoothstep(0.12, 0.42, h) * (1.0 - smoothstep(0.42, 0.78, h));
        col = mix(col, uWarm, band * 0.72);
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

function aimObject(mesh, vx, vy, vz) {
  const len = Math.hypot(vx, vy, vz);
  if (len < 0.0001) return;
  _z.set(vx / len, vy / len, vz / len);
  _x.set(0, 1, 0).cross(_z);
  if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
  _x.normalize();
  _y.crossVectors(_z, _x).normalize();
  _m.makeBasis(_x, _y, _z);
  mesh.quaternion.setFromRotationMatrix(_m);
}

function makeShotMesh(kind) {
  let geo;
  let mat;
  if (kind === 'pulse') {
    geo = new THREE.BoxGeometry(0.28, 0.28, 2.6);
    mat = new THREE.MeshBasicMaterial({ color: 0x9af8ff });
  } else if (kind === 'bomb') {
    geo = new THREE.SphereGeometry(0.46, 10, 8);
    mat = new THREE.MeshBasicMaterial({ color: 0xffc14a });
  } else if (kind === 'missile') {
    geo = new THREE.BoxGeometry(0.28, 0.28, 1.5);
    mat = new THREE.MeshBasicMaterial({ color: 0xff5b4a });
  } else {
    geo = new THREE.SphereGeometry(kind === 'flak' || kind === 'fan' ? 0.36 : 0.28, 8, 6);
    mat = new THREE.MeshBasicMaterial({ color: kind === 'fan' ? 0xff8a3a : 0xff6d5a });
  }
  return new THREE.Mesh(geo, mat);
}

function makeBoom(kind) {
  const group = new THREE.Group();
  const color = kind === 'splash' ? 0xffe1a3 : kind === 'ping' ? 0xbff7ff : kind === 'hurt' ? 0xff8d7a : 0xfff1df;
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 8, 6),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false })
  );
  group.add(sphere);
  if (kind === 'splash' || kind === 'boom') {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.7, 20),
      new THREE.MeshBasicMaterial({ color: kind === 'splash' ? 0xe7fff8 : 0xffd0a8, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    group.userData.ring = ring;
  }
  group.userData.core = sphere;
  return group;
}

export function createView(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  });
  if (!renderer.getContext()) throw new Error('WebGL 不可用');
  renderer.setClearColor(0xf6d7b4, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf6d7b4, 48, 165);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 800);
  camera.position.set(6, 18, -18);

  scene.add(makeSky());
  const ocean = makeOcean();
  scene.add(ocean);
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(10, 20, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff3cf })
  );
  sun.position.set(90, 46, 150);
  scene.add(sun);

  scene.add(new THREE.HemisphereLight(0xfff2e4, 0x164554, 0.85));
  const key = new THREE.DirectionalLight(0xfff6ea, 1.55);
  key.position.set(-28, 48, -36);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb8d8ff, 0.55);
  fill.position.set(16, 22, 80);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffd8a8, 0.35);
  rim.position.set(40, 12, -20);
  scene.add(rim);

  const player = buildAircraft('j20');
  player.scale.setScalar(1.18);
  scene.add(player);
  const decoy = new THREE.Group();
  decoy.add(new THREE.Mesh(
    new THREE.OctahedronGeometry(0.7, 0),
    new THREE.MeshBasicMaterial({ color: 0xffc14a })
  ));
  const decoyRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.06, 6, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff1c2 })
  );
  decoyRing.rotation.x = Math.PI / 2;
  decoy.add(decoyRing);
  decoy.visible = false;
  scene.add(decoy);
  const aim = new THREE.Mesh(
    new THREE.RingGeometry(1.7, 2.15, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd56a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
  );
  aim.rotation.x = -Math.PI / 2;
  aim.visible = false;
  scene.add(aim);

  const isles = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const rockMat = phong(0x6d8a78, { emissive: new THREE.Color(0x1c2a22), flatShading: true, roughness: 0.92, metalness: 0.05 });
    for (let k = 0; k < 3; k++) {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(2.2 + (i + k) % 2, 0),
        rockMat
      );
      rock.scale.set(1.1 + k * 0.25, 1.6 + (k % 2) * 0.6, 1.0 + k * 0.2);
      rock.position.set((k - 1) * 2.2, 1.0 + k * 0.4, k * 1.1);
      rock.rotation.set(k * 0.4, k * 0.7, 0.2);
      g.add(rock);
    }
    const sand = new THREE.Mesh(new THREE.SphereGeometry(3.6, 12, 8), phong(0xe6d2a8, { roughness: 0.95, metalness: 0 }));
    sand.scale.y = 0.26;
    sand.position.y = 0.15;
    g.add(sand);
    g.position.set((i % 2 === 0 ? -1 : 1) * (36 + (i % 3) * 8), 0, 40 + i * 28);
    scene.add(g);
    isles.push(g);
  }
  const clouds = [];
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Mesh(
      new THREE.SphereGeometry(4.5, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff7f1, transparent: true, opacity: 0.92, depthWrite: false })
    );
    c.scale.set(2.4, 0.45, 1.2);
    c.position.set(-40 + i * 18, 22 + (i % 3) * 3, 30 + (i % 5) * 22);
    scene.add(c);
    clouds.push(c);
  }

  const carrier = buildCarrier();
  carrier.visible = false;
  scene.add(carrier);

  const actors = new Map();
  const shotPools = {};
  const shotCursor = {};
  const fxPools = {};
  const fxCursor = {};
  let reduced = false;
  let clock = 0;
  let dprCap = 1.35;
  let cameraLock = null;

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    dprCap = coarse ? 1.15 : 1.35;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function actorFor(enemy) {
    let rec = actors.get(enemy.id);
    if (rec && rec.kind !== enemy.kind) {
      scene.remove(rec.group);
      actors.delete(enemy.id);
      rec = null;
    }
    if (!rec) {
      const group = enemy.kind === 'escort' ? buildEscort() : buildAircraft('f35');
      const airScale = enemy.kind === 'striker' ? 1.68 : 1.22;
      group.scale.setScalar(enemy.kind === 'escort' ? 1.2 : airScale);
      scene.add(group);
      rec = { group, kind: enemy.kind, hp: enemy.hp, flash: 0 };
      actors.set(enemy.id, rec);
    }
    return rec;
  }

  function poolGet(pools, cursor, kind, factory) {
    const list = pools[kind] || (pools[kind] = []);
    const i = cursor[kind] || 0;
    cursor[kind] = i + 1;
    let mesh = list[i];
    if (!mesh) {
      mesh = factory(kind);
      scene.add(mesh);
      list[i] = mesh;
    }
    mesh.visible = true;
    return mesh;
  }

  function poolHide(pools, cursor) {
    Object.keys(pools).forEach((kind) => {
      const from = cursor[kind] || 0;
      const list = pools[kind];
      for (let i = from; i < list.length; i++) list[i].visible = false;
    });
  }

  function update(game, dt) {
    const simulating = game.phase === 'play' || game.phase === 'title';
    clock += simulating ? dt : dt * 0.15;
    ocean.material.uniforms.uTime.value = clock;

    const p = game.player;
    const bob = game.phase === 'title' && !reduced ? Math.sin(clock * 0.8) * 0.28 : 0;
    player.position.set(p.x, p.y + bob, 0);
    if (game.phase === 'title') {
      player.rotation.set(0, Math.sin(clock * 0.35) * 0.18, Math.sin(clock * 0.55) * 0.08);
    } else {
      player.rotation.set(p.pitch * 0.2, -p.bank * 0.22, -p.bank * 0.62);
    }
    const stealth = game.stealthT > 0;
    const blink = game.invuln > 0 && Math.sin(clock * 40) > 0;
    player.visible = !blink;
    player.userData.mats.forEach((mat) => {
      if (mat.userData.baseOpacity == null) mat.userData.baseOpacity = mat.opacity;
      mat.opacity = stealth ? Math.min(0.34, mat.userData.baseOpacity) : mat.userData.baseOpacity;
    });
    player.userData.flames.forEach((flame, i) => {
      const flick = 0.75 + Math.sin(clock * 42 + i) * 0.22;
      flame.scale.set(stealth ? 0.4 : 1, flick, 1);
    });

    if (game.decoy) {
      decoy.visible = true;
      decoy.position.set(game.decoy.x, game.decoy.y, game.decoy.z);
      decoy.rotation.y += dt * 4;
      decoy.rotation.z += dt * 2.2;
    } else decoy.visible = false;

    const showAim = game.phase === 'play';
    aim.visible = showAim;
    if (showAim) {
      aim.position.set(game.aim.x, 0.35, game.aim.z);
      const pulse = 1 + Math.sin(clock * 6) * 0.06;
      aim.scale.setScalar(pulse);
    }

    const alive = new Set();
    for (let i = 0; i < game.enemies.length; i++) {
      const e = game.enemies[i];
      alive.add(e.id);
      const rec = actorFor(e);
      const y = e.kind === 'escort' ? 0 : e.y;
      rec.group.position.set(e.x, y, e.z);
      if (e.kind === 'escort') {
        rec.group.rotation.set(0, Math.sin(e.age * 0.4) * 0.04, 0);
        if (rec.group.userData.wake) rec.group.userData.wake.material.opacity = 0.22 + Math.sin(clock * 5) * 0.05;
      } else {
        rec.group.rotation.set(0, Math.PI, Math.sin(e.age * e.weaveFreq) * 0.18);
        rec.group.userData.flames.forEach((flame, idx) => {
          flame.scale.y = 0.7 + Math.sin(clock * 36 + idx) * 0.2;
        });
      }
      if (e.hp < rec.hp) rec.flash = 0.12;
      rec.hp = e.hp;
      rec.flash = Math.max(0, rec.flash - dt);
      const mats = rec.group.userData.mats || [];
      for (let m = 0; m < mats.length; m++) {
        const mat = mats[m];
        if (!mat.emissive) continue;
        if (mat.userData.baseEmissive == null) mat.userData.baseEmissive = mat.emissive.getHex();
        mat.emissive.setHex(rec.flash > 0 ? 0xfff4ea : mat.userData.baseEmissive);
      }
    }
    actors.forEach((rec, id) => {
      if (!alive.has(id)) {
        scene.remove(rec.group);
        actors.delete(id);
      }
    });

    if (game.boss && !game.boss.dead) {
      carrier.visible = true;
      carrier.position.set(game.boss.x, 0, game.boss.z);
      const parts = carrier.userData.parts;
      game.boss.parts.forEach((part) => {
        const g = parts[part.id];
        if (!g) return;
        g.position.set(part.x, part.y, part.z);
        const broken = part.hp <= 0;
        g.traverse((obj) => {
          if (obj.isMesh && obj.material && obj.material.emissive && part.id !== 'core') {
            obj.material.emissive.setHex(broken ? 0x2a120e : 0x12181e);
            if (obj.material.color && broken) obj.material.color.setHex(0x4a403c);
          }
        });
        g.rotation.z = broken ? 0.06 : 0;
        g.position.y = part.y - (broken ? 0.35 : 0);
        if (part.id === 'core') {
          const mesh = g.userData.coreMesh;
          const phase = game.boss.phase;
          const live = phase >= 3 && !broken;
          mesh.scale.set(1, live ? 1.15 + Math.sin(clock * 6) * 0.08 : 0.28, 1);
          g.userData.coreMat.emissive.setHex(live ? 0xff5a28 : 0x4a261c);
          g.userData.coreMat.color.setHex(broken ? 0x5a403c : 0xffb089);
        }
      });
    } else if (game.boss && game.boss.dead) {
      carrier.visible = true;
      carrier.position.set(game.boss.x, -0.4, game.boss.z);
    } else {
      carrier.visible = false;
    }

    Object.keys(shotCursor).forEach((k) => { shotCursor[k] = 0; });
    for (let i = 0; i < game.shots.length; i++) {
      const s = game.shots[i];
      const kind = s.kind || 'bolt';
      const mesh = poolGet(shotPools, shotCursor, kind, makeShotMesh);
      mesh.position.set(s.x, s.y, s.z);
      aimObject(mesh, s.vx, s.vy, s.vz);
    }
    poolHide(shotPools, shotCursor);

    Object.keys(fxCursor).forEach((k) => { fxCursor[k] = 0; });
    for (let i = 0; i < game.fx.length; i++) {
      const fx = game.fx[i];
      if (fx.kind === 'muzzle-air' || fx.kind === 'muzzle-sea') continue;
      const mesh = poolGet(fxPools, fxCursor, fx.kind, makeBoom);
      const total = Math.max(0.001, fx.age + fx.life);
      const k = fx.age / total;
      mesh.position.set(fx.x, fx.y, fx.z);
      const s = (0.35 + k * (fx.kind === 'splash' ? 7 : 4.2)) * (fx.power || 1);
      mesh.scale.setScalar(Math.max(0.2, s));
      if (mesh.userData.core) mesh.userData.core.material.opacity = (1 - k) * 0.9;
      if (mesh.userData.ring) mesh.userData.ring.material.opacity = (1 - k) * 0.75;
    }
    poolHide(fxPools, fxCursor);

    const scroll = simulating ? 12 * dt : 0;
    isles.forEach((isle) => {
      isle.position.z -= scroll;
      if (isle.position.z < -36) isle.position.z += 230;
    });
    clouds.forEach((c, i) => {
      c.position.z -= scroll * 0.55;
      c.position.x += Math.sin(clock * 0.2 + i) * dt * 0.4;
      if (c.position.z < -20) c.position.z += 180;
    });

    const shake = reduced ? 0 : game.shake || 0;
    const side = game.phase === 'title' ? 7.2 : 5.2;
    _cam.set(p.x * 0.28 + side, p.y + 5.6 + bob, -12.6);
    _look.set(p.x * 0.5, p.y * 0.2 + 1.5, 20);
    if (shake > 0) {
      _cam.x += Math.sin(clock * 46) * shake * 0.42;
      _cam.y += Math.cos(clock * 37) * shake * 0.28;
    }
    const blend = 1 - Math.exp(-3.4 * Math.max(0.001, dt));
    camera.position.lerp(_cam, game.phase === 'title' ? 0.08 : blend);
    _lookCur.lerp(_look, blend);
    camera.lookAt(_lookCur);
    if (cameraLock) {
      camera.position.set(cameraLock[0], cameraLock[1], cameraLock[2]);
      camera.lookAt(cameraLock[3], cameraLock[4], cameraLock[5]);
    }
    renderer.render(scene, camera);
  }

  resize();
  return {
    update,
    resize,
    setReduced(v) { reduced = !!v; },
    lockCamera(px, py, pz, lx, ly, lz) { cameraLock = [px, py, pz, lx, ly, lz]; },
    unlockCamera() { cameraLock = null; }
  };
}
