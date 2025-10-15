// ============================
// 📣 Discord 報連相BOT 完全統合版（同時処理対応）
// ============================

const {
  Client, GatewayIntentBits, Partials,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, Events
} = require('discord.js');
const { v4: uuidv4 } = require('uuid'); // UUID生成

// --- 環境変数（Koyeb管理）---
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const HORNSO_CHANNEL_ID = process.env.HORNSO_CHANNEL_ID; // 報連相送信先
const REPORT_CATEGORY_ID = process.env.REPORT_CATEGORY_ID; // 返信先カテゴリ

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !HORNSO_CHANNEL_ID || !REPORT_CATEGORY_ID) {
  console.error("❌ 必須環境変数が不足しています。");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Channel]
});

// ============================
// 🔘 起動時
// ============================
client.once(Events.ClientReady, async () => {
  console.log(`✅ ログイン完了: ${client.user.tag}`);
});

// ============================
// 💬 /horensoボタン設置コマンド
// ============================
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'horenso_button') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('horenso_start')
        .setLabel('📋 報連相を開始')
        .setStyle(ButtonStyle.Primary)
    );
    await interaction.reply({ content: '📋 報連相ボタンを設置しました！', components: [row], ephemeral: false });
  }
});

// ============================
// 💬 ボタン・選択・モーダル処理
// ============================
client.on(Events.InteractionCreate, async (interaction) => {

  // ============================
  // ✅ 報連相開始
  // ============================
  if (interaction.isButton() && interaction.customId === 'horenso_start') {
    const categorySelect = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_category')
        .setPlaceholder('カテゴリを選択')
        .addOptions([
          { label: '業務関連', value: '業務関連' },
          { label: 'トラブル対応', value: 'トラブル対応' },
          { label: 'その他', value: 'その他' }
        ])
    );
    await interaction.reply({ content: '📂 カテゴリを選択してください', components: [categorySelect], ephemeral: true });
  }

  // ============================
  // ✅ カテゴリ選択後
  // ============================
  if (interaction.isStringSelectMenu() && interaction.customId === 'select_category') {
    const category = interaction.values[0];
    const urgencySelect = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`select_urgency|${category}`)
        .setPlaceholder('緊急度を選択')
        .addOptions([
          { label: '緊急', value: '緊急' },
          { label: 'そうでもない', value: 'そうでもない' }
        ])
    );
    await interaction.update({ content: `📂 カテゴリ: **${category}**\n⚡ 緊急度を選択してください`, components: [urgencySelect] });
  }

  // ============================
  // ✅ 緊急度選択後（モーダル表示）
  // ============================
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_urgency')) {
    const [_, category] = interaction.customId.split('|');
    const urgency = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`report_modal|${category}|${urgency}`)
      .setTitle('📋 報連相 - 内容入力');

    const contentInput = new TextInputBuilder()
      .setCustomId('report_content')
      .setLabel('相談内容')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setPlaceholder('ここに報告内容を入力してください。');

    modal.addComponents(new ActionRowBuilder().addComponents(contentInput));
    await interaction.showModal(modal);
  }

  // ============================
  // ✅ モーダル送信後（報連相作成）
  // ============================
  if (interaction.isModalSubmit() && interaction.customId.startsWith('report_modal')) {
    const [_, category, urgency] = interaction.customId.split('|');
    const content = interaction.fields.getTextInputValue('report_content');
    const reportChannel = await client.channels.fetch(HORNSO_CHANNEL_ID);

    const mention = urgency === '緊急' ? '@everyone ' : '';

    const embed = new EmbedBuilder()
      .setColor(urgency === '緊急' ? 0xff0000 : 0x00aaff)
      .setTitle('📋 報連相')
      .addFields(
        { name: 'カテゴリ', value: category, inline: true },
        { name: '緊急度', value: urgency, inline: true },
        { name: '内容', value: content },
        { name: '送信者', value: `<@${interaction.user.id}>` }
      )
      .setTimestamp();

    // UUID生成 → 同時複数返信対応
    const uid = uuidv4();
    const replyButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`reply_button|${interaction.user.id}|${uid}`)
        .setLabel('💬 返信する')
        .setStyle(ButtonStyle.Secondary)
    );

    const sentMessage = await reportChannel.send({ content: mention, embeds: [embed], components: [replyButton] });
    await interaction.reply({ content: '✅ 報連相を送信しました！', ephemeral: true });

    // メモリ上で UUID と送信メッセージIDを保持（複数件対応）
    activeReports.set(uid, sentMessage.id);
  }

  // ============================
  // ✅ 返信ボタン押下 → チャンネル選択
  // ============================
  if (interaction.isButton() && interaction.customId.startsWith('reply_button')) {
    const [_, reporterId, uid] = interaction.customId.split('|');
    const guild = interaction.guild;

    const replyChannels = guild.channels.cache
      .filter(ch => ch.type === 0 && ch.parentId === REPORT_CATEGORY_ID)
      .map(ch => ({ label: ch.name, value: ch.id }));

    if (replyChannels.length === 0) {
      await interaction.reply({ content: '❌ 指定カテゴリ内に返信可能なチャンネルがありません。', ephemeral: true });
      return;
    }

    const channelSelect = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`reply_channel_select|${reporterId}|${uid}`)
        .setPlaceholder('返信先チャンネルを選択')
        .addOptions(replyChannels)
    );

    await interaction.reply({ content: '📡 返信先チャンネルを選択してください', components: [channelSelect], ephemeral: true });
  }

  // ============================
  // ✅ 返信チャンネル選択後（モーダル表示）
  // ============================
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('reply_channel_select')) {
    const [_, reporterId, uid] = interaction.customId.split('|');
    const channelId = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`reply_modal|${channelId}|${reporterId}|${uid}`)
      .setTitle('💬 返信内容入力');

    const replyInput = new TextInputBuilder()
      .setCustomId('reply_content')
      .setLabel('返信内容')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setPlaceholder('返信内容を入力してください。');

    modal.addComponents(new ActionRowBuilder().addComponents(replyInput));
    await interaction.showModal(modal);
  }

  // ============================
  // ✅ 返信モーダル送信後（転送・Embed）
  // ============================
  if (interaction.isModalSubmit() && interaction.customId.startsWith('reply_modal')) {
    const [_, channelId, reporterId, uid] = interaction.customId.split('|');
    const replyText = interaction.fields.getTextInputValue('reply_content');
    const replyChannel = await client.channels.fetch(channelId);

    // 元報連相メッセージID取得（UUIDで管理）
    const horensoChannel = await client.channels.fetch(HORNSO_CHANNEL_ID);
    const originalMsgId = activeReports.get(uid);
    const originalMsg = originalMsgId ? await horensoChannel.messages.fetch(originalMsgId).catch(() => null) : null;

    if (!originalMsg || !originalMsg.embeds[0]) {
      await interaction.reply({ content: '❌ 元の報連相メッセージを取得できませんでした（転送失敗防止済）', ephemeral: true });
      return;
    }

    const origEmbed = originalMsg.embeds[0];
    const replyEmbed = new EmbedBuilder()
      .setTitle('📣 返信')
      .setColor(0x00cc66)
      .addFields(
        { name: 'カテゴリ', value: origEmbed.fields.find(f => f.name === 'カテゴリ')?.value || '不明', inline: true },
        { name: '内容', value: origEmbed.fields.find(f => f.name === '内容')?.value || '不明' },
        { name: '返信内容', value: replyText }
      )
      .setTimestamp();

    await replyChannel.send({ content: `<@${reporterId}> さんへの返信です。`, embeds: [replyEmbed] });
    await interaction.reply({ content: '✅ 返信を送信しました！', ephemeral: true });

    // 処理完了 → メモリから削除
    activeReports.delete(uid);
  }
});

// ============================
// 💾 メモリ上で UUID と送信メッセージIDを保持
// ============================
const activeReports = new Map();

client.login(TOKEN);
