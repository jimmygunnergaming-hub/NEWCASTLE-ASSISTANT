const http = require('http');
const { 
  Client, 
  GatewayIntentBits, 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder 
} = require('discord.js');

// -------------------------------------------------------------
// FAKE WEB SERVER TO KEEP RENDER HAPPY & FREE
// -------------------------------------------------------------
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Newcastle Assistant Lineup Engine Online');
}).listen(process.env.PORT || 3000);

const client = new Client({ 
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] 
});

const activeSessions = new Map();

client.once('ready', () => {
  console.log(`Bot is online as ${client.user.tag}`);

  // Register modern lineup slash command
  const command = new SlashCommandBuilder()
    .setName('lineup')
    .setDescription('Build a tactical lineup step-by-step')
    .addStringOption(option =>
      option.setName('format')
        .setDescription('Select match format size')
        .setRequired(true)
        .addChoices(
          { name: '1v1 Matchup', value: '1' },
          { name: '2v2 Mini Layout', value: '2' },
          { name: '3v3 Small Sided', value: '3' },
          { name: '5v5 Five-A-Side', value: '5' },
          { name: '6v6 Custom Pitch', value: '6' },
          { name: '11v11 Full Squad', value: '11' }
        ));

  client.application.commands.create(command);
});

client.on('interactionCreate', async interaction => {
  // Validate ownership locks first on ongoing interaction modifications
  if (interaction.isStringSelectMenu() || interaction.isUserSelectMenu() || interaction.isButton()) {
    const session = activeSessions.get(interaction.message.id);
    if (session && session.creatorId !== interaction.user.id) {
      return interaction.reply({ 
        content: "❌ Only the person who started this `/lineup` command can customize these positions.", 
        ephemeral: true 
      });
    }
  }

  // 1. SLASH COMMAND ROUTER
  if (interaction.isChatInputCommand() && interaction.commandName === 'lineup') {
    const formatValue = interaction.options.getString('format');
    const totalPlayers = parseInt(formatValue);

    let formationOptions = [];
    if (totalPlayers === 6) {
      formationOptions = [
        { label: '2-2-2 Classic Balance', value: '2-2-2' },
        { label: '3-1-1 Defensive Block', value: '3-1-1' }
      ];
    } else if (totalPlayers === 11) {
      formationOptions = [
        { label: '4-4-2 Traditional', value: '4-4-2' },
        { label: '4-3-3 Attacking', value: '4-3-3' }
      ];
    } else {
      formationOptions = [{ label: 'Standard Balanced Grid', value: 'Balanced' }];
    }

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`setup_${totalPlayers}`)
        .setPlaceholder('Choose a tactical system formation...')
        .addOptions(formationOptions)
    );

    const msg = await interaction.reply({
      content: `🏟️ **Match format selected:** ${totalPlayers}v${totalPlayers}. Pick your tactical strategy below:`,
      components: [row],
      fetchReply: true
    });

    // Save session mapping metadata details
    activeSessions.set(msg.id, {
      creatorId: interaction.user.id,
      total: totalPlayers,
      formation: 'None',
      currentIndex: 0,
      activeSlot: null,
      roster: Array.from({ length: totalPlayers }, (_, i) => ({
        index: i,
        posLabel: `Slot #${i + 1}`,
        assignedUser: null,
        offset: 'Center' // Left, Center, Right modifier displacement options
      }))
    });
    return;
  }

  // 2. FORMATION CHOICE PARSER
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('setup_')) {
    const msgId = interaction.message.id;
    const session = activeSessions.get(msgId);
    if (!session) return;

    session.formation = interaction.values[0];
    
    // Apply position context overrides for custom 6v6 configuration request mapping layouts
    if (session.total === 6 && session.formation === '2-2-2') {
      const labels = ['GK', 'DEF-L', 'DEF-R', 'MID-L', 'MID-R', 'STRIKER'];
      session.roster.forEach((slot, idx) => slot.posLabel = labels[idx]);
    }

    return renderInteractivePitchPanel(interaction, msgId);
  }

  // 3. EDIT ACTION GRID CONTROLLER
  if (interaction.isButton() && interaction.customId.startsWith('edit_')) {
    const msgId = interaction.message.id;
    const targetIdx = parseInt(interaction.customId.split('_')[1]);
    const session = activeSessions.get(msgId);
    if (!session) return;

    session.activeSlot = targetIdx;

    // Display localized modifiers config choices panel menu context overlay options layout
    const userSelect = new UserSelectMenuBuilder()
      .setCustomId('assign_member')
      .setPlaceholder(`Select server member to place into ${session.roster[targetIdx].posLabel}`);

    const configRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`move_Left_${targetIdx}`).setLabel('⬅️ Shift Left').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`move_Center_${targetIdx}`).setLabel('⏺️ Center').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`move_Right_${targetIdx}`).setLabel('➡️ Shift Right').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`rename_${targetIdx}`).setLabel('📝 Rename Pos').setStyle(ButtonStyle.Primary)
    );

    return interaction.update({
      content: `⚙️ **Modifying Slot:** *${session.roster[targetIdx].posLabel}*\nUse the tools below to shift horizontal tracking grids or assign server personnel directly into the tactical space map line.`,
      components: [new ActionRowBuilder().addComponents(userSelect), configRow]
    });
  }

  // 4. SHIFT HORIZONTAL DISPLACEMENT COORDS HANDLER
  if (interaction.isButton() && interaction.customId.startsWith('move_')) {
    const [, direction, idxStr] = interaction.customId.split('_');
    const msgId = interaction.message.id;
    const session = activeSessions.get(msgId);
    if (!session) return;

    session.roster[parseInt(idxStr)].offset = direction;
    return renderInteractivePitchPanel(interaction, msgId);
  }

  // 5. CUSTOM POSITION RENAMING QUICK SIMULATOR
  if (interaction.isButton() && interaction.customId.startsWith('rename_')) {
    const idx = parseInt(interaction.customId.split('_')[1]);
    const msgId = interaction.message.id;
    const session = activeSessions.get(msgId);
    if (!session) return;

    const names = ['DEFENDER', 'MIDFIELDER', 'WINGER', 'STRIKER', 'SWEEPER', 'TARGETMAN'];
    session.roster[idx].posLabel = names[Math.floor(Math.random() * names.length)];
    return renderInteractivePitchPanel(interaction, msgId);
  }

  // 6. ROSTER ASSIGNMENT HANDLER 
  if (interaction.isUserSelectMenu() && interaction.customId === 'assign_member') {
    const msgId = interaction.message.id;
    const session = activeSessions.get(msgId);
    if (!session) return;

    const targetUser = interaction.users.first();
    session.roster[session.activeSlot].assignedUser = {
      name: targetUser.username,
      avatar: targetUser.displayAvatarURL({ extension: 'png', size: 256 })
    };

    return renderInteractivePitchPanel(interaction, msgId);
  }
});

