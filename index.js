const http = require('http'); 
const { createCanvas, loadImage } = require('canvas');
const { Client, GatewayIntentBits, SlashCommandBuilder, ActionRowBuilder, UserSelectMenuBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, EmbedBuilder } = require('discord.js');

// Lightweight port listener to keep Render happy and free
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

  if (interaction.isChatInputCommand() && interaction.commandName === 'lineup') {
    const size = interaction.options.getInteger('size');
    
    // Defer the reply to give the heavy canvas engine a few seconds to render
    const msg = await interaction.reply({ content: '🏟️ Initializing high-quality pitch layout...', fetchReply: true });
    
    activeSessions.set(msg.id, { 
      creatorId: interaction.user.id, 
      total: size, 
      currentIndex: 0, 
      roster: [] 
    });
    
    return generatePitch(interaction, msg.id, false);
  }

  if (interaction.isUserSelectMenu() && interaction.customId === 'pick') {
    const session = activeSessions.get(interaction.message.id);
    if (!session || session.creatorId !== interaction.user.id) {
      return interaction.reply({ content: '❌ Only the coach who started this command can pick players.', ephemeral: true });
    }

    const user = interaction.users.first();
    const positionTag = session.currentIndex === 0 ? 'GK' : `POS #${session.currentIndex + 1}`;

    session.roster.push({ 
      name: user.username, 
      role: positionTag,
      avatar: user.displayAvatarURL({ extension: 'png', size: 256 }) // High-resolution avatars
    });

    session.currentIndex++;

    if (session.currentIndex >= session.total) {
      return finishLineup(interaction, interaction.message.id);
    } else {
      return generatePitch(interaction, interaction.message.id, true);
    }
  }
});

async function generatePitch(interaction, msgId, isEdit) {
  const session = activeSessions.get(msgId);
  
  // High-Quality Canvas Dimensions
  const width = 800;
  const height = 1000;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Draw Realistic Vibrant Green Pitch Background
  ctx.fillStyle = '#27ae60';
  ctx.fillRect(0, 0, width, height);

  // Draw Alternating Grass Panels
  ctx.fillStyle = '#219653';
  for (let i = 0; i < height; i += 200) {
    ctx.fillRect(0, i, width, 100);
  }

  // Draw Field Markings
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.strokeRect(40, 40, width - 80, height - 80); // Field outline
  
  // Midfield Line
  ctx.beginPath(); ctx.moveTo(40, height / 2); ctx.lineTo(width - 40, height / 2); ctx.stroke();
  
  // Center Circle
  ctx.beginPath(); ctx.arc(width / 2, height / 2, 90, 0, Math.PI * 2); ctx.stroke();

  // Penalty Boxes
  ctx.strokeRect(width / 2 - 180, height - 200, 360, 160);
  ctx.strokeRect(width / 2 - 180, 40, 360, 160);

  // Dynamic Layout Coordinate Generation
  const coords = [];
  coords.push({ x: width / 2, y: height - 100 }); // Lock Goalkeeper at bottom base line

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
    const pos = coords[i];

    if (slot) {
      // Draw User Avatar Picture Inside Circle
      try {
        const img = await loadImage(slot.avatar);
        ctx.save();
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 40, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(img, pos.x - 40, pos.y - 40, 80, 80);
        ctx.restore();
        
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 40, 0, Math.PI * 2); ctx.stroke();
      } catch (err) {
        ctx.fillStyle = '#e67e22';
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 40, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      // Draw Placeholder Grey Circle Dot
      ctx.fillStyle = '#7f8c8d';
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 30, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Color active pick indicator gold
      if (i === session.currentIndex) {
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Paint Text Labels Underneath
    ctx.textAlign = 'center';
    
    // 1. Position Name Tag First
    ctx.fillStyle = '#f1c40f'; // Gold text layout for position
    ctx.font = 'bold 15px Arial';
    const labelText = slot ? slot.role : `SLOT #${i + 1}`;
    ctx.fillText(labelText, pos.x, pos.y + 65);
    
    // 2. Player Username Tag Directly Below
    ctx.fillStyle = '#ffffff'; // White text layout for username
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

async function finishLineup(interaction, msgId) {
  const session = activeSessions.get(msgId);
  
  // Final image generation compilation pass
  const width = 800; const height = 1000;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#27ae60'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#219653'; for (let i = 0; i < height; i += 200) { ctx.fillRect(0, i, width, 100); }
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.strokeRect(40, 40, width - 80, height - 80);
  ctx.beginPath(); ctx.moveTo(40, height / 2); ctx.lineTo(width - 40, height / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(width / 2, height / 2, 90, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeRect(width / 2 - 180, height - 200, 360, 160); ctx.strokeRect(width / 2 - 180, 40, 360, 160);

  const coords = [{ x: width / 2, y: height - 100 }];
  const outfieldCount = session.total - 1;
  let rows = outfieldCount > 7 ? 3 : (outfieldCount > 3 ? 2 : 1);
  const playersPerRow = Math.ceil(outfieldCount / rows);
  let assignedCount = 0;

  for (let r = 0; r < rows; r++) {
    const rowY = (height - 280) - (r * (height - 480) / rows);
    const countInThisRow = Math.min(playersPerRow, outfieldCount - assignedCount);
    for (let p = 0; p < countInThisRow; p++) {
      coords.push({ x: (width / (countInThisRow + 1)) * (p + 1), y: rowY });
      assignedCount++;
    }
  }

  for (let i = 0; i < session.total; i++) {
    const slot = session.roster[i];
    const pos = coords[i];
    try {
      const img = await loadImage(slot.avatar);
      ctx.save(); ctx.beginPath(); ctx.arc(pos.x, pos.y, 40, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(img, pos.x - 40, pos.y - 40, 80, 80); ctx.restore();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(pos.x, pos.y, 40, 0, Math.PI * 2); ctx.stroke();
    } catch (e) {}
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 15px Arial';
    ctx.fillText(slot.role, pos.x, pos.y + 65);
    ctx.fillStyle = '#ffffff'; ctx.font = '13px Arial';
    ctx.fillText(slot.name, pos.x, pos.y + 85);
  }

  const finalAttachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'finalized-lineup.png' });
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`📋 Squad Lineup Finalized (${session.total}v${session.total})`)
    .setDescription('The roster selection build is complete. View the finalized layout below:')
    .setImage('attachment://finalized-team-roster.png');

  try {
    const targetChannel = await client.channels.fetch('1542615988963385403');
    await targetChannel.send({ 
      content: `✅ **Lineup locked and published by <@${session.creatorId}>!**`, 
      embeds: [embed],
      files: [finalAttachment] 
    });
  } catch (err) { console.error(err); }

  await interaction.update({ content: '🔒 **Lineup completed and locked!** Sent directly to logs.', components: [], files: [] });
  return activeSessions.delete(msgId);
}

client.login(process.env.DISCORD_TOKEN);
