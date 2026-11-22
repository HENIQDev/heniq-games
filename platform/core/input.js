// 入力を共通の形にする：キーボード（矢印・WASD）とポインター（マウス・タッチ）。
// ゲームは input.axis()（-1〜1）と input.pointer（論理座標）だけを見る。
const KEY_AXIS = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
};
const BLOCK_DEFAULT = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);

export function createInput(canvas, size) {
  const down = new Set();
  const pointer = { x: 0, y: 0, active: false };
  const pressedOnce = new Set();
  let enabled = false;

  const toLogical = (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * size.width;
    pointer.y = ((e.clientY - r.top) / r.height) * size.height;
  };

  const onKeyDown = (e) => {
    if (enabled && BLOCK_DEFAULT.has(e.code)) e.preventDefault();
    if (!down.has(e.code)) pressedOnce.add(e.code);
    down.add(e.code);
  };
  const onKeyUp = (e) => down.delete(e.code);
  const onBlur = () => { down.clear(); pointer.active = false; };
  const onPointerDown = (e) => {
    toLogical(e);
    pointer.active = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
  };
  const onPointerMove = (e) => { if (pointer.active || e.pointerType === 'mouse') toLogical(e); };
  const onPointerUp = () => { pointer.active = false; };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  return {
    pointer,
    setEnabled(v) { enabled = v; if (!v) { down.clear(); pointer.active = false; } },
    // キーボードの向き（斜めは正規化する）
    axis() {
      let x = 0, y = 0;
      for (const k of down) { const a = KEY_AXIS[k]; if (a) { x += a[0]; y += a[1]; } }
      const len = Math.hypot(x, y);
      return len > 1 ? { x: x / len, y: y / len } : { x, y };
    },
    isDown: (code) => down.has(code),
    // 押された瞬間だけ true（1 回読むと消える）
    wasPressed(code) { return pressedOnce.delete(code); },
    clearPressed() { pressedOnce.clear(); },
    // 自己テスト用：入力を直接与える
    inject: { down: (c) => down.add(c), up: (c) => down.delete(c), pointer: (x, y, active) => { pointer.x = x; pointer.y = y; pointer.active = active; } },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
    },
  };
}
