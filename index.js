const http = require('http'); 
const { createCanvas, loadImage } = require('canvas');
const { Client, GatewayIntentBits, SlashCommandBuilder, ActionRowBuilder, UserSelectMenuBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, EmbedBuilder } = require('discord.js');

// Lightweight port listener to satisfy Render's web traffic health check rules
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
  if (!interaction.isChatInputCommand() && !interaction.isUserSelectMenu() && !interaction.isButton()) return;

  // 1. EXTRACT MSG ID SAFELY VIA LAST INDEX OF AN UNDERSCORE (Prevents array split errors)
  let msgId = '';
  if (interaction.isUserSelectMenu() || interaction.isButton()) {
    const cid = interaction.customId;
    msgId = cid.substring(cid.lastIndexOf('_') + 1);
    
    const session = activeSessions.get(msgId);
    if (session && session.creatorId !== interaction.user.id) {
      return interaction.reply({ content: '❌ Only the coach who started this command can modify player slots.', ephemeral: true });
    }
  }

  // 2. SLASH COMMAND INITIALIZATION
  if (interaction.isChatInputCommand() && interaction.commandName === 'lineup') {
    const size = interaction.options.getInteger('size');
    
    const msg = await interaction.reply({ content: '🏟️ Initializing high-quality pitch layout...', fetchReply: true });
    
    const baseRoster = Array.from({ length: size }, (_, i) => ({
      index: i,
      name: 'Unassigned',
      role: i === 0 ? 'GK' : `POS #${i + 1}`,
      avatar: '',
      offsetX: 0, 
      offsetY: 0  
    }));

    activeSessions.set(msg.id, { 
      creatorId: interaction.user.id, 
      total: size, 
      currentIndex: 0, 
      roster: baseRoster
    });
    
    return generatePitch(interaction, msg.id, false);
  }

  // 3. NUDGE ARROW INTERACTIVE CONTROLS
  if (interaction.isButton() && (interaction.customId.startsWith('up_') || interaction.customId.startsWith('down_') || interaction.customId.startsWith('left_') || interaction.customId.startsWith('right_'))) {
    const session = activeSessions.get(msgId);
    if (!session) return;

    const cid = interaction.customId;
    // Extract everything up to the first underscore to get the correct movement type
    const direction = cid.substring(0, cid.indexOf('_'));

    const activeTarget = session.roster[session.currentIndex];
    if (!activeTarget) return;

    if (direction === 'up') activeTarget.offsetY -= 25;
    if (direction === 'down') activeTarget.offsetY += 25;
    if (direction === 'left') activeTarget.offsetX -= 25;
    if (direction === 'right') activeTarget.offsetX += 25;

    await interaction.deferUpdate();
    return generatePitch(interaction, msgId, true);
  }

  // 4. PLAYER REPETITIVE SELECTION DROPDOWN HANDLER
  if (interaction.isUserSelectMenu() && interaction.customId.startsWith('pick_')) {
    const session = activeSessions.get(msgId);
    if (!session) return;

    const user = interaction.users.first();
    if (!user) return interaction.reply({ content: '❌ Failed to read user choice properly.', ephemeral: true });

    const positionTag = session.currentIndex === 0 ? 'GK' : `POS #${session.currentIndex + 1}`;

    session.roster[session.currentIndex].name = user.username;
    session.roster[session.currentIndex].role = positionTag;
    session.roster[session.currentIndex].avatar = user.displayAvatarURL({ extension: 'png', size: 256 });

    session.currentIndex++;

    if (session.currentIndex >= session.total) {
      return finishLineup(interaction, msgId);
    } else {
      await interaction.deferUpdate();
      return generatePitch(interaction, msgId, true);
    }
  }
});

// INTERACTIVE CANVAS GRAPHICS WORKSPACE GENERATOR
async function generatePitch(interaction, msgId, isEdit) {
  const session = activeSessions.get(msgId);
  if (!session) return;
  
  const width = 800;
  const height = 1000;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#27ae60'; ctx.fillRect(0, 0, width, height);

  // Stripe Panels
  ctx.fillStyle = '#219653';
  for (let i = 0; i < height; i += 200) { ctx.fillRect(0, i, width, 100); }

  // Field Markings
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6;
  ctx.strokeRect(40, 40, width - 80, height - 80);
  ctx.beginPath(); ctx.moveTo(40, height / 2); ctx.lineTo(width - 40, height / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(width / 2, height / 2, 90, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeRect(width / 2 - 180, height - 200, 360, 160); ctx.strokeRect(width / 2 - 180, 40, 360, 160);

  // Auto Grid Distribution
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

  // Draw Nodes
  for (let i = 0; i < session.total; i++) {
    const slot = session.roster[i];
    const basePos = coords[i] || { x: width / 2, y: height / 2 };
    
    const pos = {
      x: basePos.x + slot.offsetX,
      y: basePos.y + slot.offsetY
    };

    if (slot.avatar !== '') {
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
    ctx.fillText(slot.name !== 'Unassigned' ? slot.role : `SLOT #${i + 1}`, pos.x, pos.y + 65);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px Arial';
    ctx.fillText(slot.name, pos.x, pos.y + 85);
  }

  const file = new AttachmentBuilder(canvas.toBuffer(), { name: 'pitch.png' });
  
  const menuRow = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`pick_${msgId}`)
      .setPlaceholder(`👉 Select player for: ${session.currentIndex === 0 ? 'GK' : `POS #${session.currentIndex + 1}`}`)
  );

  const padRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`left_${msgId}`).setLabel('◀ Left').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`up_${msgId}`).setLabel('▲ Up').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`down_${msgId}`).setLabel('▼ Down').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`right_${msgId}`).setLabel('▶ Right').setStyle(ButtonStyle.Secondary)
  );

  const payload = { 
    content: `🏟️ **Newcastle Tactical Pitch Setup Console**\nProgress: (**${session.currentIndex} / ${session.total}**) roles allocated. Select players below:`, 
    files: [file], 
    components: [menuRow, padRow] 
  };

  if (isEdit) {
    return interaction.editReply(payload);
  } else {
    return interaction.editReply(payload);
  }
}

// COMPLETE PASS FOR LOCKING AND LOGGING SHEET MAPS PUBLICLY
async function finishLineup(interaction, msgId) {
  const session = activeSessions.get(msgId);
  if (!session) return;

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
  if (session.total > 1) {
    const outfieldCount = session.total - 1;
    let rows = outfieldCount > 7 ? 3 : (outfieldCount > 3 ? 2 : 1);
    const playersPerRow = Math.ceil(outfieldCount / rows);
    let assignedCount = 0;

    for (let r = 0; r < rows; r++) {
      const rowY = (height - 280) - (r * (height - 480) / rows);
