const { 
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events,
  ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');

// --- 環境変数 ---
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const REPORT_CATEGORY_ID = process.env.REPORT_CATEGORY_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !REPORT_CATEGORY_ID) {
  console.error("❌ 必要な環境変数が設定されていません。");
  process.exit(1);
}

// --- クライアント作成 ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// --- スラッシュコマンド登録 ---
const commands = [
  new SlashCommandBuilder()
    .setName('horenso')
    .setDescription('報連相フォームを開始します')
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

// --- コマンド実行 ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'horenso') {
    // --- カテゴリ内のチャンネルを選択 ---
    const channelsInCategory = interaction.guild.channels.cache
      .filter(c => c.isTextBased() && c.parentId === REPORT_CATEGORY_ID)
      .map(c => ({ label: c.name, value: c.id }));

    if (channelsInCategory.length === 0) {
      return interaction.reply({ content: "❌ カテゴリ内にチャンネルがありません。", ephemeral: true });
    }

    const channelSelect = new StringSelectMenuBuilder()
      .setCustomId('report_channel_select')
      .setPlaceholder('報連相を送るチャンネルを選択してください')
      .addOptions(channelsInCategory.slice(0, 25));

    await interaction.reply({
      content: "📋 報連相フォームを開始します！\nまず送信先チャンネルを選んでください。",
      components: [new ActionRowBuilder().addComponents(channelSelect)],
      ephemeral: true
    });
  }
});

// --- Botログイン ---
client.login(TOKEN);
