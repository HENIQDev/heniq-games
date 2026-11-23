// 1 試合の進行・操作の変換・HUD（CP 戦もオンライン戦も、同じ描画と HUD を使う）。
import { createMatch, step, DT, BTN, viewFromSnapshot, cloneView, lerpView, emptyInput } from './sim.js';
import { createAI } from './ai.js';
import { CHAR_BY_ID } from './chars.js';
import { t } from './i18n.js';
import { h } from './dom.js';

export function mapStick(x, y, flip) { return flip ? { mx: -y, my: x } : { mx: y, my: -x }; }

function bar(cls) { const fill = h('div', 'fill'); return { root: h('div', 'bar ' + cls, [fill]), fill }; }

function buildHud(root, o) {
  root.replaceChildren();
  const mk = (side) => {
    const name = h('div', 'pl-name', '');
    const dmgNum = h('span', 'dmg-num', '0');
    const dmg = bar('dmg'); const sta = bar('sta'); const sp = bar('sp');
    const spHint = h('div', 'sp-hint', t('spReady'));
    const el = h('div', 'pl pl-' + side, [name, h('div', 'dmg-row', [h('span', 'dmg-label', t('dmgLabel')), dmg.root, dmgNum]), h('div', 'mini-row', [h('span', 'mini-label', 'STA'), sta.root]), h('div', 'mini-row', [h('span', 'mini-label', 'SP'), sp.root, spHint])]);
    return { el, name, dmgNum, dmg, sta, sp, spHint };
  };
  const L = mk('l'), R = mk('r');
  const time = h('div', 'timer', '60');
  const sub = h('div', 'timer-sub', t('timeLabel'));
  const pauseBtn = h('button', 'pause-btn', 'II'); pauseBtn.type = 'button'; pauseBtn.setAttribute('aria-label', t('pause'));
  const banner = h('div', 'banner', '');
  const note = h('div', 'note', '');
  const net = h('div', 'netinfo', '');
  const top = h('div', 'hud-top', [L.el, h('div', 'timer-box', [sub, time]), R.el]);
  root.append(top, pauseBtn, banner, note, net);
  return { L, R, time, pauseBtn, banner, note, net, top };
}

function setBar(b, v) { b.fill.style.width = Math.max(0, Math.min(100, v)) + '%'; }

