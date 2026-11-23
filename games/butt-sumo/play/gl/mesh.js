// 基本形状（球・箱・円柱・円錐・円盤）を、コードで生成する。頂点は 位置(3)+法線(3)。外部のモデルファイルは使わない。
// 三角形の向きを、頂点の法線に合わせてそろえる（輪郭線の描画が前面／背面を使うため）
function build(pos, idx) {
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 6, b = idx[t + 1] * 6, c = idx[t + 2] * 6;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const dot = nx * (pos[a + 3] + pos[b + 3] + pos[c + 3]) + ny * (pos[a + 4] + pos[b + 4] + pos[c + 4]) + nz * (pos[a + 5] + pos[b + 5] + pos[c + 5]);
    if (dot < 0) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
  }
  return { v: new Float32Array(pos), i: new Uint16Array(idx) };
}
export function sphere(seg = 20, ring = 14) {
  const p = [], ix = [];
  for (let y = 0; y <= ring; y++) {
    const v = y / ring, th = v * Math.PI;
    for (let x = 0; x <= seg; x++) {
      const u = x / seg, ph = u * Math.PI * 2;
      const nx = Math.sin(th) * Math.cos(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(ph);
      p.push(nx, ny, nz, nx, ny, nz);
    }
  }
  for (let y = 0; y < ring; y++) for (let x = 0; x < seg; x++) {
    const a = y * (seg + 1) + x, b = a + seg + 1;
    ix.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return build(p, ix);
}
export function box() {
  const p = [], ix = [];
  const faces = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
  for (const n of faces) {
    const u = n[1] !== 0 ? [1, 0, 0] : n[0] !== 0 ? [0, 0, -n[0]] : [n[2], 0, 0];
    const w = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const base = p.length / 6;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      p.push(0.5 * (n[0] + a * u[0] + b * w[0]), 0.5 * (n[1] + a * u[1] + b * w[1]), 0.5 * (n[2] + a * u[2] + b * w[2]), n[0], n[1], n[2]);
    }
    ix.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return build(p, ix);
}
// 円柱：半径 1・高さ 1（y −0.5〜0.5）。top/bottom の半径比で円錐台にもなる
export function cyl(seg = 24, rTop = 1, rBot = 1, caps = true) {
  const p = [], ix = [];
  const slope = (rBot - rTop);
  for (let x = 0; x <= seg; x++) {
    const a = (x / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const nl = Math.hypot(1, slope), nx = c / nl, ny = slope / nl, nz = s / nl;
    p.push(c * rTop, 0.5, s * rTop, nx, ny, nz, c * rBot, -0.5, s * rBot, nx, ny, nz);
  }
  for (let x = 0; x < seg; x++) { const a = x * 2; ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  if (caps) {
    for (const [y, r, ny] of [[0.5, rTop, 1], [-0.5, rBot, -1]]) {
      if (r <= 0) continue;
      const c0 = p.length / 6;
      p.push(0, y, 0, 0, ny, 0);
      for (let x = 0; x <= seg; x++) { const a = (x / seg) * Math.PI * 2; p.push(Math.cos(a) * r, y, Math.sin(a) * r, 0, ny, 0); }
      for (let x = 0; x < seg; x++) ny > 0 ? ix.push(c0, c0 + 2 + x, c0 + 1 + x) : ix.push(c0, c0 + 1 + x, c0 + 2 + x);
    }
  }
  return build(p, ix);
}
export function disc(seg = 48) {
  const p = [0, 0, 0, 0, 1, 0], ix = [];
  for (let x = 0; x <= seg; x++) { const a = (x / seg) * Math.PI * 2; p.push(Math.cos(a), 0, Math.sin(a), 0, 1, 0); }
  for (let x = 0; x < seg; x++) ix.push(0, 2 + x, 1 + x);
  return build(p, ix);
}
