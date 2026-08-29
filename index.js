const http = require('http'); 
const { createCanvas, loadImage } = require('canvas');
const { 
  Client, 
  GatewayIntentBits, 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  UserSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  EmbedBuilder 
} = require('discord.js');

// -------------------------------------------------------------
// SECURE PORT HANDLER TO KEEP RENDER RUNNING FOR FREE
// -------------------------------------------------------------
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Newcastle Image Canvas Engine Online');
}).listen(process.env.PORT || 3000);

const client = new Client({ 
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] 
});

const activeSessions = new Map();

client.once('ready', () => {
  console.log(`Bot connection validated successfully! Authorized as ${client.user.tag}`);

  const sizeChoices = [];
  for (let i = 1; i <= 11; i++) {
    sizeChoices.push({ name: `${i}v${i} Layout Size`, value: i });
  }

  const baseCommand = new SlashCommandBuilder()
    .setName('lineup')
    .setDescription('Build a real graphical football field lineup layout directly in chat')
    .addIntegerOption(option => 
      option.setName('size')
        .setDescription('Number of people on the team (1-11)')
        .setRequired(true)
        .addChoices(...sizeChoices));

  client.application.commands.create(baseCommand);
});

client.on('interactionCreate', async interaction => {
  // Security validation check
  if (interaction.isButton() || interaction.isUserSelectMenu()) {
    const session = activeSessions.get(interaction.message.id);
    if (session && session.creatorId !== interaction.user.id) {
      return interaction.reply({ 
        content: '❌ Only the coach who started this lineup command can add players.', 
        ephemeral: true 
      });
    }
  }

  // 1. SLASH COMMAND INVOCATION
  if (interaction.isChatInputCommand() && interaction.commandName === 'lineup') {
    const totalPlayers = interaction.options.getInteger('size');
    
    const msg = await interaction.reply({
      content: `🏟️ **Initializing your ${totalPlayers}v${totalPlayers} Graphical Pitch...** Please wait a few seconds for the field layout to build.`,
      fetchReply: true
    });

    activeSessions.set(msg.id, {
      creatorId: interaction.user.id,
      channelId: interaction.channelId,
      total: totalPlayers,
      currentIndex: 0,
      roster: []
    });
    
    return generatePitchImage(interaction, msg.id, false);
  }

  // 2. DROPDOWN PLAYER SELECTION HANDLER
  if (interaction.isUserSelectMenu() && interaction.customId === 'native_player_picker') {
    const msgId = interaction.message.id;
    const session = activeSessions.get(msgId);
    if (!session) return;

    const chosenUser = interaction.users.first();
    const positionTag = session.currentIndex === 0 ? 'GK' : `POS #${session.currentIndex + 1}`;

    session.roster.push({
      id: chosenUser.id,
      name: chosenUser.username,
      role: positionTag,
      avatar: chosenUser.displayAvatarURL({ extension: 'png', size: 128 })
    });

    session.currentIndex++;

    // Check if configuration loops match requested count total limits
    if (session.currentIndex >= session.total) {
      return publishFinalLineup(interaction, msgId);
    } else {
      return generatePitchImage(interaction, msgId, true);
    }
  }

  // 3. MANUAL CANCEL INTERACTION BUTTON
  if (interaction.isButton() && interaction.customId === 'cancel_lineup') {
    activeSessions.delete(interaction.message.id);
    return interaction.update({ content: '❌ Lineup builder session closed and cancelled.', files: [], components: [] });
  }
});

