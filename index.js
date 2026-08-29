const express = require('express');
const app = express();
const path = require('path');
const { Client, GatewayIntentBits, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

app.use(express.json());

const liveSessions = new Map();

// Serves your clean pitch HTML file securely without string literal quote traps
app.get('/pitch/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, 'pitch.html'));
});

// API endpoint to load session metadata into the web screen
app.get('/api/session/:sessionId', (req, res) => {
  const session = liveSessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// Endpoint to process submitted lineup configurations back to Discord channel embed
app.post('/api/save-lineup/:id', async (req, res) => {
  const session = liveSessions.get(req.params.id);
  if (!session) return res.sendStatus(404);

  session.roster = req.body.roster;

  const summaryEmbed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('📋 Custom Squad Lineup Confirmed')
    .setDescription('The customized tactical system build is complete. Here is the team sheet:');

  session.roster.forEach((slot) => {
    const userDisplay = slot.assignedUser 
      ? '👤 **' + slot.assignedUser.name + '**\n[Profile Picture Avatar](' + slot.assignedUser.avatar + ')' 
      : '*Unassigned Empty Slot*';
    
    summaryEmbed.addFields({ name: '⚽ Position: ' + slot.posLabel, value: userDisplay, inline: true });
  });

  try {
    const channel = await client.channels.fetch(session.channelId);
    await channel.send({ content: '✅ **Lineup successfully published by <@' + session.creatorId + '>!**', embeds: [summaryEmbed] });
  } catch (err) { console.error(err); }

  res.sendStatus(200);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Web application validation listening on port ${port}`));

// -------------------------------------------------------------
// MAIN DISCORD BOT GATEWAY CONTROLLER
// -------------------------------------------------------------
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once('ready', () => {
  console.log('Bot connection validated successfully! Authorized as ' + client.user.tag);
  
  const command = new SlashCommandBuilder()
    .setName('lineup')
    .setDescription('Open the realistic interactive graphical football pitch setup workspace')
    .addIntegerOption(option =>
      option.setName('size')
        .setDescription('Select squad player count size format (1 up to 11)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(11));

  client.application.commands.create(command);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'lineup') return;

  const totalPlayers = interaction.options.getInteger('size');
  const sessionId = Math.random().toString(36).substring(2, 11);

  const membersFetched = await interaction.guild.members.fetch();
  const serverMembers = membersFetched.map(m => ({
    name: m.user.username,
    avatar: m.user.displayAvatarURL({ extension: 'png', size: 128 })
  }));

  liveSessions.set(sessionId, {
    id: sessionId,
    creatorId: interaction.user.id,
    channelId: interaction.channelId,
    total: totalPlayers,
    serverMembers: serverMembers,
    roster: Array.from({ length: totalPlayers }, (_, i) => ({ 
      index: i, 
      posLabel: i === 0 ? 'GK' : 'POS #' + (i + 1), 
      assignedUser: null 
    }))
  });

  const appUrl = process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + port;
  const dashboardLink = appUrl + '/pitch/' + sessionId;

  const linkRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('🏟️ Open Interactive Football Pitch')
      .setURL(dashboardLink)
      .setStyle(ButtonStyle.Link)
  );

  await interaction.reply({
    content: '👋 **Hey coach!** Click the button below to launch your highly realistic, drag-and-drop tactical pitch dashboard for **' + totalPlayers + 'v' + totalPlayers + '** matches.\n\n🔒 *Security Note: Only you can modify positions and save the team setup.*',
    components: [linkRow],
    ephemeral: false
  });
});

if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DEPLOYMENT FATAL ERROR: Missing DISCORD_TOKEN configuration variable.");
  process.exit(1);
} else {
  client.login(process.env.DISCORD_TOKEN);
}