export function createBattle(ctx) {
  const { gfx, sfx, input, mode, chars, stage, flip, net, onEnd, hudRoot } = ctx;
  const mySlot = ctx.slot || 0;
  const hud = buildHud(hudRoot, ctx);
  let sim = null, ais = null, acc = 0, ended = false, endTimer = 0, paused = false, time = 0, finished = false, result = null;
  let view = null;                       // 現在の（描画用の）状態
  const snaps = [];
  let lastSnapN = -1, sendTimer = 0, lastSent = '', netEnd = null, netEndAt = 0;
  const stats = { hitsDealt: 0, hitsTaken: 0, counters: 0, specials: 0 };
  hud.pauseBtn.style.display = mode === 'cp' ? '' : 'none';

  const names = ctx.names || [CHAR_BY_ID[chars[0]].name, CHAR_BY_ID[chars[1]].name];
  const left = mySlot, right = 1 - mySlot;
  hud.L.name.textContent = names[left]; hud.R.name.textContent = names[right];
  gfx.resetAnim();
  gfx.setTheme(stage.theme, 5.0 + 0);

  if (mode === 'cp') {
    sim = createMatch({ chars, seed: ctx.seed, mods: stage.mods, buffs: [{}, stage.buff] });
    ais = [null, createAI(stage.profile, ctx.seed ^ 0x9e3779b9)];
    if (ctx.auto) ctx.autopilot = createAI(ctx.auto, ctx.seed ^ 0x51ed270b);
    view = sim;
  } else {
    view = null;
  }

  function banner(text, cls, ms = 1100) {
    hud.banner.textContent = text; hud.banner.className = 'banner show ' + (cls || '');
    clearTimeout(banner.t); banner.t = setTimeout(() => { hud.banner.className = 'banner'; }, ms);
  }
  function note(text, ms = 2200) { hud.note.textContent = text; hud.note.classList.add('show'); clearTimeout(note.t); note.t = setTimeout(() => hud.note.classList.remove('show'), ms); }

  function handleEvents(events) {
    if (!events || !events.length) return;
    gfx.consume(events, { flip });
    for (const e of events) {
      if (e.t === 'ready') { if (e.i === mySlot) { sfx.ready(); hud[mySlot === left ? 'L' : 'R'].sp.root.classList.add('ready'); } continue; }
      sfx.event(e);
      if (e.t === 'count') banner(String(e.n), 'count', 700);
      else if (e.t === 'go') banner(t('go'), 'go', 1200);
      else if (e.t === 'shrink') note('土俵がせまくなる！', 3000);
      else if (e.t === 'hit') { if (e.i === mySlot) stats.hitsDealt++; else if (e.j === mySlot) stats.hitsTaken++; }
      else if (e.t === 'counter') { stats.counters += e.i === mySlot ? 1 : 0; if (e.i === mySlot) note('ジャスト踏ん張り！', 1200); }
      else if (e.t === 'special') { if (e.i === mySlot) stats.specials++; note(CHAR_BY_ID[chars[e.i]].specName, 1400); }
      else if (e.t === 'ko') banner(e.reason === 'time' ? t('timeup') : t('ringout'), 'ko', 1400);
    }
  }

  function readInput() {
    if (ctx.autopilot && sim) return ctx.autopilot.think(sim, 0);     // 検証用：AI が自分を操作する（?debug=1 のときだけ使える）
    const r = input.read();
    const m = mapStick(r.x, r.y, flip);
    return { mx: m.mx, my: m.my, b: r.b };
  }

  function updateHud(v) {
    if (!v) return;
    for (const [side, slot] of [['L', left], ['R', right]]) {
      const f = v.f[slot], o = hud[side];
      setBar(o.dmg, f.dmg / 1.5);
      o.dmgNum.textContent = Math.round(f.dmg);
      o.dmg.root.classList.toggle('hot', f.dmg > 80);
      setBar(o.sta, (f.sta / (CHAR_BY_ID[f.id].stamina || 100)) * 100);
      setBar(o.sp, f.gau);
      o.sp.root.classList.toggle('ready', f.gau >= 100);
      o.spHint.style.opacity = f.gau >= 100 ? '1' : '0';
      o.sta.root.classList.toggle('low', f.sta < 22);
    }
    hud.time.textContent = String(Math.ceil(v.timeLeft));
    hud.time.classList.toggle('urgent', v.timeLeft <= 10 && v.phase === 'fight');
  }

  function finishBattle(winner, reason, extra) {
    if (finished) return;
    finished = true;
    const win = winner === mySlot;
    result = { winner, reason, win: winner >= 0 && win, draw: winner < 0, mySlot, stats, time: view ? 60 - view.timeLeft : 0, dmg: view ? view.f[mySlot].dmg : 0, ...(extra || {}) };
    if (winner >= 0) { banner(win ? t('win') : t('lose'), win ? 'win' : 'lose', 2200); if (win) { sfx.win(); gfx.confetti(70); } else sfx.lose(); }
    else banner(t('draw'), 'ko', 2200);
    setTimeout(() => { if (!destroyed) onEnd(result); }, 2300);
  }

  let destroyed = false;
  const api = {
    get view() { return view; }, get result() { return result; }, get paused() { return paused; }, stats,
    setPaused(p) { paused = p; input.setEnabled(!p); },
    update(dt) {
      if (paused || destroyed) return;
      time += dt;
      if (mode === 'cp') {
        const slow = sim.phase === 'ko' ? 0.35 : 1;
        acc += dt * slow;
        while (acc >= DT && !sim.over) {
          acc -= DT;
          const m = readInput();
          step(sim, m, ctx.passive ? emptyInput() : ais[1].think(sim, 1));
          handleEvents(sim.events);
        }
        if (sim.over && !finished) finishBattle(sim.winner, sim.reason);
        view = sim;
        updateHud(sim);
      } else {
        // オンライン：入力を 30 Hz で送る（変化があったときと、0.1 秒ごと）
        acc += dt;
        let guard = 0;
        while (acc >= DT && guard++ < 4) {
          acc -= DT;
          const m = readInput();
          const key = m.mx.toFixed(2) + ',' + m.my.toFixed(2) + ',' + (m.b & 6);
          sendTimer += DT;
          if ((m.b & 9) || key !== lastSent || sendTimer >= 0.1) { if (net.sendInput(m.mx, m.my, m.b)) { lastSent = key; sendTimer = 0; } }
        }
        const rt = performance.now() - 90;
        if (snaps.length) {
          let i = snaps.length - 1;
          while (i > 0 && snaps[i - 1].at > rt) i--;
          const a = snaps[Math.max(0, i - 1)], b = snaps[i];
          if (a === b || rt >= b.at) view = b.view;
          else view = lerpView(a.view, b.view, Math.max(0, Math.min(1, (rt - a.at) / Math.max(1, b.at - a.at))), api._lerp || (api._lerp = { f: [{}, {}] }));
          updateHud(snaps[snaps.length - 1].view);
        }
        if (netEnd && !finished && (performance.now() - netEndAt > 2200 || (snaps.length && snaps[snaps.length - 1].view.phase === 'over'))) finishBattle(netEnd.winner, netEnd.reason, { net: netEnd, win: netEnd.winner === mySlot });
      }
    },
    render(dt, now) {
      if (!view) return;
      gfx.render({ view, dt: paused ? 0 : dt, time: now, flip, cheer: 0, zoom: api.zoom, shift: api.shift });
    },
    // オンライン：サーバーからの状態
    onSnap(m, at) {
      if (m.n <= lastSnapN) return;
      lastSnapN = m.n;
      const v = viewFromSnapshot(m, chars, null);
      const cv = cloneView(v);
      snaps.push({ view: cv, at });
      while (snaps.length > 8) snaps.shift();
      handleEvents(m.ev);
    },
    onEnd(m) { netEnd = m; netEndAt = performance.now(); },
    status(text) { hud.net.textContent = text || ''; },
    note, banner,
    destroy() { destroyed = true; clearTimeout(banner.t); clearTimeout(note.t); hudRoot.replaceChildren(); },
    hudPauseButton: hud.pauseBtn,
  };
  return api;
}
