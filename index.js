const http = require('http'); 
const { createCanvas, loadImage } = require('canvas');
const { Client, GatewayIntentBits, SlashCommandBuilder, ActionRowBuilder, UserSelectMenuBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, EmbedBuilder } = require('discord.js');

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
    .setDescription('Build a fully custom football lineup layout')
    .addIntegerOption(opt => opt.setName('size').setDescription('Squad match size format (1 up to 11)').setRequired(true).setMinValue(1).setMaxValue(11));
  client.application.commands.create(command);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isUserSelectMenu()) return;

  // SECURITY AUTHORIZATION CHECK
  if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isUserSelectMenu()) {
    const customId = interaction.customId;
    const msgId = customId.split('-').pop();
    const session = activeSessions.get(msgId);
    if (session && session.creatorId !== interaction.user.id) {
      return interaction.reply({ content: '❌ Only the coach who started this lineup command can customize slots.', ephemeral: true });
    }
  }

  // INTERACTION FLOW 1: SLASH COMMAND INITIALIZATION
  if (interaction.isChatInputCommand() && interaction.commandName === 'lineup') {
    const size = interaction.options.getInteger('size');
    
    await interaction.deferReply({ ephemeral: true });
    const msg = await interaction.fetchReply();
    
    activeSessions.set(msg.id, { 
      id: msg.id,
      creatorId: interaction.user.id, 
      channelId: interaction.channelId,
      total: size, 
      activeSlotIdx: 0,
      roster: Array.from({ length: size }, (_, i) => ({ index: i, posLabel: i === 0 ? 'GK' : 'POS #' + (i + 1), assignedUser: null }))
    });
    
    return renderFieldGraphic(interaction, msg.id, false);
  }

  // INTERACTION FLOW 2: SLOT BUTTON CLICKED -> SHOW POSITION MENU
  if (interaction.isButton() && interaction.customId.startsWith('slot-')) {
    const parts = interaction.customId.split('-');
    const targetIdx = parseInt(parts[1]); // FIX: Re-inserted correct array index for target index extraction
    const msgId = parts[2];               // FIX: Re-inserted correct array index for message ID extraction
    const session = activeSessions.get(msgId);
    if (!session) return;

    session.activeSlotIdx = targetIdx;

    const positionOptions = [
      { label: 'GK (Goalkeeper)', value: 'GK' },
      { label: 'CB (Center Back)', value: 'CB' },
      { label: 'LB (Left Back)', value: 'LB' },
      { label: 'RB (Right Back)', value: 'RB' },
      { label: 'CM (Center Midfielder)', value: 'CM' },
      { label: 'LM (Left Midfielder)', value: 'LM' },
      { label: 'RM (Right Midfielder)', value: 'RM' },
      { label: 'ST (Striker)', value: 'ST' },
      { label: 'LW (Left Winger)', value: 'LW' },
      { label: 'RW (Right Winger)', value: 'RW' }
    ];

    const posSelectMenu = new StringSelectMenuBuilder()
      .setCustomId('select-pos-' + msgId)
      .setPlaceholder('⚽ Choose the position name for this slot...')
      .addOptions(positionOptions);

    return interaction.reply({
      content: '⚙️ **Step 1:** Select the role abbreviation name for **Slot #' + (targetIdx + 1) + '**:',
      components: [new ActionRowBuilder().addComponents(posSelectMenu)],
      ephemeral: true
    });
  }

  // INTERACTION FLOW 3: POSITION CHOSEN -> SHOW USER MENU
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select-pos-')) {
    const msgId = interaction.customId.split('-').pop();
    const session = activeSessions.get(msgId);
    if (!session) return;

    const chosenPos = interaction.values[0]; // FIX: Forced extraction of pure string element instead of array object
    session.roster[session.activeSlotIdx].posLabel = chosenPos;

    const rosterPickerMenu = new UserSelectMenuBuilder()
      .setCustomId('assign-user-' + msgId)
      .setPlaceholder('👉 Select player to place into: ' + chosenPos);

    return interaction.update({
      content: '⚙️ *Position defined as [' + chosenPos + '].* Step 2: Choose your player from the live server roster list below:',
      components: [new ActionRowBuilder().addComponents(rosterPickerMenu)]
    });
  }

  // INTERACTION FLOW 4: USER CHOSEN -> REMAP AND REFRESH FIELD
  if (interaction.isUserSelectMenu() && interaction.customId.startsWith('assign-user-')) {
    const msgId = interaction.customId.split('-').pop();
    const session = activeSessions.get(msgId);
    if (!session) return;

    const chosenUser = interaction.users.first();
    if (!chosenUser) return interaction.reply({ content: '❌ User selection failed.', ephemeral: true });

    session.roster[session.activeSlotIdx].assignedUser = {
      name: chosenUser.username,
      avatar: chosenUser.displayAvatarURL({ extension: 'png', size: 128 })
    };

    // FIX: Using interactive ephemeral message cycle mechanics cleanly without causing double rendering collisions
    await interaction.update({ content: '✅ Player mapped successfully. Updating your visual editor...', components: [], files: [] });
    return renderFieldGraphic(interaction, msgId, true);
  }

  // INTERACTION FLOW 5: LOCK & PUBLISH FINAL EMBED
  if (interaction.isButton() && interaction.customId.startsWith('confirm-')) {
    const msgId = interaction.customId.split('-').pop();
    const session = activeSessions.get(msgId);
    if (!session) return;

    const incomplete = session.roster.some(slot => !slot.assignedUser);
    if (incomplete) {
      return interaction.reply({ content: '⚠️ You must fill out every position node slot before publishing.', ephemeral: true });
    }

    await interaction.deferUpdate();

    const finalBuffer = await buildCanvasBuffer(session);
    const finalAttachment = new AttachmentBuilder(finalBuffer, { name: 'finalized-team-roster.png' });

    const destinationEmbed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('📋 Squad Lineup Finalized (' + session.total + 'v' + session.total + ')')
      .setDescription('The customized tactical system build is complete. Final roster sheet details displayed below:')
      .setImage('attachment://finalized-team-roster.png');

    session.roster.forEach((slot) => {
      destinationEmbed.addFields({ name: 'Position: ' + slot.posLabel, value: '👤 **' + slot.assignedUser.name + '**', inline: true });
    });

    try {
      const targetChannel = await client.channels.fetch('1542615988963385403');
      await targetChannel.send({ 
        content: '✅ **Lineup successfully locked and published by <@' + session.creatorId + '>!**', 
        embeds: [destinationEmbed],
        files: [finalAttachment] 
      });
    } catch (err) { console.error('Discord routing delivery error:', err); }

    await interaction.editReply({ content: '🔒 **Lineup completed and locked!** Sent directly to logs.', components: [], files: [] });
    return activeSessions.delete(msgId);
  }
});

