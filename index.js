const http = require('http'); 
const { createCanvas, loadImage } = require('canvas');
const { Client, GatewayIntentBits, SlashCommandBuilder, ActionRowBuilder, UserSelectMenuBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');

// 1. LIGHTWEIGHT PORT LISTENER
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Newcastle Bot Active');
}).listen(process.env.PORT || 3000);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const activeSessions = new Map();

client.once('ready', () => {
  console.log('Bot connection validated successfully!');
  const command = new SlashCommandBuilder()
    .setName('lineup')
    .setDescription('Build a high-quality graphical football field lineup')
    .addIntegerOption(opt => opt.setName('size').setDescription('Number of players (1-11)').setRequired(true).setMinValue(1).setMaxValue(11));
  client.application.commands.create(command);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() && !interaction.isUserSelectMenu()) return;

  // INTERACTION FLOW 1: SLASH COMMAND INITIALIZATION
  if (interaction.isChatInputCommand() && interaction.commandName === 'lineup') {
    const size = interaction.options.getInteger('size');
    
    const msg = await interaction.reply({ content: '🏟️ Initializing high-quality pitch layout...', fetchReply: true });
    
    activeSessions.set(msg.id, { 
      creatorId: interaction.user.id, 
      total: size, 
      currentIndex: 0, 
      roster: [] 
    });
    
    return generatePitch(interaction, msg.id, false);
  }

  // INTERACTION FLOW 2: REPETITIVE PLAYER PICK SELECTION
  if (interaction.isUserSelectMenu() && interaction.customId === 'pick') {
    const session = activeSessions.get(interaction.message.id);
    if (!session || session.creatorId !== interaction.user.id) {
      return interaction.reply({ content: '❌ Only the coach who started this command can pick players.', ephemeral: true });
    }

    const chosenUser = interaction.users.first();
    if (!chosenUser) return interaction.reply({ content: '❌ Failed to read user choice.', ephemeral: true });

    const positionTag = session.currentIndex === 0 ? 'GK' : `POS #${session.currentIndex + 1}`;

    session.roster.push({ 
      name: chosenUser.username, 
      role: positionTag,
      avatar: chosenUser.displayAvatarURL({ extension: 'png', size: 256 })
    });

    session.currentIndex++;

    if (session.currentIndex >= session.total) {
      return finishLineup(interaction, interaction.message.id);
    } else {
      return generatePitch(interaction, interaction.message.id, true);
    }
  }
});

