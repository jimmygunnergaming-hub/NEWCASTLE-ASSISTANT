const http = require('http'); 
const { createCanvas, loadImage } = require('canvas');
const { Client, GatewayIntentBits, SlashCommandBuilder, ActionRowBuilder, UserSelectMenuBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, EmbedBuilder } = require('discord.js');

// 1. LIGHTWEIGHT PORT LISTENER (Satisfies web hosting health checks)
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Newcastle Arena Active');
}).listen(process.env.PORT || 3000);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const activeSessions = new Map();

client.once('ready', () => {
  console.log('Bot connection validated successfully!');
  const command = new SlashCommandBuilder()
    .setName('lineup')
    .setDescription('Build a custom graphical football field lineup layout')
    .addIntegerOption(opt => opt.setName('size').setDescription('Number of players (1-11)').setRequired(true).setMinValue(1).setMaxValue(11));
  client.application.commands.create(command);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isUserSelectMenu()) return;

  // SECURITY AUTHORIZATION GATE
  if (interaction.isButton() || interaction.isUserSelectMenu()) {
    const customId = interaction.customId;
    const msgId = customId.split('-').pop();
    const session = activeSessions.get(msgId);
    if (session && session.creatorId !== interaction.user.id) {
      return interaction.reply({ content: '❌ Only the coach who started this lineup command can modify nodes.', ephemeral: true });
    }
  }

  // FLOW 1: SLASH COMMAND INITIALIZATION
  if (interaction.isChatInputCommand() && interaction.commandName === 'lineup') {
    const size = interaction.options.getInteger('size');
    
    await interaction.deferReply({ ephemeral: true });
    const msg = await interaction.fetchReply();
    
    // Distribute base starter nodes down the pitch grid layout
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
      channelId: interaction.channelId,
      total: size, 
      activeSlotIdx: 0,
      roster: roster
    });
    
    return renderFieldGraphic(interaction, msg.id, false);
  }

  // FLOW 2: NUDGE BUTTON CLICKED (Up, Down, Left, Right movement controls)
  if (interaction.isButton() && (interaction.customId.startsWith('up-') || interaction.customId.startsWith('down-') || interaction.customId.startsWith('left-') || interaction.customId.startsWith('right-'))) {
    const customId = interaction.customId;
    const parts = customId.split('-');
    
    // SAFE PARSING EXTRACTION (Bypasses markdown truncation completely)
    const commandType = parts.at(0); 
    const targetIdx = parseInt(parts.at(1)); 
    const msgId = parts.at(2); 
    
    const session = activeSessions.get(msgId);
    if (!session) return;

    let deltaX = 0;
    let deltaY = 0;
    if (commandType === 'up') deltaY = -5;
    if (commandType === 'down') deltaY = 5;
    if (commandType === 'left') deltaX = -6;
    if (commandType === 'right') deltaX = 6;

    let x = session.roster[targetIdx].pctX + deltaX;
    let y = session.roster[targetIdx].pctY + deltaY;

    // Constrain position updates safely inside the field margins
    session.roster[targetIdx].pctX = Math.max(5, Math.min(95, x));
    session.roster[targetIdx].pctY = Math.max(3, Math.min(96, y));

    await interaction.deferUpdate();
    return renderFieldGraphic(interaction, msgId, false);
  }

  // FLOW 3: SELECTION DROPDOWN SLOT CHOSEN
  if (interaction.isUserSelectMenu() && interaction.customId.startsWith('pick-')) {
    const customId = interaction.customId;
    const msgId = customId.split('-').pop();
    const session = activeSessions.get(msgId);
    if (!session) return;

    const chosenUser = interaction.users.first();
    if (!chosenUser) return interaction.reply({ content: '❌ Player selection extraction failed.', ephemeral: true });

    // Update active user properties inside data session memory maps
    session.roster[session.activeSlotIdx].name = chosenUser.username;
    session.roster[session.activeSlotIdx].avatar = chosenUser.displayAvatarURL({ extension: 'png', size: 128 });

    // Step current position index forward linearly or wrap around
    session.activeSlotIdx = (session.activeSlotIdx + 1) % session.total;

    await interaction.deferUpdate();
    return renderFieldGraphic(interaction, msgId, false);
  }

  // FLOW 4: ACTIVE TARGET NODE ROTATION CLICKED
  if (interaction.isButton() && interaction.customId.startsWith('target-')) {
    const customId = interaction.customId;
    const parts = customId.split('-');
    
    // SAFE PARSING EXTRACTION (Bypasses markdown truncation completely)
    const targetIdx = parseInt(parts.at(1)); 
    const msgId = parts.at(2); 
    
    const session = activeSessions.get(msgId);
    if (!session) return;

    session.activeSlotIdx = targetIdx;

    await interaction.deferUpdate();
    return renderFieldGraphic(interaction, msgId, false);
  }

  // FLOW 5: LOCK & PUBLICLY PUBLISH TEAM SHEET EMBED
  if (interaction.isButton() && interaction.customId.startsWith('confirm-')) {
    const customId = interaction.customId;
    const msgId = customId.split('-').pop();
    const session = activeSessions.get(msgId);
    if (!session) return;

    await interaction.deferUpdate();

    const finalBuffer = await buildCanvasBuffer(session);
    const finalAttachment = new AttachmentBuilder(finalBuffer, { name: 'finalized-team-roster.png' });

    const destinationEmbed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`📋 Squad Lineup Finalized (${session.total}v${session.total})`)
      .setDescription('The customized tactical system build is complete. Final roster sheet details displayed below:')
      .setImage('attachment://finalized-team-roster.png');

    session.roster.forEach((slot) => {
      if (slot.name !== 'Unassigned') {
        destinationEmbed.addFields({ name: `Position: ${slot.role}`, value: `👤 **${slot.name}**`, inline: true });
      }
    });

    try {
      const targetChannel = await client.channels.fetch('1542615988963385403');
      await targetChannel.send({ 
        content: `✅ **Lineup successfully locked and published by <@${session.creatorId}>!**`, 
        embeds: [destinationEmbed],
        files: [finalAttachment] 
      });
    } catch (err) { console.error('Discord routing delivery error:', err); }

    await interaction.editReply({ content: '🔒 **Lineup completed and locked!** Sent directly to logs channel.', components: [], files: [] });
    return activeSessions.delete(msgId);
  }
});

