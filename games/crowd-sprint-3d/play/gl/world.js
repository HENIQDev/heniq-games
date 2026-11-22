// コースまわりの静的な 3D（柵・観客席と観客・ゴールゲート・遠景のビル）。起動時に 1 つのバッファへ結合し、1 回の描画で出す。
// 頂点：pos(3) nrm(3) color(3) ＝ 9 float。外部モデル・画像なし（すべてコードで生成）。
import { createRng } from '../../../platform/core/rng.js';

const FACES = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] }, { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
];

const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

export function buildWorld() {
  const v = [];
  const idx = [];
  let count = 0;
  function box(cx, cy, cz, sx, sy, sz, color, skipBottom = true) {
    const h = [sx / 2, sy / 2, sz / 2];
    for (let fi = 0; fi < 6; fi++) {
      if (skipBottom && fi === 3) continue;
      const f = FACES[fi];
      const ax = (a) => Math.abs(a[0]) * h[0] + Math.abs(a[1]) * h[1] + Math.abs(a[2]) * h[2];
      const hn = ax(f.n), hu = ax(f.u), hv = ax(f.v);
      const c = [cx + f.n[0] * hn, cy + f.n[1] * hn, cz + f.n[2] * hn];
      const base = count;
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        v.push(c[0] + f.u[0] * hu * su + f.v[0] * hv * sv, c[1] + f.u[1] * hu * su + f.v[1] * hv * sv, c[2] + f.u[2] * hu * su + f.v[2] * hv * sv,
          f.n[0], f.n[1], f.n[2], color[0], color[1], color[2]);
        count += 1;
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const rnd = createRng(20261122);
  const WHITE = hex('#f4f4f4'), RED = hex('#e6256f'), NAVY = hex('#0d1b3a'), GRAY = hex('#7c86a8'), DARK = hex('#4a5278');
  const SHIRTS = ['#ff6b6b', '#4dabf7', '#ffd43b', '#51cf66', '#cc5de8', '#ff922b', '#f8f9fa', '#ff8787'].map(hex);
  const SKIN = hex('#f0c49a');

  // 柵（トラックの両側）
  for (const sx of [-15.8, 15.8]) {
    for (let z = -45; z < 150; z += 5) {
      box(sx, 0.5, z, 0.14, 1.0, 0.14, WHITE);
      box(sx, 0.86, z + 2.5, 0.07, 0.09, 5.0, WHITE);
      box(sx, 0.55, z + 2.5, 0.05, 0.07, 5.0, WHITE);
    }
  }
  // スタートの印（柵の外の旗）
  for (const sx of [-16.6, 16.6]) {
    box(sx, 2.0, 0, 0.12, 4.0, 0.12, WHITE);
    box(sx, 3.6, 0.5, 0.05, 0.9, 1.0, RED);
  }
  // ゴールゲート
  for (const sx of [-16.2, 16.2]) box(sx, 3.2, 100.7, 0.7, 6.4, 0.7, RED);
  box(0, 6.4, 100.7, 33.2, 1.6, 0.6, RED);
  for (let k = 0; k < 22; k++) {
    box(-15.75 + k * 1.5, 6.4, 100.35, 1.5, 1.6, 0.06, k % 2 === 0 ? WHITE : NAVY);
  }
  box(0, 7.4, 100.7, 33.2, 0.2, 0.7, NAVY);
  // 観客席（段と観客）
  for (const side of [-1, 1]) {
    for (let tier = 0; tier < 6; tier++) {
      const x = side * (18.5 + tier * 1.7), y = 0.55 + tier * 1.1;
      box(x, y / 2, 40, 1.7, y, 190, tier % 2 ? GRAY : DARK);
      for (let z = -52; z < 130; z += 1.3) {
        const c = SHIRTS[rnd.int(0, SHIRTS.length - 1)];
        const jx = rnd.range(-0.25, 0.25), jz = rnd.range(-0.15, 0.15);
        box(x + jx, y + 0.3, z + jz, 0.45, 0.6, 0.4, c);
        box(x + jx, y + 0.72, z + jz, 0.26, 0.26, 0.26, SKIN);
      }
    }
    box(side * 30.5, 4.2, 40, 0.5, 8.5, 190, NAVY);
  }
  // 遠景のビル
  for (let k = 0; k < 70; k++) {
    const side = k % 2 === 0 ? -1 : 1;
    const x = side * rnd.range(55, 230), z = rnd.range(-80, 380), h = rnd.range(18, 95), w = rnd.range(10, 26);
    const g = rnd.range(0.55, 0.78);
    box(x, h / 2, z, w, h, w, [g * 0.78, g * 0.84, g]);
  }
  return {
    vertices: new Float32Array(v),
    indices: new Uint32Array(idx),
    triangles: idx.length / 3,
  };
}