// INTERACTIVE COMPONENT BUILDER MODULE
async function renderFieldGraphic(interaction, msgId, isFollowUp) {
  const session = activeSessions.get(msgId);
  if (!session) return;

  const canvasBuffer = await buildCanvasBuffer(session);
  const attachment = new AttachmentBuilder(canvasBuffer, { name: 'tactical-field.png' });

  const rows = [];
  let currentRow = new ActionRowBuilder();

  session.roster.forEach((slot, i) => {
    if (i > 0 && i % 5 === 0) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
    const label = `${slot.posLabel}: ${slot.assignedUser ? slot.assignedUser.name : 'Empty'}`;
    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`slot-${i}-${msgId}`)
        .setLabel(label.substring(0, 80)) 
        .setStyle(slot.assignedUser ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
  });
  rows.push(currentRow);

  if (rows.length < 5) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm-${msgId}`)
        .setLabel('🔒 Lock & Publish Lineup')
        .setStyle(ButtonStyle.Primary)
    ));
  }

  const payload = {
    content: `🏟️ **Lineup Editor Dashboard (${session.total}v${session.total})**\nClick a positional button below to customize its slot name and assign a player.`,
    files: [attachment],
    components: rows
  };

  if (isFollowUp) {
    return interaction.followUp({ ...payload, ephemeral: true });
  } else {
    return interaction.editReply(payload);
  }
}

// GRAPHICS ENGINE MODULE (Canvas builder)
async function buildCanvasBuffer(session) {
  const width = 800;
  const height = 1000;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // BACKGROUND
  ctx.fillStyle = '#27ae60'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#219653'; 
  for (let i = 0; i < height; i += 200) { ctx.fillRect(0, i, width, 100); }

  // LINES
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.strokeRect(40, 40, width - 80, height - 80);
  ctx.beginPath(); ctx.moveTo(40, height / 2); ctx.lineTo(width - 40, height / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(width / 2, height / 2, 90, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeRect(width / 2 - 180, height - 200, 360, 160); ctx.strokeRect(width / 2 - 180, 40, 360, 160);

  // FIELD POSITION COORDINATES MATRIX
