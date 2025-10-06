const {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, Events, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType
} = require('discord.js');

// --- 環境変数 ---
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const HORNSO_CHANNEL_ID = process.env.HORNSO_CHANNEL_ID; // 報連相送信先
const REPLY_CATEGORY_ID = process.env.REPLY_CATEGORY_ID; // 返信先チャンネルカテゴリID

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
    .setDescription('報連相開始ボタンを設置')
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

// --- インタラクション処理 ---
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // --- スラッシュコマンド ---
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'horenso_button') {
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('horenso_start')
              .setLabel('📋 報連相を開始')
              .setStyle(ButtonStyle.Primary)
          );

        await interaction.reply({ content: '📌 報連相はこちらから開始できます！', components: [row], ephemeral: false });
      }
    }

    // --- ボタン押下 ---
    if (interaction.isButton() && interaction.customId === 'horenso_start') {
      const categoryRow = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('horenso_category')
            .setPlaceholder('カテゴリを選択')
            .addOptions([
              { label: '業務関連', value: '業務関連' },
              { label: 'トラブル対応', value: 'トラブル対応' },
              { label: 'その他', value: 'その他' }
            ])
        );

      await interaction.reply({ content: 'カテゴリを選択してください', components: [categoryRow], ephemeral: true });
    }

    // --- カテゴリ選択 ---
    if (interaction.isStringSelectMenu() && interaction.customId === 'horenso_category') {
      const category = interaction.values[0];

      const urgencyRow = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`horenso_urgency|${category}`)
            .setPlaceholder('緊急度を選択')
            .addOptions([
              { label: '緊急', value: '緊急' },
              { label: 'そうでもない', value: 'そうでもない' }
            ])
        );

      await interaction.update({ content: `カテゴリ: **${category}**\n緊急度を選択してください`, components: [urgencyRow] });
    }

    // --- 緊急度選択 ---
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('horenso_urgency')) {
      const [_, category] = interaction.customId.split('|');
      const urgency = interaction.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`horenso_modal|${category}|${urgency}`)
        .setTitle('報連相 - 相談内容入力')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('horenso_input')
              .setLabel('相談内容')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );

      await interaction.showModal(modal);
    }

    // --- 相談モーダル送信 ---
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId.startsWith('horenso_modal')) {
      const [_, category, urgency] = interaction.customId.split('|');
      const content = interaction.fields.getTextInputValue('horenso_input');
      const reportChannel = await client.channels.fetch(HORNSO_CHANNEL_ID);

      let messageText = `📌 **報連相**\n─────────────\nカテゴリ: **${category}**\n緊急度: **${urgency}**\n相談者: <@${interaction.user.id}>\n💬 内容:\n${content}`;

      if (urgency === '緊急') {
        messageText = `@everyone\n${messageText}`;
      }

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`horenso_reply|${category}|${interaction.user.id}`)
            .setLabel('💬 返信する')
            .setStyle(ButtonStyle.Secondary)
        );

      await reportChannel.send({ content: messageText, components: [row] });
      await interaction.reply({ content: '✅ 報連相を送信しました！', ephemeral: true });
    }

    // --- 返信ボタン押下 ---
    if (interaction.isButton() && interaction.customId.startsWith('horenso_reply')) {
      const [_, category, originalUserId] = interaction.customId.split('|');

      // 返信先チャンネル選択（カテゴリ内）
      const guild = interaction.guild;
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
            .setCustomId(`horenso_reply_channel|${category}|${originalUserId}|${interaction.message.id}`)
            .setPlaceholder('返信先チャンネルを選択')
            .addOptions(channels)
        );

      await interaction.reply({ content: '返信先チャンネルを選択してください', components: [selectRow], ephemeral: true });
    }

    // --- 返信チャンネル選択後 ---
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('horenso_reply_channel')) {
      const [_, category, originalUserId, originalMessageId] = interaction.customId.split('|');
      const replyChannelId = interaction.values[0];
      const replyChannel = await client.channels.fetch(replyChannelId);

      const modal = new ModalBuilder()
        .setCustomId(`horenso_reply_modal|${originalMessageId}|${category}|${replyChannelId}|${originalUserId}`)
        .setTitle('返信内容入力')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('reply_input')
              .setLabel('返信内容')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );

      await interaction.showModal(modal);
    }

    // --- 返信モーダル送信 ---
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId.startsWith('horenso_reply_modal')) {
      const [_, originalMessageId, category, replyChannelId, originalUserId] = interaction.customId.split('|');
      const replyContent = interaction.fields.getTextInputValue('reply_input');
      const replyChannel = await client.channels.fetch(replyChannelId);

      const originalMessage = await replyChannel.messages.fetch(originalMessageId).catch(() => null);
      let originalText = "内容取得失敗";
      if (originalMessage) {
        const match = originalMessage.content.match(/💬 内容:\n([\s\S]*)/);
        if (match) originalText = match[1].trim();
      }

      const content = `📣 **返信**\n─────────────\nカテゴリ: **${category}**\n💬 内容:\n${originalText}\n\n💬 返信:\n${replyContent}\n(相談者: <@${originalUserId}>)`;

      await replyChannel.send({ content });
      await interaction.reply({ content: '✅ 返信を送信しました！', ephemeral: true });
    }

  } catch (err) {
    console.error("❌ インタラクション処理エラー:", err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: '⚠️ エラーが発生しました', ephemeral: true });
    } else {
      await interaction.reply({ content: '⚠️ エラーが発生しました', ephemeral: true });
    }
  }
});

// --- Botログイン ---
client.login(TOKEN);
