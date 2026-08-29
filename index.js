const http = require('http'); 
const { createCanvas, loadImage } = require('canvas');
const { Client, GatewayIntentBits, SlashCommandBuilder, ActionRowBuilder, UserSelectMenuBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, EmbedBuilder } = require('discord.js');

// Lightweight port listener to satisfy Render's free tier rules
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

  // Security authorization lock check
  if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isUserSelectMenu()) {
    const customId = interaction.customId;
    const msgId = customId.split('-').pop(); // Fixed array splitting logic to prevent end of input crash
    const session = activeSessions.get(msgId);
    if (session && session.creatorId !== interaction.user.id) {
      return interaction.reply({ content: '❌ Only the coach who started this lineup command can customize slots.', ephemeral: true });
    }
  }

  // 1. SLASH COMMAND INITIALIZATION (Hidden ephemerally from other users)
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

  // 2. TRIGGER POSITION SELECTION SYSTEM
  if (interaction.isButton() && interaction.customId.startsWith('slot-')) {
    const parts = interaction.customId.split('-');
    const targetIdx = parseInt(parts[1]);
    const msgId = parts[2];
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

  // 3. PARSE POSITION AND TRIGGER ROSTER CHOOSE LIST
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select-pos-')) {
    const msgId = interaction.customId.split('-').pop();
    const session = activeSessions.get(msgId);
    if (!session) return;

    const chosenPos = interaction.values[0];
    session.roster[session.activeSlotIdx].posLabel = chosenPos;

    const rosterPickerMenu = new UserSelectMenuBuilder()
      .setCustomId('assign-user-' + msgId)
      .setPlaceholder('👉 Select player to place into: ' + chosenPos);

    return interaction.update({
      content: '⚙️ *Position defined as [' + chosenPos + '].* Step 2: Choose your player from the live server roster list below:',
      components: [new ActionRowBuilder().addComponents(rosterPickerMenu)]
    });
  }

  // 4. MAP USER SELECTION VALUE AND REPAINT FIELD GRAPHIC
  if (interaction.isUserSelectMenu() && interaction.customId.startsWith('assign-user-')) {
    const msgId = interaction.customId.split('-').pop();
    const session = activeSessions.get(msgId);
    if (!session) return;

    const chosenUser = interaction.users.first();
    session.roster[session.activeSlotIdx].assignedUser = {
      name: chosenUser.username,
      avatar: chosenUser.displayAvatarURL({ extension: 'png', size: 128 })
    };

    await interaction.update({ content: '✅ Member mapped successfully.', components: [] });
    return renderFieldGraphic(interaction, msgId, true);
  }

  // 5. FINALIZE AND PUBLICLY PUBLISH TEAM SHEET EMBED
  if (interaction.isButton() && interaction.customId.startsWith('confirm-')) {
    const msgId = interaction.customId.split('-').pop();
    const session = activeSessions.get(msgId);
    if (!session) return;

    const incomplete = session.roster.some(slot => !slot.assignedUser);
    if (incomplete) {
      return interaction.reply({ content: '⚠️ You must fill out every position node slot before publishing.', ephemeral: true });
    }

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

    await interaction.update({ content: '🔒 **Lineup completed and locked!** Sent directly to logs.', components: [], files: [] });
    return activeSessions.delete(msgId);
  }
});

async function buildCanvasBuffer(session) {
  const width = 800;
  const height = 1000;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#27ae60'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#219653'; 
  for (let i = 0; i < height; i += 200) { ctx.fillRect(0, i, width, 100); }

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
        coords.push({ x: (width / (countInThisRow + 1)) * (p + 1), y: rowY });
        assignedCount++;
      }
    }
  }

  for (let i = 0; i < session.total; i++) {
    const slot = session.roster[i]; const pos = coords[i];

    if (slot.assignedUser) {
      try {
        const img = await loadImage(slot.assignedUser.avatar);
        ctx.save(); ctx.beginPath(); ctx.arc(pos.x, pos.y, 40, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(img, pos.x - 40, pos.y - 40, 80, 80); ctx.restore();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(pos.x, pos.y, 40, 0, Math.PI * 2); ctx.stroke();
      } catch (e) {}
    } else {
      ctx.fillStyle = '#7f8c8d'; ctx.beginPath(); ctx.arc(pos.x, pos.y, 30, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 15px Arial';
    ctx.fillText(slot.posLabel, pos.x, pos.y + 65);
    ctx.fillStyle = '#ffffff'; ctx.font = '13px Arial';
    ctx.fillText(slot.assignedUser ? slot.assignedUser.name : 'Unassigned', pos.x, pos.y + 85);
  }
  return canvas.toBuffer();
}

async function renderFieldGraphic(interaction, msgId, isEdit) {
  const session = activeSessions.get(msgId);
  const buffer = await buildCanvasBuffer(session);
  const fileAttachment = new AttachmentBuilder(buffer, { name: 'pitch.png' });

  const row1 = new ActionRowBuilder();
  const row2 = new ActionRowBuilder();
  const finishRow = new ActionRowBuilder();

  session.roster.forEach((slot, index) => {
