// 4×4 行列（列優先）と、描画に必要な最小限の関数。
export const m4 = {
  ident() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
  mul(a, b, o) {
    o = o || new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  },
  persp(fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
    o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = (2 * f * n) / (n - f);
    return o;
  },
  look(e, c, u) {
    let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
    let m = Math.hypot(zx, zy, zz); zx /= m; zy /= m; zz /= m;
    let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx;
    m = Math.hypot(xx, xy, xz); xx /= m; xy /= m; xz /= m;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
  },
  T(x, y, z) { const o = m4.ident(); o[12] = x; o[13] = y; o[14] = z; return o; },
  S(x, y, z) { const o = m4.ident(); o[0] = x; o[5] = y; o[10] = z; return o; },
  RX(a) { const o = m4.ident(), c = Math.cos(a), s = Math.sin(a); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; },
  RY(a) { const o = m4.ident(), c = Math.cos(a), s = Math.sin(a); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; },
  RZ(a) { const o = m4.ident(), c = Math.cos(a), s = Math.sin(a); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; },
  // 上 3×3 の逆転置（法線用）
  normal(m, o) {
    o = o || new Float32Array(9);
    const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
    const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g;
    let det = a * A + b * B + c * C;
    det = Math.abs(det) < 1e-9 ? 1 : 1 / det;
    o[0] = A * det; o[1] = B * det; o[2] = C * det;
    o[3] = (c * h - b * i) * det; o[4] = (a * i - c * g) * det; o[5] = (b * g - a * h) * det;
    o[6] = (b * f - c * e) * det; o[7] = (c * d - a * f) * det; o[8] = (a * e - b * d) * det;
    return o;
  },
};
export function hex(h) {
  if (Array.isArray(h)) return h;
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
