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
  return new THREE.MeshPhongMaterial(Object.assign({
    color,
    specular: new THREE.Color(0x9eb0c2),
    shininess: 32,
    emissive: new THREE.Color(0x0b1016),
    flatShading: false
  }, extra || {}));
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
    x = Math.sign(x) * Math.pow(Math.abs(x), 0.5) * hw;
    const py = y >= 0 ? 0.7 : 0.4;
    y = Math.sign(y) * Math.pow(Math.abs(y), py) * hh;
    if (y < 0) y *= 0.6;
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

const CHORD_U = [0, 0.04, 0.11, 0.24, 0.42, 0.62, 0.82, 1];
const CHORD_T = [0.05, 0.58, 1, 0.92, 0.68, 0.42, 0.2, 0.04];
const CHORD_C = [0, 0.04, 0.09, 0.07, 0.02, -0.02, -0.05, -0.07];

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
  const n = 14;
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
  const seg = 14;
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
  const n = 16;
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
    canard: [0.13, 0.42, 0.46],
    le: [0.62, 0.78, 0.84],
    tail: [0.13, 0.16, 0.22],
    upperHex: 0x2a3448,
    canopy: 0xe7a85a,
    canopyEmit: 0x3a2812,
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
    shininess: 56,
    specular: new THREE.Color(0xd5e2ee),
    emissive: new THREE.Color(j20 ? 0x10161e : 0x1a1e22)
  });
  const bumpMat = phong(pal.upperHex, {
    transparent: true,
    opacity: 1,
    shininess: 40,
    emissive: new THREE.Color(j20 ? 0x10161e : 0x1a1e22)
  });
  const dark = phong(0x14181e, { transparent: true, opacity: 1, shininess: 16 });
  const lip = phong(j20 ? 0x1c2832 : 0x8e99a3, { transparent: true, opacity: 1, shininess: 36 });
  const hole = new THREE.MeshBasicMaterial({ color: 0x07080a, transparent: true, opacity: 1 });
  const metal = phong(0x2c333a, {
    transparent: true,
    opacity: 1,
    shininess: 72,
    specular: new THREE.Color(0xf2f6f8),
    emissive: new THREE.Color(0x101418)
  });
  const canopyMat = phong(pal.canopy, {
    transparent: true,
    opacity: 0.74,
    shininess: 110,
    specular: new THREE.Color(0xffffff),
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
      [0.012, 0.028, 0.012, 4.75],
      [0.07, 0.09, 0.04, 4.4],
      [0.16, 0.16, 0.055, 3.95],
      [0.32, 0.24, 0.05, 3.4],
      [0.48, 0.32, 0.04, 2.8],
      [0.66, 0.38, 0.03, 2.2],
      [0.86, 0.4, 0.01, 1.55],
      [1.02, 0.4, -0.015, 0.8],
      [1.05, 0.38, -0.02, 0.05],
      [0.94, 0.34, -0.015, -0.65],
      [0.74, 0.3, 0.0, -1.25],
      [0.52, 0.24, 0.01, -1.8],
      [0.32, 0.18, 0.03, -2.25]
    ]
    : [
      [0.04, 0.07, 0.03, 3.45],
      [0.2, 0.2, 0.06, 2.95],
      [0.46, 0.34, 0.06, 2.4],
      [0.74, 0.46, 0.04, 1.75],
      [1.0, 0.5, 0.02, 1.05],
      [1.14, 0.46, -0.01, 0.3],
      [1.08, 0.42, -0.02, -0.4],
      [0.86, 0.36, -0.01, -1.0],
      [0.58, 0.28, 0.01, -1.55],
      [0.36, 0.2, 0.03, -1.95]
    ];
  addLoft(skin, body, pal, 18);
  let reversed = false;
  if (radialScore(skin.geometry()) < 0) {
    skin.flip(0);
    reversed = true;
  }

  const wingCol = { upper: pal.upper, lower: pal.belly, le: pal.le, tip: pal.tip, tipAt: j20 ? 99 : 2.35 };
  const main = j20
    ? [
      { x: 0.42, y: 0.04, lead: 1.72, trail: -1.42, thick: 0.12 },
      { x: 1.45, y: -0.01, lead: 0.82, trail: -1.5, thick: 0.09 },
      { x: 2.55, y: -0.08, lead: 0.02, trail: -1.48, thick: 0.065 },
      { x: 3.5, y: -0.15, lead: -0.48, trail: -1.36, thick: 0.042 },
      { x: 4.22, y: -0.21, lead: -0.78, trail: -1.12, thick: 0.022 }
    ]
    : [
      { x: 0.42, y: 0.04, lead: 1.05, trail: -1.2, thick: 0.11 },
      { x: 1.35, y: -0.01, lead: 0.38, trail: -1.25, thick: 0.075 },
      { x: 2.2, y: -0.07, lead: -0.05, trail: -1.16, thick: 0.048 },
      { x: 2.9, y: -0.12, lead: -0.28, trail: -0.95, thick: 0.026 }
    ];
  addPair(skin, main, wingCol);

  if (j20) {
    addPair(skin, [
      { x: 0.32, y: 0.2, lead: 3.05, trail: 1.95, thick: 0.055 },
      { x: 1.15, y: 0.34, lead: 2.62, trail: 1.78, thick: 0.04 },
      { x: 1.95, y: 0.5, lead: 2.22, trail: 1.9, thick: 0.02 }
    ], { upper: pal.canard, lower: pal.canard, le: pal.le });
    addPair(skin, [
      { x: 0.05, y: 0.03, lead: -1.45, trail: -2.4, thick: 0.035 },
      { x: 0.34, y: 0.01, lead: -1.6, trail: -2.22, thick: 0.022 }
    ], wingCol);
    addNacelle(skin, [
      { x: 0.46, y: -0.03, z: -1.5, r: 0.18 },
      { x: 0.48, y: -0.04, z: -2.0, r: 0.27 },
      { x: 0.46, y: -0.03, z: -2.5, r: 0.23 },
      { x: 0.44, y: -0.02, z: -2.82, r: 0.19 }
    ], pal.upper, reversed);
    addNacelle(skin, [
      { x: -0.46, y: -0.03, z: -1.5, r: 0.18 },
      { x: -0.48, y: -0.04, z: -2.0, r: 0.27 },
      { x: -0.46, y: -0.03, z: -2.5, r: 0.23 },
      { x: -0.44, y: -0.02, z: -2.82, r: 0.19 }
    ], pal.upper, reversed);
  } else {
    addPair(skin, [
      { x: 0.28, y: 0.02, lead: -0.85, trail: -1.72, thick: 0.045 },
      { x: 1.15, y: -0.02, lead: -1.05, trail: -1.68, thick: 0.028 }
    ], wingCol);
    addNacelle(skin, [
      { x: 0, y: -0.02, z: -1.35, r: 0.26 },
      { x: 0, y: -0.03, z: -1.75, r: 0.34 },
      { x: 0, y: -0.02, z: -2.05, r: 0.3 }
    ], pal.tail, reversed);
  }

  const finCol = { upper: pal.tail, lower: pal.tail, le: pal.le, tip: pal.tip };
  addFins(skin, j20
    ? {
      cant: 0.52,
      ox: 0.22,
      oy: 0.16,
      flashY: 99,
      stations: [
        { x: 0.02, y: 0, lead: -0.95, trail: -2.2, thick: 0.06 },
        { x: 0.85, y: 0, lead: -1.28, trail: -2.36, thick: 0.04 },
        { x: 1.78, y: 0, lead: -1.58, trail: -2.42, thick: 0.016 }
      ]
    }
    : {
      cant: 0.34,
      ox: 0.16,
      oy: 0.18,
      flashY: 1.05,
      stations: [
        { x: 0.02, y: 0, lead: -0.55, trail: -1.7, thick: 0.055 },
        { x: 0.62, y: 0, lead: -0.8, trail: -1.8, thick: 0.036 },
        { x: 1.32, y: 0, lead: -1.02, trail: -1.86, thick: 0.016 }
      ]
    }, finCol);

  const skinMesh = new THREE.Mesh(skin.geometry(), skinMat);
  group.add(skinMesh);

  addCanopy(
    group,
    canopyMat,
    dark,
    j20
      ? bubbleStations(2.55, 1.2, 0.36, 0.3, 0.4, 10)
      : bubbleStations(1.9, 0.72, 0.46, 0.36, 0.36, 10)
  );

  const intake = j20
    ? { x: 0.9, y: -0.02, z: 0.95, r: 0.2, bump: 0.34 }
    : { x: 0.7, y: 0.02, z: 1.22, r: 0.18, bump: 0.28 };
  addIntake(group, mats, intake);
  addIntake(group, mats, Object.assign({}, intake, { x: -intake.x }));

  const flames = [];
  if (j20) {
    flames.push(...addNozzle(group, mats, 0.46, -0.03, -2.78, 0.2));
    flames.push(...addNozzle(group, mats, -0.46, -0.03, -2.78, 0.2));
  } else {
    flames.push(...addNozzle(group, mats, 0, -0.02, -2.02, 0.32));
  }

  const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, j20 ? 0.55 : 0.32, 6), dark);
  pitot.rotation.x = Math.PI / 2;
  pitot.position.set(0, j20 ? 0.02 : 0.04, j20 ? 5.05 : 3.62);
  group.add(pitot);

  const lightGeo = new THREE.BoxGeometry(0.16, 0.07, 0.26);
  const span = j20 ? 4.05 : 2.72;
  const lightZ = j20 ? -0.95 : -0.55;
  const lightY = j20 ? -0.16 : -0.08;
  addMesh(group, lightGeo, hot, span, lightY, lightZ);
  addMesh(group, lightGeo, hot, -span, lightY, lightZ);

  group.userData.skin = skinMesh;
  group.userData.mats = [skinMat, bumpMat, dark, lip, hole, metal, canopyMat, hot];
  group.userData.flames = flames;
  group.userData.kind = kind;
  return group;
}

