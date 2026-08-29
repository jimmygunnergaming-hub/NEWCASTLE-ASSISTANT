const http = require('http'); // Keeps your free Render tier awake and online
const { 
  Client, 
  GatewayIntentBits, 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  UserSelectMenuBuilder, 
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder 
} = require('discord.js');

// -------------------------------------------------------------
// SECURE PORT HANDLER TO KEEP RENDER RUNNING FOR FREE
// -------------------------------------------------------------
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Newcastle Native Engine Online');
}).listen(process.env.PORT || 3000);

const client = new Client({ 
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] 
});

const activeSessions = new Map();

client.once('ready', () => {
  console.log(`Bot connection validated successfully! Authorized as ${client.user.tag}`);

  // Auto-generate match size options from 1v1 up to 11v11
  const sizeChoices = [];
  for (let i = 1; i <= 11; i++) {
    sizeChoices.push({ name: `${i}v${i} Matchup Format`, value: i });
  }

  const baseCommand = new SlashCommandBuilder()
    .setName('lineup')
    .setDescription('Build a tactical squad lineup natively inside your server chat')
    .addIntegerOption(option => 
      option.setName('size')
        .setDescription('Number of people on the team')
        .setRequired(true)
        .addChoices(...sizeChoices));

  client.application.commands.create(baseCommand);
});

client.on('interactionCreate', async interaction => {
  // SECURITY OVERLAY: Restricts all interactive panel controls strictly to the command builder
  if (interaction.isButton() || interaction.isUserSelectMenu()) {
    const session = activeSessions.get(interaction.message.id);
    if (session && session.creatorId !== interaction.user.id) {
      return interaction.reply({ 
        content: '❌ Only the coach who started this lineup session can assign personnel.', 
        ephemeral: true 
      });
    }
  }

  // 1. CHAT COMMAND INVOCATION
  if (interaction.isChatInputCommand() && interaction.commandName === 'lineup') {
    const totalPlayers = interaction.options.getInteger('size');
    
    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('trigger_assign').setLabel('👤 Assign Next Player').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('lock_lineup').setLabel('🔒 Finish & Publish Squad').setStyle(ButtonStyle.Success)
    );

    const msg = await interaction.reply({
      content: `🏟️ **Initializing your ${totalPlayers}v${totalPlayers} Squad Workspace Panel...**\nClick the controls below to start assigning positions step-by-step.`,
      components: [controlRow],
      fetchReply: true
    });

    activeSessions.set(msg.id, {
      creatorId: interaction.user.id,
      channelId: interaction.channelId,
      total: totalPlayers,
      currentIndex: 0,
      activePositionName: 'GK',
      roster: []
    });
    
    return refreshLineupDisplay(interaction, msg.id, false);
  }

  // 2. TRIGGER POSITION SETUP INPUT TIMELINE
  if (interaction.isButton() && interaction.customId === 'trigger_assign') {
    const msgId = interaction.message.id;
    const session = activeSessions.get(msgId);
    if (!session) return;

    if (session.currentIndex >= session.total) {
      return interaction.reply({ content: '⚠️ Your squad allocation space is already fully filled out.', ephemeral: true });
    }

    // Modal forms are blocked inside component replies, so we open a standard text user-picker menu directly
    const nextSlotNum = session.currentIndex + 1;
    const promptLabel = nextSlotNum === 1 ? 'Goalkeeper (GK)' : `Outfield Node #${nextSlotNum}`;

    const rosterPickerMenu = new UserSelectMenuBuilder()
      .setCustomId('execute_placement')
      .setPlaceholder(`Select user to assign to: ${promptLabel}`);

    return interaction.reply({
      content: `⚙️ **Allocation Wizard:** Use the live member roster picker menu below to map a player card directly to your lineup stack:`,
      components: [new ActionRowBuilder().addComponents(rosterPickerMenu)],
      ephemeral: true
    });
  }

  // 3. EXECUTE PLACEMENT AND CACHE PROFILE IMAGE VALUES
  if (interaction.isUserSelectMenu() && interaction.customId === 'execute_placement') {
    const parentMessageId = interaction.message.reference.messageId;
    const session = activeSessions.get(parentMessageId);
    if (!session) return;

    const chosenUser = interaction.users.first();
    const positionTag = session.currentIndex === 0 ? 'GK' : `POS #${session.currentIndex + 1}`;

    session.roster.push({
      id: chosenUser.id,
      name: chosenUser.username,
      role: positionTag,
      avatar: chosenUser.displayAvatarURL({ extension: 'png', size: 256 })
    });

    session.currentIndex++;
    
    // Clear out the temporary user select menu block overlay popup safely
    await interaction.update({ content: '✅ Player successfully assigned to grid system coords.', components: [] });
    
    return refreshLineupDisplay(interaction, parentMessageId, true);
  }

  // 4. FINAL LOCK AND PUBLIC PUBLISH TO DISCORD CHANNEL
  if (interaction.isButton() && interaction.customId === 'lock_lineup') {
    const msgId = interaction.message.id;
    const session = activeSessions.get(msgId);
    if (!session) return;

    const targetChannel = await client.channels.fetch('1542615988963385403');
    
    const finalizedEmbed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`📋 Newcastle Squad Roster Confirmed (${session.total}v${session.total})`)
      .setDescription('The customized tactical system build is complete. Final roster sheet details displayed below:');

    session.roster.forEach(player => {
      finalizedEmbed.addFields({
        name: `⚽ Position: ${player.role}`,
        value: `<@${player.id}> (**${player.name}**)\n[Profile Picture Avatar](${player.avatar})`,
        inline: true
      });
    });

    await targetChannel.send({
      content: `✅ **Lineup successfully locked and published by <@${session.creatorId}>!**`,
      embeds: [finalizedEmbed]
    });

    await interaction.update({
      content: '🔒 **Lineup locked!** The roster sheet has been processed and posted cleanly down into your logs channel.',
      embeds: [],
      components: []
    });

    return activeSessions.delete(msgId);
  }
});

