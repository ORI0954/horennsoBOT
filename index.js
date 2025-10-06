const { 
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, InteractionType
} = require('discord.js');

// --- 環境変数 ---
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const HORNSO_CHANNEL_ID = process.env.HORNSO_CHANNEL_ID; // 報連相送信先チャンネル
const REPLY_CATEGORY_ID = process.env.REPLY_CATEGORY_ID; // 返信選択用カテゴリID

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !HORNSO_CHANNEL_ID || !REPLY_CATEGORY_ID) {
  console.error("❌ 必須環境変数が不足しています。");
  process.exit(1);
}

// --- クライアント作成 ---
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

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

// --- スラッシュコマンドでボタン作成 ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'horenso_button') {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('horenso_start')
          .setLabel('📋 報連相を開始')
          .setStyle(ButtonStyle.Primary)
      );

    await interaction.reply({ content: 'ボタンを設置しました！', components: [row], ephemeral: false });
  }
});

// --- ボタン押下 / 選択 / モーダル ---
client.on(Events.InteractionCreate, async (interaction) => {
  // ボタン押下
  if (interaction.isButton() && interaction.customId === 'horenso_start') {
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

  // カテゴリ選択後
  if (interaction.isStringSelectMenu() && interaction.customId === 'horenso_category') {
    const category = interaction.values[0];

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

  // 緊急度選択後
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('horenso_urgency')) {
    const [_, category] = interaction.customId.split('|');
    const urgency = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`horenso_modal|${category}|${urgency}`)
      .setTitle('相談内容入力');

    const input = new TextInputBuilder()
      .setCustomId('reportContent')
      .setLabel('相談内容')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }

  // モーダル送信後
  if (interaction.type === InteractionType.ModalSubmit && interaction.customId.startsWith('horenso_modal')) {
    const [_, category, urgency] = interaction.customId.split('|');
    const reportContent = interaction.fields.getTextInputValue('reportContent');

    const reportChannel = await client.channels.fetch(HORNSO_CHANNEL_ID);

    let content = `📌 **報連相**\n─────────────\nカテゴリ: **${category}**\n緊急度: **${urgency}**\n💬 内容:\n${reportContent}`;

    if (urgency === '緊急') content = `<@everyone> ` + content;

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`horenso_reply|${category}`)
          .setLabel('💬 返信する')
          .setStyle(ButtonStyle.Secondary)
      );

    await reportChannel.send({ content, components: [row] });
    await interaction.reply({ content: '✅ 報連相を送信しました！', ephemeral: true });
  }

  // 返信ボタン押下
  if (interaction.isButton() && interaction.customId.startsWith('horenso_reply')) {
    const [_, category] = interaction.customId.split('|');
    const guild = interaction.guild;

    // カテゴリ内のチャンネルを取得
    const channels = guild.channels.cache
      .filter(ch => ch.type === 0 && ch.parentId === REPLY_CATEGORY_ID)
      .map(ch => ({ label: ch.name, value: ch.id }));

    if (!channels.length) {
      await interaction.reply({ content: '❌ 指定カテゴリ内にチャンネルがありません', ephemeral: true });
      return;
    }

    const selectRow = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`horenso_reply_channel|${interaction.message.id}`)
          .setPlaceholder('返信先チャンネルを選択')
          .addOptions(channels)
      );

    await interaction.reply({ content: '返信先チャンネルを選択してください', components: [selectRow], ephemeral: true });
  }

  // 返信チャンネル選択後
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('horenso_reply_channel')) {
    const [_, originalMessageId] = interaction.customId.split('|');
    const channelId = interaction.values[0];
    const replyChannel = await client.channels.fetch(channelId);

    const modal = new ModalBuilder()
      .setCustomId(`horenso_reply_modal|${originalMessageId}`)
      .setTitle('返信内容入力');

    const input = new TextInputBuilder()
      .setCustomId('replyContent')
      .setLabel('返信内容')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }

  // 返信モーダル送信後
  if (interaction.type === InteractionType.ModalSubmit && interaction.customId.startsWith('horenso_reply_modal')) {
    const [_, originalMessageId] = interaction.customId.split('|');
    const replyContent = interaction.fields.getTextInputValue('replyContent');

    const originalMessage = await interaction.channel.messages.fetch(originalMessageId).catch(() => null);
    let originalText = '内容取得失敗';
    if (originalMessage) {
      const split = originalMessage.content.split('\n💬 内容:\n');
      if (split.length > 1) originalText = split[1];
    }

    const content = `📣 **返信**\n─────────────\nカテゴリ: **${originalMessage ? originalMessage.content.split('\n')[1].split('**')[1] : '不明'}**\n💬 内容:\n${originalText}\n\n💬 返信:\n${replyContent}`;

    const replyChannel = await client.channels.fetch(interaction.channelId); // 返信先チャンネル
    await replyChannel.send({ content });
    await interaction.reply({ content: '✅ 返信を送信しました', ephemeral: true });
  }
});

// --- Botログイン ---
client.login(TOKEN);
