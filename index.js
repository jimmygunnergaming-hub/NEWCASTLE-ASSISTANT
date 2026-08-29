const express = require('express');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { captureHtmlTemplate } = require('html-to-image-wrapper'); // Safe web renderer

const app = express();
app.use(express.json());

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const activeSessions = new Map();

// 1. DASHBOARD ENDPOINTS FOR YOUR INTERACTIVE WEB PITCH
app.get('/lineup/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'pitch.html'));
});

app.get('/api/session/:id', (req, res) => {
  const session = activeSessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({
    id: session.id,
    creatorId: session.creatorId,
    total: session.total,
    roster: session.roster,
    serverMembers: session.serverMembers
  });
});

app.post('/api/session/:id/save', async (req, res) => {
  const { id } = req.params;
  const session = activeSessions.get(id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  session.roster = req.body.roster;

  try {
    // Generate raw HTML matching state configurations
    const htmlPath = path.join(__dirname, 'pitch.html');
    let templateHtml = fs.readFileSync(htmlPath, 'utf8');

    // Convert positions state data to static markup injection pass
    let inlineNodesHtml = '';
    session.roster.forEach((player) => {
      const avatarHtml = player.avatar ? `<img src="${player.avatar}">` : `<div class="drag-handle"></div>`;
      inlineNodesHtml += `
        <div class="player-node" style="left: ${player.pctX}%; top: ${player.pctY}%;">
          ${avatarHtml}
          <div class="label-container">
            <div class="pos-name">${player.role}</div>
            <div class="usr-name">${player.name}</div>
          </div>
        </div>`;
    });

    // Inject data layer directly before snapshot rendering step runs
    templateHtml = templateHtml.replace('<div id="nodes-container"></div>', `<div id="nodes-container">${inlineNodesHtml}</div>`);
    templateHtml += `<style>#lockout-screen, .top-controls, .pad-controls { display: none !important; }</style>`;

    // Render snapshot completely in memory via cloud rendering layer
    const imageBuffer = await captureHtmlTemplate(templateHtml, { width: 900, height: 1150 });
    const finalAttachment = new AttachmentBuilder(imageBuffer, { name: 'finalized-squad-lineup.png' });

    const destinationEmbed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`📋 Squad Lineup Finalized (${session.total}v${session.total})`)
      .setDescription('Tactical field chart compiled cleanly using the live workspace console application.')
      .setImage('attachment://finalized-squad-lineup.png');

    session.roster.forEach((slot) => {
      if (slot.name && slot.name !== 'Unassigned') {
        destinationEmbed.addFields({ name: `Position: ${slot.role}`, value: `👤 **${slot.name}**`, inline: true });
      }
    });

    const targetChannel = await client.channels.fetch('1542615988963385403');
    await targetChannel.send({ 
      content: `✅ **New squad sheet locked and published by manager <@${session.creatorId}>!**`, 
      embeds: [destinationEmbed],
      files: [finalAttachment] 
    });

    activeSessions.delete(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Graphics build or delivery failure:', err);
    res.status(500).json({ error: 'Failed to process chart layout.' });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Live web manager control server actively listening...');
});

// 2. DISCORD APPLICATION COMMAND ROUTING
client.once('ready', () => {
  console.log('Newcastle Bot connection validated successfully!');
  const command = new SlashCommandBuilder()
    .setName('lineup')
    .setDescription('Build a high-quality graphical football field lineup')
    .addIntegerOption(opt => opt.setName('size').setDescription('Number of players (1-11)').setRequired(true).setMinValue(1).setMaxValue(11));
  client.application.commands.create(command);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'lineup') {
    const size = interaction.options.getInteger('size');
    await interaction.deferReply({ ephemeral: true });
    const msg = await interaction.fetchReply();

    let membersList = [];
    try {
      const fetched = await interaction.guild.members.fetch({ limit: 100 });
      membersList = fetched.map(m => ({
        id: m.user.id,
        username: m.user.username,
        avatar: m.user.displayAvatarURL({ extension: 'png', size: 128 })
      }));
    } catch (e) {
      console.error('Failed to extract live server guild member profiles:', e);
    }

    const roster = Array.from({ length: size }, (_, i) => ({
      index: i,
      name: 'Unassigned',
      role: i === 0 ? 'GK' : `POS #${i + 1}`,
      avatar: '',
      pctX: 50,
      pctY: 85 - (i * 7)
    }));

    activeSessions.set(msg.id, {
      id: msg.id,
      creatorId: interaction.user.id,
      total: size,
      roster: roster,
      serverMembers: membersList
    });

    const externalHost = process.env.RENDER_EXTERNAL_HOSTNAME || `localhost:${process.env.PORT || 3000}`;
    const secureProtocol = process.env.RENDER_EXTERNAL_HOSTNAME ? 'https' : 'http';
    const webLink = `${secureProtocol}://${externalHost}/lineup/${msg.id}?uid=${interaction.user.id}`;
    
    return interaction.editReply({
      content: `🏟️ **Newcastle Tactical Pitch Live Workspace Instantiated**\nAccess your interactive manager control board through this secure link:\n🔗 ${webLink}`
    });
  }
});

client.login(process.env.TOKEN);
