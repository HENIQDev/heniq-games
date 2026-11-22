// 全ゲーム共通の自己テスト（?selftest=1）：起動→開始→操作→ゲームオーバー→リトライ。
// 結果は <pre id="selftest-result"> に JSON で出す（ヘッドレス Chrome が読む）。
export function runSelfTest(c, def) {
  const result = { game: def.id, checks: {}, ok: false };
  const check = (name, v) => { result.checks[name] = !!v; };
  try {
    check('title', c.state === 'title');
    c.start(12345);
    check('playing', c.state === 'playing');
    // 操作を与えながら進める（最大 10 分相当）。操作が効いてもいつかは終わる必要がある。
    let frames = 0;
    const cx = def.width / 2;
    // 入力は「ゲーム内の時間」で決める（カウントダウンの長さがプレイごとに違っても、同じ入力になるように）
    const clock = (f) => (c.game.simTime !== undefined ? c.game.simTime * 60 : f);
    while (c.state === 'playing' && frames < 60 * 600) {
      c.input.inject.pointer(cx + Math.sin(clock(frames) / 50) * cx * 0.8, def.height * 0.8, true);
      c.step(1 / 60);
      frames += 1;
    }
    check('over', c.state === 'over');
    check('score', Number.isFinite(c.game.score) && c.game.score > 0);
    const first = c.game.score;
    c.start(12345);
    check('retry', c.state === 'playing' && c.runCount === 2);
    // 同じ種・同じ入力なら同じ結果（将来のリプレイ検証の前提）
    let f2 = 0;
    while (c.state === 'playing' && f2 < 60 * 600) {
      c.input.inject.pointer(cx + Math.sin(clock(f2) / 50) * cx * 0.8, def.height * 0.8, true);
      c.step(1 / 60);
      f2 += 1;
    }
    check('deterministic', c.game.score === first);
    result.frames = frames;
    result.score = first;
    result.ok = Object.values(result.checks).every(Boolean);
  } catch (e) {
    result.error = String(e && e.message || e);
  }
  const pre = document.createElement('pre');
  pre.id = 'selftest-result';
  pre.textContent = JSON.stringify(result);
  document.body.append(pre);
}