// INTERACTIVE COMPONENT AND VISUAL BUFFER BUILDER MODULE
async function generatePitch(interaction, msgId, isEdit) {
  const session = activeSessions.get(msgId);
  if (!session) return;
  
  const width = 800;
  const height = 1000;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Draw Field Background Stripes
  ctx.fillStyle = '#27ae60'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#219653'; 
  for (let i = 0; i < height; i += 200) { ctx.fillRect(0, i, width, 100); }

  // Draw Field Markings
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.strokeRect(40, 40, width - 80, height - 80);
  ctx.beginPath(); ctx.moveTo(40, height / 2); ctx.lineTo(width - 40, height / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(width / 2, height / 2, 90, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeRect(width / 2 - 180, height - 200, 360, 160); ctx.strokeRect(width / 2 - 180, 40, 360, 160);

  // Field Position Coordinates Matrix Setup
  const coords = [{ x: width / 2, y: height - 100 }]; 

  if (session.total > 1) {
    const outfieldCount = session.total - 1;
    let rows = 1;
    if (outfieldCount > 3) rows = 2;
    if (outfieldCount > 7) rows = 3;

    const playersPerRow = Math.ceil(outfieldCount / rows);
    let assignedCount = 0;

    for (let r = 0; r < rows; r++) {
      const rowY = (height - 280) - (r * (height - 480) / rows);
      const countInThisRow = Math.min(playersPerRow, outfieldCount - assignedCount);

      for (let p = 0; p < countInThisRow; p++) {
        const rowX = (width / (countInThisRow + 1)) * (p + 1);
        coords.push({ x: rowX, y: rowY });
        assignedCount++;
      }
    }
  }

  // Render Circles and Data text Labels
  for (let i = 0; i < session.total; i++) {
    const slot = session.roster[i];
    const pos = coords[i] || { x: width / 2, y: height / 2 };

    if (slot) {
      try {
        const img = await loadImage(slot.avatar);
        ctx.save();
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 40, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(img, pos.x - 40, pos.y - 40, 80, 80);
        ctx.restore();
        
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 40, 0, Math.PI * 2); ctx.stroke();
      } catch (err) {
        ctx.fillStyle = '#e67e22';
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 40, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      ctx.fillStyle = '#7f8c8d';
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 30, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke();

      if (i === session.currentIndex) {
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2); ctx.fill();
      }
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 15px Arial';
    const labelText = slot ? slot.role : `SLOT #${i + 1}`;
    ctx.fillText(labelText, pos.x, pos.y + 65);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px Arial';
    const nameText = slot ? slot.name : 'Unassigned';
    ctx.fillText(nameText, pos.x, pos.y + 85);
  }

  const file = new AttachmentBuilder(canvas.toBuffer(), { name: 'pitch.png' });
  const row = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId('pick')
      .setPlaceholder(`👉 Select player for: ${session.currentIndex === 0 ? 'GK' : `POS #${session.currentIndex + 1}`}`)
  );

  const payload = { 
    content: `🏟️ **Newcastle Tactical Pitch Setup Console**\nProgress: (**${session.currentIndex} / ${session.total}**) roles allocated. Select players below:`, 
    files: [file], 
    components: [row] 
  };

  if (isEdit) {
    return interaction.update(payload);
  } else {
    return interaction.editReply(payload);
  }
}

// FINAL PASSTHROUGH COMPILATION PUBLIC ENGINE
async function finishLineup(interaction, msgId) {
  const session = activeSessions.get(msgId);
  if (!session) return;
  
  await interaction.deferUpdate();

  const width = 800; 
  const height = 1000;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#27ae60'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#219653'; 
  for (let i = 0; i < height; i += 200) { ctx.fillRect(0, i, width, 100); }
  
  // Markings
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.strokeRect(40, 40, width - 80, height - 80);
  ctx.beginPath(); ctx.moveTo(40, height / 2); ctx.lineTo(width - 40, height / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(width / 2, height / 2, 90, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeRect(width / 2 - 180, height - 200, 360, 160); ctx.strokeRect(width / 2 - 180, 40, 360, 160);

  const coords = [{ x: width / 2, y: height - 100 }];
  if (session.total > 1) {
    const outfieldCount = session.total - 1;
    let rows = outfieldCount > 7 ? 3 : (outfieldCount > 3 ? 2 : 1);
    const playersPerRow = Math.ceil(outfieldCount / rows);
    let assignedCount = 0;

    for (let r = 0; r < rows; r++) {
      const rowY = (height - 280) - (r * (height - 480) / rows);
      const countInThisRow = Math.min(playersPerRow, outfieldCount - assignedCount);

      for (let p = 0; p < countInThisRow; p++) {
        const rowX = (width / (countInThisRow + 1)) * (p + 1);
        coords.push({ x: rowX, y: rowY });
        assignedCount++;
      }
    }
  }

  // Draw players on the final clean canvas wrap pass
  for (let i = 0; i < session.total; i++) {
    const slot = session.roster[i];
    const pos = coords[i] || { x: width / 2, y: height / 2 };

    if (slot) {
      try {
        const img = await loadImage(slot.avatar);
        ctx.save();
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 40, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(img, pos.x - 40, pos.y - 40, 80, 80);
        ctx.restore();
        
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 40, 0, Math.PI * 2); ctx.stroke();
      } catch (err) {
        ctx.fillStyle = '#e67e22';
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 40, 0, Math.PI * 2); ctx.fill();
      }
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 15px Arial';
    ctx.fillText(slot ? slot.role : `SLOT #${i + 1}`, pos.x, pos.y + 65);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px Arial';
    ctx.fillText(slot ? slot.name : 'Unassigned', pos.x, pos.y + 85);
  }

  const finalBuffer = canvas.toBuffer();
  const finalAttachment = new AttachmentBuilder(finalBuffer, { name: 'finalized-squad-lineup.png' });

  const destinationEmbed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('📋 Squad Lineup Finalized (' + session.total + 'v' + session.total + ')')
    .setDescription('The sequential custom lineup compilation phase has finished.')
    .setImage('attachment://finalized-squad-lineup.png');

  session.roster.forEach((slot) => {
    destinationEmbed.addFields({ name: 'Position: ' + slot.role, value: '👤 **' + slot.name + '**', inline: true });
  });

  try {
    // Delivers the final card straight to your dedicated logs channel
    const targetChannel = await client.channels.fetch('1542615988963385403');
