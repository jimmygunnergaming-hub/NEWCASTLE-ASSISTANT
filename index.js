const http = require('http'); 
const { createCanvas, loadImage } = require('canvas');
const { Client, GatewayIntentBits, SlashCommandBuilder, ActionRowBuilder, UserSelectMenuBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, EmbedBuilder } = require('discord.js');

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Online');
}).listen(process.env.PORT || 3000);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const activeSessions = new Map();

client.once('ready', () => {
  console.log('Bot is online!');
  const command = new SlashCommandBuilder()
    .setName('lineup')
    .setDescription('Create lineup')
    .addIntegerOption(opt => opt.setName('size').setDescription('1-11').setRequired(true).setMinValue(1).setMaxValue(11));
  client.application.commands.create(command);
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'lineup') {
    const size = interaction.options.getInteger('size');
    const msg = await interaction.reply({ content: 'Building field...', fetchReply: true });
    activeSessions.set(msg.id, { creatorId: interaction.user.id, total: size, currentIndex: 0, roster: [] });
    return updatePitch(interaction, msg.id);
  }

  if (interaction.isUserSelectMenu() && interaction.customId === 'pick') {
    const session = activeSessions.get(interaction.message.id);
    if (!session || session.creatorId !== interaction.user.id) return;
    const user = interaction.users.first();
    session.roster.push({ name: user.username, avatar: user.displayAvatarURL({ extension: 'png', size: 128 }) });
    session.currentIndex++;
    if (session.currentIndex >= session.total) return finish(interaction);
    return updatePitch(interaction, interaction.message.id);
  }
});

async function updatePitch(interaction, msgId) {
  const session = activeSessions.get(msgId);
  const canvas = createCanvas(600, 800);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#27ae60';
  ctx.fillRect(0, 0, 600, 800);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 5;
  ctx.strokeRect(20, 20, 560, 760);
  
  for (let i = 0; i < session.total; i++) {
    const y = 700 - (i * 60);
    if (session.roster[i]) {
      const img = await loadImage(session.roster[i].avatar);
      ctx.drawImage(img, 270, y, 60, 60);
    } else {
      ctx.fillStyle = '#7f8c8d';
      ctx.beginPath(); ctx.arc(300, y + 30, 25, 0, Math.PI * 2); ctx.fill();
    }
  }

  const file = new AttachmentBuilder(canvas.toBuffer(), { name: 'pitch.png' });
  const row = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder().setCustomId('pick').setPlaceholder(`Select Player ${session.currentIndex + 1}`)
  );

  const data = { content: `Player ${session.currentIndex + 1}/${session.total}`, files: [file], components: [row] };
  return interaction.replied ? interaction.editReply(data) : interaction.reply(data);
}

async function finish(interaction) {
  await interaction.update({ content: '✅ Lineup Complete!', components: [], files: [] });
}

client.login(process.env.DISCORD_TOKEN);
