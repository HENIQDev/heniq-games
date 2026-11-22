// 自動検査・計測用（?botcheck=1・?bench=1・?gltest=1・?shot=…）。通常のプレイでは読み込まれない。
// idle：何もしない／smart：人を避けて、ダッシュとジャンプを使い分ける（最上級に近い人間の代わり）。
import { ST, P } from './sim.js';

function decide(game, state) {
  const sim = game.sim, p = sim.player, x = sim.x, z = sim.z;
  // 横：前方の人から遠い向きを選ぶ
  let best = 0, bestCost = 1e9;
  for (const a of [-1, -0.5, 0, 0.5, 1]) {
    const px = Math.max(-14.5, Math.min(14.5, p.x + a * P.lat * 0.5));
    let cost = Math.abs(a) * 0.15 + (Math.abs(px) > 13.5 ? 3 : 0);
    for (let i = 0; i < sim.M; i++) {
      const dz = z[i] - p.z;
      if (dz < -0.3 || dz > 4.5) continue;
      const dx = Math.abs(x[i] - px);
      if (dx < 1.0) cost += (1.0 - dx) * (sim.st[i] === ST.FALLEN ? 1.2 : 2.5) / Math.max(0.4, dz + 0.5);
    }
    if (cost < bestCost) { bestCost = cost; best = a; }
  }
  // ダッシュ：スタミナの使い分け（0 まで使い切ると息切れで損をする）
  if (p.stam < 8) state.dash = false;
  else if (p.stam > 45) state.dash = true;
  // ジャンプ：進路上に転んだ人がいるとき
  let jump = false;
  if (p.jumpCd <= 0 && p.jumpT <= 0 && p.fallT <= 0) {
    for (let i = 0; i < sim.M; i++) {
      if (sim.st[i] !== ST.FALLEN) continue;
      const dz = z[i] - p.z;
      if (dz > 0.5 && dz < 2.4 && Math.abs(x[i] - p.x) < 0.8) { jump = true; break; }
    }
  }
  return { axis: best, dash: state.dash && p.exhaust <= 0, jump };
}

function drive(c, cmd) {
  const inj = c.input.inject;
  inj.up('ArrowLeft'); inj.up('ArrowRight');
  if (cmd.axis > 0.3) inj.down('ArrowRight');
  else if (cmd.axis < -0.3) inj.down('ArrowLeft');
  inj.zone('dash', cmd.dash);
  if (cmd.jump) inj.zone('jump', true); else inj.zone('jump', false);
}

export function play(c, mode, seed, maxSec) {
  c.start(seed);
  c.hold(true);
  const state = { dash: true };
  let frames = 0;
  while (c.state === 'playing' && frames < maxSec * 60) {
    drive(c, mode === 'smart' ? decide(c.game, state) : { axis: 0, dash: false, jump: false });
    c.step(1 / 60);
    frames += 1;
  }
  const s = c.game.sim;
  drive(c, { axis: 0, dash: false, jump: false });
  c.hold(false);
  return { rank: s.finished ? s.finalRank : s.rank, finished: s.finished, time: s.finishTime, bumps: s.bumps, falls: s.falls, overtakes: s.overtakes };
}

function out(obj) {
  const pre = document.createElement('pre');
  pre.id = 'bot-result';
  pre.textContent = typeof obj === 'string' ? obj : JSON.stringify(obj);
  document.body.append(pre);
  return pre;
}

const stat = (arr) => {
  const a = [...arr].sort((x, y) => x - y);
  const avg = a.reduce((s, v) => s + v, 0) / (a.length || 1);
  return { avg, min: a[0] || 0, max: a[a.length - 1] || 0, p95: a[Math.min(a.length - 1, Math.floor(a.length * 0.95))] || 0 };
};