function buildEscort() {
  const group = new THREE.Group();
  const hull = phong(0x2f6d74, { emissive: new THREE.Color(0x0c2a2e) });
  const deck = phong(0xd7e2df);
  const dark = phong(0x1c2428);
  const amber = new THREE.MeshBasicMaterial({ color: 0xffc14a });
  const body = addMesh(group, new THREE.BoxGeometry(1.8, 0.72, 6.4), hull, 0, 0.62, 0);
  const bow = addMesh(group, new THREE.ConeGeometry(0.95, 2.1, 4), hull, 0, 0.62, -4.05);
  bow.rotation.x = Math.PI / 2;
  addMesh(group, new THREE.BoxGeometry(1.5, 0.12, 4.2), deck, 0, 1.02, 0.2);
  addMesh(group, new THREE.BoxGeometry(0.9, 0.7, 1.6), dark, 0, 1.4, 0.6);
  const gun = addMesh(group, new THREE.CylinderGeometry(0.28, 0.34, 0.35, 8), dark, 0, 1.35, -1.5);
  gun.rotation.x = Math.PI / 2;
  const barrel = addMesh(group, new THREE.BoxGeometry(0.1, 0.1, 0.9), dark, 0, 1.4, -2.15);
  barrel.userData.barrel = true;
  addMesh(group, new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), amber, 0, 2.05, 0.8);
  const wake = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 4.2),
    new THREE.MeshBasicMaterial({ color: 0xe8fff8, transparent: true, opacity: 0.28, depthWrite: false })
  );
  wake.rotation.x = -Math.PI / 2;
  wake.position.set(0, 0.18, 4.2);
  group.add(wake);
  group.userData.mats = [hull, deck, dark];
  group.userData.wake = wake;
  return group;
}

