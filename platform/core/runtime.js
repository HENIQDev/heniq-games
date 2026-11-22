// ゲームの共通ランタイム：ループ・画面の拡縮・開始／ゲームオーバー／リトライ・自己ベスト・一時停止。
// ゲーム側は create(env) が返す { update(dt), draw(g), score, isOver, hud?() } だけを書けばよい。
import { createInput } from './input.js';
import { createRng, newSeed } from './rng.js';
import { loadNumber, saveNumber } from './storage.js';
import { createAudio } from './audio.js';

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
  // ゲームごとの見た目（任意）：オーバーレイの色・フォントを CSS 変数で渡す（CSP に合う CSSOM での設定）
  for (const [k, v] of Object.entries(def.theme || {})) root.style.setProperty('--hg-' + k, v);
  const audio = createAudio();
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const stage = el('div', 'hg-stage');
  const canvas = el('canvas', 'hg-canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const overlay = el('div', 'hg-overlay');
  stage.append(canvas, overlay);
  root.append(stage);
  // WebGL2 を使うゲーム（def.gl）：3D 用の Canvas を、操作・HUD 用の 2D Canvas の下に重ねる
  let glCanvas = null;
  let gl = null;
  let glLost = false;
  if (def.gl) {
    glCanvas = el('canvas', 'hg-canvas hg-gl');
    canvas.classList.add('hg-over2d');
    stage.insertBefore(glCanvas, canvas);
    try {
      gl = glCanvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!def.gl.preserve });
    } catch (e) { gl = null; }
    glCanvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); glLost = true; });
    glCanvas.addEventListener('webglcontextrestored', () => { glLost = false; if (game && game.restoreGL) game.restoreGL(gl); if (game) draw(); });
  }
  const muteBtn = el('button', 'hg-mute');
  muteBtn.type = 'button';
  const syncMute = () => {
    muteBtn.textContent = audio.muted ? '♪×' : '♪';
    muteBtn.setAttribute('aria-label', audio.muted ? '音を出す' : '音を消す');
    muteBtn.setAttribute('aria-pressed', String(audio.muted));
  };
  audio.onMute(syncMute);
  syncMute();
  muteBtn.addEventListener('click', () => { audio.unlock(); audio.toggleMute(); muteBtn.blur(); });
  stage.append(muteBtn);
  const g = canvas.getContext('2d');
  const input = createInput(canvas, size);

  let state = 'title'; // title | playing | over | paused
  let game = null;
  let acc = 0;
  let last = 0;
  let raf = 0;
  let best = loadNumber(bestKey, NaN);
  let runCount = 0;
  // フレームの統計：直近 600 フレームの間隔・CPU 時間・入力遅延（ゲーム内の ?perf=1 やベンチが使う）
  const stat = { dt: [], cpu: [], lat: [], last: 0 };
  const pushStat = (arr, v) => { arr.push(v); if (arr.length > 600) arr.shift(); };
  const pct = (arr, p) => { if (!arr.length) return 0; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * p))]; };
  const avg = (arr) => (arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : 0);
  const stats = {
    reset() { stat.dt.length = 0; stat.cpu.length = 0; stat.lat.length = 0; stat.last = 0; },
    get() {
      return {
        frames: stat.dt.length, fps: stat.dt.length ? 1000 / avg(stat.dt) : 0, dtAvg: avg(stat.dt), dtP95: pct(stat.dt, 0.95), dtMax: Math.max(0, ...stat.dt),
        cpuAvg: avg(stat.cpu), cpuP95: pct(stat.cpu, 0.95), cpuMax: Math.max(0, ...stat.cpu), latAvg: avg(stat.lat), latMax: Math.max(0, ...stat.lat),
      };
    },
  };
  let held = false; // スクリーンショットなどの確認用：true の間は自動で進めない
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
    if (game && game.onResize) game.onResize(w, h, dpr);
    if (game && state !== 'playing') draw();
  }

  // ---- 画面の部品 ----
  function showOverlay(kind) {
    overlay.replaceChildren();
    overlay.classList.toggle('hg-hidden', kind === null);
    if (kind === null) return;
    const box = el('div', 'hg-panel');
    if (kind === 'nogl') {
      box.append(el('h2', 'hg-over', def.title));
      box.append(el('p', 'hg-tagline', 'このゲームは WebGL2 に対応したブラウザが必要です。'));
      box.append(el('p', 'hg-how', 'iPhone は iOS 15 以降の Safari、PC は最新の Chrome・Edge・Firefox・Safari でお試しください。'));
      const home = el('a', 'hg-btn hg-primary', 'ゲーム一覧');
      home.href = '../';
      box.append(home);
    } else if (kind === 'title') {
      box.append(el('h1', 'hg-title', def.title));
      if (def.tagline) box.append(el('p', 'hg-tagline', def.tagline));
      const how = el('div', 'hg-how');
      for (const line of def.controls || []) how.append(el('p', null, line));
      box.append(how);
      if (hasBest()) box.append(el('p', 'hg-best', 'ベスト  ' + fmt(best)));
      box.append(button('START', 'hg-btn hg-primary', startRun));
      const about = el('a', 'hg-link', 'あそびかた・ゲーム詳細');
      about.href = 'about/';
      box.append(about);
    } else if (kind === 'over') {
      box.append(el('h2', 'hg-over', def.overTitle || 'GAME OVER'));
      box.append(el('p', 'hg-score', fmt(game.score)));
      for (const line of game.resultLines || []) box.append(el('p', 'hg-best', line));
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
    game = def.create({ rng, input, audio, reducedMotion, runCount, gl, glCanvas, stats, stageSize: () => ({ w: stage.clientWidth, h: stage.clientHeight, dpr: Math.min(window.devicePixelRatio || 1, 2) }), get best() { return hasBest() ? best : 0; }, width: size.width, height: size.height });
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
    stat.last = 0;
    showOverlay(null);
    canvas.focus({ preventScroll: true });
    if (def.bgm) audio.startBgm(def.bgm);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function finish() {
    state = 'over';
    input.setEnabled(false);
    audio.stopBgm();
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
    audio.stopBgm();
    showOverlay('paused');
  }
  function resume() {
    if (state !== 'paused') return;
    state = 'playing';
    input.setEnabled(true);
    showOverlay(null);
    if (def.bgm) audio.startBgm(def.bgm);
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
    if (gl && !glLost && game.drawGL) game.drawGL(gl);
    g.save();
    game.draw(g);
    g.restore();
  }

  function frame(now) {
    if (state !== 'playing') return;
    if (held) { draw(); raf = requestAnimationFrame(frame); return; }
    const t0 = performance.now();
    if (stat.last) pushStat(stat.dt, now - stat.last);
    stat.last = now;
    acc += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    while (acc >= STEP && state === 'playing') {
      acc -= STEP;
      step(STEP);
    }
    if (state === 'playing') {
      draw();
      pushStat(stat.cpu, performance.now() - t0);
      const stamp = input.takeStamp();
      if (stamp) pushStat(stat.lat, performance.now() - stamp);
      raf = requestAnimationFrame(frame);
    }
  }

  // ---- イベント ----
  window.addEventListener('resize', fit);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyM') { audio.unlock(); audio.toggleMute(); return; }
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
  showOverlay(def.gl && !gl ? 'nogl' : 'title');

  // 自己テストやデバッグ用（ゲームの進行そのものを操作する口。ランキングなどの外部には出さない）
  const controller = {
    get state() { return state; },
    get game() { return game; },
    input,
    start: startRun,
    step,
    render: draw,
    hold(v) { held = !!v; },
    get runCount() { return runCount; },
    audio,
    stats,
    gl,
    get glLost() { return glLost; },
  };
  if (/[?&]selftest=1/.test(location.search)) {
    import('./selftest.js').then((m) => m.runSelfTest(controller, def));
  }
  // 検証用（?debug=1）：実際のキー・タッチ操作の確認テストが、状態を読むための口
  if (/[?&]debug=1/.test(location.search)) window.__heniq = controller;
  return controller;
}
