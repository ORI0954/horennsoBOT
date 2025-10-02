const { 
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');

// --- 環境変数 ---
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const HORNSO_CHANNEL_ID = process.env.HORNSO_CHANNEL_ID; // 報連相送信先
const EMERGENCY_ROLE_ID = process.env.EMERGENCY_ROLE_ID; // 緊急ロール
const REPLY_CATEGORY_ID = process.env.REPLY_CATEGORY_ID; // 返信用チャンネルカテゴリ

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !HORNSO_CHANNEL_ID || !EMERGENCY_ROLE_ID || !REPLY_CATEGORY_ID) {
  console.error("❌ 必須環境変数が不足しています。");
  process.exit(1);
}

// --- クライアント作成 ---
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// --- スラッシュコマンド登録 ---
const commands = [
  new SlashCommandBuilder()
    .setName('horenso')
    .setDescription('報連相フォームを開始します')
    .toJSON()
];
const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  try {
    console.log("⏳ スラッシュコマンド登録中...");
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log("✅ スラッシュコマンド登録完了！");
  } catch (err) {
    console.error("❌ コマンド登録失敗:", err);
  }
}

// --- ボタン作成 ---
const startButton = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId('horenso_start')
    .setLabel('報連相フォームを開始')
    .setStyle(ButtonStyle.Primary)
);

// --- Bot起動 ---
client.once(Events.ClientReady, async (c) => {
  console.log(`🤖 ログイン完了: ${c.user.tag}`);
  await registerCommands();
});

// --- コマンド実行 ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'horenso') {
    // ボタン作成メッセージを送信
    await interaction.reply({ content: '💬 報連相フォームを開始するには下のボタンを押してください', components: [startButton] });
  }

  // ボタン押下時
  if (interaction.isButton() && interaction.customId === 'horenso_start') {
    // --- カテゴリ選択 ---
    const categoryRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('horenso_category')
        .setPlaceholder('カテゴリを選択')
        .addOptions([
          { label: '業務関連', value: '業務関連' },
          { label: 'トラブル対応', value: 'トラブル対応' },
          { label: 'その他', value: 'その他' },
        ])
    );
    await interaction.reply({ content: '📂 カテゴリを選択してください', components: [categoryRow], ephemeral: true });
  }

  // カテゴリ選択後
  if (interaction.isStringSelectMenu() && interaction.customId === 'horenso_category') {
    const category = interaction.values[0];

    const urgencyRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`horenso_urgency|${category}`)
        .setPlaceholder('緊急度を選択')
        .addOptions([
          { label: '緊急', value: '緊急' },
          { label: 'そうでもない', value: 'そうでもない' },
        ])
    );

    await interaction.update({ content: `カテゴリ: **${category}**\n緊急度を選択してください`, components: [urgencyRow] });
  }

  // 緊急度選択後
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('horenso_urgency|')) {
    const [_, category] = interaction.customId.split('|');
    const urgency = interaction.values[0];

    // 相談内容入力を促す
    await interaction.update({ content: `カテゴリ: **${category}**\n緊急度: **${urgency}**\n💬 相談内容をこのチャンネルで入力してください（他の人には見えません）`, components: [] });

    // モーダルなどで入力受け取りたい場合は、別途設定
    // 簡易的には次のメッセージを ephemeral で受け取る形に
  }

  // ここから返信用などは別途ボタン押下で処理可能
});

// --- Botログイン ---
client.login(TOKEN);
