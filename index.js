const { 
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType 
} = require('discord.js');

// --- 環境変数 ---
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const HORNSO_CHANNEL_ID = process.env.HORNSO_CHANNEL_ID; // 報連相送信先チャンネル
const EMERGENCY_ROLE_ID = process.env.EMERGENCY_ROLE_ID; // 緊急時ロールID
const REPLY_CATEGORY_ID = process.env.REPLY_CATEGORY_ID; // 返信選択用カテゴリID

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !HORNSO_CHANNEL_ID || !EMERGENCY_ROLE_ID || !REPLY_CATEGORY_ID) {
  console.error("❌ 必須環境変数が不足しています。");
  process.exit(1);
}

// --- クライアント作成 ---
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// --- コマンド登録 ---
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

// --- Bot起動時 ---
client.once(Events.ClientReady, async (c) => {
  console.log(`🤖 ログイン完了: ${c.user.tag}`);
  await registerCommands();
});

// --- インタラクション処理 ---
client.on(Events.InteractionCreate, async (interaction) => {

  // スラッシュコマンドでボタン作成
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

  // ボタン押下
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

  // カテゴリ選択
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

  // 緊急度選択
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('horenso_urgency')) {
    const [_, category] = interaction.customId.split('|');
    const urgency = interaction.values[0];

    // 相談内容モーダル表示
    const modal = new ModalBuilder()
      .setCustomId(`horenso_modal|${category}|${urgency}`)
      .setTitle('💬 報連相内容入力');

    const input = new TextInputBuilder()
      .setCustomId('report_content')
      .setLabel('相談内容')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    await interaction.showModal(modal);
  }

  // モーダル送信（報連相）
  if (interaction.type === InteractionType.ModalSubmit && interaction.customId.startsWith('horenso_modal')) {
    const [_, category, urgency] = interaction.customId.split('|');
    const contentText = interaction.fields.getTextInputValue('report_content');

    const reportChannel = await client.channels.fetch(HORNSO_CHANNEL_ID);
    let content = `📌 **報連相**\n─────────────\nカテゴリ: **${category}**\n緊急度: **${urgency}**\n💬 内容:\n${contentText}`;

    if (urgency === '緊急') content = `<@&${EMERGENCY_ROLE_ID}> ` + content;

    // 返信ボタン作成、元メッセージID含める
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`horenso_reply|${category}|${interaction.user.id}`)
          .setLabel('💬 返信する')
          .setStyle(ButtonStyle.Secondary)
      );

    const sentMsg = await reportChannel.send({ content, components: [row] });
    await interaction.reply({ content: '✅ 報連相を送信しました！', ephemeral: true });
  }

  // 返信ボタン押下
  if (interaction.isButton() && interaction.customId.startsWith('horenso_reply')) {
    const [_, category, reporterId] = interaction.customId.split('|');

    // 返信先選択（カテゴリ内チャンネル）
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
          .setCustomId(`horenso_reply_channel|${category}|${reporterId}|${interaction.message.id}|${interaction.message.channelId}`)
          .setPlaceholder('返信先チャンネルを選択')
          .addOptions(channels)
      );

    await interaction.reply({ content: '返信先チャンネルを選択してください', components: [selectRow], ephemeral: true });
  }

  // 返信先チャンネル選択
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('horenso_reply_channel')) {
    const [_, category, reporterId, originalMsgId, originalChannelId] = interaction.customId.split('|');
    const channelId = interaction.values[0];
    const replyChannel = await client.channels.fetch(channelId);

    // 返信モーダル
    const modal = new ModalBuilder()
      .setCustomId(`horenso_reply_modal|${category}|${reporterId}|${originalMsgId}|${originalChannelId}`)
      .setTitle('💬 返信内容入力');

    const input = new TextInputBuilder()
      .setCustomId('reply_content')
      .setLabel('返信')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    await interaction.showModal(modal);
  }

  // 返信モーダル送信
  if (interaction.type === InteractionType.ModalSubmit && interaction.customId.startsWith('horenso_reply_modal')) {
    const [_, category, reporterId, originalMsgId, originalChannelId] = interaction.customId.split('|');
    const replyText = interaction.fields.getTextInputValue('reply_content');

    // 元報連相メッセージ取得
    const originalChannel = await client.channels.fetch(originalChannelId);
    let originalMsg;
    try {
      originalMsg = await originalChannel.messages.fetch(originalMsgId);
    } catch {
      originalMsg = null;
    }

    const originalContent = originalMsg ? originalMsg.content.split('\n💬 内容:\n')[1] : '内容取得失敗';

    const content = `📣 **返信**\n─────────────\nカテゴリ: **${category}**\n💬 内容:\n${originalContent}\n\n💬 返信:\n${replyText}`;

    const replyChannel = interaction.channelId ? await client.channels.fetch(interaction.channelId) : interaction.channel;

    await replyChannel.send({ content });
    await interaction.reply({ content: '✅ 返信を送信しました', ephemeral: true });
  }

});

// --- Botログイン ---
client.login(TOKEN);
