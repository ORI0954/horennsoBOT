const { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  InteractionType 
} = require('discord.js');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// /horenso コマンド処理
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "horenso") {
    await interaction.reply({
      content: "📋 報連相フォームを開始します！",
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("category")
            .setPlaceholder("カテゴリを選んでください")
            .addOptions([
              { label: "報告", value: "report" },
              { label: "連絡", value: "contact" },
              { label: "相談", value: "consult" },
            ])
        )
      ]
    });
  }
});

// カテゴリ選択処理
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;

  if (interaction.customId === "category") {
    const category = interaction.values[0];
    await interaction.update({
      content: `カテゴリ **${category}** が選択されました。次に緊急度を選んでください。`,
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("priority")
            .setPlaceholder("緊急度を選んでください")
            .addOptions([
              { label: "高", value: "high" },
              { label: "中", value: "medium" },
              { label: "低", value: "low" },
            ])
        )
      ]
    });
  }

  if (interaction.customId === "priority") {
    const priority = interaction.values[0];

    // モーダル（内容入力フォーム）
    const modal = new ModalBuilder()
      .setCustomId("horensoForm")
      .setTitle("報連相内容");

    const input = new TextInputBuilder()
      .setCustomId("content")
      .setLabel("内容を入力してください")
      .setStyle(TextInputStyle.Paragraph);

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    await interaction.showModal(modal);
  }
});

// モーダル処理（内容送信）
client.on("interactionCreate", async (interaction) => {
  if (interaction.type !== InteractionType.ModalSubmit) return;
  if (interaction.customId === "horensoForm") {
    const content = interaction.fields.getTextInputValue("content");

    await interaction.reply({
      content: `✅ フォームが送信されました！\n内容: ${content}`
    });
  }
});

client.login(process.env.TOKEN);
