// メニュー・選択・結果などの画面（DOM）。ゲームの状態は main.js が持ち、ここは見せて、操作を返すだけ。
import { h, btn } from './dom.js';
import { t } from './i18n.js';
import { CHARS, CHAR_BY_ID } from './chars.js';
import { MODELS } from './gl/models.js';
import { STAGES, STAGE_COUNT, UNLOCKS, THEME_NAMES, unlockedChars } from './stages.js';

const chipColor = (id) => { const p = MODELS[id].parts.find((x) => x.role === 'body') || MODELS[id].parts[0]; return p.c; };
const replaceKids = (el, kids) => el.replaceChildren(...kids.filter(Boolean));
const pips = (n) => h('span', 'pips', Array.from({ length: 5 }, (_, i) => h('i', i < n ? 'on' : '')));

export function logo(small) {
  return h('div', 'logo' + (small ? ' small' : ''), [h('span', 'l1', 'BUTT'), h('span', 'l2', 'SUMO')]);
}

export function createScreens(G) {
  const S = {};
  const sc = (cls, kids) => h('div', 'screen ' + cls, kids);
  const header = (title, back) => h('div', 'head', [btn('◀ ' + t('back'), 'btn-back', () => { G.sfx.back(); back(); }), h('h2', null, title)]);
  const click = (fn) => (e) => { G.sfx.click(); fn(e); };

  S.title = () => {
    const el = sc('title', [logo(false), h('div', 'tagline', t('subtitle')), h('div', 'tap', t('pressStart')), h('div', 'foot', [h('a', 'lnk', 'ゲーム一覧'), h('a', 'lnk', 'ゲームの詳細')])]);
    const [a, b] = el.querySelectorAll('.lnk'); a.href = '../'; b.href = 'about/';
    el.addEventListener('click', (e) => { if (e.target.closest('a')) return; G.sfx.confirm(); G.go('menu'); });
    G.keyOnce(['Enter', 'Space'], () => { G.sfx.confirm(); G.go('menu'); });
    return el;
  };

  S.menu = () => {
    const sv = G.save, next = Math.min(STAGE_COUNT, sv.cleared + 1);
    const items = [
      btn([h('b', null, t('menuCp')), h('small', null, sv.cleared >= STAGE_COUNT ? '全ステージ制覇！' : sv.cleared ? 'つづき：ステージ ' + next : 'はじめから')], 'big cp', click(() => G.go('stages'))),
      btn([h('b', null, t('menuOnline')), h('small', null, G.onlineAvailable ? '世界の誰かと 1 対 1' : '準備中')], 'big online', click(() => G.go('online'))),
      btn([h('b', null, t('menuChars')), h('small', null, unlockedChars(sv.cleared).length + ' / ' + CHARS.length + ' 体')], 'big chars', click(() => G.go('chars', { purpose: 'view' }))),
    ];
    const row = h('div', 'menu-row', [
      btn(t('menuRanking'), 'mid rank', click(() => G.go('ranking'))),
      btn(t('menuHow'), 'mid', click(() => G.go('how'))),
      btn(t('menuSettings'), 'mid', click(() => G.go('settings'))),
    ]);
    const home = h('a', 'lnk', t('menuHome')); home.href = '../';
    return sc('menu', [logo(true), h('div', 'menu-grid', items), row, h('div', 'foot', [home])]);
  };

  // ---- キャラクター ----
  S.chars = (p) => {
    const sv = G.save, open = unlockedChars(sv.cleared);
    let cur = p.purpose === 'view' ? sv.char : (p.current || sv.char);
    if (!open.includes(cur)) cur = open[0];
    const detail = h('div', 'detail');
    const chips = h('div', 'chips');
    const pick = btn(p.purpose === 'view' ? t('back') : t('start'), 'btn-go', null);
    const chipEls = {};
    const lockText = (id) => { const at = UNLOCKS[id]; return at ? t('lockedChar', { n: at }) : ''; };
    function show(id) {
      cur = id;
      const c = CHAR_BY_ID[id], isOpen = open.includes(id);
      G.setPreview(id);
      for (const k in chipEls) chipEls[k].classList.toggle('sel', k === id);
      replaceKids(detail, [
        h('div', 'c-name', [h('span', null, c.name), h('small', null, c.kana)]),
        h('p', 'c-blurb', c.blurb),
        h('div', 'c-stats', [['stat_weight', 'weight'], ['stat_speed', 'speed'], ['stat_power', 'power'], ['stat_defense', 'defense'], ['stat_stamina', 'stamina']].map(([k, f]) => h('div', 'srow', [h('span', null, t(k)), pips(c.rank[f])]))),
        h('div', 'c-spec', [h('b', null, t('special') + '：' + c.specName), h('span', null, c.specDesc)]),
        isOpen ? null : h('div', 'c-lock', lockText(id)),
      ]);
      pick.disabled = !isOpen && p.purpose !== 'view';
      pick.textContent = p.purpose === 'view' ? (isOpen ? t('select') : t('back')) : t('start');
    }
    for (const c of CHARS) {
      const isOpen = open.includes(c.id);
      const chip = h('button', 'chip' + (isOpen ? '' : ' lock'), [h('i', 'dot'), h('span', null, isOpen ? c.name : '？？？')]);
      chip.type = 'button'; chip.querySelector('.dot').style.background = chipColor(c.id);
      chip.addEventListener('click', () => { G.sfx.click(); show(c.id); });
      chipEls[c.id] = chip; chips.append(chip);
    }
    pick.addEventListener('click', () => {
      G.sfx.confirm();
      if (p.purpose === 'view') { if (open.includes(cur)) { sv.char = cur; G.persist(); } p.back ? p.back() : G.go('menu'); }
      else p.onPick(cur);
    });
    const el = sc('chars', [header(t('charTitle'), () => (p.back ? p.back() : G.go('menu'))), h('div', 'side', [chips, detail, pick])]);
    show(cur);
    return el;
  };

  // ---- ステージ選択 ----
  S.stages = (p = {}) => {
    const sv = G.save;
    let page = p.page !== undefined ? p.page : Math.floor(Math.min(sv.cleared, STAGE_COUNT - 1) / 10);
    let sel = p.stage || Math.min(sv.cleared + 1, STAGE_COUNT);
    const grid = h('div', 'stage-grid'), tabs = h('div', 'tabs'), info = h('div', 'detail');
    const startBtn = btn('挑戦！', 'btn-go', null);
    function renderInfo() {
      const st = STAGES[sel - 1], foe = CHAR_BY_ID[st.foe], me = CHAR_BY_ID[sv.char];
      const best = sv.best[sel];
      G.setStagePreview(sel);
      replaceKids(info, [
        h('div', 'c-name', [h('span', null, (st.boss ? 'BOSS ' : '') + st.title), h('small', null, 'STAGE ' + sel)]),
        h('div', 'vs-line', [h('span', 'you', me.name), h('b', null, 'VS'), h('span', 'foe', st.boss ? st.boss.name : foe.name)]),
        st.boss ? h('p', 'c-blurb', '戦い方：' + st.style) : h('p', 'c-blurb', 'CP：' + foe.name + '（' + foe.blurb + '）'),
        st.unlock ? h('div', 'c-spec', [h('b', null, 'クリアで解放'), h('span', null, CHAR_BY_ID[st.unlock].name)]) : null,
        best ? h('p', 'c-best', t('yourBest') + '：' + best.t.toFixed(1) + ' 秒') : null,
        h('div', 'row', [btn('キャラ：' + me.name + '（変更）', 'btn-sub', () => { G.sfx.click(); G.go('chars', { purpose: 'pick', current: sv.char, onPick: (id) => { sv.char = id; G.persist(); G.go('stages', { page, stage: sel }); }, back: () => G.go('stages', { page, stage: sel }) }); })]),
      ]);
      startBtn.disabled = sel > sv.cleared + 1;
    }
    function renderGrid() {
      grid.replaceChildren();
      for (let i = 1; i <= 10; i++) {
        const n = page * 10 + i, st = STAGES[n - 1], locked = n > sv.cleared + 1, done = n <= sv.cleared;
        const b = h('button', 'stage' + (locked ? ' lock' : '') + (done ? ' done' : '') + (st.boss ? ' boss' : '') + (n === sel ? ' sel' : ''), [h('b', null, n), h('small', null, st.boss ? 'BOSS' : done ? '✓' : locked ? 'LOCK' : '')]);
        b.type = 'button';
        b.addEventListener('click', () => { G.sfx.click(); sel = n; renderGrid(); renderInfo(); });
        grid.append(b);
      }
    }
    function renderTabs() {
      tabs.replaceChildren();
      for (let i = 0; i < 10; i++) {
        const unlockedPage = i * 10 + 1 <= sv.cleared + 1;
        const tb = h('button', 'tab' + (i === page ? ' sel' : '') + (unlockedPage ? '' : ' lock'), [h('b', null, String(i * 10 + 1)), h('small', null, THEME_NAMES[STAGES[i * 10].theme])]);
        tb.type = 'button';
        tb.addEventListener('click', () => { G.sfx.click(); page = i; sel = Math.min(Math.max(sel, i * 10 + 1), i * 10 + 10); if (Math.floor((sel - 1) / 10) !== i) sel = i * 10 + 1; renderTabs(); renderGrid(); renderInfo(); });
        tabs.append(tb);
      }
    }
    startBtn.addEventListener('click', () => { if (sel <= sv.cleared + 1) { G.sfx.confirm(); G.startCp(sel); } });
    const el = sc('stages', [header(t('stageSel'), () => G.go('menu')), tabs, h('div', 'side', [grid, info, startBtn])]);
    renderTabs(); renderGrid(); renderInfo();
    return el;
  };

  // ---- 結果（CP） ----
  S.cpResult = (p) => {
    const r = p.result, st = p.stage, win = r.win;
    const rows = [
      h('div', 'r-row', [h('span', null, '時間'), h('b', null, r.time.toFixed(1) + ' 秒')]),
      h('div', 'r-row', [h('span', null, '当てた回数'), h('b', null, String(r.stats.hitsDealt))]),
      h('div', 'r-row', [h('span', null, '受けた回数'), h('b', null, String(r.stats.hitsTaken))]),
      h('div', 'r-row', [h('span', null, 'ジャスト踏ん張り'), h('b', null, String(r.stats.counters))]),
    ];
    const buttons = [];
    if (win && st.n < STAGE_COUNT) buttons.push(btn(t('next'), 'btn-go', () => { G.sfx.confirm(); G.startCp(st.n + 1); }));
    buttons.push(btn(t('retry'), win ? 'btn-sub' : 'btn-go', () => { G.sfx.confirm(); G.startCp(st.n); }));
    buttons.push(btn(t('toStages'), 'btn-sub', () => G.go('stages', { stage: Math.min(STAGE_COUNT, win ? st.n + 1 : st.n) })));
    return sc('result ' + (win ? 'win' : 'lose'), [h('div', 'panel', [
      h('h2', win ? 'r-win' : r.draw ? 'r-draw' : 'r-lose', win ? t('win') : r.draw ? t('draw') : t('lose')),
      h('p', 'r-sub', (st.boss ? 'BOSS ' : '') + st.title + (win && st.boss ? ' を撃破！' : '')),
      h('div', 'r-rows', rows), p.newBest ? h('p', 'r-new', 'NEW RECORD') : null,
      h('div', 'row', buttons),
    ])]);
  };

  S.unlock = (p) => {
    const c = CHAR_BY_ID[p.id];
    const el = sc('unlock', [h('div', 'panel', [h('div', 'u-title', t('unlockTitle')), h('div', 'u-name', c.name), h('p', 'u-blurb', c.blurb), h('p', 'r-sub', t('unlockHint')), btn(t('ok'), 'btn-go', () => { G.sfx.confirm(); p.next(); })])]);
    return el;
  };

  S.pause = (p) => sc('pause', [h('div', 'panel', [h('h2', null, t('pause')), btn(t('resume'), 'btn-go', p.resume), btn(t('retry'), 'btn-sub', p.retry), btn(t('quit'), 'btn-sub', p.quit)])]);

  S.how = () => {
    const blocks = ['howGoal', 'howButt', 'howDash', 'howBrace', 'howCharge', 'howSpecial', 'howDamage'].map((k) => h('div', 'how-b', [h('i', 'ic ic-' + k), h('p', null, t(k))]));
    return sc('how', [header(t('howTitle'), () => G.go('menu')), h('div', 'how-body', [...blocks, h('div', 'how-ctrl', [h('p', null, t('ctrlPc')), h('p', null, t('ctrlTouch'))])])]);
  };

  S.settings = () => {
    const sv = G.save, st = sv.settings;
    const slider = (label, key, after) => {
      const inp = h('input', 'range'); inp.type = 'range'; inp.min = '0'; inp.max = '100'; inp.value = String(Math.round(st[key] * 100));
      inp.addEventListener('input', () => { st[key] = Number(inp.value) / 100; G.persist(); if (after) after(); });
      inp.addEventListener('change', () => { if (key === 'sfx') G.sfx.hit(0.4); });
      return h('label', 'set-row', [h('span', null, label), inp]);
    };
    const toggle = (label, get, set) => {
      const b = btn(get() ? t('on') : t('off'), 'toggle' + (get() ? ' on' : ''), null);
      b.addEventListener('click', () => { set(!get()); b.textContent = get() ? t('on') : t('off'); b.classList.toggle('on', get()); G.persist(); G.sfx.click(); });
      return h('div', 'set-row', [h('span', null, label), b]);
    };
    const nick = h('input', 'text'); nick.type = 'text'; nick.maxLength = 12; nick.value = st.nick || ''; nick.placeholder = 'ななし'; nick.autocomplete = 'off';
    nick.addEventListener('change', () => { st.nick = nick.value.slice(0, 12); G.persist(); G.net && G.net.setNick(G.nick()); });
    const reset = btn(t('setReset'), 'btn-sub danger', () => {
      if (reset.dataset.arm !== '1') { reset.dataset.arm = '1'; reset.textContent = t('setResetConfirm'); reset.classList.add('armed'); setTimeout(() => { reset.dataset.arm = ''; reset.textContent = t('setReset'); reset.classList.remove('armed'); }, 6000); return; }
      G.resetSave(); G.go('menu');
    });
    return sc('settings', [header(t('settingsTitle'), () => G.go('menu')), h('div', 'set-body', [
      slider(t('setBgm'), 'bgm', () => { if (G.sfx.currentBgm()) { /* 次の拍から反映 */ } }), slider(t('setSfx'), 'sfx'),
      toggle(t('setMute'), () => G.audio.muted, (v) => G.audio.setMuted(v)),
      toggle(t('setShake'), () => st.shake, (v) => { st.shake = v; }),
      toggle(t('setTouch'), () => st.touch === 'on', (v) => { st.touch = v ? 'on' : 'auto'; }),
      h('label', 'set-row', [h('span', null, t('setNick')), nick]),
      h('div', 'set-row', [reset]),
      h('p', 'set-note', '保存されるのは、このブラウザの中の「進行状況・設定」だけです。オンライン対戦を使うと、端末ごとのランダムな ID とニックネーム、戦績がサーバーに保存されます。'),
    ])]);
  };

  S.ranking = () => {
    const body = h('div', 'rank-body', [h('p', 'r-sub', G.onlineAvailable ? t('onlineConnecting') : t('unavailable'))]);
    G.loadRanking((m, err) => {
      body.replaceChildren();
      if (err) { body.append(h('p', 'r-sub', err === 'unavailable' ? t('unavailable') : t('onlineOffline'))); return; }
      if (m.me) body.append(h('div', 'me-card', [h('b', null, m.me.nick), h('span', null, t('rating') + ' ' + m.me.rating), h('span', null, m.me.w + t('winsLabel') + ' ' + m.me.l + t('lossesLabel')), h('span', null, m.me.rank ? m.me.rank + ' 位' : '圏外（3 試合以上で掲載）')]));
      if (!m.list.length) body.append(h('p', 'r-sub', t('rankingEmpty')));
      const tbl = h('div', 'rank-tbl');
      m.list.forEach((r, i) => tbl.append(h('div', 'rk' + (i < 3 ? ' top' + (i + 1) : ''), [h('i', null, String(i + 1)), h('span', 'nm', r.n), h('b', null, String(r.r)), h('small', null, r.w + '勝' + r.l + '敗')])));
      body.append(tbl, h('p', 'set-note', t('rankingNote')));
    });
    return sc('ranking', [header(t('rankingTitle'), () => G.go('menu')), body]);
  };

  // ---- オンライン ----
  S.online = (p = {}) => {
    const st = G.online;                    // { phase, me, rank, online, ... }
    const kids = [header(t('onlineTitle'), () => { G.leaveOnline(); G.go('menu'); })];
    const panel = h('div', 'panel');
    if (st.phase === 'unavailable') panel.append(h('p', 'r-sub', t('unavailable')), h('p', 'r-sub', t('unavailableHint')), btn(t('toMenu'), 'btn-go', () => G.go('menu')));
    else if (st.phase === 'connecting') panel.append(h('div', 'spinner'), h('p', 'r-sub', t('onlineConnecting')));
    else if (st.phase === 'error') panel.append(h('p', 'r-sub', st.msg || t('onlineOffline')), btn(t('retry'), 'btn-go', () => G.enterOnline()), btn(t('toMenu'), 'btn-sub', () => G.go('menu')));
    else if (st.phase === 'lobby') {
      const me = st.me || { rating: 1500, w: 0, l: 0, streak: 0, best: 0, games: 0 };
      const c = CHAR_BY_ID[G.save.char];
      panel.append(
        h('div', 'me-card', [h('b', null, st.me ? st.me.nick : ''), h('span', null, t('rating') + ' ' + me.rating), h('span', null, me.w + t('winsLabel') + ' ' + me.l + t('lossesLabel')), h('span', null, t('streak') + ' ' + me.streak), h('span', null, st.rank ? st.rank + ' 位' : '')]),
        h('p', 'r-sub', 'あなたのキャラ：' + c.name),
        btn('キャラを変える', 'btn-sub', () => { G.go('chars', { purpose: 'pick', current: G.save.char, onPick: (id) => { G.save.char = id; G.persist(); G.go('online'); }, back: () => G.go('online') }); }),
        btn('対戦相手をさがす', 'btn-go', () => G.findMatch()),
        h('p', 'set-note', 'オンライン人数：' + (st.online || 1) + '　／　対戦相手がいないときは、しばらく待つか、時間をおいてもう一度。'),
      );
    } else if (st.phase === 'search') {
      const sec = h('p', 'r-sub big', '0');
      panel.append(h('div', 'spinner'), h('p', 'r-sub', t('onlineSearch')), sec, btn(t('onlineCancel'), 'btn-sub', () => G.cancelFind()));
      const t0 = performance.now(); const iv = setInterval(() => { if (!sec.isConnected) { clearInterval(iv); return; } sec.textContent = Math.floor((performance.now() - t0) / 1000) + ' 秒'; }, 500);
    } else if (st.phase === 'matched') {
      const o = st.opp, c = CHAR_BY_ID[st.myChar], oc = CHAR_BY_ID[o.char];
      panel.append(h('p', 'r-sub', t('onlineFound')), h('div', 'vs-line big', [h('span', 'you', (st.me ? st.me.nick : 'あなた') + '（' + c.name + '）'), h('b', null, 'VS'), h('span', 'foe', o.nick + '（' + oc.name + '・' + o.rating + '）')]), h('div', 'spinner'), h('p', 'r-sub', t('onlineWait')));
    } else if (st.phase === 'noopp') {
      panel.append(h('p', 'r-sub', t('onlineNoOpp')), btn(t('retry'), 'btn-go', () => G.findMatch()), btn(t('toMenu'), 'btn-sub', () => G.go('menu')));
    }
    kids.push(panel);
    return sc('online', kids);
  };

  S.onlineResult = (p) => {
    const m = p.msg, win = m.winner === p.slot;
    const title = m.void ? '無効試合' : m.winner < 0 ? t('draw') : win ? t('win') : t('lose');
    const why = m.reason === 'forfeit' ? (win ? t('onlineOppLeft') : t('onlineYouLost')) : m.void ? '相手が来なかったため、レートは変わりません' : '';
    const s = m.stats;
    return sc('result ' + (win ? 'win' : 'lose'), [h('div', 'panel', [
      h('h2', win ? 'r-win' : 'r-lose', title), why ? h('p', 'r-sub', why) : null,
      h('div', 'r-rows', [
        h('div', 'r-row', [h('span', null, t('ratingChange')), h('b', null, (m.rating || 0) + '  (' + (m.delta > 0 ? '+' : '') + (m.delta || 0) + ')')]),
        s ? h('div', 'r-row', [h('span', null, '戦績'), h('b', null, s.w + t('winsLabel') + ' ' + s.l + t('lossesLabel') + '　' + t('streak') + ' ' + s.streak)]) : null,
        s && s.rank ? h('div', 'r-row', [h('span', null, t('rank')), h('b', null, s.rank + ' 位')]) : null,
      ]),
      h('div', 'row', [btn('もう一度', 'btn-go', () => { G.sfx.confirm(); G.enterOnline(true); }), btn(t('toMenu'), 'btn-sub', () => { G.leaveOnline(); G.go('menu'); })]),
    ])]);
  };

  S.error = (p) => sc('error', [h('div', 'panel', [h('h2', null, t('errorTitle')), h('p', 'r-sub', p.text), btn(t('reload'), 'btn-go', () => location.reload())])]);
  S.nogl = () => sc('error', [h('div', 'panel', [logo(true), h('p', 'r-sub', t('webglNeed')), (() => { const a = h('a', 'btn btn-go', 'ゲーム一覧'); a.href = '../'; return a; })()])]);
  return S;
}
