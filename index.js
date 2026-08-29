const http = require('http'); // Built-in lightweight port handler
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
// LIGHTWEIGHT PORT LISTENER TO KEEP RENDER FREE
// -------------------------------------------------------------
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Newcastle Lineup Engine Active');
}).listen(process.env.PORT || 3000, () => {
  console.log("Render web port validation check passed successfully.");
});

// -------------------------------------------------------------
// BOT LOGIC
// -------------------------------------------------------------
const client = new Client({ 
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] 
});

const activeLineups = new Map();

client.once('ready', () => {
  console.log(`Bot connection validated successfully! Authorized as ${client.user.tag}`);

  const formatChoices = [];
  for (let i = 1; i <= 11; i++) {
    formatChoices.push({ name: `${i}v${i} Layout`, value: i.toString() });
  }

  const command = new SlashCommandBuilder()
    .setName('lineup')
    .setDescription('Build your team roster lineup step-by-step in chat')
    .addStringOption(option => 
      option.setName('format')
        .setDescription('Select match format size')
        .setRequired(true)
        .addChoices(...formatChoices));

  client.application.commands.create(command);
});

client.on('interactionCreate', async interaction => {
  if (interaction.isStringSelectMenu() || interaction.isUserSelectMenu()) {
    const session = activeLineups.get(interaction.message.id);
    if (session && session.creatorId !== interaction.user.id) {
      return interaction.reply({ 
        content: '❌ Only the coach who typed `/lineup` can interact with this selector panel.', 
        ephemeral: true 
      });
    }
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'lineup') {
    const totalPlayers = parseInt(interaction.options.getString('format'));
    
    let formationOptions = [];
    if (totalPlayers === 6) {
      formationOptions = [{ label: '2-2-2 Strategic Grid Layout', value: '2-2-2' }];
    } else if (totalPlayers === 11) {
      formationOptions = [
        { label: '4-4-2 Traditional Balanced', value: '4-4-2' },
        { label: '4-3-3 Heavy Attacking', value: '4-3-3' }
      ];
    } else {
      formationOptions = [{ label: 'Standard Balanced Field Positioning', value: 'Balanced' }];
    }

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`form_${totalPlayers}`)
        .setPlaceholder('Select tactical lineup system formation...')
        .addOptions(formationOptions)
    );

    const msg = await interaction.reply({
      content: `👥 **Creating a ${totalPlayers}v${totalPlayers} matchup setup.** Please choose your starting formation:`,
      components: [row],
      fetchReply: true
    });

    activeLineups.set(msg.id, {
      creatorId: interaction.user.id,
      total: totalPlayers,
      formation: 'None',
      currentIndex: 0,
      labels: [],
      roster: []
    });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('form_')) {
    const msgId = interaction.message.id;
    const session = activeLineups.get(msgId);
    if (!session) return;

    const totalPlayers = parseInt(interaction.customId.split('_'));
    session.formation = interaction.values[0];

    if (totalPlayers === 6 && session.formation === '2-2-2') {
      session.labels = ['GK (Goalkeeper)', 'DEF-L (Left Defender)', 'DEF-R (Right Defender)', 'MID-L (Left Midfielder)', 'MID-R (Right Midfielder)', 'ST (Striker)'];
    } else if (totalPlayers === 11 && session.formation === '4-4-2') {
      session.labels = ['GK', 'LB', 'CB1', 'CB2', 'RB', 'LM', 'CM1', 'CM2', 'RM', 'ST1', 'ST2'];
    } else {
      for (let i = 1; i <= totalPlayers; i++) {
        session.labels.push(i === 1 ? 'GK (Goalkeeper)' : `Player Node #${i}`);
      }
    }

    return advanceLineupProcess(interaction, msgId);
  }

  if (interaction.isUserSelectMenu() && interaction.customId === 'player_picker') {
    const msgId = interaction.message.id;
    const session = activeLineups.get(msgId);
    if (!session) return interaction.reply({ content: 'Session timeline data expired.', ephemeral: true });

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
        .setColor(0x2ecc71)
        .setTitle(`📋 Newcastle Squad Roster Confirmed (${session.total}v${session.total})`)
        .setDescription(`**Tactical System Strategy:** \`${session.formation}\`\nFinal starting roster breakdown list displayed directly below:`);

      session.roster.forEach(player => {
        finalEmbed.addFields({ 
          name: `🟢 ${player.position}`, 
          value: `**Assigned:** ${player.name}\n[View Profile Picture Avatar Link](${player.avatarUrl})`, 
          inline: true 
        });
      });

      await interaction.update({
        content: `✅ **Lineup build complete!** Roster sheet has been locked and published down inside the public field card logs.`,
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

  let visualizationProgress = `⚽ **Camp Nou Pitch Position Status:** \`${session.formation}\`\n\n`;
  for (let i = 0; i < session.total; i++) {
    if (i === session.currentIndex) {
      visualizationProgress += `🟢 **[Active Pick: ${session.labels[i]}]**\n`;
    } else if (i < session.currentIndex) {
      visualizationProgress += `✅ ${session.roster[i].position}: **${session.roster[i].name}**\n`;
    } else {
      visualizationProgress += `⚪ ${session.labels[i]}: *Empty Slot Position*\n`;
    }
  }

  const userSelect = new UserSelectMenuBuilder()
    .setCustomId('player_picker')
    .setPlaceholder(`Click here to pick the person for: ${currentPosLabel}`);

  const row = new ActionRowBuilder().addComponents(userSelect);

  await interaction.update({
    content: `🏟️ **NEWCASTLE ASSISTANT STRATEGY BUILDER PANEL**\n\n${visualizationProgress}`,
    components: [row]
  });
}

client.login(process.env.DISCORD_TOKEN);
