// 報告送信（モーダルSubmit）の部分
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

  // ユニークIDを作成
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

  // --- ここでロールメンション追加 ---
  const roleId = "123456789012345678"; // 各カテゴリごとの通知ロールIDに変更
  await channel.send({
    content: `<@&${roleId}>`, // ロールにメンション
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(replyButton)]
  });

  await interaction.reply({ content: '報連相を送信しました ✅', ephemeral: true });
  return;
}
