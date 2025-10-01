const { 
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events,
  ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');

// --- 環境変数 ---
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const REPORT_CHANNEL_ID = process.env.REPORT_CHANNEL_ID; // 固定送信先
const REPLY_CATEGORY_ID = process.env.REPLY_CATEGORY_ID; // 返信用選択先カテゴリ

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !REPORT_CHANNEL_ID || !REPLY_CATEGORY_ID) {
  console.error("❌ 環境変数が不足しています");
  process.exit(1);
}

// --- クライアント作成 ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

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
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ スラッシュコマンド登録完了！");
  } catch (err) {
    console.error("❌ コマンド登録に失敗:", err);
  }
}

// --- Bot起動 ---
client.once(Events.ClientReady, async (c) => {
  console.log(`🤖 ログイン完了: ${c.user.tag}`);
  await registerCommands();
});

// --- コマンド実行 ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'horenso') {
    // ① カテゴリ選択
    const categoryMenu = new StringSelectMenuBuilder()
      .setCustomId('category_select')
      .setPlaceholder('カテゴリを選択してください')
      .addOptions([
        { label: '仕事', value: '仕事' },
        { label: 'プライベート', value: 'プライベート' },
        { label: 'その他', value: 'その他' }
      ]);

    await interaction.reply({
      content: "📋 報連相フォームを開始します！\nまずカテゴリを選択してください。",
      components: [new ActionRowBuilder().addComponents(categoryMenu)],
      ephemeral: true
    });
  }

  // --- 選択メニューの処理 ---
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'category_select') {
      const category = interaction.values[0];

      // ② 緊急度選択
      const urgencyMenu = new StringSelectMenuBuilder()
        .setCustomId('urgency_select')
        .setPlaceholder('緊急度を選択してください')
        .addOptions([
          { label: '高', value: '高' },
          { label: '中', value: '中' },
          { label: '低', value: '低' }
        ]);

      await interaction.update({
        content: `✅ カテゴリ: ${category}\n次に緊急度を選択してください。`,
        components: [new ActionRowBuilder().addComponents(urgencyMenu)]
      });

      // 保存用にカスタムIDにカテゴリを保持
      interaction.customCategory = category;
    }

    else if (interaction.customId === 'urgency_select') {
      const urgency = interaction.values[0];

      // ③ 相談内容入力用モーダル
      const modal = new ModalBuilder()
        .setCustomId(`report_modal_${urgency}`)
        .setTitle('相談内容を入力してください');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('report_content')
            .setLabel('相談内容')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
    }
  }

  // --- モーダル送信 ---
  if (interaction.isModalSubmit()) {
    const content = interaction.fields.getTextInputValue('report_content');

    // 固定チャンネルへ送信
    const reportChannel = await client.channels.fetch(REPORT_CHANNEL_ID);
    await reportChannel.send({
      content: `📢 新しい報連相\n**送信者:** ${interaction.user.tag}\n**内容:** ${content}`
    });

    // --- 返信先チャンネル選択 ---
    const channelsInCategory = interaction.guild.channels.cache
      .filter(c => c.isTextBased() && c.parentId === REPLY_CATEGORY_ID)
      .map(c => ({ label: c.name, value: c.id }));

    const replyMenu = new StringSelectMenuBuilder()
      .setCustomId('reply_channel_select')
      .setPlaceholder('返信先チャンネルを選択してください')
      .addOptions(channelsInCategory.slice(0, 25));

    await interaction.reply({
      content: "✅ 報連相を送信しました。\n返信するチャンネルを選択してください。",
      components: [new ActionRowBuilder().addComponents(replyMenu)],
      ephemeral: true
    });
  }

  // --- 返信先選択 ---
  if (interaction.isStringSelectMenu() && interaction.customId === 'reply_channel_select') {
    const channelId = interaction.values[0];
    await interaction.update({
      content: `✅ 返信先チャンネル: <#${channelId}> が選択されました。`,
      components: []
    });
  }
});

// --- Botログイン ---
client.login(TOKEN);
