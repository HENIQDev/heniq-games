// 入力：キーボード・タッチ（仮想スティックとボタン）・ゲームパッド。画面の向きの {x: 右, y: 下} を返す。
// 突進と必殺は「押した瞬間」、踏ん張りとチャージは「押している間」。
export const B = { DASH: 1, BRACE: 2, CHARGE: 4, SPECIAL: 8 };
const KEYMAP = {
  ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R', ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D',
  Space: 'dash', KeyJ: 'dash', KeyZ: 'dash', ShiftLeft: 'brace', ShiftRight: 'brace', KeyK: 'brace', KeyX: 'brace', KeyC: 'charge', KeyL: 'charge', KeyE: 'special', Enter: 'special', KeyU: 'special',
};

export function createInput(root) {
  const keys = new Set();
  let edge = 0;
  const hold = { brace: false, charge: false };
  const touch = { x: 0, y: 0, stickId: null, ox: 0, oy: 0, active: false, ui: null, held: { brace: new Set(), charge: new Set() } };
  let enabled = false;
  let pauseCb = null;
  const pad = { x: 0, y: 0, btn: [false, false, false, false], prev: [false, false, false, false] };

  function kd(e) {
    if (e.code === 'KeyP' || e.code === 'Escape') { if (!e.repeat && pauseCb) pauseCb(); return; }
    const k = KEYMAP[e.code];
    if (!k) return;
    if (enabled) e.preventDefault();
    // 押しっぱなしの移動・踏ん張り・チャージは、リピートのイベントでも状態を保つ（ポーズから戻ったとき、押し続けているキーが効かなくなるのを防ぐ）。突進と必殺だけは、押した瞬間の 1 回
    if (k === 'dash') { if (enabled && !e.repeat) edge |= B.DASH; return; }
    if (k === 'special') { if (enabled && !e.repeat) edge |= B.SPECIAL; return; }
    if (!(enabled || e.repeat)) return;
    keys.add(k);
    if (k === 'brace') hold.brace = true;
    if (k === 'charge') hold.charge = true;
  }
  function ku(e) {
    const k = KEYMAP[e.code];
    if (!k) return;
    keys.delete(k);
    if (k === 'brace') hold.brace = [...keys].includes('brace') || false;
    if (k === 'charge') hold.charge = false;
    if (k === 'brace') hold.brace = false;
  }
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  window.addEventListener('blur', () => { keys.clear(); hold.brace = hold.charge = false; touch.stickId = null; touch.x = touch.y = 0; touch.held.brace.clear(); touch.held.charge.clear(); });

  // ---- タッチ UI ----
  function mkBtn(cls, label, kind) {
    const b = document.createElement('div');
    b.className = 'tbtn ' + cls;
    const sp = document.createElement('span'); sp.textContent = label; b.append(sp);
    const down = (e) => {
      e.preventDefault(); if (!enabled) return;
      try { b.setPointerCapture(e.pointerId); } catch (x) { /* ok */ }
      b.classList.add('on');
      if (kind === 'dash') edge |= B.DASH; else if (kind === 'special') edge |= B.SPECIAL; else touch.held[kind].add(e.pointerId);
    };
    const up = (e) => {
      b.classList.remove('on');
      if (kind === 'brace' || kind === 'charge') touch.held[kind].delete(e.pointerId);
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    return b;
  }
  function attachTouch(layer) {
    detachTouch();
    const wrap = document.createElement('div');
    wrap.className = 'touch-ui';
    const zone = document.createElement('div'); zone.className = 'stick-zone';
    const base = document.createElement('div'); base.className = 'stick-base';
    const knob = document.createElement('div'); knob.className = 'stick-knob';
    base.append(knob); zone.append(base);
    const R = 56;
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault(); if (!enabled || touch.stickId !== null) return;
      touch.stickId = e.pointerId; zone.setPointerCapture(e.pointerId);
      const r = zone.getBoundingClientRect();
      touch.ox = e.clientX; touch.oy = e.clientY; touch.active = true;
      base.style.left = (e.clientX - r.left) + 'px'; base.style.top = (e.clientY - r.top) + 'px'; base.classList.add('on');
      knob.style.transform = 'translate(0px,0px)';
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== touch.stickId) return;
      let dx = e.clientX - touch.ox, dy = e.clientY - touch.oy;
      const m = Math.hypot(dx, dy);
      if (m > R) { dx *= R / m; dy *= R / m; }
      touch.x = dx / R; touch.y = dy / R;
      if (Math.hypot(touch.x, touch.y) < 0.12) { touch.x = 0; touch.y = 0; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    });
    const end = (e) => { if (e.pointerId !== touch.stickId) return; touch.stickId = null; touch.x = touch.y = 0; touch.active = false; base.classList.remove('on'); };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end); zone.addEventListener('lostpointercapture', end);
    const btns = document.createElement('div'); btns.className = 'btn-pad';
    btns.append(mkBtn('b-dash', '突進', 'dash'), mkBtn('b-brace', '踏ん張り', 'brace'), mkBtn('b-charge', 'チャージ', 'charge'), mkBtn('b-special', '必殺', 'special'));
    wrap.append(zone, btns);
    layer.append(wrap);
    touch.ui = wrap;
    return wrap;
  }
  function detachTouch() { if (touch.ui) { touch.ui.remove(); touch.ui = null; } touch.stickId = null; touch.x = touch.y = 0; touch.held.brace.clear(); touch.held.charge.clear(); }

  function pollPad() {
    try {
      const gp = (navigator.getGamepads && navigator.getGamepads()) || [];
      for (const g of gp) {
        if (!g || !g.connected) continue;
        pad.x = Math.abs(g.axes[0]) > 0.2 ? g.axes[0] : 0; pad.y = Math.abs(g.axes[1]) > 0.2 ? g.axes[1] : 0;
        if (g.buttons[14] && g.buttons[14].pressed) pad.x = -1; if (g.buttons[15] && g.buttons[15].pressed) pad.x = 1;
        if (g.buttons[12] && g.buttons[12].pressed) pad.y = -1; if (g.buttons[13] && g.buttons[13].pressed) pad.y = 1;
        const now = [!!(g.buttons[0] && g.buttons[0].pressed), !!(g.buttons[1] && g.buttons[1].pressed), !!(g.buttons[2] && g.buttons[2].pressed), !!(g.buttons[3] && g.buttons[3].pressed)];
        if (now[0] && !pad.prev[0] && enabled) edge |= B.DASH;
        if (now[3] && !pad.prev[3] && enabled) edge |= B.SPECIAL;
        pad.btn = now; pad.prev = now;
        return;
      }
    } catch (e) { /* ゲームパッドが無い */ }
  }

  const api = {
    // 1 ステップぶんの入力（画面の向き）。edge は読んだら消える
    read() {
      pollPad();
      let x = (keys.has('R') ? 1 : 0) - (keys.has('L') ? 1 : 0), y = (keys.has('D') ? 1 : 0) - (keys.has('U') ? 1 : 0);
      if (x || y) { const m = Math.hypot(x, y); x /= m; y /= m; }
      if (!x && !y) { x = touch.x; y = touch.y; }
      if (!x && !y) { x = pad.x; y = pad.y; }
      let b = edge; edge = 0;
      if (hold.brace || touch.held.brace.size || pad.btn[1]) b |= B.BRACE;
      if (hold.charge || touch.held.charge.size || pad.btn[2]) b |= B.CHARGE;
      return { x, y, b };
    },
    // 描画用：押している状態（ボタンの表示）
    peek() { return { brace: hold.brace || touch.held.brace.size > 0, charge: hold.charge || touch.held.charge.size > 0 }; },
    setEnabled(v) { enabled = !!v; if (!v) { edge = 0; keys.clear(); hold.brace = hold.charge = false; } },
    onPause(cb) { pauseCb = cb; },
    attachTouch, detachTouch,
    inject(x, y, b) { edge |= (b & (B.DASH | B.SPECIAL)); api._inj = { x, y, b }; },
    clearEdges() { edge = 0; },
    get touchAttached() { return !!touch.ui; },
    // 自動テスト用：実際の入力イベントの代わりに、押している状態を直接指定する
    debugHold(name, on) { hold[name] = !!on; },
    debugKey(code, down) { (down ? kd : ku)({ code, preventDefault() {}, repeat: false }); },
  };
  return api;
}
