// 表示用の値（自己ベストなど）だけを保存する。秘密の値は保存しない。
// プライベートモードなどで失敗しても、ゲームは動く。
const PREFIX = 'heniq.games.';

export function loadNumber(key, fallback = 0) {
  try {
    const v = Number(localStorage.getItem(PREFIX + key));
    return Number.isFinite(v) && localStorage.getItem(PREFIX + key) !== null ? v : fallback;
  } catch (e) {
    return fallback;
  }
}

export function saveNumber(key, value) {
  try {
    localStorage.setItem(PREFIX + key, String(value));
    return true;
  } catch (e) {
    return false;
  }
}
