const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder
} = require('discord.js');

// --- 環境変数 ---
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const HORNSO_CHANNEL_ID = process.env.HORNSO_CHANNEL_ID; // 報連相送信先
const EMERGENCY_ROLE_ID = process.env.EMERGENCY_ROLE_ID; // 緊急時ロールID
const REPLY_CATEGORY_ID = process.env.REPLY_CATEGORY_ID; // 返信用カテゴリID

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !HORNSO_CHANNEL_ID || !EMERGENCY_ROLE_ID || !REPLY_CATEGORY_ID) {
  console.error("❌ 必須環境変数が不足しています。");
  process.exit(1);
}

// --- クライアント作成 ---
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// --- コマンド登録 ---
const commands = [
  new SlashCommandBuilder()
    .setName('horenso_button')
    .setDescription('報連相開始ボタンを常設で作成')
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
client.once(Events.ClientReady, async c => {
  console.log(`🤖 ログイン完了: ${c.user.tag}`);
  await registerCommands();
});

// --- スラッシュコマンドで常設ボタン作成 ---
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'horenso_button') {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('horenso_start')
          .setLabel('📋 報連相を開始')
          .setStyle(ButtonStyle.Primary)
      );

    await interaction.reply({
      content: 'ボタンを設置しました！\n誰でも押せます。',
      components: [row],
      ephemeral: false
    });
  }
});

// --- ボタン押下・モーダル処理 ---
client.on(Events.InteractionCreate, async interaction => {

  // --- 報連相開始ボタン ---
  if (interaction.isButton() && interaction.customId === 'horenso_start') {

    const modal = new ModalBuilder()
      .setCustomId('horenso_modal')
      .setTitle('報連相フォーム');

    const categoryInput = new TextInputBuilder()
      .setCustomId('horenso_category')
      .setLabel('カテゴリ (業務関連 / トラブル対応 / その他)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('業務関連');

    const urgencyInput = new TextInputBuilder()
      .setCustomId('horenso_urgency')
      .setLabel('緊急度 (緊急 / そうでもない)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('そうでもない');

    const contentInput = new TextInputBuilder()
      .setCustomId('horenso_content')
      .setLabel('相談内容')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(categoryInput),
      new ActionRowBuilder().addComponents(urgencyInput),
      new ActionRowBuilder().addComponents(contentInput)
    );

    await interaction.showModal(modal);
  }

  // --- 報連相モーダル送信 ---
  if (interaction.isModalSubmit() && interaction.customId === 'horenso_modal') {
    const category = interaction.fields.getTextInputValue('horenso_category');
    const urgency = interaction.fields.getTextInputValue('horenso_urgency');
    const contentText = interaction.fields.getTextInputValue('horenso_content');

    const reportChannel = await client.channels.fetch(HORNSO_CHANNEL_ID);

    let messageContent = `📌 **報連相**\n─────────────\nカテゴリ: **${category}**\n緊急度: **${urgency}**\n💬 内容:\n${contentText}`;
    if (urgency.toLowerCase() === '緊急') messageContent = `<@&${EMERGENCY_ROLE_ID}> ` + messageContent;

    const replyButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('horenso_reply')
          .setLabel('💬 返信する')
          .setStyle(ButtonStyle.Secondary)
      );

    await reportChannel.send({ content: messageContent, components: [replyButton] });
    await interaction.reply({ content: '✅ 報連相を送信しました！', ephemeral: true });
  }

  // --- 返信ボタン押下 ---
  if (interaction.isButton() && interaction.customId === 'horenso_reply') {
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
          .setCustomId('horenso_reply_channel')
          .setPlaceholder('返信先チャンネルを選択')
          .addOptions(channels)
      );

    await interaction.reply({ content: '返信先チャンネルを選択してください', components: [selectRow], ephemeral: true });
  }

  // --- 返信先選択後 ---
  if (interaction.isStringSelectMenu() && interaction.customId === 'horenso_reply_channel') {
    const channelId = interaction.values[0];
    const replyChannel = await client.channels.fetch(channelId);

    const modal = new ModalBuilder()
      .setCustomId(`horenso_reply_modal|${channelId}`)
      .setTitle('返信フォーム');

    const replyInput = new TextInputBuilder()
      .setCustomId('reply_content')
      .setLabel('返信内容')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(replyInput));
    await interaction.showModal(modal);
  }

  // --- 返信モーダル送信 ---
  if (interaction.isModalSubmit() && interaction.customId.startsWith('horenso_reply_modal')) {
    const channelId = interaction.customId.split('|')[1];
    const replyChannel = await client.channels.fetch(channelId);
    const replyContent = interaction.fields.getTextInputValue('reply_content');

    const message = await interaction.message.fetch();
    const original = message.content.split('\n💬 内容:\n')[1] || '内容取得失敗';
    const categoryLine = message.content.split('\n')[1]; // カテゴリ行

    const finalContent = `📣 **返信**\n─────────────\n${categoryLine}\n💬 内容:\n${original}\n\n💬 返信:\n${replyContent}`;

    await replyChannel.send({ content: finalContent });
    await interaction.reply({ content: '✅ 返信を送信しました', ephemeral: true });
  }
});

// --- Botログイン ---
client.login(TOKEN);