// -------------------------------------------------------------
// TEXT-BASED SOCCER STADIUM FIELD ENGINE RENDERER
// -------------------------------------------------------------
async function refreshLineupDisplay(interaction, msgId, isEditStep) {
  const session = activeSessions.get(msgId);

  // Builds an authentic ASCII Football Arena Field inside the Discord text card layout
  let fieldGraphic = `\n🟩🟩🟩🟩🟩🟩 **STADIUM FIELD WORKSPACE** 🟩🟩🟩🟩🟩🟩\n`;
  fieldGraphic += `\`  ____________________________________________  \`\n`;
  fieldGraphic += `\` |                  [ TOP BOX ]                 | \`\n`;

  // Dynamic tactical array distribution calculation block loops
  for (let i = session.total - 1; i >= 0; i--) {
    let lineString = ' ';
    const isAssigned = session.roster[i];
    
    if (isAssigned) {
      lineString += `👉 **${session.roster[i].role}**: <@${session.roster[i].id}> (${session.roster[i].name}) ✅`;
    } else {
      if (i === session.currentIndex) {
        lineString += `🟢 **[Assigning Next Slot: Node #${i + 1}]**`;
      } else {
        lineString += `⚪ *Unassigned Position Slot Node #${i + 1}*`;
      }
    }
    fieldGraphic += `\` | \` ${lineString}\n`;
  }

  fieldGraphic += `\` |__________________ [ BOT BOX ] ________________| \`\n`;
  fieldGraphic += `\`   [🏟️]   [🏟️]   [🏟️]   [🏟️]   [🏟️]   [🏟️]   [🏟️]   \`\n\n`;
  fieldGraphic += `*Active Progress Info: (${session.currentIndex} / ${session.total}) Roles Allocated.*`;

  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('trigger_assign').setLabel('👤 Assign Player').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('lock_lineup').setLabel('🔒 Finish Lineup').setStyle(ButtonStyle.Success).setDisabled(session.currentIndex < session.total)
  );

  const payload = { content: fieldGraphic, components: [controlRow] };

  if (isEditStep) {
    const parentChannel = await client.channels.fetch(session.channelId);
    const targetMsg = await parentChannel.messages.fetch(msgId);
    await targetMsg.edit(payload);
  } else {
    await interaction.editReply(payload);
  }
}

if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DEPLOYMENT FATAL ERROR: Missing DISCORD_TOKEN configuration variable.");
  process.exit(1);
} else {
  client.login(process.env.DISCORD_TOKEN);
}
