// オンライン対戦の通信の約束（クライアントとサーバーが共有）。サーバーは、ここの検査を通ったものだけを使う。
import { CHAR_BY_ID } from './chars.js';

export const PROTO = 1;
export const MAX_MSG = 600;                 // 1 メッセージの最大バイト数
export const NICK_MAX = 12;
export const MATCH_JOIN_TIMEOUT = 15;       // 試合の部屋に両者が揃うまでの秒数
export const RECONNECT_GRACE = 10;          // 切断してから、復帰を待つ秒数
export const QUEUE_TIMEOUT = 45;            // 対戦相手が見つからないと諦める秒数

export function cleanNick(s) {
  let n = typeof s === 'string' ? s : '';
  n = n.replace(/[\u0000-\u001f\u007f<>"'&\\]/g, '').replace(/\s+/g, ' ').trim();
  n = Array.from(n).slice(0, NICK_MAX).join('');
  return n || 'ななし';
}
export const validPid = (s) => typeof s === 'string' && /^[0-9a-f]{32}$/.test(s);
export const validChar = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(CHAR_BY_ID, id);
export function parseMsg(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_MSG) return null;
  try { const m = JSON.parse(raw); return m && typeof m === 'object' && typeof m.t === 'string' ? m : null; } catch (e) { return null; }
}
// 入力：スティックは −1..1、ボタンは 0..15 の整数に丸める（範囲外・NaN は無視される）
export function cleanInput(m) {
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
  const b = typeof m.b === 'number' && Number.isFinite(m.b) ? (m.b | 0) & 15 : 0;
  return { mx: Math.round(num(m.mx) * 100) / 100, my: Math.round(num(m.my) * 100) / 100, b };
}
