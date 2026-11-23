// キャラクターの性能（ゲーム本体・CP・オンラインのサーバーが同じ値を使う。見た目は gl/models.js）。
// 単位：メートル・秒・kg 相当の相対値（おじさん = 1.0）。
export const CHARS = [
  { id: 'ojisan', name: 'おじさん', kana: 'OJISAN', blurb: '会社帰りの、ごく普通のお尻。バランス型。',
    r: 0.78, mass: 1.0, speed: 3.6, grip: 9, turn: 7, dashSpeed: 10.0, power: 1.0, defense: 1.0, stamina: 100, regen: 18, slip: 1.0, bounce: 0.55,
    spec: 'tackle', specName: '全力ぶちかましヒップ', specDesc: '長い距離を超パワーで突進。当たれば大ダメージ。', rank: { weight: 3, speed: 3, power: 3, defense: 3, stamina: 3 } },
  { id: 'chicken', name: 'ニワトリ', kana: 'NIWATORI', blurb: '軽くて速い。吹っ飛びやすいのが玉にきず。',
    r: 0.62, mass: 0.62, speed: 4.3, grip: 12, turn: 10, dashSpeed: 11.0, power: 0.85, defense: 0.66, stamina: 110, regen: 20, slip: 1.0, bounce: 0.6,
    spec: 'hop', specName: 'バサバサ飛び乗り', specDesc: '飛び上がって相手の背後（土俵の内側）へ。着地で外へ押し出す。', rank: { weight: 1, speed: 5, power: 2, defense: 1, stamina: 4 } },
  { id: 'gorilla', name: 'ゴリラ', kana: 'GORIRA', blurb: '重量級。押し出しは強烈だが、動きは遅い。',
    r: 0.98, mass: 1.65, speed: 2.8, grip: 7, turn: 4.4, dashSpeed: 8.8, power: 1.1, defense: 1.25, stamina: 90, regen: 15, slip: 1.0, bounce: 0.45,
    spec: 'quake', specName: 'ドラミング地震', specDesc: '胸を叩いて地面を揺らす。近くの相手を外側へ吹き飛ばす。', rank: { weight: 5, speed: 1, power: 5, defense: 4, stamina: 2 } },
  { id: 'frog', name: 'カエル', kana: 'KAERU', blurb: '長いベロで引き寄せる、トリッキーな中量級。',
    r: 0.66, mass: 0.85, speed: 4.1, grip: 10, turn: 8, dashSpeed: 10.6, power: 1.12, defense: 0.95, stamina: 105, regen: 19, slip: 1.0, bounce: 0.6,
    spec: 'pull', specName: 'ベロベロ引き寄せ', specDesc: 'ベロで相手を手前に引き寄せる。引いた直後が攻めどき。', rank: { weight: 2, speed: 4, power: 3, defense: 2, stamina: 3 } },
  { id: 'burger', name: 'ハンバーガー', kana: 'HAMBURGER', blurb: 'よく弾む。ぶつかられても、跳ね返して逆襲。',
    r: 0.86, mass: 1.1, speed: 3.4, grip: 8, turn: 6, dashSpeed: 9.8, power: 1.0, defense: 1.0, stamina: 100, regen: 18, slip: 1.0, bounce: 0.95,
    spec: 'spin', specName: 'バンズ回転ヒップ', specDesc: '回転して、全方向のお尻で当たる。囲まれても強い。', rank: { weight: 3, speed: 3, power: 3, defense: 3, stamina: 3 } },
  { id: 'pudding', name: 'プリン', kana: 'PURIN', blurb: 'つるつる滑る。慣れれば、誰よりも自在。',
    r: 0.8, mass: 1.0, speed: 4.1, grip: 4.6, turn: 6, dashSpeed: 10.6, power: 1.05, defense: 1.0, stamina: 100, regen: 18, slip: 0.7, bounce: 0.7,
    spec: 'slide', specName: 'ぷるぷるスライド', specDesc: '氷のように滑りながら、全身でぶつかる。', rank: { weight: 3, speed: 3, power: 3, defense: 2, stamina: 3 } },
  { id: 'sushi', name: '寿司', kana: 'SUSHI', blurb: '小さくて超すばしっこい。当たると、すぐ飛ぶ。',
    r: 0.56, mass: 0.55, speed: 4.8, grip: 13, turn: 12, dashSpeed: 12.0, power: 1.0, defense: 0.78, stamina: 115, regen: 21, slip: 1.0, bounce: 0.65,
    spec: 'spin', specName: '回転寿司アタック', specDesc: 'ぐるぐる回って、全方向にお尻で当たる。', rank: { weight: 1, speed: 5, power: 2, defense: 1, stamina: 5 } },
  { id: 'robot', name: 'ロボット', kana: 'ROBOT', blurb: '装甲が厚く、ふんばりに強い。のろまなのが弱点。',
    r: 0.82, mass: 1.3, speed: 3.1, grip: 8, turn: 5.4, dashSpeed: 9.2, power: 1.0, defense: 1.35, stamina: 95, regen: 16, slip: 1.0, bounce: 0.4,
    spec: 'heavy', specName: '装甲全開ズッシリ', specDesc: '数秒間、重さが倍増して、ほとんど動かせなくなる。', rank: { weight: 4, speed: 2, power: 3, defense: 5, stamina: 2 } },
  { id: 'baby', name: '巨大な赤ちゃん', kana: 'AKACHAN', blurb: '巨体で、動きは遅い。大泣きで周りが吹っ飛ぶ。',
    r: 1.16, mass: 1.7, speed: 2.5, grip: 6, turn: 4.0, dashSpeed: 8.2, power: 0.95, defense: 1.1, stamina: 85, regen: 15, slip: 1.0, bounce: 0.5,
    spec: 'cry', specName: '大泣きウェーブ', specDesc: '大声で泣く。広い範囲の相手を吹き飛ばし、しびれさせる。', rank: { weight: 5, speed: 1, power: 4, defense: 3, stamina: 2 } },
  { id: 'mystery', name: '謎の生物', kana: 'NAZO', blurb: '正体不明。必殺技が毎回ちがう。',
    r: 0.8, mass: 1.0, speed: 3.7, grip: 9, turn: 7, dashSpeed: 10.0, power: 1.0, defense: 1.0, stamina: 100, regen: 18, slip: 1.0, bounce: 0.6,
    spec: 'chaos', specName: '？？？', specDesc: '何が出るかは、本人にも分からない（ほかの必殺技のどれか）。', rank: { weight: 3, speed: 3, power: 3, defense: 3, stamina: 3 } },
];

export const CHAR_BY_ID = Object.fromEntries(CHARS.map((c) => [c.id, c]));
export const CHAR_INDEX = Object.fromEntries(CHARS.map((c, i) => [c.id, i]));
export const START_CHARS = ['ojisan', 'chicken'];

// 必殺技の共通パラメータ
export const SPECIALS = {
  tackle: { name: 'ぶちかまし' }, hop: { name: '飛び乗り' }, quake: { name: '地震' }, pull: { name: '引き寄せ' },
  spin: { name: '回転' }, slide: { name: 'スライド' }, heavy: { name: 'ズッシリ' }, cry: { name: '大泣き' }, chaos: { name: '？？？' },
};
