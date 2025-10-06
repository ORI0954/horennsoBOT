const { 
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events, 
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');

// --- 環境変数 ---
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const HORNSO_CHANNEL_ID = process.env.HORNSO_CHANNEL_ID; // 報連相送信先
const EMERGENCY_ROLE_ID = process.env.EMERGENCY_ROLE_ID; // 緊急時ロールID
const REPLY_CATEGORY_ID = process.env.REPLY_CATEGORY_ID; // 返信選択用カテゴリID

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !HORNSO_CHANNEL_ID || !EMERGENCY_ROLE_ID || !REPLY_CATEGORY_ID) {
  console.error("❌ 必須環境変数が不足しています。");
  process.exit(1);
}

// --- クライアント ---
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// --- スラッシュコマンド登録 ---
const commands = [
  new SlashCommandBuilder()
    .setName('horenso_button')
    .setDescription('報連相開始ボタンを作成')
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
    console.error("❌ コマンド登録に失敗:", err);
  }
}

// --- Bot起動 ---
client.once(Events.ClientReady, async (c) => {
  console.log(`🤖 ログイン完了: ${c.user.tag}`);
  await registerCommands();
});

// --- インタラクション ---
client.on(Events.InteractionCreate, async (interaction) => {
  // --- スラッシュコマンド: ボタン設置 ---
  if (interaction.isChatInputCommand() && interaction.commandName === 'horenso_button') {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('horenso_start')
          .setLabel('📋 報連相を開始')
          .setStyle(ButtonStyle.Primary)
      );
    await interaction.reply({ content: 'ボタンを設置しました！', components: [row], ephemeral: false });
  }

  // --- ボタン押下: 報連相開始 ---
  if (interaction.isButton() && interaction.customId === 'horenso_start') {
    // カテゴリ選択
    const categoryRow = new ActionRowBuilder()
      .addComponents(
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

  // --- カテゴリ選択 ---
  if (interaction.isStringSelectMenu() && interaction.customId === 'horenso_category') {
    const category = interaction.values[0];

    // 緊急度選択
    const urgencyRow = new ActionRowBuilder()
      .addComponents(
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

  // --- 緊急度選択 ---
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('horenso_urgency')) {
    const [_, category] = interaction.customId.split('|');
    const urgency = interaction.values[0];

    // モーダルで相談内容入力
    const modal = new ModalBuilder()
      .setCustomId(`horenso_modal|${category}|${urgency}`)
      .setTitle('報連相入力');

    const contentInput = new TextInputBuilder()
      .setCustomId('report_content')
      .setLabel('相談内容')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(contentInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
  }

  // --- モーダル送信: 報連相 ---
  if (interaction.isModalSubmit() && interaction.customId.startsWith('horenso_modal')) {
    const [_, category, urgency] = interaction.customId.split('|');
    const content = interaction.fields.getTextInputValue('report_content');
    const reportChannel = await client.channels.fetch(HORNSO_CHANNEL_ID);

    let reportMessage = `📌 **報連相**\n─────────────\nカテゴリ: **${category}**\n緊急度: **${urgency}**\n💬 内容:\n${content}\n💁‍♂️ 報告者: <@${interaction.user.id}>`;

    if (urgency === '緊急') reportMessage = `<@&${EMERGENCY_ROLE_ID}> ` + reportMessage;

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`horenso_reply|${interaction.user.id}`)
          .setLabel('💬 返信する')
          .setStyle(ButtonStyle.Secondary)
      );

    await reportChannel.send({ content: reportMessage, components: [row] });
    await interaction.reply({ content: '✅ 報連相を送信しました！', ephemeral: true });
  }

  // --- 返信ボタン押下 ---
  if (interaction.isButton() && interaction.customId.startsWith('horenso_reply')) {
    const userId = interaction.customId.split('|')[1];

    // 返信先チャンネル選択（カテゴリ内）
    const guild = interaction.guild;
    const channels = guild.channels.cache
      .filter(ch => ch.type === 0 && ch.parentId === REPLY_CATEGORY_ID)
      .map(ch => ({ label: ch.name, value: ch.id }));

    if (channels.length === 0) {
      await interaction.reply({ content: '❌ 指定カテゴリ内にチャンネルがありません', ephemeral: true });
      return;
    }

    const selectRow = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`horenso_reply_channel|${userId}|${interaction.message.id}`)
          .setPlaceholder('返信先チャンネルを選択')
          .addOptions(channels)
      );

    await interaction.reply({ content: '返信先チャンネルを選択してください', components: [selectRow], ephemeral: true });
  }

  // --- 返信先チャンネル選択 ---
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('horenso_reply_channel')) {
    const [_, userId, originalMessageId] = interaction.customId.split('|');
    const channelId = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`horenso_reply_modal|${channelId}|${originalMessageId}`)
      .setTitle('返信入力');

    const replyInput = new TextInputBuilder()
      .setCustomId('reply_content')
      .setLabel('返信')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(replyInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
  }

  // --- モーダル送信: 返信 ---
  if (interaction.isModalSubmit() && interaction.customId.startsWith('horenso_reply_modal')) {
    const [_, channelId, originalMessageId] = interaction.customId.split('|');
    const replyContent = interaction.fields.getTextInputValue('reply_content');
    const replyChannel = await client.channels.fetch(channelId);

    let originalMessage;
    try {
      originalMessage = await replyChannel.messages.fetch(originalMessageId);
    } catch {
      originalMessage = null;
    }

    let originalText = originalMessage
      ? originalMessage.content.split('💬 内容:\n')[1].split('\n💁‍♂️')[0]
      : '内容取得失敗';

    const content = `📣 **返信**\n─────────────\nカテゴリ: **${originalMessage ? originalMessage.content.split('\n')[1].split(': **')[1].replace('**','') : '不明'}**\n💬 内容:\n${originalText}\n\n💬 返信:\n${replyContent}`;

    await replyChannel.send({ content });
    await interaction.reply({ content: '✅ 返信を送信しました', ephemeral: true });
  }
});

// --- ログイン ---
client.login(TOKEN);

