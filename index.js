const http = require('http');
const { createCanvas, loadImage } = require('canvas');
const { 
  Client, 
  GatewayIntentBits, 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require('discord.js');

// -------------------------------------------------------------
// FAKE WEB SERVER TO KEEP RENDER HAPPY & FREE
// -------------------------------------------------------------
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Newcastle Lineup Image Engine Online');
}).listen(process.env.PORT || 3000);

const client = new Client({ 
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] 
});

const activeSessions = new Map();

client.once('ready', () => {
  console.log(`Bot is online as ${client.user.tag}`);

  // Create choices array for 1v1 up to 11v11
  const formatChoices = [];
  for (let i = 1; i <= 11; i++) {
    formatChoices.push({ name: `${i}v${i} Matchup`, value: i.toString() });
  }

  const command = new SlashCommandBuilder()
    .setName('lineup')
    .setDescription('Build a real graphical football field lineup layout')
    .addStringOption(option =>
      option.setName('format')
        .setDescription('Select match size format (1v1 up to 11v11)')
        .setRequired(true)
        .addChoices(...formatChoices));

  client.application.commands.create(command);
});

client.on('interactionCreate', async interaction => {
  // Security lock verification check
  if (interaction.isStringSelectMenu() || interaction.isUserSelectMenu() || interaction.isButton()) {
    const session = activeSessions.get(interaction.message.id);
    if (session && session.creatorId !== interaction.user.id) {
      return interaction.reply({ 
        content: "❌ Only the coach who started this lineup command can place players.", 
        ephemeral: true 
      });
    }
  }

  // 1. SLASH COMMAND INVOCATION
  if (interaction.isChatInputCommand() && interaction.commandName === 'lineup') {
    const totalPlayers = parseInt(interaction.options.getString('format'));

    const formationOptions = [
      { label: 'Standard Tactical Layout', value: 'Standard' },
      { label: 'Attacking Setup Grid', value: 'Attacking' },
      { label: 'Defensive Strategy Wall', value: 'Defensive' }
    ];

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`setup_${totalPlayers}`)
        .setPlaceholder('Choose a starting pitch layout...')
        .addOptions(formationOptions)
    );

    const msg = await interaction.reply({
      content: `🏟️ **Match format selected:** ${totalPlayers}v${totalPlayers}. Pick your tactical strategy:`,
      components: [row],
      fetchReply: true
    });

    // Create session tracking
    activeSessions.set(msg.id, {
      creatorId: interaction.user.id,
      total: totalPlayers,
      activeSlot: null,
      roster: Array.from({ length: totalPlayers }, (_, i) => ({
        index: i,
        posLabel: i === 0 ? 'GK' : `POS #${i + 1}`,
        assignedUser: null
      }))
    });
    return;
  }

  // 2. STRATEGY SELECTION
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('setup_')) {
    const msgId = interaction.message.id;
    return renderPitchGraphics(interaction, msgId);
  }

  // 3. SELECTION MENU INTERACTION
  if (interaction.isButton() && interaction.customId.startsWith('edit_')) {
    const msgId = interaction.message.id;
    const targetIdx = parseInt(interaction.customId.split('_')[1]);
    const session = activeSessions.get(msgId);
    if (!session) return;

    session.activeSlot = targetIdx;

    const userSelect = new UserSelectMenuBuilder()
      .setCustomId('assign_member')
      .setPlaceholder(`Pick a player for position: ${session.roster[targetIdx].posLabel}`);

    return interaction.update({
      content: `⚙️ **Modifying Slot:** *${session.roster[targetIdx].posLabel}*\nSelect a member from your server list roster dropdown menu below.`,
      components: [new ActionRowBuilder().addComponents(userSelect)]
    });
  }

  // 4. CHOOSE MEMBER AND REPAINT IMAGE
  if (interaction.isUserSelectMenu() && interaction.customId === 'assign_member') {
    const msgId = interaction.message.id;
    const session = activeSessions.get(msgId);
    if (!session) return;

    const targetUser = interaction.users.first();
    session.roster[session.activeSlot].assignedUser = {
      name: targetUser.username,
      avatar: targetUser.displayAvatarURL({ extension: 'png', size: 128 })
    };

    return renderPitchGraphics(interaction, msgId);
  }
});

