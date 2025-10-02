const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } = require('discord.js');

// --- 環境変数 ---
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const HORNSO_CHANNEL_ID = process.env.HORNSO_CHANNEL_ID;
const EMERGENCY_ROLE_ID = process.env.EMERGENCY_ROLE_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !HORNSO_CHANNEL_ID || !EMERGENCY_ROLE_ID) {
  console.error("❌ 必須環境変数が不足しています。");
  process.exit(1);
}

// --- クライアント作成 ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// --- スラッシュコマンド登録 ---
const commands = [
  new SlashCommandBuilder()
    .setName('horenso-button')
    .setDescription('報連相ボタンを設置します')
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  try {
    console.log("⏳ スラッシュコマンドを登録中...");
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

// --- スラッシュコマンド処理 ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'horenso-button') {
    const button = new ButtonBuilder()
      .setCustomId('horenso_start')
      .setLabel('📋 報連相を開始')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({ content: 'ボタンを押して報連相フォームを開始してください', components: [row], ephemeral: true });
  }
});

// --- ボタン押下処理 ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'horenso_start') {
    // カテゴリ選択メニュー
    const categorySelect = new StringSelectMenuBuilder()
      .setCustomId('horenso_category')
      .setPlaceholder('カテゴリを選択してください')
      .addOptions([
        { label: '業務', value: 'business' },
        { label: 'トラブル', value: 'trouble' },
        { label: 'その他', value: 'other' }
      ]);

    const row = new ActionRowBuilder().addComponents(categorySelect);

    await interaction.reply({ content: '📋 カテゴリを選択してください', components: [row], ephemeral: true });
  }
});

// --- セレクトメニュー選択 ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;

  if (interaction.customId === 'horenso_category') {
    const selectedCategory = interaction.values[0];

    const emergencySelect = new StringSelectMenuBuilder()
      .setCustomId(`horenso_emergency_${selectedCategory}`)
      .setPlaceholder('緊急度を選択してください')
      .addOptions([
        { label: '高', value: 'high' },
        { label: '中', value: 'medium' },
        { label: '低', value: 'low' }
      ]);

    const row = new ActionRowBuilder().addComponents(emergencySelect);

    await interaction.update({ content: `カテゴリ: ${selectedCategory}\n次に緊急度を選択してください`, components: [row] });
  } else if (interaction.customId.startsWith('horenso_emergency_')) {
    const category = interaction.customId.replace('horenso_emergency_', '');
    const emergency = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`horenso_modal_${category}_${emergency}`)
      .setTitle('報連相 相談内容入力');

    const input = new TextInputBuilder()
      .setCustomId('horenso_content')
      .setLabel('相談内容')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('ここに相談内容を入力してください')
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    await interaction.showModal(modal);
  }
});

// --- モーダル送信処理 ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.type !== InteractionType.ModalSubmit) return;
  if (!interaction.customId.startsWith('horenso_modal_')) return;

  const [_, category, emergency] = interaction.customId.split('_').slice(1, 4);
  const content = interaction.fields.getTextInputValue('horenso_content');

  const channel = await client.channels.fetch(HORNSO_CHANNEL_ID);

  let msgContent = `📌 **報連相**\n- カテゴリ: ${category}\n- 緊急度: ${emergency}\n- 内容: ${content}\n- 投稿者: <@${interaction.user.id}>`;
  if (emergency === 'high') {
    msgContent = `<@&${EMERGENCY_ROLE_ID}> ` + msgContent;
  }

  await channel.send({ content: msgContent });

  await interaction.reply({ content: '✅ 報連相を送信しました。', ephemeral: true });
});

// --- Botログイン ---
client.login(TOKEN);
