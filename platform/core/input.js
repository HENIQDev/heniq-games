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
  // ゾーン入力（マルチタッチ）：ボタンなどの領域を宣言すると、指ごとに追跡する。ゾーン外の指は、従来の pointer（なぞる操作）になる
  let zones = [];
  const zoneDownSet = new Set();
  const zonePressedSet = new Set();
  const zonePointers = new Map(); // pointerId -> ゾーン名
  let stamp = 0; // 反映されていない入力の、いちばん早い時刻（入力遅延の計測用）
  const mark = (e) => { if (!stamp) stamp = e.timeStamp || performance.now(); };
  let touchSeen = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const hit = (z, x, y) => (z.shape === 'circle' ? Math.hypot(x - z.x, y - z.y) <= z.r : x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);

  const toLogical = (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * size.width;
    pointer.y = ((e.clientY - r.top) / r.height) * size.height;
  };

  const onKeyDown = (e) => {
    mark(e);
    if (enabled && BLOCK_DEFAULT.has(e.code)) e.preventDefault();
    if (!down.has(e.code)) pressedOnce.add(e.code);
    down.add(e.code);
  };
  const onKeyUp = (e) => down.delete(e.code);
  const onBlur = () => { down.clear(); pointer.active = false; };
  const onPointerDown = (e) => {
    mark(e);
    if (e.pointerType === 'touch') touchSeen = true;
    if (zones.length) {
      const r = canvas.getBoundingClientRect();
      const lx = ((e.clientX - r.left) / r.width) * size.width;
      const ly = ((e.clientY - r.top) / r.height) * size.height;
      const z = zones.find((q) => hit(q, lx, ly));
      if (z) {
        zonePointers.set(e.pointerId, z.name);
        zoneDownSet.add(z.name);
        zonePressedSet.add(z.name);
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
        return;
      }
    }
    toLogical(e);
    pointer.active = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
  };
  const onPointerMove = (e) => { if (zonePointers.has(e.pointerId)) return; if (pointer.active || e.pointerType === 'mouse') toLogical(e); };
  const onPointerUp = (e) => {
    const name = zonePointers.get(e.pointerId);
    if (name) {
      zonePointers.delete(e.pointerId);
      if (![...zonePointers.values()].includes(name)) zoneDownSet.delete(name);
      return;
    }
    pointer.active = false;
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  return {
    pointer,
    setEnabled(v) { enabled = v; if (!v) { down.clear(); pointer.active = false; zoneDownSet.clear(); zonePointers.clear(); } },
    // キーボードの向き（斜めは正規化する）
    axis() {
      let x = 0, y = 0;
      for (const k of down) { const a = KEY_AXIS[k]; if (a) { x += a[0]; y += a[1]; } }
      const len = Math.hypot(x, y);
      return len > 1 ? { x: x / len, y: y / len } : { x, y };
    },
    setZones(list) { zones = list; },
    takeStamp() { const t = stamp; stamp = 0; return t; },
    zoneDown: (name) => zoneDownSet.has(name),
    zonePressed: (name) => zonePressedSet.delete(name),
    get touchSeen() { return touchSeen; },
    isDown: (code) => down.has(code),
    // 押された瞬間だけ true（1 回読むと消える）
    wasPressed(code) { return pressedOnce.delete(code); },
    clearPressed() { pressedOnce.clear(); zonePressedSet.clear(); },
    // 自己テスト用：入力を直接与える
    inject: { zone: (n, on) => { if (on) { if (!zoneDownSet.has(n)) zonePressedSet.add(n); zoneDownSet.add(n); } else zoneDownSet.delete(n); }, down: (c) => down.add(c), up: (c) => down.delete(c), pointer: (x, y, active) => { pointer.x = x; pointer.y = y; pointer.active = active; } },
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
