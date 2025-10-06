const { 
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events, 
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');

// --- 環境変数 ---
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const HORNSO_CHANNEL_ID = process.env.HORNSO_CHANNEL_ID; // 報連相送信先
const REPLY_CATEGORY_ID = process.env.REPLY_CATEGORY_ID; // 返信用カテゴリ

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

// --- インタラクション ---
client.on(Events.InteractionCreate, async (interaction) => {

  // スラッシュコマンド：ボタン作成
  if (interaction.isChatInputCommand() && interaction.commandName === 'horenso_button') {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('horenso_start')
          .setLabel('📋 報連相を開始')
          .setStyle(ButtonStyle.Primary)
      );
    await interaction.reply({ content: 'ボタンを設置しました！', components: [row], ephemeral: false });
    return;
  }

  // ボタン押下：報連相開始
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
    return;
  }

  // カテゴリ選択 → 緊急度選択
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
    return;
  }

  // 緊急度選択 → 相談内容モーダル
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('horenso_urgency')) {
    const [_, category] = interaction.customId.split('|');
    const urgency = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`horenso_modal|${category}|${urgency}`)
      .setTitle('相談内容入力')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('report_input')
            .setLabel('相談内容')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        )
      );
    await interaction.showModal(modal);
    return;
  }

  // モーダル送信 → 報連相送信
  if (interaction.isModalSubmit() && interaction.customId.startsWith('horenso_modal')) {
    const [_, category, urgency] = interaction.customId.split('|');
    const contentInput = interaction.fields.getTextInputValue('report_input');
    const reportChannel = await client.channels.fetch(HORNSO_CHANNEL_ID);

    let content = `📌 **報連相**\n─────────────\nカテゴリ: **${category}**\n緊急度: **${urgency}**\n💬 内容:\n${contentInput}\n💁‍♂️ 報告者: <@${interaction.user.id}>`;

    if (urgency === '緊急') content = `@everyone ` + content;

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`horenso_reply|${interaction.id}|${category}`)
          .setLabel('💬 返信する')
          .setStyle(ButtonStyle.Secondary)
      );

    await reportChannel.send({ content, components: [row] });
    await interaction.reply({ content: '✅ 報連相を送信しました！', ephemeral: true });
    return;
  }

  // 返信ボタン押下 → カテゴリ内チャンネル選択
  if (interaction.isButton() && interaction.customId.startsWith('horenso_reply')) {
    const [_, originalInteractionId, category] = interaction.customId.split('|');

    const guild = await client.guilds.fetch(interaction.guildId);
    const channels = await guild.channels.fetch();
    const options = channels
      .filter(ch => ch.type === 0 && ch.parentId === REPLY_CATEGORY_ID)
      .map(ch => ({ label: ch.name, value: ch.id }));

    if (!options.length) {
      await interaction.reply({ content: '❌ 指定カテゴリ内にチャンネルがありません', ephemeral: true });
      return;
    }

    const selectRow = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`horenso_reply_channel|${originalInteractionId}|${category}`)
          .setPlaceholder('返信先チャンネルを選択')
          .addOptions(options)
      );

    await interaction.reply({ content: '返信先チャンネルを選択してください', components: [selectRow], ephemeral: true });
    return;
  }

  // 返信先チャンネル選択 → モーダル表示
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('horenso_reply_channel')) {
    const [_, originalInteractionId, category] = interaction.customId.split('|');
    const replyChannelId = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`horenso_reply_modal|${originalInteractionId}|${category}|${replyChannelId}`)
      .setTitle('返信入力')
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
    return;
  }

  // 返信モーダル送信
  if (interaction.isModalSubmit() && interaction.customId.startsWith('horenso_reply_modal')) {
    const [_, originalInteractionId, category, replyChannelId] = interaction.customId.split('|');
    const replyContent = interaction.fields.getTextInputValue('reply_input');
    const replyChannel = await client.channels.fetch(replyChannelId);

    // 元メッセージ引用取得
    const reportChannel = await client.channels.fetch(HORNSO_CHANNEL_ID);
    let originalMessage;
    try {
      const messages = await reportChannel.messages.fetch({ limit: 50 });
      originalMessage = messages.find(m => m.interaction?.id === originalInteractionId);
    } catch {
      originalMessage = null;
    }

    const originalContent = originalMessage
      ? originalMessage.content.split('\n💬 内容:\n')[1]?.split('\n💁‍♂️')[0] || '内容取得失敗'
      : '内容取得失敗';

    const content = `📣 **返信**\n─────────────\nカテゴリ: **${category}**\n💬 報告内容:\n${originalContent}\n\n💬 返信:\n${replyContent}`;

    await replyChannel.send({ content });
    await interaction.reply({ content: '✅ 返信を送信しました', ephemeral: true });
    return;
  }

});

// --- Botログイン ---
client.login(TOKEN);