// Dynamic layout renderer engine framework logic panel UI builder helper block code
async function renderInteractivePitchPanel(interaction, msgId) {
  const session = activeSessions.get(msgId);

  let pitchGraphic = `🟩🟩🟩🟩 **CAMP NOU TACTICAL FIELD** 🟩🟩🟩🟩\n`;
  pitchGraphic += `**Match Setup Engine:** \`${session.total}v${session.total}\` | **Formation:** \`${session.formation}\`\n\n`;

  const controlRow1 = new ActionRowBuilder();
  const controlRow2 = new ActionRowBuilder();

  session.roster.forEach((slot, index) => {
    let alignmentIndent = '';
    if (slot.offset === 'Left') alignmentIndent = ' 🟥 ';
    if (slot.offset === 'Right') alignmentIndent = '          🟨 ';
    if (slot.offset === 'Center') alignmentIndent = '     ';

    if (slot.assignedUser) {
      pitchGraphic += `${alignmentIndent}🟢 **${slot.posLabel}**: @${slot.assignedUser.name}\n`;
    } else {
      pitchGraphic += `${alignmentIndent}⚪ **${slot.posLabel}**: *Empty Position*\n`;
    }

    const btn = new ButtonBuilder()
      .setCustomId(`edit_${index}`)
      .setLabel(`Edit: ${slot.posLabel}`)
      .setStyle(slot.assignedUser ? ButtonStyle.Success : ButtonStyle.Danger);

    if (index < 5) controlRow1.addComponents(btn);
    else if (index < 10) controlRow2.addComponents(btn);
  });

  const componentsArray = [];
  if (controlRow1.components.length > 0) componentsArray.push(controlRow1);
  if (controlRow2.components.length > 0) componentsArray.push(controlRow2);

  // Generate complete final overview summary display card attachment block details map
  const overviewEmbed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`📋 Live Lineup Roster Setup Panel Dashboard`)
    .setDescription('Players assigned into tactical roster coordinates display details directly below:')
    .setFooter({ text: 'Security Notice: Permissions locked strictly to command builder operator.' });

  session.roster.forEach(slot => {
    if (slot.assignedUser) {
      overviewEmbed.addFields({
        name: `👤 ${slot.assignedUser.name}`,
        value: `**Position Assigned:** \`${slot.posLabel}\`\n[View Profile Picture](${slot.assignedUser.avatar})`,
        inline: true
      });
    }
  });

  await interaction.update({
    content: pitchGraphic,
    embeds: [overviewEmbed],
    components: componentsArray
  });
}

client.login(process.env.DISCORD_TOKEN);
