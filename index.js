const { 
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder
} = require('discord.js');

// --- 環境変数 ---
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const HORNSO_CHANNEL_ID = process.env.HORNSO_CHANNEL_ID; // 報連相送信先チャンネル
const EMERGENCY_ROLE_ID = process.env.EMERGENCY_ROLE_ID; // 緊急時ロールID
const REPLY_CATEGORY_ID = process.env.REPLY_CATEGORY_ID; // 返信選択用カテゴリID

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !HORNSO_CHANNEL_ID || !EMERGENCY_ROLE_ID || !REPLY_CATEGORY_ID) {
  console.error("❌ 必須環境変数が不足しています。");
  process.exit(1);
}

// --- クライアント作成 ---
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

// --- Bot起動時 ---
client.once(Events.ClientReady, async c => {
  console.log(`🤖 ログイン完了: ${c.user.tag}`);
  await registerCommands();
});

// --- インタラクション処理 ---
client.on(Events.InteractionCreate, async interaction => {

  // --- スラッシュコマンド：ボタン作成 ---
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

  // --- ボタン押下時：報連相開始 ---
  if (interaction.isButton() && interaction.customId === 'horenso_start') {
    const categoryRow = new ActionRowBuilder().addComponents(
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

  // --- カテゴリ選択 ---
  if (interaction.isStringSelectMenu() && interaction.customId === 'horenso_category') {
    const category = interaction.values[0];
    const urgencyRow = new ActionRowBuilder().addComponents(
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

  // --- 緊急度選択 ---
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('horenso_urgency')) {
    const [_, category] = interaction.customId.split('|');
    const urgency = interaction.values[0];

    await interaction.update({ content: '💬 相談内容をこのチャンネルで入力してください（他人には見えません）', components: [], ephemeral: true });

    const filter = m => m.author.id === interaction.user.id;
    const collector = interaction.channel.createMessageCollector({ filter, max: 1, time: 5*60*1000 });

    collector.on('collect', async m => {
      const reportChannel = await client.channels.fetch(HORNSO_CHANNEL_ID);

      let content = `📌 **報連相**\n─────────────\nカテゴリ: **${category}**\n緊急度: **${urgency}**\n💬 内容:\n${m.content}`;
      if (urgency === '緊急') content = `<@&${EMERGENCY_ROLE_ID}> ` + content;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`horenso_reply|${category}`)
          .setLabel('💬 返信する')
          .setStyle(ButtonStyle.Secondary)
      );

      await reportChannel.send({ content, components: [row] });
      await interaction.followUp({ content: '✅ 報連相を送信しました！', ephemeral: true });
    });
    return;
  }

  // --- 返信ボタン押下 ---
  if (interaction.isButton() && interaction.customId.startsWith('horenso_reply')) {
    const [_, category] = interaction.customId.split('|');
    const guild = interaction.guild;
    const channels = guild.channels.cache
      .filter(ch => ch.type === 0 && ch.parentId === REPLY_CATEGORY_ID)
      .map(ch => ({ label: ch.name, value: ch.id }));

    if (!channels.length) {
      await interaction.reply({ content: '❌ 指定カテゴリ内にチャンネルがありません', ephemeral: true });
      return;
    }

    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`horenso_reply_channel|${category}`)
        .setPlaceholder('返信先チャンネルを選択')
        .addOptions(channels)
    );

    await interaction.reply({ content: '返信先チャンネルを選択してください', components: [selectRow], ephemeral: true });
    return;
  }

  // --- 返信先選択後 ---
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('horenso_reply_channel')) {
    const [_, category] = interaction.customId.split('|');
    const channelId = interaction.values[0];
    const replyChannel = await client.channels.fetch(channelId);

    await interaction.reply({ content: '💬 返信内容を入力してください', ephemeral: true });

    const filter = m => m.author.id === interaction.user.id;
    const collector = interaction.channel.createMessageCollector({ filter, max: 1, time: 5*60*1000 });

    collector.on('collect', async m => {
      const original = await interaction.message.fetch();
      const originalContent = original.content.split('\n💬 内容:\n')[1];

      const content = `📣 **返信**\n─────────────\nカテゴリ: **${category}**\n💬 内容:\n${originalContent}\n\n💬 返信:\n${m.content}`;
      await replyChannel.send({ content });
      await interaction.followUp({ content: '✅ 返信を送信しました', ephemeral: true });
    });
    return;
  }

});

// --- Botログイン ---
client.login(TOKEN);
