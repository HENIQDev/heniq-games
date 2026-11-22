// ボール避け：飛んでくるボールをひたすら避ける。スコアは生き延びた時間。
import { startGame } from '../platform/core/runtime.js';

const W = 480;
const H = 720;
const PLAYER_R = 11;
const PLAYER_SPEED = 360;   // px/秒
const HIT_FORGIVE = 0.8;    // 当たり判定をやや甘くする（理不尽感を減らす）
const MAX_BALLS = 90;

function create(env) {
  const { rng, input } = env;
  const player = { x: W / 2, y: H * 0.75 };
  const balls = [];
  let t = 0;
  let spawnTimer = 0.4;
  const self = {
    score: 0,      // 生き延びたミリ秒
    isOver: false,
    get balls() { return balls.length; },

    update(dt) {
      t += dt;
      movePlayer(dt);
      spawn(dt);
      for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < -80 || b.x > W + 80 || b.y < -80 || b.y > H + 80) { balls.splice(i, 1); continue; }
        const d = Math.hypot(b.x - player.x, b.y - player.y);
        if (d < (b.r + PLAYER_R) * HIT_FORGIVE) self.isOver = true;
      }
      self.score = Math.floor(t * 1000);
    },

    draw(g) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      // 時間がたつほど背景がうっすら明るくなる
      g.fillStyle = 'rgba(205,222,255,' + Math.min(0.08, t / 900) + ')';
      g.fillRect(0, 0, W, H);
      for (const b of balls) {
        g.fillStyle = b.color;
        g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = self.isOver ? '#ff5a5a' : '#fff';
      g.beginPath(); g.arc(player.x, player.y, PLAYER_R, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff';
      g.font = '700 28px sans-serif';
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillText((self.score / 1000).toFixed(1) + ' s', 16, 14);
      g.fillStyle = '#a8a8a8';
      g.font = '14px sans-serif';
      g.textAlign = 'right';
      g.fillText('BALLS ' + balls.length, W - 16, 20);
    },
  };

  function movePlayer(dt) {
    if (input.pointer.active) {
      // 指・マウスの位置へ向かう（指で隠れないよう、少し上を目標にする）
      const tx = input.pointer.x;
      const ty = input.pointer.y - 28;
      const dx = tx - player.x;
      const dy = ty - player.y;
      const dist = Math.hypot(dx, dy);
      const stepLen = PLAYER_SPEED * 1.6 * dt;
      if (dist <= stepLen) { player.x = tx; player.y = ty; }
      else { player.x += (dx / dist) * stepLen; player.y += (dy / dist) * stepLen; }
    } else {
      const a = input.axis();
      player.x += a.x * PLAYER_SPEED * dt;
      player.y += a.y * PLAYER_SPEED * dt;
    }
    player.x = Math.min(W - PLAYER_R, Math.max(PLAYER_R, player.x));
    player.y = Math.min(H - PLAYER_R, Math.max(PLAYER_R, player.y));
  }

  function spawn(dt) {
    spawnTimer -= dt;
    while (spawnTimer <= 0 && balls.length < MAX_BALLS) {
      spawnTimer += Math.max(0.1, 0.65 - t * 0.008);
      addBall();
    }
    if (spawnTimer < 0) spawnTimer = 0;
  }

  function addBall() {
    // 画面の外周のどこかから、プレイヤーの付近をねらって飛んでくる
    const side = rng.int(0, 3);
    let x, y;
    if (side === 0) { x = rng.range(0, W); y = -30; }
    else if (side === 1) { x = W + 30; y = rng.range(0, H); }
    else if (side === 2) { x = rng.range(0, W); y = H + 30; }
    else { x = -30; y = rng.range(0, H); }
    const aimX = player.x + rng.range(-90, 90);
    const aimY = player.y + rng.range(-90, 90);
    const speed = Math.min(150 + t * 4, 340) * rng.range(0.8, 1.2);
    const len = Math.hypot(aimX - x, aimY - y) || 1;
    const shade = rng.int(0, 2);
    balls.push({
      x, y,
      vx: ((aimX - x) / len) * speed,
      vy: ((aimY - y) / len) * speed,
      r: rng.range(8, 17),
      color: ['#cddeff', '#8fb0ff', '#ff9d6b'][shade],
    });
  }

  return self;
}

startGame({
  id: 'ball-dodge',
  title: 'BALL DODGE',
  tagline: '飛んでくるボールを避け続けろ',
  controls: ['PC：矢印キー／WASD で移動', 'スマホ：画面をなぞって移動', 'Esc：ポーズ'],
  width: W,
  height: H,
  scoreOrder: 'high',
  formatScore: (ms) => (ms / 1000).toFixed(2) + ' 秒',
  create,
});
