const { 
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder 
} = require('discord.js');

// --- 環境変数 ---
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const HORNSO_CHANNEL_ID = process.env.HORNSO_CHANNEL_ID; // 報連相送信先チャンネル
const EMERGENCY_ROLE_ID = process.env.EMERGENCY_ROLE_ID; // 緊急度高でメンションするロール
const CATEGORY_ID = process.env.CATEGORY_ID; // 返信用チャンネルを選ぶときのカテゴリ

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !HORNSO_CHANNEL_ID || !CATEGORY_ID) {
  console.error("❌ 必須環境変数が不足しています。");
  process.exit(1);
}

// --- クライアント作成 ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// --- /horenso スラッシュコマンド登録 ---
const commands = [
  new SlashCommandBuilder()
    .setName('horenso')
    .setDescription('報連相フォームを開始します')
    .toJSON()
];
const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  try {
    console.log("⏳ スラッシュコマンドを登録中...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ スラッシュコマンド登録完了！");
  } catch (err) {
    console.error(err);
  }
}

// --- フォームデータ保持用 ---
const horensoData = new Map(); // interaction.user.id => { category, urgency, content }

// --- ボタン・セレクト作成関数 ---
function createCategoryMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('horenso_category')
      .setPlaceholder('カテゴリを選択してください')
      .addOptions([
        { label: '質問', value: '質問' },
        { label: '相談', value: '相談' },
        { label: '報告', value: '報告' },
      ])
  );
}

function createUrgencyMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('horenso_urgency')
      .setPlaceholder('緊急度を選択してください')
      .addOptions([
        { label: '高', value: '高' },
        { label: '中', value: '中' },
        { label: '低', value: '低' },
      ])
  );
}

// --- Bot起動 ---
client.once(Events.ClientReady, c => {
  console.log(`🤖 ログイン完了: ${c.user.tag}`);
  registerCommands();
});

// --- コマンド実行 ---
client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'horenso') {
      await interaction.reply({
        content: '📋 報連相フォームを開始します！カテゴリを選択してください。',
        components: [createCategoryMenu()],
        ephemeral: true
      });
    }

    // --- カテゴリ選択 ---
    if (interaction.isStringSelectMenu() && interaction.customId === 'horenso_category') {
      horensoData.set(interaction.user.id, { category: interaction.values[0] });
      await interaction.update({
        content: `カテゴリ: ${interaction.values[0]} 選択済み。次に緊急度を選択してください。`,
        components: [createUrgencyMenu()]
      });
    }

    // --- 緊急度選択 ---
    if (interaction.isStringSelectMenu() && interaction.customId === 'horenso_urgency') {
      const data = horensoData.get(interaction.user.id) || {};
      data.urgency = interaction.values[0];
      horensoData.set(interaction.user.id, data);
      await interaction.update({
        content: `緊急度: ${interaction.values[0]} 選択済み。最後に相談内容を入力してください。`,
        components: []
      });

      // --- 相談内容を聞くモーダルに誘導 ---
      await interaction.followUp({
        content: '💬 相談内容をこのチャンネルでメッセージとして入力してください。',
        ephemeral: true
      });
    }

    // --- メッセージで相談内容入力 ---
    if (interaction.isMessageComponent()) return; // まだボタンは押してない

  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: '❌ エラーが発生しました', ephemeral: true });
    } else {
      await interaction.reply({ content: '❌ エラーが発生しました', ephemeral: true });
    }
  }
});

// --- メッセージ送信監視 ---
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const data = horensoData.get(message.author.id);
  if (!data || !data.urgency) return; // カテゴリ・緊急度選択後のみ

  // --- 報連相送信 ---
  const targetChannel = await client.channels.fetch(HORNSO_CHANNEL_ID);
  let content = `📋 **報連相フォーム**\n`;
  content += `**送信者:** ${message.author}\n`;
  content += `**カテゴリ:** ${data.category}\n`;
  content += `**緊急度:** ${data.urgency}\n`;
  content += `**内容:** ${message.content}\n`;
  if (data.urgency === '高' && EMERGENCY_ROLE_ID) content = `<@&${EMERGENCY_ROLE_ID}> ` + content;

  await targetChannel.send({ content });

  // --- データクリア ---
  horensoData.delete(message.author.id);
  await message.reply({ content: '✅ 報連相を送信しました！', ephemeral: true });
});

// --- Botログイン ---
client.login(TOKEN);