// INTERACTIVE COMPONENT LAYER GRAPHIC INTERFACE MODULE
async function renderFieldGraphic(interaction, msgId, isFollowUp) {
  const session = activeSessions.get(msgId);
  if (!session) return;

  const canvasBuffer = await buildCanvasBuffer(session);
  const attachment = new AttachmentBuilder(canvasBuffer, { name: 'tactical-field.png' });
  const activeSlot = session.roster[session.activeSlotIdx];

  // Component Row 1: The player target distribution select option menu
  const menuRow = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`pick-${msgId}`)
      .setPlaceholder(`👉 Select player for Target: ${activeSlot.role}`)
  );

  // Component Row 2: Target index cycle switch button row selector (Slices up to 5 buttons max to follow Discord limits)
  const navRow = new ActionRowBuilder();
  const maxButtons = Math.min(5, session.total);
  for (let i = 0; i < maxButtons; i++) {
    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`target-${i}-${msgId}`)
        .setLabel(session.roster[i].role)
        .setStyle(i === session.activeSlotIdx ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
  }

  // Component Row 3: Nudge direction movement pad configurations
  const controlPadRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`left-${session.activeSlotIdx}-${msgId}`).setLabel('◀ Move Left').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`up-${session.activeSlotIdx}-${msgId}`).setLabel('▲ Move Up').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`down-${session.activeSlotIdx}-${msgId}`).setLabel('▼ Move Down').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`right-${session.activeSlotIdx}-${msgId}`).setLabel('▶ Move Right').setStyle(ButtonStyle.Secondary)
  );

  // Component Row 4: Final confirmation publish submission row button
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`confirm-${msgId}`).setLabel('🔒 Lock & Publish Final Lineup').setStyle(ButtonStyle.Primary)
  );

  const payload = {
    content: `🏟️ **Newcastle Tactical Pitch Setup Console (${session.total}v${session.total})**\nCurrently Editing: **[${activeSlot.role}]** (Assigned: ${activeSlot.name})\n\nUse the direction buttons below to nudge this position element across the pitch layout framework.`,
    files: [attachment],
    components: [menuRow, navRow, controlPadRow, actionRow]
  };

  if (isFollowUp) {
    return interaction.followUp({ ...payload, ephemeral: true });
  } else {
    return interaction.editReply(payload);
  }
}

// GRAPHICS ENGINE COMPILATION CORE MODULE
async function buildCanvasBuffer(session) {
  const width = 900; const height = 1150; 
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Pitch Background Paint Stripes
  ctx.fillStyle = '#27ae60'; ctx.fillRect(0, 0, width, height);
