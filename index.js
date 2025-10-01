const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  Events, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ModalSubmitInteraction 
} = require('discord.js');

// --- 環境変数 ---
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("❌ DISCORD_TOKEN / CLIENT_ID / GUILD_ID が設定されていません。");
  process.exit(1);
}

// --- クライアント作成 ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// --- スラッシュコマンド定義 ---
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

// --- コマンド実行時 ---
client.on(Events.InteractionCreate, async (interaction) => {
  // --- スラッシュコマンド ---
  if (interaction.isChatInputCommand() && interaction.commandName === 'horenso') {

    // カテゴリ選択メニュー
    const categorySelect = new StringSelectMenuBuilder()
      .setCustomId('horenso_category')
      .setPlaceholder('カテゴリを選択してください')
      .addOptions([
        { label: 'バグ報告', value: 'バグ報告' },
        { label: '要望', value: '要望' },
        { label: '質問', value: '質問' }
      ]);

    // 緊急度選択メニュー
    const urgencySelect = new StringSelectMenuBuilder()
      .setCustomId('horenso_urgency')
      .setPlaceholder('緊急度を選択してください')
      .addOptions([
        { label: '低', value: '低' },
        { label: '中', value: '中' },
        { label: '高', value: '高' }
      ]);

    const row1 = new ActionRowBuilder().addComponents(categorySelect);
    const row2 = new ActionRowBuilder().addComponents(urgencySelect);

    await interaction.reply({
      content: "📋 報連相フォームを開始します！\nカテゴリと緊急度を選択してください。",
      components: [row1, row2],
      ephemeral: true
    });
  }

  // --- 選択メニューの反応 ---
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'horenso_category') {
      // カテゴリ選択後、緊急度選択へ
      await interaction.update({ content: `✅ カテゴリ: **${interaction.values[0]}** が選択されました\n次に緊急度を選択してください。`, components: [] });

    } else if (interaction.customId === 'horenso_urgency') {
      // 緊急度選択後、相談内容モーダルを表示
      const modal = new ModalBuilder()
        .setCustomId(`horenso_modal_${interaction.user.id}`)
        .setTitle('相談内容を入力してください');

      const input = new TextInputBuilder()
        .setCustomId('horenso_content')
        .setLabel('相談内容')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('相談内容を詳しく入力してください')
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);

      await interaction.showModal(modal);
    }
  }

  // --- モーダル送信後 ---
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('horenso_modal_')) {
      const content = interaction.fields.getTextInputValue('horenso_content');
      await interaction.reply({
        content: `📩 報連相が送信されました！\n**相談内容:** ${content}`,
        ephemeral: true
      });

      // 必要ならここで管理者用チャンネルに送信するなどの処理も追加可能
    }
  }
});

// --- Botログイン ---
client.login(TOKEN);