// 計測環境の確認：何も描かない（クリアだけの）WebGL を 60 フレーム回し、GPU 時間とフレーム間隔を測る。
// この値が大きいとき（GPU が他の処理で埋まっている）、FPS・GPU 時間の結果は参考にならない。
function baseline() {
  return new Promise((resolve) => {
    const cv = document.createElement('canvas');
    cv.width = 960; cv.height = 1440;
    const gl = cv.getContext('webgl2');
    if (!gl) return resolve({ ok: false, note: 'WebGL2 なし' });
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const qs = [], gt = [], dts = [];
    let last = 0, n = 0;
    const f = (now) => {
      if (last) dts.push(now - last);
      last = now;
      for (const e of qs) if (!e.d && gl.getQueryParameter(e.q, gl.QUERY_RESULT_AVAILABLE)) { gt.push(gl.getQueryParameter(e.q, gl.QUERY_RESULT) / 1e6); e.d = 1; }
      let q = null;
      if (ext) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
      gl.clearColor(0.1, 0.2, 0.3, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push({ q, d: 0 }); }
      if (++n < 60) requestAnimationFrame(f);
      else setTimeout(() => {
        const a = (v) => (v.length ? v.reduce((x, y) => x + y, 0) / v.length : null);
        const dt = a(dts), g = a(gt);
        const clean = dt < 20 && (g === null || g < 3);
        resolve({ ok: clean, frame_ms: dt && +dt.toFixed(1), fps: dt && +(1000 / dt).toFixed(1), gpu_clear_ms: g === null ? 'n/a' : +g.toFixed(2), verdict: clean ? '正常（結果は有効）' : '【警告】何も描かないのに遅い。この端末・環境が他の処理で高負荷です。FPS・GPU 時間の結果は参考外にしてください' });
      }, 150);
    };
    requestAnimationFrame(f);
  });
}

// ---- ベンチ：ボットが実時間でレースを走り、1 秒ごとに FPS・CPU・GPU を記録する（実機でも同じものを使う）----
async function bench(c, q) {
  const base = await baseline();
  const loops = Math.max(1, Number(q.get('loop') || 1));
  const secs = [];
  const state = { dash: true };
  let race = 0, nextSample = 0, lastGpu = null;
  const t0 = performance.now();
  c.start(100 + race);
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:9;background:rgba(0,0,0,.82);color:#9fffb0;font:12px ui-monospace,Menlo,monospace;padding:8px;white-space:pre-wrap;max-height:45vh;overflow:auto';
  panel.textContent = 'ベンチ実行中… ' + loops + ' レース（約 ' + loops * 25 + ' 秒）。画面に触れず、そのままお待ちください。';
  document.body.append(panel);
  function frame(now) {
    if (c.state === 'playing') {
      drive(c, decide(c.game, state));
      if (c.game.countdown <= 0 && now >= nextSample) {
        if (nextSample) {
          const s = c.stats.get(), r = c.game.renderer ? c.game.renderer.stats : null;
          if (s.frames > 5) secs.push({ t: (now - t0) / 1000, fps: s.fps, dtP95: s.dtP95, dtMax: s.dtMax, cpu: s.cpuAvg, gpu: r && r.gpuMs != null ? r.gpuMs : null });
          if (r) lastGpu = r.gpuMs;
        }
        c.stats.reset();
        nextSample = now + 1000;
      }
    } else if (c.state === 'over') {
      race += 1;
      if (race >= loops) return finish();
      c.start(100 + race);
    }
    requestAnimationFrame(frame);
  }
  function finish() {
    drive(c, { axis: 0, dash: false, jump: false });
    const fps = stat(secs.map((s) => s.fps)), cpu = stat(secs.map((s) => s.cpu)), p95 = stat(secs.map((s) => s.dtP95));
    const gpuS = secs.filter((s) => s.gpu != null).map((s) => s.gpu);
    const half = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const first = secs.filter((s) => s.t <= 30).map((s) => s.fps), last = secs.slice(-30).map((s) => s.fps);
    const r = c.game.renderer ? c.game.renderer.stats : {};
    const res = {
      device: { ua: navigator.userAgent, dpr: devicePixelRatio, screen: screen.width + 'x' + screen.height, cores: navigator.hardwareConcurrency || null, mem_gb: navigator.deviceMemory || null },
      canvas: document.querySelector('.hg-gl') ? document.querySelector('.hg-gl').width + 'x' + document.querySelector('.hg-gl').height : null,
      baseline: base,
      races: loops, seconds: secs.length, npc: c.game.sim.M,
      fps: { avg: +fps.avg.toFixed(1), min_second: +fps.min.toFixed(1), max_second: +fps.max.toFixed(1) },
      dt_p95_ms: { avg: +p95.avg.toFixed(1), worst: +p95.max.toFixed(1) },
      cpu_ms: { avg: +cpu.avg.toFixed(2), worst: +cpu.max.toFixed(2) },
      gpu_ms: gpuS.length ? { avg: +half(gpuS).toFixed(2), worst: +Math.max(...gpuS).toFixed(2) } : 'n/a（このブラウザでは取得できない。iPhone は Xcode の Instruments で）',
      thermal_proxy: loops >= 6 ? { fps_first_30s: +half(first).toFixed(1), fps_last_30s: +half(last).toFixed(1), drop_pct: +(100 * (1 - half(last) / Math.max(1, half(first)))).toFixed(1) } : '（loop=6 以上で計測。発熱の目安）',
      js_heap_mb: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : 'n/a',
      gpu_buffer_mb: r.gpuBytes ? +(r.gpuBytes() / 1048576).toFixed(2) : null,
      draw: { calls: r.drawCalls, triangles: r.triangles, lod_instances: r.instances, culled: r.culled, lod_tris: r.lodTriangles, world_tris: r.worldTriangles },
      render_scale_final: document.querySelector('.hg-gl') ? document.querySelector('.hg-gl').width : null,
      input_latency: '未計測（ボットの入力にはイベントがない。?perf=1 で実際に操作すると、画面に表示される）',
      last_gpu_ms: lastGpu,
    };
    panel.textContent = JSON.stringify(res, null, 1);
    out(res);
  }
  requestAnimationFrame(frame);
}

