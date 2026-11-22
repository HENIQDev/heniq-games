// ランナーのスプライト（HENIQ 独自の単純な図形）。起動時に 1 枚のアトラスへ事前に描き、毎フレームは drawImage だけにする。
export const CELL_W = 40;
export const CELL_H = 56;
export const SHIRTS = ['#ff6b6b', '#4dabf7', '#ffd43b', '#51cf66', '#cc5de8', '#ff922b'];
export const POSES = { RUN0: 0, RUN1: 1, RUN2: 2, RUN3: 3, STUMBLE: 4, FALLEN: 5, JUMP: 6 };
const INK = '#2b2350';
const SKIN = '#f3c9a0';

function drawRunner(g, ox, oy, pose, shirt, isPlayer) {
  g.save();
  g.translate(ox + 20, oy + 54);                      // 足元の中心
  g.lineJoin = 'round';
  g.lineCap = 'round';
  if (pose === POSES.FALLEN) {
    // 倒れている：横向き＋目が回っている印
    g.fillStyle = 'rgba(43,35,80,0.2)';
    g.beginPath(); g.ellipse(0, -2, 17, 4, 0, 0, 6.2832); g.fill();
    g.rotate(-Math.PI / 2 + 0.15);
    g.translate(0, -2);
    body(g, shirt, 0, isPlayer, true);
    g.restore();
    g.fillStyle = '#ffd43b';
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(ox + 12 + i * 8, oy + 38 - (i % 2) * 3, 2.3, 0, 6.2832); g.fill(); }
    return;
  }
  g.fillStyle = 'rgba(43,35,80,0.22)';
  g.beginPath(); g.ellipse(0, 0, 11, 3, 0, 0, 6.2832); g.fill();
  if (pose === POSES.STUMBLE) g.rotate(-0.35);
  body(g, shirt, pose, isPlayer, false);
  g.restore();
}

function body(g, shirt, pose, isPlayer, lying) {
  const phase = pose <= 3 ? pose : 0;
  const swing = [8, 0, -8, 0][phase];
  const jump = pose === POSES.JUMP;
  const stumble = pose === POSES.STUMBLE;
  g.strokeStyle = INK;
  g.lineWidth = 2;
  // 足
  g.fillStyle = SKIN;
  const legs = jump ? [[-4, -14, 3, -9], [4, -14, 9, -9]] : [[-4, -16, -4 + swing * 0.45, -2], [4, -16, 4 - swing * 0.45, -2]];
  for (const [x0, y0, x1, y1] of legs) {
    g.lineWidth = 5; g.strokeStyle = INK; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.lineWidth = 3; g.strokeStyle = SKIN; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
  // 短パン
  g.fillStyle = INK;
  g.fillRect(-7, -20, 14, 6);
  // 腕
  const arms = (jump || stumble) ? [[-8, -32, -13, -43], [8, -32, 13, -43]] : [[-8, -32, -9 - swing * 0.4, -22], [8, -32, 9 + swing * 0.4, -22]];
  for (const [x0, y0, x1, y1] of arms) {
    g.lineWidth = 4.6; g.strokeStyle = INK; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.lineWidth = 2.6; g.strokeStyle = SKIN; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
  // 胴
  g.fillStyle = shirt;
  g.strokeStyle = INK;
  g.lineWidth = 2;
  g.beginPath(); g.roundRect ? g.roundRect(-8, -36, 16, 18, 4) : g.rect(-8, -36, 16, 18); g.fill(); g.stroke();
  if (isPlayer) { g.fillStyle = '#fff'; g.fillRect(-8, -30, 16, 4); g.strokeRect(-8, -36, 16, 18); }
  // 頭
  g.fillStyle = SKIN;
  g.beginPath(); g.arc(0, -43, 7, 0, 6.2832); g.fill(); g.stroke();
  g.fillStyle = INK;
  g.beginPath(); g.arc(0, -45, 7, Math.PI, 0); g.fill();
  if (isPlayer) { g.fillStyle = '#e6256f'; g.fillRect(-7, -48, 14, 3); }
  void lying;
}

// アトラス：行＝色（SHIRTS 6 色＋プレイヤー）、列＝ポーズ（7）
export function buildAtlas() {
  const rows = SHIRTS.length + 1;
  const c = document.createElement('canvas');
  c.width = CELL_W * 7;
  c.height = CELL_H * rows;
  const g = c.getContext('2d');
  for (let r = 0; r < rows; r++) {
    for (let p = 0; p < 7; p++) drawRunner(g, p * CELL_W, r * CELL_H, p, r < SHIRTS.length ? SHIRTS[r] : '#ff7a2f', r === SHIRTS.length);
  }
  return c;
}
