import { buildAircraft } from './gfx.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function inspect(kind) {
  const group = buildAircraft(kind);
  const skin = group.userData.skin.geometry;
  const pos = skin.attributes.position;
  const nor = skin.attributes.normal;
  let nan = 0;
  let side = 0;
  let sideSum = 0;
  let topN = 0;
  let topNy = 0;
  let botN = 0;
  let botNy = 0;
  let finN = 0;
  let finOut = 0;
  let finBad = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    const nz = nor.getZ(i);
    if (![x, y, z, nx, ny, nz].every(Number.isFinite)) nan++;
    if (z > 2.55 && z < 3.35 && Math.abs(x) > 0.12) {
      side++;
      sideSum += nx * Math.sign(x);
    }
    if (Math.abs(x) > 1.3 && Math.abs(x) < 2.15 && z < 0.55 && z > -1.45) {
      if (y > 0) {
        topN++;
        topNy += ny;
      } else if (y < -0.02) {
        botN++;
        botNy += ny;
      }
    }
    if (y > 1.15 && x > 0.45 && ny < -0.25) {
      finN++;
      finOut += nx;
      if (nx < 0.2) finBad++;
    }
  }
  const tris = skin.index.count / 3;
  const report = {
    verts: pos.count,
    tris,
    side: side ? sideSum / side : null,
    wingTop: topN ? topNy / topN : null,
    wingBot: botN ? botNy / botN : null,
    fin: finN ? finOut / finN : null,
    nan
  };
  console.log(kind, JSON.stringify(report));
  assert(nan === 0, kind + ' has NaN normals');
  assert(tris > 400 && tris < 9000, kind + ' triangle count ' + tris);
  assert(report.side > 0.2, kind + ' fuselage normals face inward');
  assert(topN > 4 && report.wingTop > 0.75, kind + ' wing tops face down');
  assert(botN > 4 && report.wingBot < -0.75, kind + ' wing bottoms face up');
  assert(finN > 4 && finBad === 0 && report.fin > 0.4, kind + ' fins lean the wrong way');
  assert(group.userData.flames.length >= 2, kind + ' missing exhaust');
}

inspect('j20');
inspect('f35');
console.log('aircraft mesh ok');
