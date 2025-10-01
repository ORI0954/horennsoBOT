const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events } = require('discord.js');

// --- 環境変数から取得（KoyebのSettings → Environment Variablesで設定） ---
const TOKEN = process.env.TOKEN;        // Botのトークン
const CLIENT_ID = process.env.CLIENT_ID; // DiscordアプリケーションID
const GUILD_ID = process.env.GUILD_ID;   // サーバーID

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("❌ TOKEN / CLIENT_ID / GUILD_ID が設定されていません。Koyebの環境変数を確認してください。");
  process.exit(1);
}

// --- クライアント作成 ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// --- スラッシュコマンドの定義 ---
const commands = [
  new SlashCommandBuilder()
    .setName('horenso')
    .setDescription('報連相フォームを開始します')
    .toJSON()
];

// --- コマンド登録 ---
const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  try {
    console.log("⏳ スラッシュコマンドを登録中...");
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log("✅ スラッシュコマンド登録完了！");
  } catch (err) {
    console.error("❌ コマンド登録に失敗:", err);
  }
}

// --- Bot起動時 ---
client.once(Events.ClientReady, async (c) => {
  console.log(`🤖 ログイン完了: ${c.user.tag}`);
  await registerCommands();
});

// --- コマンド実行時の処理 ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'horenso') {
    await interaction.reply({
      content: "📋 報連相フォームを開始します！",
      ephemeral: true
    });
  }
});

// --- Botログイン ---
client.login(TOKEN);
