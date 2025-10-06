const { 
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder 
} = require('discord.js');

// --- 環境変数 ---
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const HORNSO_CHANNEL_ID = process.env.HORNSO_CHANNEL_ID; // 報連相送信先
const EMERGENCY_ROLE_ID = process.env.EMERGENCY_ROLE_ID; // 緊急時ロールID
const REPLY_CATEGORY_ID = process.env.REPLY_CATEGORY_ID; // 返信先選択用カテゴリ

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
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
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

  // ボタン押下でカテゴリ選択
  if (interaction.isButton() && interaction.customId === 'horenso_start') {
    const row = new ActionRowBuilder()
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
    await interaction.reply({ content: 'カテゴリを選択してください', components: [row], ephemeral: true });
  }

  // カテゴリ選択後
  if (interaction.isStringSelectMenu() && interaction.customId === 'horenso_category') {
    const category = interaction.values[0];
    const row = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`horenso_urgency|${category}`)
          .setPlaceholder('緊急度を選択')
          .addOptions([
            { label: '緊急', value: '緊急' },
            { label: 'そうでもない', value: 'そうでもない' },
          ])
      );
    await interaction.update({ content: `カテゴリ: **${category}**\n緊急度を選択してください`, components: [row] });
  }

  // 緊急度選択後 → 相談内容モーダル
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('horenso_urgency')) {
    const [_, category] = interaction.customId.split('|');
    const urgency = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`horenso_content|${category}|${urgency}`)
      .setTitle('報連相 相談内容');

    const input = new TextInputBuilder()
      .setCustomId('content_input')
      .setLabel('💬 相談内容')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('相談内容を入力してください')
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    await interaction.showModal(modal);
  }

  // モーダル送信（報連相送信）
  if (interaction.isModalSubmit() && interaction.customId.startsWith('horenso_content')) {
    const [_, category, urgency] = interaction.customId.split('|');
    const contentText = interaction.fields.getTextInputValue('content_input');
    const reportChannel = await client.channels.fetch(HORNSO_CHANNEL_ID);

    const mentionText = urgency === '緊急' ? `<@&${EMERGENCY_ROLE_ID}> ` : '';

    const embed = new EmbedBuilder()
      .setTitle('📣 新しい報連相')
      .setColor(urgency === '緊急' ? 0xff0000 : 0x00bfff)
      .addFields(
        { name: '📂 カテゴリ', value: category, inline: true },
        { name: '⚡ 緊急度', value: urgency, inline: true },
        { name: '💬 内容', value: contentText, inline: false }
      )
      .setFooter({ text: '💬 返信する場合は下のボタンを押してください' });

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`horenso_reply|${interaction.id}`)
          .setLabel('💬 返信する')
          .setStyle(ButtonStyle.Secondary)
      );

    await reportChannel.send({ content: mentionText, embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ 報連相を送信しました！', ephemeral: true });
  }

  // 返信ボタン押下 → 返信先選択
  if (interaction.isButton() && interaction.customId.startsWith('horenso_reply')) {
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
          .setCustomId(`horenso_reply_channel|${interaction.id}`)
          .setPlaceholder('返信先チャンネルを選択')
          .addOptions(channels)
      );

    await interaction.reply({ content: '返信先チャンネルを選択してください', components: [selectRow], ephemeral: true });
  }

  // 返信先チャンネル選択 → 返信モーダル
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('horenso_reply_channel')) {
    const [_, originalId] = interaction.customId.split('|');
    const replyChannelId = interaction.values[0];
    const replyChannel = await client.channels.fetch(replyChannelId);

    const modal = new ModalBuilder()
      .setCustomId(`horenso_reply_modal|${originalId}|${replyChannelId}`)
      .setTitle('💬 返信内容入力');

    const input = new TextInputBuilder()
      .setCustomId('reply_input')
      .setLabel('💬 返信')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('返信内容を入力してください')
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    await interaction.showModal(modal);
  }

  // 返信モーダル送信
  if (interaction.isModalSubmit() && interaction.customId.startsWith('horenso_reply_modal')) {
    const [_, originalId, replyChannelId] = interaction.customId.split('|');
    const replyText = interaction.fields.getTextInputValue('reply_input');
    const replyChannel = await client.channels.fetch(replyChannelId);

    let originalMessage;
    try {
      originalMessage = await interaction.channel.messages.fetch(originalId);
    } catch {
      await interaction.reply({ content: '❌ 元報連相の取得に失敗しました', ephemeral: true });
      return;
    }

    const originalEmbed = originalMessage.embeds[0];
    const category = originalEmbed.fields.find(f => f.name === '📂 カテゴリ')?.value || '不明';
    const contentText = originalEmbed.fields.find(f => f.name === '💬 内容')?.value || '内容取得失敗';

    const embed = new EmbedBuilder()
      .setTitle('📣 返信')
      .setColor(0x00bfff)
      .addFields(
        { name: '📂 カテゴリ', value: category, inline: true },
        { name: '💬 内容', value: contentText, inline: false },
        { name: '💬 返信', value: replyText, inline: false }
      );

    await replyChannel.send({ embeds: [embed] });
    await interaction.reply({ content: '✅ 返信を送信しました', ephemeral: true });
  }

});

// --- ログイン ---
client.login(TOKEN);
