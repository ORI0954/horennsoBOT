const { Client, GatewayIntentBits } = require("discord.js");

// ここで client を作る
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// TOKEN の確認（先頭4文字だけ表示して安全に確認）
console.log("TOKEN:", process.env.TOKEN?.slice(0, 4) + "…");

// client.login は client 定義のあとに呼ぶ
client.login(process.env.TOKEN);

// ログイン成功したら ready イベントで通知
client.on("ready", () => {
  console.log(`${client.user.tag} でログインしました`);
});
