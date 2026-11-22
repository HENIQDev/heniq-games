// 自動検査用のボット（?botcheck=1 または ?shot=…）。通常のプレイでは読み込まれない。
// idle：何もしない／smart：ボールの進路を予測して、いちばん余裕のある向きへ動く（公平さの確認）。
const KEYS = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };
const DIRS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707]];
const W = 480, H = 720, SPEED = 360, PR = 11;

function decide(game) {
  const p = game.playerPos;
  const balls = game.ballList.filter((b) => Math.hypot(b.x - p.x, b.y - p.y) < 320);
  let best = null, bestScore = -1e9;
  for (const [dx, dy] of DIRS) {
    let clear = 1e9;
    for (let k = 1; k <= 8; k++) {
      const tau = k * 0.1;
      const px = Math.min(W - PR, Math.max(PR, p.x + dx * SPEED * tau));
      const py = Math.min(H - PR, Math.max(PR, p.y + dy * SPEED * tau));
      for (const b of balls) {
        const d = Math.hypot(b.x + b.vx * tau - px, b.y + b.vy * tau - py) - (b.r + PR);
        if (d < clear) clear = d;
      }
    }
    // 余裕が十分なら画面の中央寄りを好む（壁際に追い込まれないように）
    const cx = Math.min(p.x + dx * 60, W - 1), cy = Math.min(p.y + dy * 60, H - 1);
    const center = -Math.hypot(cx - W / 2, cy - H * 0.6) * 0.05;
    const score = Math.min(clear, 70) + center - (dx === 0 && dy === 0 ? 0 : 0.5);
    if (score > bestScore) { bestScore = score; best = [dx, dy]; }
  }
  return best;
}

function drive(c, dir) {
  const inj = c.input.inject;
  for (const k of Object.values(KEYS)) inj.up(k);
  if (dir[0] > 0.3) inj.down(KEYS.right);
  if (dir[0] < -0.3) inj.down(KEYS.left);
  if (dir[1] > 0.3) inj.down(KEYS.down);
  if (dir[1] < -0.3) inj.down(KEYS.up);
}

// 1 回プレイして、生き残った時間（ミリ秒）を返す。maxSec に達したら打ち切り
export function play(c, mode, seed, maxSec) {
  c.start(seed);
  c.hold(true);
  let frames = 0;
  while (c.state === 'playing' && frames < maxSec * 60) {
    drive(c, mode === 'smart' ? decide(c.game) : [0, 0]);
    c.step(1 / 60);
    frames += 1;
  }
  const ms = c.game.score;
  drive(c, [0, 0]);
  c.hold(false);
  return { ms, ended: c.state === 'over', nearMisses: c.game.nearMisses };
}

export function run(c) {
  const q = new URLSearchParams(location.search);
  const out = document.createElement('pre');
  out.id = 'bot-result';
  if (q.get('shot')) {
    // スクリーンショット用：ボットで指定の秒数まで進めて止める
    const kind = q.get('shot');
    const seed = Number(q.get('seed') || 7);
    if (kind === 'title') { out.textContent = 'ok'; document.body.append(out); return; }
    if (kind === 'over') {
      c.start(seed);
      c.hold(true);
      let f = 0;
      while (c.state === 'playing' && f < 60 * 120) { drive(c, f < 60 * Number(q.get('t') || 14) ? decide(c.game) : [0, 0]); c.step(1 / 60); f += 1; }
      drive(c, [0, 0]);
      c.hold(false);
    } else {
      c.start(seed);
      c.hold(true);
      const until = Number(q.get('t') || 8) * 60;
      let f = 0;
      while (c.state === 'playing' && f < until) { drive(c, decide(c.game)); c.step(1 / 60); f += 1; }
      drive(c, [0, 0]);
      c.render();
    }
    out.textContent = 'ok';
    document.body.append(out);
    return;
  }
  const seeds = [1, 2, 3, 4, 5];
  const res = { idle: [], smart: [] };
  for (const s of seeds) res.idle.push(play(c, 'idle', s, 60).ms);
  for (const s of seeds) res.smart.push(play(c, 'smart', s, 150));
  out.textContent = JSON.stringify(res);
  document.body.append(out);
}
