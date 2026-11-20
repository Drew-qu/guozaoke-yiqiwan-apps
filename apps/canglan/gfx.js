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

function chine(w, h, y0) {
  return [
    [0, h * 0.55 + y0],
    [w * 0.58, h * 0.18 + y0],
    [w, -h * 0.02 + y0],
    [w * 0.4, -h * 0.4 + y0],
    [0, -h * 0.5 + y0],
    [-w * 0.4, -h * 0.4 + y0],
    [-w, -h * 0.02 + y0],
    [-w * 0.58, h * 0.18 + y0]
  ];
}

function loft(stations) {
  const n = stations[0].ring.length;
  const pos = [];
  stations.forEach((st) => {
    st.ring.forEach((p) => pos.push(p[0], p[1], st.z));
  });
  const nose = stations[0];
  const tail = stations[stations.length - 1];
  pos.push(0, nose.ring[0][1] * 0.2, nose.z + 0.08);
  pos.push(0, 0, tail.z - 0.12);
  const noseI = (pos.length / 3) - 2;
  const tailI = noseI + 1;
  const idx = [];
  for (let s = 0; s < stations.length - 1; s++) {
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      const a = s * n + i;
      const b = s * n + i2;
      const c = (s + 1) * n + i;
      const d = (s + 1) * n + i2;
      idx.push(a, c, b, b, c, d);
    }
  }
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    idx.push(noseI, i2, i);
    const base = (stations.length - 1) * n;
    idx.push(tailI, base + i, base + i2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function poly(points) {
  const pos = [];
  const idx = [];
  points.forEach((p) => pos.push(p.x, p.y, p.z));
  for (let i = 1; i < points.length - 1; i++) idx.push(0, i, i + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const ny = geo.attributes.normal.getY(0);
  if (ny < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const tmp = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = tmp;
    }
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }
  return geo;
}

function mirrorX(points) {
  return points.map((p) => ({ x: -p.x, y: p.y, z: p.z }));
}

function addMesh(group, geo, mat, x, y, z) {
  const mesh = new THREE.Mesh(geo, mat);
  if (x) mesh.position.set(x, y || 0, z || 0);
  else if (y || z) mesh.position.set(0, y || 0, z || 0);
  group.add(mesh);
  return mesh;
}

function buildAircraft(kind) {
  const group = new THREE.Group();
  const j20 = kind === 'j20';
  const body = phong(j20 ? 0x2a3548 : 0xb7c3d1, {
    transparent: true,
    opacity: 1,
    emissive: new THREE.Color(j20 ? 0x101820 : 0x1a1e24)
  });
  const edge = phong(j20 ? 0x1a2230 : 0x8e9bab, { transparent: true, opacity: 1 });
  const wing = phong(j20 ? 0x243044 : 0xaeb8c6, { transparent: true, opacity: 1, side: THREE.DoubleSide });
  const accent = phong(j20 ? 0x16323a : 0xd85a32, { transparent: true, opacity: 1, emissive: new THREE.Color(j20 ? 0x06262c : 0x4a1c10) });
  const hot = new THREE.MeshBasicMaterial({ color: j20 ? 0x39e7ff : 0xff7a3c });
  const canopy = phong(j20 ? 0xf0b15a : 0x9fd0ea, {
    transparent: true,
    opacity: 0.82,
    shininess: 80,
    specular: new THREE.Color(0xffffff)
  });
  const dark = phong(0x14181e, { transparent: true, opacity: 1 });
  const stations = j20
    ? [
      { z: 4.4, ring: chine(0.04, 0.07, 0.02) },
      { z: 3.5, ring: chine(0.32, 0.24, 0.03) },
      { z: 2.55, ring: chine(0.62, 0.38, 0.02) },
      { z: 1.55, ring: chine(0.95, 0.52, 0.04) },
      { z: 0.35, ring: chine(1.2, 0.46, -0.02) },
      { z: -0.75, ring: chine(1.02, 0.4, -0.02) },
      { z: -1.7, ring: chine(0.72, 0.34, 0.0) },
      { z: -2.45, ring: chine(0.42, 0.26, 0.02) }
    ]
    : [
      { z: 3.2, ring: chine(0.05, 0.1, 0.0) },
      { z: 2.35, ring: chine(0.48, 0.34, 0.04) },
      { z: 1.35, ring: chine(1.05, 0.58, 0.04) },
      { z: 0.2, ring: chine(1.28, 0.5, -0.02) },
      { z: -0.7, ring: chine(1.02, 0.4, -0.02) },
      { z: -1.65, ring: chine(0.55, 0.3, 0.0) }
    ];
  addMesh(group, loft(stations), body);

  const wingPts = j20
    ? [
      { x: 0.55, y: 0.02, z: 1.85 },
      { x: 1.35, y: 0.0, z: 0.85 },
      { x: 4.55, y: -0.22, z: -0.15 },
      { x: 3.95, y: -0.18, z: -1.05 },
      { x: 0.72, y: -0.02, z: -1.55 }
    ]
    : [
      { x: 0.7, y: 0.02, z: 0.85 },
      { x: 2.75, y: -0.08, z: 0.05 },
      { x: 2.45, y: -0.08, z: -1.05 },
      { x: 0.62, y: -0.02, z: -1.25 }
    ];
  addMesh(group, poly(wingPts), wing);
  addMesh(group, poly(mirrorX(wingPts)), wing);

  if (j20) {
    const canard = [
      { x: 0.42, y: 0.08, z: 2.55 },
      { x: 1.72, y: 0.16, z: 1.95 },
      { x: 1.28, y: 0.1, z: 1.28 },
      { x: 0.4, y: 0.05, z: 1.62 }
    ];
    addMesh(group, poly(canard), accent);
    addMesh(group, poly(mirrorX(canard)), accent);
    const tail = [
      { x: 0.42, y: 0.22, z: -1.05 },
      { x: 0.7, y: 0.16, z: -2.15 },
      { x: 1.38, y: 1.55, z: -2.28 },
      { x: 1.12, y: 1.48, z: -1.22 }
    ];
    addMesh(group, poly(tail), edge);
    addMesh(group, poly(mirrorX(tail)), edge);
  } else {
    const fin = new THREE.BoxGeometry(0.12, 1.35, 1.05);
    const finMesh = addMesh(group, fin, edge, 0, 0.95, -1.15);
    finMesh.rotation.x = 0.35;
    const stripe = new THREE.BoxGeometry(0.14, 0.16, 1.7);
    addMesh(group, stripe, accent, 0, 0.22, 1.7);
  }

  const nozzleGeo = new THREE.CylinderGeometry(j20 ? 0.2 : 0.26, j20 ? 0.26 : 0.32, 0.55, 10);
  const nozzleMat = phong(0x2a3038, { transparent: true, opacity: 1, shininess: 50 });
  const flameMat = new THREE.MeshBasicMaterial({ color: j20 ? 0x7ef6ff : 0xffb15a });
  const flames = [];
  const nozzles = j20 ? [-0.42, 0.42] : [0];
  nozzles.forEach((x) => {
    const nozzle = addMesh(group, nozzleGeo, nozzleMat, x, -0.02, j20 ? -2.55 : -1.85);
    nozzle.rotation.x = Math.PI / 2;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.85, 8), flameMat);
    flame.position.set(x, -0.02, j20 ? -3.05 : -2.25);
    flame.rotation.x = -Math.PI / 2;
    group.add(flame);
    flames.push(flame);
  });

  const canopyMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), canopy);
  canopyMesh.scale.set(j20 ? 0.42 : 0.48, j20 ? 0.28 : 0.34, j20 ? 0.72 : 0.62);
  canopyMesh.position.set(0, j20 ? 0.38 : 0.42, j20 ? 1.45 : 0.85);
  group.add(canopyMesh);

  const intake = new THREE.BoxGeometry(0.55, 0.28, 0.9);
  if (j20) {
    addMesh(group, intake, dark, -0.95, -0.22, 0.35);
    addMesh(group, intake, dark, 0.95, -0.22, 0.35);
    const bump = new THREE.SphereGeometry(0.22, 8, 6);
    addMesh(group, bump, edge, -0.95, -0.02, 0.85).scale.set(1.1, 0.6, 0.7);
    addMesh(group, bump, edge, 0.95, -0.02, 0.85).scale.set(1.1, 0.6, 0.7);
  } else {
    addMesh(group, intake, dark, -0.72, -0.18, 0.15);
    addMesh(group, intake, dark, 0.72, -0.18, 0.15);
  }

  const lightGeo = new THREE.BoxGeometry(0.18, 0.08, 0.28);
  const span = j20 ? 4.35 : 2.55;
  addMesh(group, lightGeo, hot, span, -0.12, j20 ? -0.35 : -0.2);
  addMesh(group, lightGeo, hot, -span, -0.12, j20 ? -0.35 : -0.2);

  group.userData.mats = [body, edge, wing, accent, canopy, dark, nozzleMat];
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
    renderer.render(scene, camera);
  }

  resize();
  return {
    update,
    resize,
    setReduced(v) { reduced = !!v; }
  };
}
