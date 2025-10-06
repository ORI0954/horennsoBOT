const { 
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType
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

// --- クライアント作成 ---
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

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

// --- Bot起動時 ---
client.once(Events.ClientReady, async (c) => {
  console.log(`🤖 ログイン完了: ${c.user.tag}`);
  await registerCommands();
});

// --- インタラクション処理 ---
client.on(Events.InteractionCreate, async interaction => {
  
  // --- スラッシュコマンドでボタン作成 ---
  if (interaction.isChatInputCommand() && interaction.commandName === 'horenso_button') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('horenso_start')
        .setLabel('📋 報連相を開始')
        .setStyle(ButtonStyle.Primary)
    );
    await interaction.reply({ content: 'ボタンを設置しました！', components: [row], ephemeral: false });
    return;
  }

  // --- ボタン押下時（報連相開始） ---
  if (interaction.isButton() && interaction.customId === 'horenso_start') {
    const categoryRow = new ActionRowBuilder().addComponents(
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
    return;
  }

  // --- カテゴリ選択後 ---
  if (interaction.isStringSelectMenu() && interaction.customId === 'horenso_category') {
    const category = interaction.values[0];
    const urgencyRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`horenso_urgency|${category}`)
        .setPlaceholder('緊急度を選択')
        .addOptions([
          { label: '緊急', value: '緊急' },
          { label: 'そうでもない', value: 'そうでもない' }
        ])
    );
    await interaction.update({ content: `カテゴリ: **${category}**\n緊急度を選択してください`, components: [urgencyRow] });
    return;
  }

  // --- 緊急度選択後（モーダルで相談内容入力） ---
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('horenso_urgency')) {
    const [_, category] = interaction.customId.split('|');
    const urgency = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`horenso_modal|${category}|${urgency}`)
      .setTitle('報連相入力');

    const input = new TextInputBuilder()
      .setCustomId('content_input')
      .setLabel('相談内容')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('ここに入力してください…')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  // --- モーダル送信後（報連相送信） ---
  if (interaction.type === InteractionType.ModalSubmit && interaction.customId.startsWith('horenso_modal')) {
    const [_, category, urgency] = interaction.customId.split('|');
    const contentText = interaction.fields.getTextInputValue('content_input');
    const reportChannel = await client.channels.fetch(HORNSO_CHANNEL_ID);

    let content = `📌 **報連相**\n─────────────\nカテゴリ: **${category}**\n緊急度: **${urgency}**\n💬 内容:\n${contentText}`;

    if (urgency === '緊急') content = `<@&${EMERGENCY_ROLE_ID}> ` + content;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`horenso_reply|${interaction.id}`)
        .setLabel('💬 返信する')
        .setStyle(ButtonStyle.Secondary)
    );

    await reportChannel.send({ content, components: [row] });
    await interaction.reply({ content: '✅ 報連相を送信しました！', ephemeral: true });
    return;
  }

  // --- 返信ボタン押下時 ---
  if (interaction.isButton() && interaction.customId.startsWith('horenso_reply')) {
    // fetchしてカテゴリ内のテキストチャンネル選択
    const guild = interaction.guild;
    const allChannels = await guild.channels.fetch();
    const channels = allChannels
      .filter(ch => ch.type === 0 && ch.parentId === REPLY_CATEGORY_ID)
      .map(ch => ({ label: ch.name, value: ch.id }));

    if (!channels.length) {
      await interaction.reply({ content: '❌ 指定カテゴリ内にチャンネルがありません', ephemeral: true });
      return;
    }

    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`horenso_reply_channel|${interaction.message.id}`)
        .setPlaceholder('返信先チャンネルを選択')
        .addOptions(channels)
    );

    await interaction.reply({ content: '返信先チャンネルを選択してください', components: [selectRow], ephemeral: true });
    return;
  }

  // --- 返信先チャンネル選択後 ---
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('horenso_reply_channel')) {
    const [_, originalMessageId] = interaction.customId.split('|');
    const channelId = interaction.values[0];
    const replyChannel = await client.channels.fetch(channelId);

    const modal = new ModalBuilder()
      .setCustomId(`horenso_reply_modal|${originalMessageId}`)
      .setTitle('返信内容入力');

    const input = new TextInputBuilder()
      .setCustomId('reply_input')
      .setLabel('返信内容')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('ここに入力してください…')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  // --- 返信モーダル送信後 ---
  if (interaction.type === InteractionType.ModalSubmit && interaction.customId.startsWith('horenso_reply_modal')) {
    const [_, originalMessageId] = interaction.customId.split('|');
    const replyContent = interaction.fields.getTextInputValue('reply_input');

    const originalMessage = await interaction.channel.messages.fetch(originalMessageId).catch(() => null);
    const originalText = originalMessage ? originalMessage.content : '内容取得失敗';

    const content = `📣 **返信**\n─────────────\n${originalText}\n\n💬 返信:\n${replyContent}`;
    await interaction.reply({ content: `✅ 返信を送信しました！`, ephemeral: true });

    // 実際に送信するチャンネルはモーダル呼び出し元の選択チャンネル
    const selectedChannelId = interaction.message.reference?.channelId;
    if (selectedChannelId) {
      const selectedChannel = await client.channels.fetch(selectedChannelId);
      await selectedChannel.send({ content });
    } else {
      // fallback
      await interaction.channel.send({ content });
    }
    return;
  }
});

client.login(TOKEN);
