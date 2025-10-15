const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  Routes,
  REST,
  Events,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const CATEGORY_ID = process.env.REPORT_CATEGORY_ID; // ✅ 報告カテゴリ
const REVIEW_CHANNEL_ID = process.env.REVIEW_CHANNEL_ID; // ✅ 報告転送先デフォルト（フォールバック）

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const rest = new REST({ version: '10' }).setToken(TOKEN);

// --- スラッシュコマンド登録 ---
const commands = [
  new SlashCommandBuilder()
    .setName('report')
    .setDescription('報連相を送信します')
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('報告の種類')
        .setRequired(true)
        .addChoices(
          { name: '報告', value: 'report' },
          { name: '連絡', value: 'contact' },
          { name: '相談', value: 'advice' },
        ),
    )
    .addStringOption(option =>
      option
        .setName('urgency')
        .setDescription('緊急度を選択')
        .setRequired(true)
        .addChoices(
          { name: '低', value: 'low' },
          { name: '中', value: 'medium' },
          { name: '高（緊急）', value: 'high' },
        ),
    )
    .setDMPermission(false),
];

(async () => {
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log('✅ スラッシュコマンド登録完了');
})();

// --- コマンド処理 ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'report') {
    const type = interaction.options.getString('type');
    const urgency = interaction.options.getString('urgency');

    // カテゴリ内のチャンネルを選択メニューにする
    const category = interaction.guild.channels.cache.get(CATEGORY_ID);
    if (!category) {
      return interaction.reply({ content: '❌ カテゴリが見つかりません。', ephemeral: true });
    }

    const channelOptions = category.children.cache
      .filter(ch => ch.isTextBased())
      .map(ch => ({
        label: ch.name,
        value: ch.id,
      }));

    if (channelOptions.length === 0) {
      return interaction.reply({ content: '❌ カテゴリ内にチャンネルがありません。', ephemeral: true });
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select-report-channel')
      .setPlaceholder('返信先チャンネルを選択')
      .addOptions(channelOptions);

    await interaction.reply({
      content: `📋 **${type}** の報連相を作成します。\n緊急度: ${urgency.toUpperCase()}\n転送先チャンネルを選んでください。`,
      components: [new ActionRowBuilder().addComponents(selectMenu)],
      ephemeral: true,
    });

    client.once(Events.InteractionCreate, async (selectInteraction) => {
      if (!selectInteraction.isStringSelectMenu()) return;
      if (selectInteraction.customId !== 'select-report-channel') return;

      const targetChannelId = selectInteraction.values[0];
      const targetChannel = await interaction.guild.channels.fetch(targetChannelId);

      await selectInteraction.reply({
        content: '✏️ 内容を入力してください（このメッセージに返信する形で）',
        ephemeral: true,
      });

      const filter = msg => msg.author.id === interaction.user.id;
      const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });

      collector.on('collect', async msg => {
        const embed = new EmbedBuilder()
          .setTitle(`📨 ${type.toUpperCase()}（${urgency.toUpperCase()}）`)
          .setDescription(msg.content)
          .setColor(urgency === 'high' ? 0xff0000 : urgency === 'medium' ? 0xffa500 : 0x00bfff)
          .setFooter({ text: `送信者: ${interaction.user.tag}` })
          .setTimestamp();

        // 緊急なら @everyone メンションを含める
        const mention = urgency === 'high' ? '@everyone' : '';

        try {
          await targetChannel.send({
            content: `${mention} 📢 新しい報連相が届きました`,
            embeds: [embed],
          });

          await msg.reply('✅ 報連相を転送しました！');
        } catch (err) {
          console.error(err);
          await msg.reply('❌ 転送中にエラーが発生しました。');
        }
      });

      collector.on('end', (collected) => {
        if (collected.size === 0) {
          selectInteraction.followUp({ content: '⌛ 入力がありませんでした。再度お試しください。', ephemeral: true });
        }
      });
    });
  }
});

client.login(TOKEN);