export function run(c) {
  const q = new URLSearchParams(location.search);
  if (q.get('bench')) return bench(c, q);
  if (q.get('cpubench')) {
    // JS の CPU 時間（更新＋インスタンス構築＋描画命令の発行＋HUD）。GPU は含まない。回帰の検出用
    c.start(5); c.hold(true);
    const state = { dash: true };
    const times = [];
    for (let f = 0; f < 600 && c.state === 'playing'; f++) {
      drive(c, decide(c.game, state));
      const t0 = performance.now();
      c.step(1 / 60);
      c.render();
      times.push(performance.now() - t0);
    }
    const st = stat(times.slice(30));
    out({ frames: times.length, avg_ms: st.avg, p95_ms: st.p95, max_ms: st.max, npc: c.game.sim.M });
    return null;
  }
  if (q.get('gltest')) {
    // 描画の確認：1 フレーム描いて、画素を読んで、背景だけでないこと・エラーがないことを確かめる
    c.start(5); c.hold(true);
    const state = { dash: true };
    for (let f = 0; f < 60 * 8; f++) { drive(c, decide(c.game, state)); c.step(1 / 60); }
    c.render();
    const gl = c.gl, cv = gl.canvas, w = cv.width, h = cv.height;
    const px = new Uint8Array(4);
    const seen = new Set();
    let nonBg = 0, total = 0;
    for (let yy = 0.1; yy < 1; yy += 0.1) for (let xx = 0.1; xx < 1; xx += 0.1) {
      gl.readPixels(Math.floor(w * xx), Math.floor(h * yy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      seen.add(px[0] + ',' + px[1] + ',' + px[2]); total += 1;
      if (!(px[0] > 240 && px[1] > 160 && px[1] < 190 && px[2] > 100 && px[2] < 135)) nonBg += 1;
    }
    const r = c.game.renderer.stats;
    out({ glError: gl.getError(), size: w + 'x' + h, distinctColors: seen.size, nonBackground: nonBg, samples: total, drawCalls: r.drawCalls, triangles: r.triangles, instances: r.instances, culled: r.culled, submitted: r.submitted, gpuBytes: r.gpuBytes(), lodTris: r.lodTriangles, worldTris: r.worldTriangles, npc: c.game.sim.M, gpuTimer: c.game.renderer.gpuTimerSupported });
    return null;
  }
  if (q.get('shot')) {
    const kind = q.get('shot'), seed = Number(q.get('seed') || 5), until = Number(q.get('t') || 10);
    if (kind === 'title') { out('ok'); return null; }
    c.start(seed); c.hold(true);
    const state = { dash: true };
    let f = 0;
    if (kind === 'over') {
      while (c.state === 'playing' && f < 60 * 120) { drive(c, decide(c.game, state)); c.step(1 / 60); f += 1; }
      c.hold(false);
    } else {
      while (c.state === 'playing' && c.game.sim.t < until && f < 60 * 120) { drive(c, decide(c.game, state)); c.step(1 / 60); f += 1; }
      drive(c, { axis: 0, dash: false, jump: false });
      c.render();
    }
    out('ok');
    return null;
  }
  const res = { idle: [], smart: [] };
  for (const s of [1, 2, 3]) res.idle.push(play(c, 'idle', s, 120));
  for (const s of [1, 2, 3, 4, 5]) res.smart.push(play(c, 'smart', s, 120));
  out(res);
  return null;
}
