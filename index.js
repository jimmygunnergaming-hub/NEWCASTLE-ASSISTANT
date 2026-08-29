const express = require('express');
const fs = require('fs'); // FIXED: Explicitly added native filesystem package
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const { Client, GatewayIntentBits, SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');

const app = express();
app.use(express.json());

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const activeSessions = new Map();

// 1. LIVE WEB APP ROUTING ENDPOINTS
app.get('/lineup/:id', (req, res) => {
  const filePath = path.join(__dirname, 'pitch.html');
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('❌ Error: pitch.html was not found in your main repository folder directory.');
  }
  res.sendFile(filePath);
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
    const finalBuffer = await buildCanvasBuffer(session);
    const finalAttachment = new AttachmentBuilder(finalBuffer, { name: 'finalized-squad-lineup.png' });

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

// 2. DISCORD INTERACTION ROUTING LAYER
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

// 3. CANVAS EXPORT COMPILATION PASS
async function buildCanvasBuffer(session) {
  const width = 900; const height = 1150; 
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#27ae60'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#219653'; for (let i = 0; i < height; i += 230) { ctx.fillRect(0, i, width, 115); }
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.strokeRect(40, 40, width - 80, height - 80);
  ctx.beginPath(); ctx.moveTo(40, height / 2); ctx.lineTo(width - 40, height / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(width / 2, height / 2, 100, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeRect(width / 2 - 200, height - 180, 400, 140); ctx.strokeRect(width / 2 - 200, 40, 400, 140);

  for (let i = 0; i < session.roster.length; i++) {
    const slot = session.roster[i];
    const posX = (slot.pctX / 100) * width;
    const posY = (slot.pctY / 100) * height;

    if (slot.avatar && slot.avatar !== '') {
      try {
        const img = await loadImage(slot.avatar);
        ctx.save();
        ctx.beginPath(); ctx.arc(posX, posY, 42, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(img, posX - 42, posY - 42, 84, 84);
        ctx.restore();
        
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(posX, posY, 42, 0, Math.PI * 2); ctx.stroke();
      } catch (err) {
        ctx.fillStyle = '#e67e22';
        ctx.beginPath(); ctx.arc(posX, posY, 42, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      ctx.fillStyle = '#7f8c8d';
      ctx.beginPath(); ctx.arc(posX, posY, 35, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(slot.role, posX, posY + 68);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px Arial';
    ctx.fillText(slot.name, posX, posY + 88);
  }

  return canvas.toBuffer();
}

client.login(process.env.TOKEN);
