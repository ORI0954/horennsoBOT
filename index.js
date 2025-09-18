const { 
  Client, GatewayIntentBits,
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// --- 設定 --- //
const categoryChannels = {
  report: "1418268098083160094",   // #業務報告
  consult: "1418268172536119306",  // #相談
  contact: "1418268123752169502"   // #連絡
};

// 各カテゴリの通知ロール
const categoryRoles = {
  report: "1418267211054977084",   // 業務報告通知ロール
  consult: "1418267211054977084",  // 相談通知ロール
  contact: "1418267211054977084"   // 連絡通知ロール
};

// 報告者ID → 報告履歴配列
const reportMap = new Map();

// 緊急度ごとの色と絵文字
const urgencyInfo = {
  低: { color: 0x57F287, emoji: '🟢' },
  中: { color: 0xFEE75C, emoji: '🟡' },
  高: { color: 0xED4245, emoji: '🔴' }
};

// --- BOT起動 ---
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// --- スラッシュコマンド /horenso ---
client.on(Events.InteractionCreate, async (interaction) => {

  // コマンド: カテゴリ選択
  if (interaction.isChatInputCommand() && interaction.commandName === 'horenso') {
    const categorySelect = new StringSelectMenuBuilder()
      .setCustomId('categorySelect')
      .setPlaceholder('カテゴリを選択してください')
      .addOptions([
        { label: '業務報告', value: 'report' },
        { label: '相談', value: 'consult' },
        { label: '連絡', value: 'contact' },
      ]);
    const row = new ActionRowBuilder().addComponents(categorySelect);
    await interaction.reply({ content: 'カテゴリを選択してください:', components: [row], ephemeral: true });
    return;
  }

  // --------------------------
  // 1. カテゴリ選択
  // --------------------------
  if (interaction.isSelectMenu() && interaction.customId === 'categorySelect') {
    await interaction.deferUpdate();
    const selectedCategory = interaction.values[0];

    if (!reportMap.has(interaction.user.id)) reportMap.set(interaction.user.id, []);
    reportMap.get(interaction.user.id).push({ category: selectedCategory });

    const urgencySelect = new StringSelectMenuBuilder()
      .setCustomId('urgencySelect')
      .setPlaceholder('緊急度を選択してください')
      .addOptions([
        { label: '低', value: '低' },
        { label: '中', value: '中' },
        { label: '高', value: '高' },
      ]);
    const row = new ActionRowBuilder().addComponents(urgencySelect);
    await interaction.followUp({ content: '緊急度を選択してください:', components: [row], ephemeral: true });
    return;
  }

  // --------------------------
  // 2. 緊急度選択
  // --------------------------
  if (interaction.isSelectMenu() && interaction.customId === 'urgencySelect') {
    await interaction.deferUpdate();
    const urgency = interaction.values[0];

    const userReports = reportMap.get(interaction.user.id);
    if (!userReports || userReports.length === 0) return interaction.followUp({ content: 'エラー: カテゴリ情報がありません', ephemeral: true });

    const tmp = userReports[userReports.length - 1];
    tmp.urgency = urgency;

    const modal = new ModalBuilder()
      .setCustomId('reportContentModal')
      .setTitle('報連相フォーム');

    const contentInput = new TextInputBuilder()
      .setCustomId('content')
      .setLabel('内容を入力してください')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(contentInput));
    await interaction.showModal(modal);
    return;
  }

  // --------------------------
  // 3. モーダル送信（報告）
  // --------------------------
  if (interaction.isModalSubmit() && interaction.customId === 'reportContentModal') {
    const content = interaction.fields.getTextInputValue('content');
    const user = interaction.user;
    const userReports = reportMap.get(user.id);
    const tmp = userReports[userReports.length - 1];
    tmp.content = content;

    const channel = interaction.guild.channels.cache.get(categoryChannels[tmp.category])
                    || await interaction.guild.channels.fetch(categoryChannels[tmp.category]);
    if (!channel) return interaction.reply({ content: '送信先チャンネルが存在しません', ephemeral: true });

    const { color, emoji } = urgencyInfo[tmp.urgency];

    const reportId = Date.now();
    tmp.messageId = reportId;

    const embed = new EmbedBuilder()
      .setTitle(`${emoji}【${tmp.category}】報連相 [ID:${reportId}]`)
      .setDescription(content)
      .addFields({ name: '緊急度', value: tmp.urgency, inline: true })
      .setFooter({ text: `投稿者: ${user.tag}` })
      .setColor(color)
      .setTimestamp();

    const replyButton = new ButtonBuilder()
      .setCustomId(`reply-${user.id}-${reportId}`)
      .setLabel('返信する')
      .setStyle(ButtonStyle.Primary);

    // --- カテゴリロールにメンション ---
    const roleId = categoryRoles[tmp.category];
    await channel.send({
      content: `<@&${roleId}>`,
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(replyButton)]
    });

    await interaction.reply({ content: '報連相を送信しました ✅', ephemeral: true });
    return;
  }

  // --------------------------
  // 4. 返信ボタン
  // --------------------------
  if (interaction.isButton() && interaction.customId.startsWith('reply-')) {
    const parts = interaction.customId.split('-');
    const targetUserId = parts[1];
    const reportId = parts[2];

    const modal = new ModalBuilder()
      .setCustomId(`replyModal-${targetUserId}-${reportId}`)
      .setTitle('返信フォーム');

    const replyInput = new TextInputBuilder()
      .setCustomId('replyContent')
      .setLabel('返信内容を入力してください')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(replyInput));
    await interaction.showModal(modal);
    return;
  }

  // --------------------------
  // 5. 返信モーダル送信
  // --------------------------
  if (interaction.isModalSubmit() && interaction.customId.startsWith('replyModal-')) {
    const parts = interaction.customId.split('-');
    const targetUserId = parts[1];
    const reportId = parts[2];

    const replyContent = interaction.fields.getTextInputValue('replyContent');
    const replier = interaction.user;

    const replyChannel = interaction.guild.channels.cache.get(replyChannels[targetUserId])
                         || await interaction.guild.channels.fetch(replyChannels[targetUserId]);
    if (!replyChannel) return interaction.reply({ content: '返信先チャンネルが存在しません', ephemeral: true });

    const userReports = reportMap.get(targetUserId);
    const originalReport = userReports.find(r => r.messageId.toString() === reportId);

    let replyText = `💬 <@${replier.id}> → <@${targetUserId}>:\n${replyContent}`;
    if (originalReport) {
      replyText += `\n\n📝 元の報告 [${originalReport.category} / ${originalReport.urgency}]:\n${originalReport.content.slice(0, 100)}...`;
    }

    await replyChannel.send(replyText);
    await interaction.reply({ content: '返信を送信しました ✅', ephemeral: true });
    return;
  }
});

// --- BOTログイン ---
client.login(process.env.TOKEN);
