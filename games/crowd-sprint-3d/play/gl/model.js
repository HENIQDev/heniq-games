// ランナーの 3D モデル（コードから生成する低ポリゴンの人型。外部モデルなし）。LOD0／1／2 の 3 段階。
// 頂点：pos(3) nrm(3) part(1) slot(1) ＝ 8 float。パーツ番号を持たせ、頂点シェーダーが関節を動かす。
export const PART = { PELVIS: 0, TORSO: 1, HEAD: 2, UARM_L: 3, UARM_R: 4, FARM_L: 5, FARM_R: 6, THIGH_L: 7, THIGH_R: 8, SHIN_L: 9, SHIN_R: 10 };
export const SLOT = { SKIN: 0, SHIRT: 1, SHORTS: 2, SHOES: 3, HAIR: 4, BAND: 5, STRIPE: 6 };
// 関節の位置（メートル。足元の中心が原点、y が上、z が前。左＝+x）。シェーダーにも同じ値を渡す
export const PIVOT = {
  hipL: [0.1, 0.95, 0], hipR: [-0.1, 0.95, 0],
  kneeL: [0.1, 0.51, 0], kneeR: [-0.1, 0.51, 0],
  shoulderL: [0.24, 1.42, 0], shoulderR: [-0.24, 1.42, 0],
  elbowL: [0.24, 1.12, 0], elbowR: [-0.24, 1.12, 0],
};

const FACES = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] }, { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
];

class MeshBuilder {
  constructor() { this.v = []; this.i = []; }
  vert(p, n, part, slot) { this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], part, slot); return this.v.length / 8 - 1; }
  box(cx, cy, cz, sx, sy, sz, part, slot) {
    const h = [sx / 2, sy / 2, sz / 2];
    for (const f of FACES) {
      const ax = (a) => Math.abs(a[0]) * h[0] + Math.abs(a[1]) * h[1] + Math.abs(a[2]) * h[2];   // その軸方向の半分の長さ
      const hn = ax(f.n), hu = ax(f.u), hv = ax(f.v);
      const c = [cx + f.n[0] * hn, cy + f.n[1] * hn, cz + f.n[2] * hn];
      const corner = (su, sv) => [c[0] + f.u[0] * hu * su + f.v[0] * hv * sv, c[1] + f.u[1] * hu * su + f.v[1] * hv * sv, c[2] + f.u[2] * hu * su + f.v[2] * hv * sv];
      const a = this.vert(corner(-1, -1), f.n, part, slot), b = this.vert(corner(1, -1), f.n, part, slot);
      const d = this.vert(corner(1, 1), f.n, part, slot), e = this.vert(corner(-1, 1), f.n, part, slot);
      this.i.push(a, b, d, a, d, e);
    }
  }
  // 球（面ごとの法線＝フラットシェーディング。外向きを確認して向きをそろえる）
  sphere(cx, cy, cz, r, seg, rings, part, slot) {
    const pt = (lon, lat) => [cx + r * Math.cos(lat) * Math.sin(lon), cy + r * Math.sin(lat), cz + r * Math.cos(lat) * Math.cos(lon)];
    const tri = (a, b, c) => {
      let n = cross(sub(b, a), sub(c, a));
      const m = [(a[0] + b[0] + c[0]) / 3 - cx, (a[1] + b[1] + c[1]) / 3 - cy, (a[2] + b[2] + c[2]) / 3 - cz];
      if (dot(n, m) < 0) { [b, c] = [c, b]; n = [-n[0], -n[1], -n[2]]; }
      const l = Math.hypot(...n) || 1;
      n = [n[0] / l, n[1] / l, n[2] / l];
      const ia = this.vert(a, n, part, slot), ib = this.vert(b, n, part, slot), ic = this.vert(c, n, part, slot);
      this.i.push(ia, ib, ic);
    };
    for (let k = 0; k < rings; k++) {
      const lat0 = -Math.PI / 2 + (k / rings) * Math.PI, lat1 = -Math.PI / 2 + ((k + 1) / rings) * Math.PI;
      for (let s = 0; s < seg; s++) {
        const lon0 = (s / seg) * Math.PI * 2, lon1 = ((s + 1) / seg) * Math.PI * 2;
        const p00 = pt(lon0, lat0), p10 = pt(lon1, lat0), p01 = pt(lon0, lat1), p11 = pt(lon1, lat1);
        if (k > 0) tri(p00, p10, p11);
        if (k < rings - 1) tri(p00, p11, p01);
      }
    }
  }
  build() { return { vertices: new Float32Array(this.v), indices: new Uint16Array(this.i), triangles: this.i.length / 3 }; }
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const P = PART, S = SLOT;

export function buildRunnerLOD(level) {
  const m = new MeshBuilder();
  if (level === 0) {
    m.box(0, 0.95, 0, 0.34, 0.2, 0.2, P.PELVIS, S.SHORTS);
    m.box(0, 1.25, 0, 0.38, 0.46, 0.22, P.TORSO, S.SHIRT);
    m.box(0, 1.22, 0.112, 0.385, 0.08, 0.012, P.TORSO, S.STRIPE);
    m.sphere(0, 1.62, 0, 0.115, 8, 5, P.HEAD, S.SKIN);
    m.box(0, 1.715, -0.005, 0.235, 0.065, 0.245, P.HEAD, S.HAIR);
    m.box(0, 1.665, 0, 0.245, 0.04, 0.245, P.HEAD, S.BAND);
    for (const [sx, up, fa, th, sh] of [[1, P.UARM_L, P.FARM_L, P.THIGH_L, P.SHIN_L], [-1, P.UARM_R, P.FARM_R, P.THIGH_R, P.SHIN_R]]) {
      m.box(sx * 0.255, 1.27, 0, 0.1, 0.3, 0.1, up, S.SHIRT);
      m.box(sx * 0.255, 0.97, 0, 0.085, 0.3, 0.085, fa, S.SKIN);
      m.box(sx * 0.1, 0.74, 0, 0.14, 0.42, 0.15, th, S.SKIN);
      m.box(sx * 0.1, 0.32, 0, 0.12, 0.42, 0.13, sh, S.SKIN);
      m.box(sx * 0.1, 0.05, 0.045, 0.13, 0.1, 0.27, sh, S.SHOES);
    }
  } else if (level === 1) {
    m.box(0, 0.95, 0, 0.34, 0.2, 0.2, P.PELVIS, S.SHORTS);
    m.box(0, 1.25, 0, 0.38, 0.46, 0.22, P.TORSO, S.SHIRT);
    m.sphere(0, 1.62, 0, 0.115, 6, 3, P.HEAD, S.SKIN);
    m.box(0.255, 1.12, 0, 0.1, 0.6, 0.1, P.UARM_L, S.SHIRT);
    m.box(-0.255, 1.12, 0, 0.1, 0.6, 0.1, P.UARM_R, S.SHIRT);
    m.box(0.1, 0.5, 0, 0.14, 0.95, 0.15, P.THIGH_L, S.SKIN);
    m.box(-0.1, 0.5, 0, 0.14, 0.95, 0.15, P.THIGH_R, S.SKIN);
  } else {
    m.box(0, 1.1, 0, 0.36, 0.7, 0.21, P.TORSO, S.SHIRT);
    m.box(0, 1.62, 0, 0.22, 0.22, 0.22, P.HEAD, S.SKIN);
    m.box(0.1, 0.47, 0, 0.14, 0.95, 0.15, P.THIGH_L, S.SKIN);
    m.box(-0.1, 0.47, 0, 0.14, 0.95, 0.15, P.THIGH_R, S.SKIN);
  }
  return m.build();
}
