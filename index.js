const http = require('http'); // Built-in helper to fake a webpage
const { 
  Client, 
  GatewayIntentBits, 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  UserSelectMenuBuilder, 
  StringSelectMenuBuilder,
  EmbedBuilder 
} = require('discord.js');

// -------------------------------------------------------------
// FAKE WEB SERVER TO KEEP RENDER HAPPY & FREE
// -------------------------------------------------------------
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Discord Bot Lineup Generator is Online!');
}).listen(process.env.PORT || 3000, () => {
  console.log("Web server listener initialized successfully.");
});

// -------------------------------------------------------------
// MAIN DISCORD BOT CODE
// -------------------------------------------------------------
const client = new Client({ 
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] 
});

const activeLineups = new Map();

client.once('ready', () => {
  console.log(`Bot is online as ${client.user.tag}`);

  const command = new SlashCommandBuilder()
    .setName('lineup')
    .setDescription('Build your team roster lineup step-by-step')
    .addIntegerOption(option => 
      option.setName('size')
        .setDescription('Number of people in the lineup')
        .setRequired(true)
        .setMinValue(2)
        .setMaxValue(11));

  client.application.commands.create(command);
});

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'lineup') {
    const totalPlayers = interaction.options.getInteger('size');
    
    let formationOptions = [
      { label: 'Standard Balanced Layout', value: 'Balanced' },
      { label: 'Attacking Bias Layout', value: 'Attacking' },
      { label: 'Defensive Wall Layout', value: 'Defensive' }
    ];

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`form_${totalPlayers}`)
        .setPlaceholder('Select what formation to use')
        .addOptions(formationOptions)
    );

    return interaction.reply({
      content: `👥 Creating a **${totalPlayers} person** lineup. Please choose your strategy below:`,
      components: [row],
      ephemeral: false
    });
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('form_')) {
    const totalPlayers = parseInt(interaction.customId.split('_'));
    const chosenFormation = interaction.values;

    const positionLabels = [];
    for(let i = 1; i <= totalPlayers; i++) {
      positionLabels.push(`Position #${i}`);
    }

    activeLineups.set(interaction.message.id, {
      total: totalPlayers,
      formation: chosenFormation,
      labels: positionLabels,
      currentIndex: 0,
      roster: []
    });

    return advanceLineupProcess(interaction, interaction.message.id);
  }

  if (interaction.isUserSelectMenu() && interaction.customId === 'player_picker') {
    const msgId = interaction.message.id;
    const session = activeLineups.get(msgId);
    if (!session) return interaction.reply({ content: 'Lineup tracking data expired.', ephemeral: true });

    const targetUser = interaction.users.first();
    const currentPosLabel = session.labels[session.currentIndex];

    session.roster.push({
      name: targetUser.username,
      position: currentPosLabel,
      avatarUrl: targetUser.displayAvatarURL({ extension: 'png', size: 256 })
    });

    session.currentIndex++;

    if (session.currentIndex >= session.total) {
      const finalEmbed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`📊 Lineup Complete: ${session.formation} (${session.total} Players)`)
        .setDescription('Here is the finalized lineup order with tags and profiles:');

      session.roster.forEach(player => {
        finalEmbed.addFields({ 
          name: `👤 ${player.name}`, 
          value: `**Position:** ${player.position}\n[Profile Avatar Picture Link](${player.avatarUrl})`, 
          inline: true 
        });
      });

      await interaction.update({
        content: `✅ **Lineup successfully completed!**`,
        embeds: [finalEmbed],
        components: []
      });
      
      return activeLineups.delete(msgId);
    } else {
      return advanceLineupProcess(interaction, msgId);
    }
  }
});

async function advanceLineupProcess(interaction, msgId) {
  const session = activeLineups.get(msgId);
  const currentPosLabel = session.labels[session.currentIndex];

  let visualizationProgress = `**Formation:** ${session.formation}\n\n`;
  for (let i = 0; i < session.total; i++) {
    if (i === session.currentIndex) {
      visualizationProgress += `🟢 **[Assigning: ${session.labels[i]}]**\n`;
    } else if (i < session.currentIndex) {
      visualizationProgress += `✅ ${session.roster[i].position}: **${session.roster[i].name}**\n`;
    } else {
      visualizationProgress += `⚪ ${session.labels[i]}: *Unassigned*\n`;
    }
  }

  const userSelect = new UserSelectMenuBuilder()
    .setCustomId('player_picker')
    .setPlaceholder(`Click here to pick person for ${currentPosLabel}`);

  const row = new ActionRowBuilder().addComponents(userSelect);

  const responsePayload = {
    content: `🛠️ **Lineup Editor Status Builder**\n\n${visualizationProgress}`,
    components: [row]
  };

  if (interaction.replied || interaction.deferred) {
    await interaction.update(responsePayload);
  } else {
    await interaction.reply(responsePayload);
  }
}

client.login(process.env.DISCORD_TOKEN);
