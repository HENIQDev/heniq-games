// 100 ステージの構成：相手・CP の行動パターン・土俵の条件・テーマ・キャラクター解放。
import { CHARS, START_CHARS } from './chars.js';

export const STAGE_COUNT = 100;
export const THEMES = ['park', 'bath', 'shrine', 'beach', 'space', 'ice', 'volcano', 'neon', 'kitchen', 'sky'];
export const THEME_NAMES = { park: '公園', bath: '銭湯', shrine: '神社', beach: '海辺', space: '宇宙', ice: '氷の国', volcano: '火山', neon: 'ネオン街', kitchen: '食卓', sky: '天空' };

// クリアで解放されるキャラクター（そのステージをクリアした時点で使える）
export const UNLOCKS = { gorilla: 8, frog: 15, burger: 25, pudding: 35, sushi: 48, robot: 62, baby: 78, mystery: 92 };
export const UNLOCK_AT = Object.fromEntries(Object.entries(UNLOCKS).map(([k, v]) => [v, k]));

const TIERS = [
  { to: 8, tactics: ['rush'] },
  { to: 16, tactics: ['rush', 'chase'] },
  { to: 32, tactics: ['rush', 'chase', 'brace', 'counter'] },
  { to: 55, tactics: ['chase', 'brace', 'counter', 'feint', 'edge'] },
  { to: 80, tactics: ['chase', 'brace', 'counter', 'feint', 'edge', 'charge', 'special'] },
  { to: 100, tactics: ['chase', 'brace', 'counter', 'feint', 'edge', 'charge', 'special'] },
];

export const BOSSES = {
  10: { name: 'ドスコイ番長', char: 'gorilla', style: '押しの一手', tactics: ['rush', 'chase', 'charge'], aggr: 0.8, brace: 0.2, big: 1.0 },
  20: { name: 'チキン将軍', char: 'chicken', style: 'ひき逃げ', tactics: ['kite', 'chase', 'counter', 'feint', 'special'], aggr: 0.7, brace: 0.3, big: 1.05 },
  30: { name: '鉄壁ロボ・ガード', char: 'robot', style: 'カウンター', tactics: ['brace', 'counter', 'chase', 'special'], aggr: 0.5, brace: 0.85, big: 1.0 },
  40: { name: 'プリン姫', char: 'pudding', style: '滑って回り込む', tactics: ['edge', 'feint', 'chase', 'special'], aggr: 0.65, brace: 0.4, big: 1.0 },
  50: { name: 'ハンバーガー大王', char: 'burger', style: '回転ラッシュ', tactics: ['rush', 'chase', 'special', 'charge'], aggr: 0.85, brace: 0.3, big: 1.1 },
  60: { name: 'ゲコ仙人', char: 'frog', style: '引き寄せと外押し', tactics: ['edge', 'feint', 'counter', 'brace', 'special'], aggr: 0.6, brace: 0.6, big: 1.1 },
  70: { name: 'ビッグ・ベビー', char: 'baby', style: '重量と大泣き', tactics: ['chase', 'charge', 'special', 'brace'], aggr: 0.7, brace: 0.5, big: 1.0 },
  80: { name: '大将寿司', char: 'sushi', style: '高速フェイント', tactics: ['feint', 'edge', 'counter', 'chase', 'special', 'brace'], aggr: 0.8, brace: 0.55, big: 1.25 },
  90: { name: 'ナゾ博士', char: 'mystery', style: '全部入り', tactics: ['chase', 'brace', 'counter', 'feint', 'edge', 'charge', 'special'], aggr: 0.8, brace: 0.7, big: 1.0 },
  100: { name: '大横綱 ミスター・ケツ', char: 'ojisan', style: 'すべての戦術', tactics: ['chase', 'brace', 'counter', 'feint', 'edge', 'charge', 'special'], aggr: 0.9, brace: 0.85, big: 1.2 },
};

const FOE_ORDER = ['ojisan', 'chicken', 'frog', 'burger', 'pudding', 'sushi', 'robot', 'gorilla', 'baby', 'mystery'];

function lerp(a, b, t) { return a + (b - a) * t; }

export function stageInfo(n) {
  const t = (n - 1) / (STAGE_COUNT - 1);
  const theme = THEMES[Math.floor((n - 1) / 10) % THEMES.length];
  const boss = BOSSES[n] || null;
  const tier = TIERS.find((x) => n <= x.to);
  const foe = boss ? boss.char : FOE_ORDER[(n * 3 + Math.floor(n / 7)) % FOE_ORDER.length];
  const prof = {
    react: lerp(0.6, 0.12, Math.pow(t, 0.55)),
    aggr: boss ? boss.aggr : lerp(0.25, 0.85, Math.pow(t, 0.65)),
    aim: lerp(0.65, 0.03, Math.pow(t, 0.6)),
    brace: boss ? boss.brace : lerp(0.0, 0.85, Math.pow(t, 0.7)),
    perfect: lerp(0.15, 0.9, Math.pow(t, 0.7)),
    edge: lerp(0.1, 0.95, Math.pow(t, 0.7)),
    tactics: boss ? boss.tactics : tier.tactics,
  };
  const buff = { atk: lerp(0.85, 1.18, Math.pow(t, 0.8)), def: lerp(0.9, 1.2, Math.pow(t, 0.8)), spd: lerp(0.9, 1.08, t), big: boss ? boss.big : 1 };
  const mods = {
    ringR: 5.0 + (n % 10 === 3 ? -0.4 : 0) + (n % 10 === 7 ? 0.4 : 0),
    slip: theme === 'ice' ? 0.6 : theme === 'bath' ? 0.8 : 1,
    time: 60,
  };
  const names = ['入門', '修行', '腕試し', '実戦', '激闘', '大勝負', '勝ち抜き', '強敵', '番付', '頂上'];
  return {
    n, theme, boss, foe, name: boss ? boss.name : '第' + n + '戦', title: boss ? 'ボス戦：' + boss.name : THEME_NAMES[theme] + 'の' + names[(n - 1) % 10] + '戦',
    style: boss ? boss.style : null, profile: prof, buff, mods, unlock: UNLOCK_AT[n] || null,
  };
}

export const STAGES = Array.from({ length: STAGE_COUNT }, (_, i) => stageInfo(i + 1));

export function unlockedChars(cleared) {
  const set = new Set(START_CHARS);
  for (const [id, at] of Object.entries(UNLOCKS)) if (cleared >= at) set.add(id);
  return CHARS.map((c) => c.id).filter((id) => set.has(id));
}