// -------------------------------------------------------------
// GRAPHICAL RENDERING ENGINE (PITCH + PROPIX DRAWING)
// -------------------------------------------------------------
async function renderPitchGraphics(interaction, msgId) {
  const session = activeSessions.get(msgId);
  
  // Set up standard canvas size
  const width = 600;
  const height = 800;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Draw Football Pitch Background
  ctx.fillStyle = '#228B22'; // Forest Grass Green
  ctx.fillRect(0, 0, width, height);

  // Draw Pitch Line Markings
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.strokeRect(20, 20, width - 40, height - 40); // Field Outer Boundaries
  
  // Midfield Line
  ctx.beginPath();
  ctx.moveTo(20, height / 2);
  ctx.lineTo(width - 20, height / 2);
  ctx.stroke();

  // Penalty Box (Bottom Team area)
  ctx.strokeRect(width / 2 - 120, height - 150, 240, 130);
  // Penalty Box (Top Team area)
  ctx.strokeRect(width / 2 - 120, 20, 240, 130);

  // Draw Center Circle
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 70, 0, Math.PI * 2);
  ctx.stroke();

  // DYNAMICALLY GENERATE PLAYER POSITION GRID COORDINATES (1 to 11)
  const total = session.total;
  const coords = [];

  // Always enforce goalkeeper coordinate layout positioning at bottom base line
  coords.push({ x: width / 2, y: height - 70 });

  if (total > 1) {
    const fieldPlayersCount = total - 1;
    // Split remaining elements evenly into vertical horizontal coordinate row tiers
    let rows = 1;
    if (fieldPlayersCount > 3) rows = 2;
    if (fieldPlayersCount > 7) rows = 3;

    const playersPerRow = Math.ceil(fieldPlayersCount / rows);
    let assignedCount = 0;

    for (let r = 0; r < rows; r++) {
      // Determine vertical heights row step tier placements
      const rowY = (height - 200) - (r * (height - 350) / rows);
      const countInThisRow = Math.min(playersPerRow, fieldPlayersCount - assignedCount);

      for (let p = 0; p < countInThisRow; p++) {
        const rowX = (width / (countInThisRow + 1)) * (p + 1);
        coords.push({ x: rowX, y: rowY });
        assignedCount++;
      }
    }
  }

  // DRAW THE GREY CIRCLES / PROFILE PICTURES ONTO CANVAS PITCH
  for (let i = 0; i < total; i++) {
    const currentSlot = session.roster[i];
    const pos = coords[i];

    if (currentSlot.assignedUser) {
      // Draw User Profile Pic inside a clean clipping bubble circle
      try {
        const img = await loadImage(currentSlot.assignedUser.avatar);
        ctx.save();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 30, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, pos.x - 30, pos.y - 30, 60, 60);
        ctx.restore();
      } catch (e) {
        // Fallback drawing if avatar parsing encounters a network glitch
        ctx.fillStyle = '#1abc9c';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 30, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Draw the Requested Interactive Empty Position Grey Circle Dot
      ctx.fillStyle = '#7f8c8d'; // Grey Dot
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 25, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Paint Position Name & Assignment Data Labels Underneath
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    
    const displayName = currentSlot.assignedUser ? currentSlot.assignedUser.name : 'Empty';
    ctx.fillText(currentSlot.posLabel, pos.x, pos.y + 45);
    
    ctx.fillStyle = '#f1c40f'; // Gold text layout coloring layer for usernames
    ctx.font = '12px Arial';
    ctx.fillText(displayName, pos.x, pos.y + 60);
  }

  // Package layout file into standard discord attachments buffer pipeline streams
  const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'pitch-lineup.png' });

  // Generate dynamic button mapping rows to let users select slots directly
  const row1 = new ActionRowBuilder();
  const row2 = new ActionRowBuilder();

  session.roster.forEach((slot, index) => {
    const btn = new ButtonBuilder()
      .setCustomId(`edit_${index}`)
      .setLabel(slot.posLabel)
      .setStyle(slot.assignedUser ? ButtonStyle.Success : ButtonStyle.Secondary);

    if (index < 5) row1.addComponents(btn);
    else if (index < 10) row2.addComponents(btn);
  });

  const componentsArray = [];
  if (row1.components.length > 0) componentsArray.push(row1);
  if (row2.components.length > 0) componentsArray.push(row2);

  const payload = {
    content: `📋 **Pitch Lineup Builder Console Panel**\nClick a matching button position name block to select who you want to transfer into that coordinate slot space.`,
    files: [attachment],
    components: componentsArray
  };

  if (interaction.replied || interaction.deferred) {
    await interaction.update(payload);
  } else {
    await interaction.reply(payload);
  }
}

client.login(process.env.DISCORD_TOKEN);
