const http = require('http'); 
const { createCanvas, loadImage } = require('canvas');
const { Client, GatewayIntentBits, SlashCommandBuilder, ActionRowBuilder, UserSelectMenuBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

// Lightweight port listener to satisfy Render's free tier requirements
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
  // Check security authorization locks on click adjustments
  if (interaction.isButton() || interaction.isUserSelectMenu() || interaction.isModalSubmit()) {
    const customId = interaction.customId;
    const msgId = interaction.message ? interaction.message.id : customId.split('_').pop();
    const session = activeSessions.get(msgId);
    
    if (session && session.creatorId !== interaction.user.id) {
      return interaction.reply({ content: '❌ Only the coach who started this lineup command can customize slots.', ephemeral: true });
    }
  }

  // 1. SLASH COMMAND INITIALIZATION
  if (interaction.isChatInputCommand() && interaction.commandName === 'lineup') {
    const size = interaction.options.getInteger('size');
    const msg = await interaction.reply({ content: '🏟️ Initializing massive tactical arena canvas...', fetchReply: true });
    
    activeSessions.set(msg.id, { 
      id: msg.id,
      creatorId: interaction.user.id, 
      total: size, 
      activeSlotIdx: null,
      roster: Array.from({ length: size }, (_, i) => ({ index: i, posLabel: i === 0 ? 'GK' : `POS #${i + 1}`, assignedUser: null }))
    });
    
    return renderFieldGraphic(interaction, msg.id, false);
  }

  // 2. TRIGGER POSITION OVERRIDE MODAL FORM
  if (interaction.isButton() && interaction.customId.startsWith('slot_')) {
    const targetIdx = parseInt(interaction.customId.split('_')[1]);
    const msgId = interaction.message.id;
    const session = activeSessions.get(msgId);
    if (!session) return;

    session.activeSlotIdx = targetIdx;

    const modal = new ModalBuilder().setCustomId(`posmodal_${msgId}`).setTitle('Set Custom Position Label');
    const nameInput = new TextInputBuilder()
      .setCustomId('pos_input_text')
      .setLabel('Enter position abbreviation (e.g. ST, LW, CB)')
      .setValue(session.roster[targetIdx].posLabel)
      .setStyle(TextInputStyle.Short)
      .setMaxLength(10)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
    return interaction.showModal(modal);
  }

  // 3. PARSE POSITION OVERRIDE AND TRIGGER ROSTER SELECT MENU
  if (interaction.isModalSubmit() && interaction.customId.startsWith('posmodal_')) {
    const msgId = interaction.customId.split('_')[1];
    const session = activeSessions.get(msgId);
    if (!session) return;

    const typedName = interaction.fields.getTextInputValue('pos_input_text');
    session.roster[session.activeSlotIdx].posLabel = typedName.toUpperCase();

    const rosterPickerMenu = new UserSelectMenuBuilder()
      .setCustomId('assign_user')
      .setPlaceholder(`👉 Select person to place into: ${session.roster[session.activeSlotIdx].posLabel}`);

    return interaction.reply({
      content: `⚙️ **Position defined as [${session.roster[session.activeSlotIdx].posLabel}].** Choose your player from the live server roster list below:`,
      components: [new ActionRowBuilder().addComponents(rosterPickerMenu)],
      ephemeral: true
    });
  }

  // 4. MAP USER SELECTION VALUE AND REPAINT FIELD GRAPHIC
  if (interaction.isUserSelectMenu() && interaction.customId === 'assign_user') {
    const parentMsgId = interaction.message.reference.messageId;
    const session = activeSessions.get(parentMsgId);
    if (!session) return;

    const chosenUser = interaction.users.first();
    session.roster[session.activeSlotIdx].assignedUser = {
      name: chosenUser.username,
      avatar: chosenUser.displayAvatarURL({ extension: 'png', size: 256 })
    };

    await interaction.update({ content: '✅ Member mapped into field node coordinate spaces successfully.', components: [] });
    return renderFieldGraphic(interaction, parentMsgId, true);
  }

  // 5. FINALIZE AND PUBLICLY PUBLISH TEAM SHEET EMBED
  if (interaction.isButton() && interaction.customId === 'confirm_lineup') {
    const msgId = interaction.message.id;
    const session = activeSessions.get(msgId);
    if (!session) return;

    const finalCanvas = await buildCanvasBuffer(session);
    const finalAttachment = new AttachmentBuilder(finalCanvas, { name: 'finalized-team-roster.png' });

    const destinationEmbed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`📋 Squad Lineup Finalized (${session.total}v${session.total})`)
      .setDescription('The customized tactical system build is complete. Final roster sheet details displayed below:')
      .setImage('attachment://finalized-team-roster.png');

    try {
      const targetChannel = await client.channels.fetch('1542615988963385403');
      await targetChannel.send({ 
        content: `✅ **Lineup successfully locked and published by <@${session.creatorId}>!**`, 
        embeds: [destinationEmbed],
        files: [finalAttachment] 
      });
    } catch (err) { console.error('Discord routing delivery error:', err); }

    await interaction.update({ content: '🔒 **Lineup completed and locked!** Sent directly to logs.', components: [], files: [] });
    return activeSessions.delete(msgId);
  }
});

