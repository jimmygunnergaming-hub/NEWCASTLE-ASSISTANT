const express = require('express');
const app = express();
const path = require('path');
const https = require('https');
const { Client, GatewayIntentBits, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder } = require('discord.js');

app.use(express.json({ limit: '50mb' }));

const liveSessions = new Map();
let mostRecentSessionId = null; 

app.get('/pitch/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, 'pitch.html'));
});

app.get('/api/session/:sessionId', (req, res) => {
  const session = liveSessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

app.get('/api/proxy-avatar', (req, res) => {
  const avatarUrl = req.query.url;
  if (!avatarUrl) return res.sendStatus(400);

  https.get(avatarUrl, (proxyRes) => {
    res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'image/png');
    res.setHeader('Access-Control-Allow-Origin', '*');
    proxyRes.pipe(res);
  }).on('error', () => res.sendStatus(500));
});

app.post('/api/save-lineup/:id', async (req, res) => {
  const session = liveSessions.get(req.params.id);
  if (!session) return res.sendStatus(404);

  session.roster = req.body.roster;
  const imageBlob = req.body.imageBlob;

  const base64Data = imageBlob.replace(/^data:image\/png;base64,/, "");
  const imageBuffer = Buffer.from(base64Data, 'base64');
  const fileAttachment = new AttachmentBuilder(imageBuffer, { name: 'finalized-pitch-squad.png' });

  const summaryEmbed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('📋 Newcastle Squad Lineup Finalized')
    .setDescription('The customized tactical system build is complete. Here is the team sheet details:')
    .setImage('attachment://finalized-pitch-squad.png');

  session.roster.forEach((slot) => {
    const userDisplay = slot.assignedUser 
      ? '👤 **' + slot.assignedUser.name + '**' 
      : '*Unassigned Empty Slot*';
    summaryEmbed.addFields({ name: '⚽ Position: ' + slot.posLabel, value: userDisplay, inline: true });
  });

  try {
    const targetChannel = await client.channels.fetch('1542615988963385403');
    await targetChannel.send({ 
      content: '✅ **Lineup successfully published by <@' + session.creatorId + '>!**', 
      embeds: [summaryEmbed],
      files: [fileAttachment]
    });
  } catch (err) { console.error('Discord routing delivery error:', err); }

  res.sendStatus(200);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Web application validation listening on port ${port}`));

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once('ready', () => {
  console.log('Bot connection validated successfully! Authorized as ' + client.user.tag);
  
  const choicesArray = [];
  for (let i = 1; i <= 11; i++) {
    choicesArray.push({ name: i + 'v' + i + ' Matchup Size', value: i });
  }

  const baseCommand = new SlashCommandBuilder()
    .setName('lineup')
    .setDescription('Open the realistic interactive graphical football pitch setup workspace')
    .addIntegerOption(option =>
      option.setName('size')
        .setDescription('Select squad player count size format (1 up to 11)')
        .setRequired(true)
        .addChoices(...choicesArray));

  const editCommand = new SlashCommandBuilder()
    .setName('edit')
    .setDescription('Modify your most recently initialized team field project space properties');

  client.application.commands.create(baseCommand);
  client.application.commands.create(editCommand);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // Extract the live server domain URL cleanly without guess tracking traps
  let baseUrl = process.env.RENDER_EXTERNAL_URL;
  if (!baseUrl) {
    // Rebuild the link dynamically if the environment variables are obscured
    baseUrl = 'https://' + interaction.guild.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.onrender.com';
  }
  
  // Hard-correct alternative: if you look at your dashboard url, change this link to your exact sub-string if it drops out
  if (baseUrl.includes('localhost') || !baseUrl) {
    baseUrl = 'https://onrender.com';
  }

  if (interaction.commandName === 'lineup') {
    const totalPlayers = interaction.options.getInteger('size');
    const sessionId = Math.random().toString(36).substring(2, 11);
    mostRecentSessionId = sessionId;

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

    const dashboardLink = baseUrl + '/pitch/' + sessionId;

    const linkRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('🏟️ Open Interactive Football Pitch').setURL(dashboardLink).setStyle(ButtonStyle.Link)
    );

    await interaction.reply({
      content: '👋 **Hey coach!** Click the button below to launch your tactical pitch dashboard for **' + totalPlayers + 'v' + totalPlayers + '** matches.',
      components: [linkRow],
      ephemeral: true
    });
  }

  if (interaction.commandName === 'edit') {
    if (!mostRecentSessionId || !liveSessions.has(mostRecentSessionId)) {
      return interaction.reply({ content: '❌ No active or recent layout records found to update.', ephemeral: true });
    }

    const dashboardLink = baseUrl + '/pitch/' + mostRecentSessionId;

    const linkRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('📝 Edit Most Recent Lineup Workspace').setURL(dashboardLink).setStyle(ButtonStyle.Link)
    );

    await interaction.reply({
      content: '🛠️ **Lineup modification session found.** Click the button below to resume editing where you left off:',
      components: [linkRow],
      ephemeral: true
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
