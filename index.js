const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  Events, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');

// --- 環境変数 ---
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const HORNSO_CHANNEL_ID = process.env.HORNSO_CHANNEL_ID; // 報連相送信先チャンネル
const EMERGENCY_ROLE_ID = process.env.EMERGENCY_ROLE_ID; // 緊急時ロールID
const REPLY_CATEGORY_ID = process.env.REPLY_CATEGORY_ID; // 返信先カテゴリID

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !HORNSO_CHANNEL_ID || !EMERGENCY_ROLE_ID || !REPLY_CATEGORY_ID) {
  console.error("❌ 必須環境変数が不足しています。");
  process.exit(1);
}

// --- クライアント作成 ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// --- コマンド登録 ---
const commands = [
  new SlashCommandBuilder()
    .setName('horenso_button')
    .setDescription('報連相開始ボタンを設置')
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(TOKEN);
async function registerCommands() {
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ スラッシュコマンド登録完了！");
  } catch (err) {
    console.error("❌ コマンド登録失敗:", err);
  }
}

// --- 起動時 ---
client.once(Events.ClientReady, async (c) => {
  console.log(`🤖 ログイン完了: ${c.user.tag}`);
  await registerCommands();
});

// --- インタラクション ---
client.on(Events.InteractionCreate, async (interaction) => {

  // =============================
  // ボタン設置コマンド
  // =============================
  if (interaction.isChatInputCommand() && interaction.commandName === 'horenso_button') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('horenso_start')
        .setLabel('📋 報連相を開始')
        .setStyle(ButtonStyle.Primary)
    );
    await interaction.reply({ content: '報連相を開始するにはボタンを押してください', components: [row], ephemeral: false });
  }

  // =============================
  // 報連相開始ボタン
  // =============================
  if (interaction.isButton() && interaction.customId === 'horenso_start') {
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
    await interaction.reply({ content: 'カテゴリを選択してください', components: [categoryRow], ephemeral: true });
  }

  // =============================
  // カテゴリ選択
  // =============================
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

  // =============================
  // 緊急度選択 → モーダルで相談内容
  // =============================
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('horenso_urgency')) {
    const [_, category] = interaction.customId.split('|');
    const urgency = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`horenso_modal|${category}|${urgency}`)
      .setTitle('📋 報連相 - 相談内容入力');

    const input = new TextInputBuilder()
      .setCustomId('horenso_content')
      .setLabel('相談内容を入力してください')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }

  // =============================
  // 相談内容モーダル → 報告送信
  // =============================
  if (interaction.isModalSubmit() && interaction.customId.startsWith('horenso_modal')) {
    const [_, category, urgency] = interaction.customId.split('|');
    const contentText = interaction.fields.getTextInputValue('horenso_content');
    const reportChannel = await client.channels.fetch(HORNSO_CHANNEL_ID);

    let content =
      `📌 **報連相**\n─────────────\nカテゴリ: **${category}**\n緊急度: **${urgency}**\n送信者: <@${interaction.user.id}>\n💬 内容:\n${contentText}`;

    if (urgency === '緊急') content = `<@&${EMERGENCY_ROLE_ID}>\n` + content;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`horenso_reply|${category}|TEMP`)
        .setLabel('💬 返信する')
        .setStyle(ButtonStyle.Secondary)
    );

    const reportMsg = await reportChannel.send({ content, components: [row] });

    // メッセージIDを customId に更新
    const newRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`horenso_reply|${category}|${reportMsg.id}`)
        .setLabel('💬 返信する')
        .setStyle(ButtonStyle.Secondary)
    );
    await reportMsg.edit({ components: [newRow] });

    console.log("📌 報告送信済み:", reportMsg.id, category, urgency);

    await interaction.reply({ content: '✅ 報連相を送信しました！', ephemeral: true });
  }

  // =============================
  // 返信ボタン押下 → 返信先チャンネル選択
  // =============================
  if (interaction.isButton() && interaction.customId.startsWith('horenso_reply')) {
    const [_, category, msgId] = interaction.customId.split('|');

    const guild = interaction.guild;
    const channels = guild.channels.cache
      .filter(ch => ch.type === 0 && ch.parentId === REPLY_CATEGORY_ID)
      .map(ch => ({ label: ch.name, value: `${ch.id}|${msgId}|${category}` }));

    if (channels.length === 0) {
      await interaction.reply({ content: '❌ 指定カテゴリ内にチャンネルがありません', ephemeral: true });
      return;
    }

    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('horenso_reply_channel')
        .setPlaceholder('返信先チャンネルを選択')
        .addOptions(channels)
    );

    await interaction.reply({ content: '返信先チャンネルを選択してください', components: [selectRow], ephemeral: true });
  }

  // =============================
  // 返信先チャンネル選択 → モーダル入力
  // =============================
  if (interaction.isStringSelectMenu() && interaction.customId === 'horenso_reply_channel') {
    const [channelId, msgId, category] = interaction.values[0].split('|');

    const modal = new ModalBuilder()
      .setCustomId(`horenso_reply_modal|${channelId}|${msgId}|${category}`)
      .setTitle('💬 報連相 - 返信内容入力');

    const input = new TextInputBuilder()
      .setCustomId('reply_content')
      .setLabel('返信内容を入力してください')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }

  // =============================
  // 返信モーダル送信 → 返信メッセージ
  // =============================
  if (interaction.isModalSubmit() && interaction.customId.startsWith('horenso_reply_modal')) {
    const [_, channelId, msgId, category] = interaction.customId.split('|');
    const replyText = interaction.fields.getTextInputValue('reply_content');

    try {
      const reportChannel = await client.channels.fetch(HORNSO_CHANNEL_ID);
      const originalMsg = await reportChannel.messages.fetch(msgId).catch(() => null);

      let originalContent = "内容取得失敗";
      if (originalMsg) {
        const match = originalMsg.content.match(/💬 内容:\n([\s\S]*)/);
        if (match) originalContent = match[1];
      }

      const replyChannel = await client.channels.fetch(channelId);
      const content =
        `📣 **返信**\n─────────────\nカテゴリ: **${category}**\n💬 内容:\n${originalContent}\n\n💬 返信:\n${replyText}`;

      await replyChannel.send({ content });
      await interaction.reply({ content: '✅ 返信を送信しました！', ephemeral: true });

      console.log("📣 返信送信:", { msgId, category, replyText });
    } catch (err) {
      console.error("❌ 返信送信エラー:", err);
      await interaction.reply({ content: '❌ 返信送信中にエラーが発生しました', ephemeral: true });
    }
  }
});

// --- Botログイン ---
client.login(TOKEN);
