console.log("TOKEN:", process.env.TOKEN?.slice(0, 4) + "…");

client.login(process.env.TOKEN);


const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const TOKEN = 'TOKEN';

// 起動時
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

// メッセージ送信時の処理（例: ボタン付きでフォーム開始）
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // 特定コマンドでフォーム開始
    if (message.content === '!form') {
        // ボタンを作成
        const startButton = new ButtonBuilder()
            .setCustomId('start_form')
            .setLabel('📋 報連相フォームを開始')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(startButton);

        await message.reply({ content: 'フォームを開始するにはボタンを押してください', components: [row] });
    }
});

// ボタン・セレクトメニューの処理
client.on('interactionCreate', async (interaction) => {
    try {
        // ボタンが押された場合
        if (interaction.isButton()) {
            if (interaction.customId === 'start_form') {
                // セレクトメニュー作成
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('report_category')
                    .setPlaceholder('カテゴリを選んでください')
                    .addOptions([
                        { label: '質問', value: 'question' },
                        { label: '相談', value: 'consult' },
                        { label: '報告', value: 'report' },
                    ]);

                const row = new ActionRowBuilder().addComponents(selectMenu);

                await interaction.reply({ content: '📋 報連相フォームを開始します！カテゴリを選んでください。', components: [row], ephemeral: true });
            }
        }

        // セレクトメニューが選択された場合
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'report_category') {
                await interaction.update({ content: `✅ 選択されたカテゴリ: ${interaction.values[0]}`, components: [] });
            }
        }
    } catch (err) {
        console.error('Interaction error:', err);
    }
});

client.login(TOKEN);
