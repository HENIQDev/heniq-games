// ゲームの共通ランタイム：ループ・画面の拡縮・開始／ゲームオーバー／リトライ・自己ベスト・一時停止。
// ゲーム側は create(env) が返す { update(dt), draw(g), score, isOver, hud?() } だけを書けばよい。
import { createInput } from './input.js';
import { createRng, newSeed } from './rng.js';
import { loadNumber, saveNumber } from './storage.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.1;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function startGame(def) {
  const root = document.getElementById('game');
  const size = { width: def.width, height: def.height };
  const order = def.scoreOrder === 'low' ? 'low' : 'high';
  const fmt = def.formatScore || ((s) => String(Math.floor(s)));
  const bestKey = 'best.' + def.id;

  root.classList.add('hg-root');
  const stage = el('div', 'hg-stage');
  const canvas = el('canvas', 'hg-canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const overlay = el('div', 'hg-overlay');
  stage.append(canvas, overlay);
  root.append(stage);
  const g = canvas.getContext('2d');
  const input = createInput(canvas, size);

  let state = 'title'; // title | playing | over | paused
  let game = null;
  let acc = 0;
  let last = 0;
  let raf = 0;
  let best = loadNumber(bestKey, NaN);
  let runCount = 0;
  const hasBest = () => Number.isFinite(best);

  // ---- 画面の拡縮（論理サイズを保ったまま、枠にぴったり合わせる） ----
  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vw = root.clientWidth || window.innerWidth;
    const vh = root.clientHeight || window.innerHeight;
    const scale = Math.min(vw / size.width, vh / size.height);
    const w = Math.floor(size.width * scale);
    const h = Math.floor(size.height * scale);
    stage.style.width = w + 'px';
    stage.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    g.setTransform(canvas.width / size.width, 0, 0, canvas.height / size.height, 0, 0);
    overlay.style.fontSize = Math.max(12, Math.round(w / 24)) + 'px';
    if (game && state !== 'playing') draw();
  }

  // ---- 画面の部品 ----
  function showOverlay(kind) {
    overlay.replaceChildren();
    overlay.classList.toggle('hg-hidden', kind === null);
    if (kind === null) return;
    const box = el('div', 'hg-panel');
    if (kind === 'title') {
      box.append(el('h1', 'hg-title', def.title));
      if (def.tagline) box.append(el('p', 'hg-tagline', def.tagline));
      const how = el('div', 'hg-how');
      for (const line of def.controls || []) how.append(el('p', null, line));
      box.append(how);
      if (hasBest()) box.append(el('p', 'hg-best', 'ベスト  ' + fmt(best)));
      box.append(button('START', 'hg-btn hg-primary', startRun));
    } else if (kind === 'over') {
      box.append(el('h2', 'hg-over', 'GAME OVER'));
      box.append(el('p', 'hg-score', fmt(game.score)));
      if (game.newBest) box.append(el('p', 'hg-new', 'NEW RECORD'));
      if (hasBest()) box.append(el('p', 'hg-best', 'ベスト  ' + fmt(best)));
      box.append(button('RETRY', 'hg-btn hg-primary', startRun));
      const home = el('a', 'hg-btn', 'ゲーム一覧');
      home.href = '../';
      box.append(home);
    } else if (kind === 'paused') {
      box.append(el('h2', 'hg-over', 'PAUSE'));
      box.append(button('再開', 'hg-btn hg-primary', resume));
    }
    overlay.append(box);
    const first = box.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  }
  function button(label, cls, fn) {
    const b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }

  // ---- 進行 ----
  function newGame(seed) {
    const rng = createRng(seed);
    game = def.create({ rng, input, width: size.width, height: size.height });
    game.seed = seed;
    game.newBest = false;
  }

  function startRun(seed) {
    runCount += 1;
    newGame(typeof seed === 'number' ? seed : newSeed());
    state = 'playing';
    input.clearPressed();
    input.setEnabled(true);
    acc = 0;
    last = performance.now();
    showOverlay(null);
    canvas.focus({ preventScroll: true });
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function finish() {
    state = 'over';
    input.setEnabled(false);
    const s = game.score;
    const better = !hasBest() || (order === 'high' ? s > best : s < best);
    if (better) { best = s; saveNumber(bestKey, s); game.newBest = true; }
    draw();
    showOverlay('over');
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    input.setEnabled(false);
    showOverlay('paused');
  }
  function resume() {
    if (state !== 'paused') return;
    state = 'playing';
    input.setEnabled(true);
    showOverlay(null);
    acc = 0;
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function step(dt) {
    game.update(dt);
    if (game.isOver) finish();
  }

  function draw() {
    g.save();
    game.draw(g);
    g.restore();
  }

  function frame(now) {
    if (state !== 'playing') return;
    acc += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    while (acc >= STEP && state === 'playing') {
      acc -= STEP;
      step(STEP);
    }
    if (state === 'playing') {
      draw();
      raf = requestAnimationFrame(frame);
    }
  }

  // ---- イベント ----
  window.addEventListener('resize', fit);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (state === 'playing' && (e.code === 'Escape' || e.code === 'KeyP')) pause();
    else if (state === 'paused' && (e.code === 'Escape' || e.code === 'KeyP')) resume();
    else if ((state === 'title' || state === 'over') && (e.code === 'Space' || e.code === 'Enter')) {
      if (document.activeElement && document.activeElement.tagName === 'A') return;
      e.preventDefault();
      startRun();
    }
  });

  // タイトル画面の背景には、動かない 1 フレーム目を描く
  newGame(1);
  fit();
  draw();
  showOverlay('title');

  // 自己テストやデバッグ用（ゲームの進行そのものを操作する口。ランキングなどの外部には出さない）
  const controller = {
    get state() { return state; },
    get game() { return game; },
    input,
    start: startRun,
    step,
    get runCount() { return runCount; },
  };
  if (/[?&]selftest=1/.test(location.search)) {
    import('./selftest.js').then((m) => m.runSelfTest(controller, def));
  }
  return controller;
}
