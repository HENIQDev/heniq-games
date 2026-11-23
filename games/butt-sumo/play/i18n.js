// 文言。日本語が基本。英語など他の言語は、同じ ID の辞書を足せば切り替えられる（足りない ID は日本語に戻る）。
const ja = {
  title: 'BUTT SUMO', subtitle: 'お尻で押し出せ！ 最強のバカ相撲', pressStart: 'タップ / キーでスタート',
  menuCp: 'CPステージ', menuOnline: 'ランダム対戦', menuChars: 'キャラクター', menuRanking: 'ランキング', menuHow: '遊び方', menuSettings: '設定', menuHome: 'ゲーム一覧へ',
  back: 'もどる', ok: 'OK', cancel: 'キャンセル', retry: 'もういちど', next: '次のステージへ', toMenu: 'メニューへ', toStages: 'ステージ選択へ', start: 'この子で行く！', select: '選ぶ',
  stageSel: 'ステージ選択', locked: '未解放', cleared: 'クリア済み', boss: 'BOSS', stage: 'ステージ', foe: '対戦相手', style: '戦い方',
  you: 'あなた', win: '勝利！', lose: '敗北…', draw: '引き分け', ringout: '土俵の外へ！', timeup: '時間切れ', pause: 'ポーズ', resume: '再開', quit: 'やめる',
  go: 'はっけよい！', unlockTitle: '新キャラクター解放！', unlockHint: 'キャラクター選択で使えます',
  timeLabel: 'TIME', dmgLabel: '勢い', staLabel: 'スタミナ', spLabel: '必殺', spReady: '必殺技 OK！',
  btnDash: '突進', btnBrace: '踏ん張り', btnCharge: 'チャージ', btnSpecial: '必殺',
  howTitle: '遊び方', howGoal: '相手を土俵の外へ押し出せば勝ち。自分が出たら負け。時間切れは「勢い（ダメージ）」が少ない方の勝ち。',
  howButt: 'お尻の向きがだいじ。キャラは自動で相手にお尻を向ける。お尻でぶつかると、大きくはね飛ばせる。',
  howDash: '突進：スティックの方向（なければ相手の方）へお尻から突っ込む。外すと大きなスキ。連打はスタミナ切れ。',
  howBrace: '踏ん張り：ホールドで耐える。突進が当たる直前に押すと「ジャスト踏ん張り」で弾き返せる。',
  howCharge: 'チャージ：ホールドして離すと強力な突進。ためている間は動きが遅く、攻撃を受けると中断。',
  howSpecial: '必殺：ゲージが満タンで発動。キャラごとに効果が違う。ゲージは当てても当てられても、時間でも溜まる。',
  howDamage: '「勢い」が高いほど、はね飛ばされやすい。80を超えたら要注意。',
  ctrlPc: 'PC：移動 WASD／矢印　突進 Space／J　踏ん張り Shift／K　チャージ C／L（長押し）　必殺 E／Enter　ポーズ P',
  ctrlTouch: 'スマホ：左の円でスティック移動　右のボタンで突進・踏ん張り・チャージ・必殺',
  settingsTitle: '設定', setBgm: 'BGM の音量', setSfx: '効果音の音量', setMute: 'ミュート', setShake: '画面のゆれ', setNick: 'ニックネーム', setReset: '進行データを消す', setResetConfirm: 'CPステージの進行とキャラクター解放を消します。元に戻せません。よろしいですか？', setLang: '言語', setTouch: 'タッチ操作ボタンを表示',
  on: 'オン', off: 'オフ',
  onlineTitle: 'ランダム対戦', onlineSearch: '対戦相手を探しています…', onlineFound: '対戦相手が見つかりました！', onlineCancel: 'やめる', onlineNoOpp: '対戦相手が見つかりませんでした。時間をおいて、もう一度お試しください。', onlineOffline: 'サーバーに接続できません。通信状況を確認して、もう一度お試しください。', onlineConnecting: 'サーバーに接続中…',
  onlineWait: '対戦相手の接続を待っています…', onlineReconnect: '再接続しています…', onlineOppAway: '相手の接続が切れました。復帰を待っています…', onlineYouLost: '接続が切れたため、負けになりました', onlineOppLeft: '相手が切断したため、あなたの勝ちです',
  rating: 'レート', winsLabel: '勝', lossesLabel: '敗', winRate: '勝率', streak: '連勝', bestStreak: '最高連勝', games: '試合数', rank: '順位',
  rankingTitle: 'オンラインランキング', rankingEmpty: 'まだ誰もいません。最初の1人になろう！', rankingNote: 'レートで並べています（3試合以上）。ニックネームは自由に設定できます。',
  onlineResult: 'オンライン対戦の結果', ratingChange: 'レート',
  unavailable: 'オンライン対戦は、サーバー準備中のため現在ご利用いただけません。', unavailableHint: 'CPステージは、そのまま遊べます。',
  charTitle: 'キャラクター', stat_weight: '重さ', stat_speed: '速さ', stat_power: '突進', stat_defense: '守り', stat_stamina: 'スタミナ', special: '必殺技',
  lockedChar: 'ステージ{n}をクリアで解放', yourBest: 'ベスト',
  webglNeed: 'このゲームは WebGL2 に対応したブラウザが必要です。iPhone は iOS 15 以降の Safari、PC は最新の Chrome・Edge・Firefox・Safari でお試しください。',
  loading: '読み込み中…', errorTitle: '問題が発生しました', reload: '再読み込み',
  rotateHint: '画面を横向きにすると、より遊びやすくなります', pausedHint: 'ブラウザの別タブに移ったため、ポーズしました',
};
const dicts = { ja, en: {} };
let lang = 'ja';
export function setLang(l) { lang = dicts[l] ? l : 'ja'; }
export function t(id, vars) {
  let s = (dicts[lang] && dicts[lang][id]) || ja[id] || id;
  if (vars) for (const k of Object.keys(vars)) s = s.replace('{' + k + '}', vars[k]);
  return s;
}
export function registerLang(code, dict) { dicts[code] = dict; }