function buildCarrier() {
  const root = new THREE.Group();
  const hullMat = phong(0x3c4a55, { emissive: new THREE.Color(0x12181e) });
  const deckMat = phong(0x6d7882);
  const dark = phong(0x232a30);
  const chevMat = phong(0x35d0c4, { emissive: new THREE.Color(0x0c3c38) });
  const hull = addMesh(root, new THREE.BoxGeometry(8.4, 2.4, 32), hullMat, 0, 0.85, 1.2);
  const bow = addMesh(root, new THREE.ConeGeometry(3.5, 7.4, 8), hullMat, 0, 1.25, -17.6);
  bow.rotation.x = -Math.PI / 2;
  bow.scale.z = 0.32;
  const deck = addMesh(root, new THREE.BoxGeometry(SPEC.carrier.width, 0.36, SPEC.carrier.length), deckMat, 0, 2.18, 0);
  for (let i = 0; i < 4; i++) {
    const chev = addMesh(root, new THREE.ConeGeometry(0.72, 1.5, 3), chevMat, 0, 2.42, -8 + i * 4.5);
    chev.rotation.x = Math.PI / 2;
  }
  const wake = new THREE.Mesh(
    new THREE.PlaneGeometry(6.5, 16),
    new THREE.MeshBasicMaterial({ color: 0xd9fff6, transparent: true, opacity: 0.22, depthWrite: false })
  );
  wake.rotation.x = -Math.PI / 2;
  wake.position.set(0, 0.2, 22);
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
    const base = addMesh(g, new THREE.CylinderGeometry(0.7, 0.85, 0.7, 8), dark.clone(), 0, 0, 0);
    addMesh(g, new THREE.BoxGeometry(0.22, 0.22, 1.6), phong(0x1b2126), 0, 0.35, -0.7);
    g.userData.baseMat = base.material;
  });

  const island = partGroup('island');
  const islandMat = phong(0xded4c4, { emissive: new THREE.Color(0x3a342c) });
  addMesh(island, new THREE.BoxGeometry(2.7, 3.3, 6.4), islandMat, 0, -1.35, 0);
  addMesh(island, new THREE.BoxGeometry(2.1, 1.8, 3.1), phong(0xf2efe6), 0, 0.85, -0.2);
  addMesh(island, new THREE.CylinderGeometry(0.12, 0.16, 2.4, 6), dark, 0.4, 2.3, 0.4);
  const dish = addMesh(island, new THREE.CylinderGeometry(0.7, 0.7, 0.08, 10), chevMat.clone(), 0.4, 3.15, 0.4);
  dish.rotation.x = 0.4;
  island.userData.flashMat = islandMat;

  const cat = partGroup('catapult');
  const railMat = phong(0x1e252b, { emissive: new THREE.Color(0x12343a) });
  addMesh(cat, new THREE.BoxGeometry(0.28, 0.1, 8.5), railMat, -0.85, 0, 0);
  addMesh(cat, new THREE.BoxGeometry(0.28, 0.1, 8.5), railMat, 0.85, 0, 0);
  addMesh(cat, new THREE.BoxGeometry(2.2, 0.08, 0.5), chevMat.clone(), 0, 0.08, -3.4);
  cat.userData.flashMat = railMat;

  const core = partGroup('core');
  const coreMat = new THREE.MeshPhongMaterial({
    color: 0xffb089,
    emissive: new THREE.Color(0x5a2618),
    specular: new THREE.Color(0xffd8c4),
    shininess: 40,
    transparent: true,
    opacity: 0.95
  });
  const coreMesh = addMesh(core, new THREE.CylinderGeometry(1.15, 1.35, 1.1, 10), coreMat, 0, 0, 0);
  addMesh(core, new THREE.TorusGeometry(1.45, 0.08, 6, 16), chevMat, 0, -0.2, 0).rotation.x = Math.PI / 2;
  core.userData.coreMesh = coreMesh;
  core.userData.coreMat = coreMat;

  root.userData.parts = parts;
  root.userData.hull = hull;
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
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf6d7b4, 42, 155);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 800);
  camera.position.set(6, 18, -18);

  scene.add(makeSky());
  const ocean = makeOcean();
  scene.add(ocean);
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(10, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff3cf })
  );
  sun.position.set(90, 46, 150);
  scene.add(sun);

  scene.add(new THREE.HemisphereLight(0xfff0dd, 0x1d4d5c, 0.72));
  const key = new THREE.DirectionalLight(0xfff6ea, 1.25);
  key.position.set(-28, 48, -36);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc5e4ff, 0.45);
  fill.position.set(16, 22, 80);
  scene.add(fill);

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
    const rock = new THREE.Mesh(new THREE.ConeGeometry(4 + (i % 3), 5 + (i % 4), 6), phong(0x6d8a78, { emissive: new THREE.Color(0x1c2a22) }));
    rock.position.y = 1.2;
    g.add(rock);
    const sand = new THREE.Mesh(new THREE.SphereGeometry(3.2, 8, 6), phong(0xe6d2a8));
    sand.scale.y = 0.28;
    sand.position.y = 0.2;
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
      group.scale.setScalar(enemy.kind === 'escort' ? 1.2 : 1.42);
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