// -------------------------------------------------------------
// CORE IMAGE GENERATION & COMPILER ENGINE
// -------------------------------------------------------------
async function buildCanvasBuffer(session) {
  const width = 1000;
  const height = 1300; // Giant full-resolution stadium coordinates
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#27ae60'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#219653'; 
  for (let i = 0; i < height; i += 260) { ctx.fillRect(0, i, width, 130); }

  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 8; ctx.strokeRect(50, 50, width - 100, height - 100);
  ctx.beginPath(); ctx.moveTo(50, height / 2); ctx.lineTo(width - 50, height / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(width / 2, height / 2, 110, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeRect(width / 2 - 220, height - 250, 440, 200); ctx.strokeRect(width / 2 - 220, 50, 440, 200);

  const coords = [{ x: width / 2, y: height - 140 }]; // Lock GK
  if (session.total > 1) {
    const outfieldCount = session.total - 1;
    let rows = outfieldCount > 7 ? 3 : (outfieldCount > 3 ? 2 : 1);
    const playersPerRow = Math.ceil(outfieldCount / rows);
    let assignedCount = 0;

    for (let r = 0; r < rows; r++) {
      const rowY = (height - 350) - (r * (height - 600) / rows);
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
        ctx.save(); ctx.beginPath(); ctx.arc(pos.x, pos.y, 50, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(img, pos.x - 50, pos.y - 50, 100, 100); ctx.restore();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(pos.x, pos.y, 50, 0, Math.PI * 2); ctx.stroke();
      } catch (e) {}
    } else {
      ctx.fillStyle = '#7f8c8d'; ctx.beginPath(); ctx.arc(pos.x, pos.y, 40, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 20px Arial';
    ctx.fillText(slot.posLabel, pos.x, pos.y + 85);
    ctx.fillStyle = '#ffffff'; ctx.font = '16px Arial';
    ctx.fillText(slot.assignedUser ? slot.assignedUser.name : 'Unassigned', pos.x, pos.y + 110);
  }
  return canvas.toBuffer();
}

async function renderFieldGraphic(interaction, msgId, isEdit) {
  const session = activeSessions.get(msgId);
  const buffer = await buildCanvasBuffer(session);
  const fileAttachment = new AttachmentBuilder(buffer, { name: 'pitch.png' });

  // Generate customized action button matrix blocks cleanly inside 5-row limits
  const row1 = new ActionRowBuilder();
  const row2 = new ActionRowBuilder();
  const finishRow = new ActionRowBuilder();

  session.roster.forEach((slot, index) => {
    const btn = new ButtonBuilder()
      .setCustomId(`slot_${index}`)
      .setLabel(`${slot.posLabel}: ${slot.assignedUser ? slot.assignedUser.name : '➕'}`)
      .setStyle(slot.assignedUser ? ButtonStyle.Success : ButtonStyle.Secondary);

    if (index < 5) row1.addComponents(btn);
    else if (index < 10) row2.addComponents(btn);
  });

  finishRow.addComponents(new ButtonBuilder().setCustomId('confirm_lineup').setLabel('🔒 Lock & Publish Lineup').setStyle(ButtonStyle.Primary));

  const componentRows = [];
  if (row1.components.length > 0) componentRows.push(row1);
  if (row2.components.length > 0) componentRows.push(row2);