// -------------------------------------------------------------
// GRAPHICAL RENDERING ENGINE (PITCH + PROPIX DRAWING)
// -------------------------------------------------------------
async function generatePitchImage(interaction, msgId, isEditStep) {
  const session = activeSessions.get(msgId);

  // Set up standard high-res canvas sizes
  const width = 600;
  const height = 800;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Draw Realistic Green Football Pitch Background
  ctx.fillStyle = '#27ae60'; 
  ctx.fillRect(0, 0, width, height);

  // Draw Darker Striped Cut Grass Panels
  ctx.fillStyle = '#219653';
  for (let i = 0; i < height; i += 160) {
    ctx.fillRect(0, i, width, 80);
  }

  // Draw Pitch White Line Markings
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.strokeRect(30, 30, width - 60, height - 60); // Boundaries
  
  // Midfield Line
  ctx.beginPath();
  ctx.moveTo(30, height / 2);
  ctx.lineTo(width - 30, height / 2);
  ctx.stroke();

  // Penalty Boxes
  ctx.strokeRect(width / 2 - 140, height - 160, 280, 130);
  ctx.strokeRect(width / 2 - 140, 30, 280, 130);

  // Center Circle
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 75, 0, Math.PI * 2);
  ctx.stroke();

  // DYNAMICALLY DISTRIBUTE TEAM COORDINATES (1 to 11)
  const coords = [];
  coords.push({ x: width / 2, y: height - 80 }); // Always lock Goalkeeper at bottom base line

  if (session.total > 1) {
    const outfieldCount = session.total - 1;
    let rows = 1;
    if (outfieldCount > 3) rows = 2;
    if (outfieldCount > 7) rows = 3;

    const playersPerRow = Math.ceil(outfieldCount / rows);
    let assignedCount = 0;

    for (let r = 0; r < rows; r++) {
      const rowY = (height - 220) - (r * (height - 380) / rows);
      const countInThisRow = Math.min(playersPerRow, outfieldCount - assignedCount);

      for (let p = 0; p < countInThisRow; p++) {
        const rowX = (width / (countInThisRow + 1)) * (p + 1);
        coords.push({ x: rowX, y: rowY });
        assignedCount++;
      }
    }
  }

  // RENDER CURRENT ROSTER IMAGES ONTO CANVAS
  for (let i = 0; i < session.total; i++) {
    const slot = session.roster[i];
    const pos = coords[i];

    if (slot) {
      // Draw Real Discord User Profile Picture Avatar inside a clean circular clip bubble
      try {
        const pfpImg = await loadImage(slot.avatar);
        ctx.save();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 32, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(pfpImg, pos.x - 32, pos.y - 32, 64, 64);
        ctx.restore();
      } catch (err) {
        ctx.fillStyle = '#e67e22';
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 32, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      // Draw Requested Grey Interactive Circle Placeholder Dot
      ctx.fillStyle = '#7f8c8d'; 
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 25, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();

      // If this is the node currently active and awaiting placement, color tag it yellow
      if (i === session.currentIndex) {
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Paint labels underneath circles
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    
    const labelText = slot ? slot.role : `SLOT #${i + 1}`;
    const nameText = slot ? slot.name : 'Unassigned';
    
    ctx.fillText(labelText, pos.x, pos.y + 50);
    ctx.fillStyle = slot ? '#f1c40f' : 'rgba(255,255,255,0.6)';
    ctx.font = '11px Arial';
    ctx.fillText(nameText, pos.x, pos.y + 65);
  }

  // Compile image to standard buffer format pipeline streams
  const fileAttachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'live-pitch-lineup.png' });

  // Native User selector menu layout dropdown block
  const nextSlotLabel = session.currentIndex === 0 ? 'Goalkeeper (GK)' : `Outfield Slot Node #${session.currentIndex + 1}`;
  const userSelectMenu = new UserSelectMenuBuilder()
    .setCustomId('native_player_picker')
    .setPlaceholder(`👉 Select person to assign to: ${nextSlotLabel}`);

  const actionRow = new ActionRowBuilder().addComponents(userSelectMenu);
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cancel_lineup').setLabel('❌ Cancel Suffix').setStyle(ButtonStyle.Danger)
  );

  const responsePayload = {
    content: `🏟️ **Newcastle Interactive Pitch Assembly Console**\nActive Progress: (**${session.currentIndex} / ${session.total}**) assigned. Use the dropdown roster selection menu below to choose your players!`,
    files: [fileAttachment],
    components: [actionRow, buttonRow]
  };

  if (isEditStep) {
    await interaction.update(responsePayload);
  } else {
    await interaction.editReply(responsePayload);
  }
}

// -------------------------------------------------------------
// CONFIRM AND FINISH LINEUP DISPATCH CHANNELS LOG ROUTER
// -------------------------------------------------------------
async function publishFinalLineup(interaction, msgId) {
  const session = activeSessions.get(msgId);

  // Redraw final field layout canvas once loop assignments finish 
  const width = 600; const height = 800;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#27ae60'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#219653'; for (let i = 0; i < height; i += 160) { ctx.fillRect(0, i, width, 80); }
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.strokeRect(30, 30, width - 60, height - 60);
  ctx.beginPath(); ctx.moveTo(30, height / 2); ctx.lineTo(width - 30, height / 2); ctx.stroke();
  ctx.strokeRect(width / 2 - 140, height - 160, 280, 130); ctx.strokeRect(width / 2 - 140, 30, 280, 130);
  ctx.beginPath(); ctx.arc(width / 2, height / 2, 75, 0, Math.PI * 2); ctx.stroke();

  const coords = [{ x: width / 2, y: height - 80 }];
  const outfieldCount = session.total - 1;
  let rows = outfieldCount > 7 ? 3 : (outfieldCount > 3 ? 2 : 1);
  const playersPerRow = Math.ceil(outfieldCount / rows);
  let assignedCount = 0;

