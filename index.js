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
  TextInputStyle
} = require("discord.js");

// --- 環境変数 ---
const TOKEN = process.env.DISCORD_TOKEN;          // Bot Token
const CLIENT_ID = process.env.CLIENT_ID;          // Application ID
const GUILD_ID = process.env.GUILD_ID;            // Guild ID
const REPORT_CHANNEL_ID = process.env.REPORT_CHANNEL_ID; // 報連相送信先チャンネル
const REPLY_CATEGORY_ID = process.env.REPLY_CATEGORY_ID; // 返信用カテゴリ
const ALERT_ROLE_ID = process.env.ALERT_ROLE_ID;        // 緊急度「高」用ロール

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !REPORT_CHANNEL_ID || !REPLY_CATEGORY_ID) {
  console.error("❌ 必須環境変数が不足しています。");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// --- コマンド登録 ---
const commands = [
  new SlashCommandBuilder()
    .setName("horenso_button")
    .setDescription("報連相開始ボタンを設置します")
    .toJSON()
];
const rest = new REST({ version: "10" }).setToken(TOKEN);

async function registerCommands() {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
  console.log("✅ スラッシュコマンド登録完了");
}

// --- Bot起動 ---
client.once(Events.ClientReady, async (c) => {
  console.log(`🤖 ログイン完了: ${c.user.tag}`);
  await registerCommands();
});

// --- セッション管理 ---
const userSessions = new Map();

// --- インタラクション処理 ---
client.on(Events.InteractionCreate, async (interaction) => {

  // --- ボタン: 報連相開始 ---
  if (interaction.isButton() && interaction.customId === "startHorenso") {
    userSessions.set(interaction.user.id, { step: "category" });
    await interaction.reply({
      content: "📌 カテゴリを選択してください",
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("selectCategory")
            .setPlaceholder("カテゴリを選択")
            .addOptions(
              { label: "業務", value: "業務" },
              { label: "トラブル", value: "トラブル" },
              { label: "その他", value: "その他" }
            )
        )
      ],
      ephemeral: true
    });
    return;
  }

  // --- カテゴリ選択 ---
  if (interaction.isStringSelectMenu() && interaction.customId === "selectCategory") {
    userSessions.set(interaction.user.id, {
      step: "urgency",
      category: interaction.values[0]
    });
    await interaction.update({
      content: "⚡ 緊急度を選択してください",
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("selectUrgency")
            .setPlaceholder("緊急度を選択")
            .addOptions(
              { label: "高", value: "高" },
              { label: "中", value: "中" },
              { label: "低", value: "低" }
            )
        )
      ]
    });
    return;
  }

  // --- 緊急度選択 ---
  if (interaction.isStringSelectMenu() && interaction.customId === "selectUrgency") {
    const session = userSessions.get(interaction.user.id);
    if (!session) return;

    session.urgency = interaction.values[0];
    session.step = "content";

    const modal = new ModalBuilder()
      .setCustomId("horensoContent")
      .setTitle("相談内容入力")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("contentInput")
            .setLabel("相談内容")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        )
      );

    await interaction.showModal(modal);
    return;
  }

  // --- 相談内容送信 ---
  if (interaction.isModalSubmit() && interaction.customId === "horensoContent") {
    const session = userSessions.get(interaction.user.id);
    if (!session) return;

    const content = interaction.fields.getTextInputValue("contentInput");
    session.content = content;

    const reportChannel = await client.channels.fetch(REPORT_CHANNEL_ID);
    if (!reportChannel) {
      await interaction.reply({ content: "❌ 報告チャンネルが見つかりません。", ephemeral: true });
      return;
    }

    const mentionRole = session.urgency === "高" && ALERT_ROLE_ID ? `<@&${ALERT_ROLE_ID}> ` : "";

    await reportChannel.send({
      content: `${mentionRole}📋 **報連相が届きました**\n\n` +
        `カテゴリ: ${session.category}\n` +
        `緊急度: ${session.urgency}\n` +
        `相談者: <@${interaction.user.id}>\n` +
        `内容:\n${session.content}`,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`replyBtn_${interaction.user.id}`)
            .setLabel("返信する")
            .setStyle(ButtonStyle.Success)
        )
      ]
    });

    await interaction.reply({ content: "✅ 報連相を送信しました！", ephemeral: true });
    userSessions.delete(interaction.user.id);
    return;
  }

  // --- 返信ボタン ---
  if (interaction.isButton() && interaction.customId.startsWith("replyBtn_")) {
    const originalUserId = interaction.customId.split("_")[1];

    const channels = interaction.guild.channels.cache
      .filter(ch => ch.parentId === REPLY_CATEGORY_ID && ch.isTextBased());
    const options = channels.map(ch => ({ label: ch.name, value: ch.id }));

    await interaction.reply({
      content: "📌 返信先チャンネルを選択してください",
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`selectReplyChannel_${originalUserId}`)
            .setPlaceholder("返信先チャンネルを選択")
            .addOptions(options)
        )
      ],
      ephemeral: true
    });
    return;
  }

  // --- 返信先チャンネル選択 ---
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("selectReplyChannel_")) {
    const originalUserId = interaction.customId.split("_")[1];
    const channelId = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`replyContent_${originalUserId}_${channelId}`)
      .setTitle("返信内容入力")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("replyInput")
            .setLabel("返信メッセージ")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        )
      );

    await interaction.showModal(modal);
    return;
  }

  // --- 返信内容送信 & メンション選択 ---
  if (interaction.isModalSubmit() && interaction.customId.startsWith("replyContent_")) {
    const [, originalUserId, channelId] = interaction.customId.split("_");
    const replyContent = interaction.fields.getTextInputValue("replyInput");

    const targetChannel = await client.channels.fetch(channelId);
    if (!targetChannel) {
      await interaction.reply({ content: "❌ チャンネルが見つかりません。", ephemeral: true });
      return;
    }

    // メンション選択用ボタン
    await interaction.reply({
      content: "📣 送信時に相談者にメンションしますか？",
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`mentionYes_${originalUserId}_${channelId}_${replyContent}`)
            .setLabel("メンションする")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`mentionNo_${originalUserId}_${channelId}_${replyContent}`)
            .setLabel("メンションしない")
            .setStyle(ButtonStyle.Secondary)
        )
      ],
      ephemeral: true
    });
    return;
  }

  // --- メンションボタン押下 ---
  if (interaction.isButton() && (interaction.customId.startsWith("mentionYes_") || interaction.customId.startsWith("mentionNo_"))) {
    const [type, originalUserId, channelId, ...replyParts] = interaction.customId.split("_");
    const replyText = replyParts.join("_");

    const targetChannel = await client.channels.fetch(channelId);
    if (!targetChannel) {
      await interaction.reply({ content: "❌ チャンネルが見つかりません。", ephemeral: true });
      return;
    }

    const mention = type === "mentionYes" ? `<@${originalUserId}> ` : "";
    await targetChannel.send({ content: `${mention}${replyText}` });
    await interaction.update({ content: "✅ 返信を送信しました！", components: [] });
    return;
  }

});

// --- Botログイン ---
client.login(TOKEN);
