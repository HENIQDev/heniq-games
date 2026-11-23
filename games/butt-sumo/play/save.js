// 保存：CP ステージの進行・設定・自己ベストなど（この端末のブラウザだけ。外部へは送らない）。
// 失敗しても（プライベートモードなど）、ゲームは動く。
const KEY = 'heniq.games.butt-sumo.save';
const PID_KEY = 'heniq.games.butt-sumo.device';
const DEFAULT = { v: 1, cleared: 0, best: {}, char: 'ojisan', seenUnlocks: [], settings: { bgm: 0.6, sfx: 0.8, mute: false, shake: true, lang: 'ja', touch: 'auto', nick: '' }, stats: { cpWins: 0, cpLosses: 0, bosses: 0, hits: 0 }, online: null };

let data = null;
function clone(o) { return JSON.parse(JSON.stringify(o)); }

export function load() {
  if (data) return data;
  data = clone(DEFAULT);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw);
      if (j && j.v === 1) {
        data.cleared = Math.max(0, Math.min(100, Number(j.cleared) | 0));
        data.char = typeof j.char === 'string' ? j.char : data.char;
        if (j.best && typeof j.best === 'object') data.best = j.best;
        if (Array.isArray(j.seenUnlocks)) data.seenUnlocks = j.seenUnlocks.slice(0, 20);
        Object.assign(data.settings, j.settings && typeof j.settings === 'object' ? j.settings : {});
        Object.assign(data.stats, j.stats && typeof j.stats === 'object' ? j.stats : {});
        data.online = j.online && typeof j.online === 'object' ? j.online : null;
      }
    }
  } catch (e) { /* 読めなければ初期値 */ }
  return data;
}

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
}

export function reset() {
  const keep = data ? data.settings : DEFAULT.settings;
  data = clone(DEFAULT);
  data.settings = keep;
  persist();
  return data;
}

// オンライン対戦の「匿名 ID」：サーバーが戦績を見つけるための、ランダムな見出し（個人情報ではない）。
// 認証用の秘密としては扱わない：他の人には表示も送信もせず（ランキングに出るのはニックネームだけ）、ID を知っていても、
// 待機中・対戦中の接続は乗っ取れない（サーバー側で拒否）。この ID で守っているのは、匿名のレートだけ。
export function deviceId() {
  try {
    let id = localStorage.getItem(PID_KEY);
    if (!id || !/^[0-9a-f]{32}$/.test(id)) {
      const a = new Uint8Array(16);
      crypto.getRandomValues(a);
      id = Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(PID_KEY, id);
    }
    return id;
  } catch (e) {
    return deviceId.mem || (deviceId.mem = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join(''));
  }
}

// 匿名 ID を作り直す（オンライン戦績の削除のあと）
export function resetDeviceId() {
  try { localStorage.removeItem(PID_KEY); } catch (e) { /* ok */ }
  deviceId.mem = null;
}
