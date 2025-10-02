const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  Events,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ChannelType
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const REPORT_CHANNEL_ID = process.env.REPORT_CHANNEL_ID;
const ALERT_ROLE_ID = process.env.ALERT_ROLE_ID; // 緊急度「高」のときにメンションするロール

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !REPORT_CHANNEL_ID) {
  console.error("❌ 必要な環境変数が足りません。DISCORD_TOKEN, CLIENT_ID, GUILD_ID, REPORT_CHANNEL_ID, ALERT_ROLE_ID を確認してください。");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// --- スラッシュコマンド定義 ---
const commands = [
  new SlashCommandBuilder()
    .setName('horenso')
    .setDescription('報連相フォームを開始します')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('horenso-button')
    .setDescription('報連相開始ボタンを設置します')
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log("✅ スラッシュコマンド登録完了！");
  } catch (err) {
    console.error("❌ コマンド登録失敗:", err);
  }
}

// --- 一時データ保持 ---
const sessionData = new Map();

// --- Bot起動時 ---
client.once(Events.ClientReady, async (c) => {
  console.log(`🤖 ログイン完了: ${c.user.tag}`);
  await registerCommands();
});

// --- コマンド実行 ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'horenso') {
    startHorenso(interaction);
  }

  if (interaction.commandName === 'horenso-button') {
    const startButton = new ButtonBuilder()
      .setCustomId('start_horenso')
      .setLabel("📋 報連相を開始する")
      .setStyle(ButtonStyle.Success);

    await interaction.reply({
      content: "こちらから報連相を開始できます！",
      components: [new ActionRowBuilder().addComponents(startButton)]
    });
  }
});

// --- ボタンで開始 ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'start_horenso') {
    startHorenso(interaction);
  }
});

// --- 報連相開始処理 ---
async function startHorenso(interaction) {
  const categorySelect = new StringSelectMenuBuilder()
    .setCustomId('select_category')
    .setPlaceholder('カテゴリを選択してください')
    .addOptions(
      { label: '業務連絡', value: '業務連絡' },
      { label: '相談', value: '相談' },
      { label: '報告', value: '報告' }
    );

  await interaction.reply({
    content: "📋 まずカテゴリを選んでください",
    components: [new ActionRowBuilder().addComponents(categorySelect)],
    ephemeral: true
  });
}

// --- セレクト処理 ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;

  const userId = interaction.user.id;

  if (interaction.customId === 'select_category') {
    sessionData.set(userId, { category: interaction.values[0] });

    const urgencySelect = new StringSelectMenuBuilder()
      .setCustomId('select_urgency')
      .setPlaceholder('緊急度を選択してください')
      .addOptions(
        { label: '高', value: '高' },
        { label: '中', value: '中' },
        { label: '低', value: '低' }
      );

    await interaction.update({
      content: `✅ カテゴリ: ${interaction.values[0]}\n次に緊急度を選んでください`,
      components: [new ActionRowBuilder().addComponents(urgencySelect)]
    });
  }

  else if (interaction.customId === 'select_urgency') {
    const data = sessionData.get(userId);
    data.urgency = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId('input_content')
      .setTitle('相談内容入力')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('content')
            .setLabel('相談内容を入力してください')
            .setStyle(TextInputStyle.Paragraph)
        )
      );

    await interaction.showModal(modal);
  }
});

// --- モーダル処理（報連相送信） ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  if (interaction.customId !== 'input_content') return;

  const userId = interaction.user.id;
  const data = sessionData.get(userId);
  data.content = interaction.fields.getTextInputValue('content');

  const reportChannel = await client.channels.fetch(REPORT_CHANNEL_ID);

  const embed = new EmbedBuilder()
    .setTitle("📢 新しい報連相")
    .addFields(
      { name: "カテゴリ", value: data.category, inline: true },
      { name: "緊急度", value: data.urgency, inline: true },
      { name: "内容", value: data.content }
    )
    .setFooter({ text: `送信者: ${interaction.user.tag}` })
    .setTimestamp();

  const replyButton = new ButtonBuilder()
    .setCustomId(`reply_${userId}`)
    .setLabel("返信する")
    .setStyle(ButtonStyle.Primary);

  let content = "";
  if (data.urgency === "高" && ALERT_ROLE_ID) {
    content = `<@&${ALERT_ROLE_ID}> ⚠️ 緊急度「高」の報連相があります`;
  }

  await reportChannel.send({
    content,
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(replyButton)]
  });

  await interaction.reply({ content: "✅ 報連相を送信しました！", ephemeral: true });
  sessionData.delete(userId);
});

// --- 返信ボタン処理 ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith("reply_")) return;

  const targetUserId = interaction.customId.split("_")[1];

  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = guild.channels.cache
    .filter(ch => ch.type === ChannelType.GuildText);

  const channelSelect = new StringSelectMenuBuilder()
    .setCustomId(`select_reply_channel_${targetUserId}`)
    .setPlaceholder('返信先チャンネルを選択してください')
    .addOptions(
      channels.map(ch => ({ label: ch.name, value: ch.id }))
    );

  await interaction.reply({
    content: "返信を送信するチャンネルを選んでください",
    components: [new ActionRowBuilder().addComponents(channelSelect)],
    ephemeral: true
  });
});

// --- チャンネル選択後（返信用） ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  if (!interaction.customId.startsWith("select_reply_channel_")) return;

  const targetUserId = interaction.customId.split("_")[3];
  const channelId = interaction.values[0];

  const modal = new ModalBuilder()
    .setCustomId(`send_reply_${targetUserId}_${channelId}`)
    .setTitle('返信入力')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reply_message')
          .setLabel('返信内容を入力してください')
          .setStyle(TextInputStyle.Paragraph)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('mention')
          .setLabel('メンションする？(yes/no)')
          .setStyle(TextInputStyle.Short)
      )
    );

  await interaction.showModal(modal);
});

// --- 返信送信処理 ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  if (!interaction.customId.startsWith("send_reply_")) return;

  const parts = interaction.customId.split("_");
  const targetUserId = parts[2];
  const channelId = parts[3];

  const message = interaction.fields.getTextInputValue('reply_message');
  const mentionChoice = interaction.fields.getTextInputValue('mention').toLowerCase();

  let replyText = message;
  if (mentionChoice === "yes") {
    replyText = `<@${targetUserId}> ${message}`;
  }

  const channel = await client.channels.fetch(channelId);
  await channel.send(replyText);

  await interaction.reply({ content: "✅ 返信を送信しました！", ephemeral: true });
});

client.login(TOKEN);
