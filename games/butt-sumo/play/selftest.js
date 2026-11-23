// 起動時の自己テスト：シミュレーション・3D 描画（全キャラ）・全画面の生成が、エラーなく動くことを確かめる。
import { createMatch, step, emptyInput } from './sim.js';
import { createAI } from './ai.js';

export function runSelfTest({ G, gfx, S, STAGES, CHARS }) {
  const checks = [];
  const ok = (name, cond, extra) => checks.push({ name, ok: !!cond, extra });
  try {
    const s = createMatch({ chars: ['ojisan', 'gorilla'], seed: 1 });
    const A = createAI(STAGES[50].profile, 1), B = createAI(STAGES[50].profile, 2);
    let finite = true;
    for (let i = 0; i < 200 && !s.over; i++) { step(s, A.think(s, 0), B.think(s, 1)); for (const f of s.f) if (![f.x, f.y, f.dmg, f.sta].every(Number.isFinite)) finite = false; }
    ok('シミュレーションが動き、数値が壊れない', finite && s.tick > 100);
    const gl = gfx.gl;
    for (const c of CHARS) { gfx.render({ preview: { id: c.id, yaw: 0.5, pose: 'idle' }, mode: 'menu', dt: 0.016, time: 1, flip: false }); }
    ok('全キャラクターの 3D 描画（GL エラーなし）', gl.getError() === 0, String(gl.getError()));
    for (const name of ['title', 'menu', 'chars', 'stages', 'how', 'settings']) { const el = S[name](name === 'chars' ? { purpose: 'view' } : {}); ok('画面 ' + name, el && el.childElementCount > 0); }
    ok('100 ステージ', STAGES.length === 100);
  } catch (e) { ok('例外なし', false, String(e && e.stack || e)); }
  const pre = document.createElement('pre');
  pre.id = 'selftest-result';
  pre.textContent = JSON.stringify({ ok: checks.every((c) => c.ok), checks });
  document.body.append(pre);
}
