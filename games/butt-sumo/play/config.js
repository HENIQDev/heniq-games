// オンライン対戦サーバーの接続先（Cloudflare Workers + Durable Objects）。空にすると「準備中」と表示し、通信は一切しない。
// 値を入れるときは、game.json の network_hosts にも同じホストを書く（CSP の connect-src に反映される。テストが一致を確認する）。
export const SERVER = 'wss://heniq-butt-sumo.heniq-dev.workers.dev';
