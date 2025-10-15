// ============================
// 📣 Discord 報連相BOT (Koyeb対応・スラッシュコマンド登録付き)
// ============================

const { 
  Client, GatewayIntentBits, Partials,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  EmbedBuilder, Events, REST, Routes, SlashCommandBuilder
} = require('discord.js');

// --- 環境変数 ---
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const HORNSO_CHANNEL_ID = process.env.HORNSO_CHANNEL_ID; // 報連相送信先
const REPORT_CATEGORY_ID = process.env.REPORT_CATEGORY_ID; // 返信先カテゴリ

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !HORNSO_CHANNEL_ID || !REPORT_CATEGORY_ID) {
  console.error("❌ 必須環境変数が不足しています。");
  process.exit(1);
}

// --- クライアント作成 ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Channel]
});

// ============================
// 🔘 スラッシュコマンド登録
// ============================
const rest = new REST({ version: '10' }).setToken(TOKEN);

const commands = [
  new SlashCommandBuilder()
    .setName('horenso_button')
    .setDescription('報連相開始ボタンを設置')
    .toJSON()
];

async function registerCommands() {
  try {
    console.log('⏳ スラッシュコマンド登録中...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ スラッシュコマンド登録完了！');
  } catch (err) {
    console.error('❌ コマンド登録に失敗:', err);
  }
}

// ============================
// 🔘 起動時
// ============================
client.once(Events.ClientReady, async () => {
  console.log(`🤖 ログイン完了: ${client.user.tag}`);
  await registerCommands();
});

// ============================
// 💬 スラッシュコマンド・ボタン・モーダル処理
// ============================
client.on(Events.InteractionCreate, async (interaction) => {
  // --- /horenso_button コマンド ---
  if (interaction.isChatInputCommand() && interaction.commandName === 'horenso_button') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('horenso_start')
        .setLabel('📋 報連相を開始')
        .setStyle(ButtonStyle.Primary)
    );
    await interaction.reply({ content: '📋 報連相ボタンを設置しました！', components: [row], ephemeral: false });
    return;
  }

  // --- 報連相開始ボタン ---
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
    return;
  }

  // --- カテゴリ選択 → 緊急度選択 ---
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
    return;
  }

  // --- 緊急度選択 → モーダル ---
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
    return;
  }

  // --- モーダル送信 → 報連相送信 ---
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

    const sentMessage = await reportChannel.send({ content: mention, embeds: [embed] });

    const replyButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`reply_button|${interaction.user.id}|${sentMessage.id}`)
        .setLabel('💬 返信する')
        .setStyle(ButtonStyle.Secondary)
    );
    await sentMessage.edit({ components: [replyButton] });
    await interaction.reply({ content: '✅ 報連相を送信しました！', ephemeral: true });
    return;
  }

  // --- 返信ボタン押下 → チャンネル選択 ---
  if (interaction.isButton() && interaction.customId.startsWith('reply_button')) {
    const [_, reporterId, messageId] = interaction.customId.split('|');
    const guild = interaction.guild;

    const replyChannels = guild.channels.cache
      .filter(ch => ch.type === 0 && ch.parentId === REPORT_CATEGORY_ID)
      .map(ch => ({ label: ch.name, value: ch.id }));

    if (replyChannels.length === 0) {
      await interaction.reply({ content: '❌ 返信可能なチャンネルがありません。', ephemeral: true });
      return;
    }

    const channelSelect = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`reply_channel_select|${reporterId}|${messageId}`)
        .setPlaceholder('返信先チャンネルを選択')
        .addOptions(replyChannels)
    );

    await interaction.reply({ content: '📡 返信先チャンネルを選択してください', components: [channelSelect], ephemeral: true });
    return;
  }

  // --- 返信チャンネル選択 → モーダル ---
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('reply_channel_select')) {
    const [_, reporterId, messageId] = interaction.customId.split('|');
    const channelId = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`reply_modal|${channelId}|${reporterId}|${messageId}`)
      .setTitle('💬 返信内容入力');

    const replyInput = new TextInputBuilder()
      .setCustomId('reply_content')
      .setLabel('返信内容')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setPlaceholder('返信内容を入力してください。');

    modal.addComponents(new ActionRowBuilder().addComponents(replyInput));
    await interaction.showModal(modal);
    return;
  }

  // --- 返信モーダル送信 → 転送 ---
  if (interaction.isModalSubmit() && interaction.customId.startsWith('reply_modal')) {
    const [_, channelId, reporterId, messageId] = interaction.customId.split('|');
    const replyText = interaction.fields.getTextInputValue('reply_content');
    const replyChannel = await client.channels.fetch(channelId);

    // 元の報連相取得（失敗してもEmbed作成で防ぐ）
    let originalEmbed;
    try {
      const horensoChannel = await client.channels.fetch(HORNSO_CHANNEL_ID);
      const originalMsg = await horensoChannel.messages.fetch(messageId);
      originalEmbed = originalMsg.embeds[0];
    } catch {
      originalEmbed = null;
    }

    const replyEmbed = new EmbedBuilder()
      .setTitle('📣 返信')
      .setColor(0x00cc66)
      .addFields({ name: '返信内容', value: replyText })
      .setTimestamp();

    if (originalEmbed) {
      originalEmbed.fields.forEach(f => {
        if (!replyEmbed.data.fields.some(x => x.name === f.name)) {
          replyEmbed.addFields(f);
        }
      });
    }

    await replyChannel.send({ content: `<@${reporterId}> さんへの返信です。`, embeds: [replyEmbed] });
    await interaction.reply({ content: '✅ 返信を送信しました！', ephemeral: true });
    return;
  }
});

// ============================
// 🔘 ログイン
// ============================
client.login(TOKEN);
