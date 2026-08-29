const express = require('express');
const app = express();
const { Client, GatewayIntentBits, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

app.use(express.json());

const liveSessions = new Map();

// WEB DASHBOARD SYSTEM
app.get('/pitch/:sessionId', (req, res) => {
  const session = liveSessions.get(req.params.sessionId);
  if (!session) return res.status(404).send('Lineup session expired.');

  let nodesHtml = '';
  session.roster.forEach((player, idx) => {
    const pctY = 85 - (idx * (70 / Math.max(1, session.total - 1)));
    const pctX = 50 + (idx % 2 === 0 ? (idx * 3) : -(idx * 3));
    nodesHtml += '<div class="player-node" id="node_' + idx + '" style="left: ' + pctX + '%; top: ' + pctY + '%;" mousedown="startNodeDrag(event, ' + idx + ')" onclick="handleNodeClick(' + idx + ')"><div id="avatar_box_' + idx + '" class="w-100 h-100 d-flex align-items-center justify-content-center"><span style="font-size:20px; color:#95a5a6;">⚪</span></div><div class="label-container"><div class="pos-name" id="lbl_pos_' + idx + '">' + player.posLabel + '</div><div class="usr-name" id="lbl_usr_' + idx + '">Unassigned</div></div></div>';
  });

  res.send('<!DOCTYPE html><html><head><title>Tactical Field Dashboard</title><meta name="viewport" content="width=device-width, initial-scale=1.0"><link href="https://jsdelivr.net" rel="stylesheet"><style>body { background: #111; color: #fff; font-family: "Segoe UI", sans-serif; text-align: center; overflow-x: hidden; }.pitch-environment { position: relative; width: 100%; max-width: 700px; height: 80vh; margin: 20px auto; background: #1e722a; border: 4px solid #fff; border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); overflow: hidden; }.midfield-line { position: absolute; top: 50%; left: 0; width: 100%; height: 4px; background: #fff; }.center-circle { position: absolute; top: 50%; left: 50%; width: 140px; height: 140px; border: 4px solid #fff; border-radius: 50%; transform: translate(-50%, -50%); }.penalty-box-top { position: absolute; top: 0; left: 50%; width: 260px; height: 120px; border: 4px solid #fff; transform: translateX(-50%); border-top: none; }.penalty-box-bot { position: absolute; bottom: 0; left: 50%; width: 260px; height: 120px; border: 4px solid #fff; transform: translateX(-50%); border-bottom: none; }.player-node { position: absolute; width: 70px; height: 70px; background: #2c3e50; border: 3px solid #f1c40f; border-radius: 50%; cursor: move; display: flex; flex-direction: column; align-items: center; justify-content: center; transform: translate(-50%, -50%); z-index: 10; }.player-node img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }.label-container { position: absolute; bottom: -45px; width: 120px; font-size: 11px; font-weight: bold; background: rgba(0,0,0,0.85); border-radius: 4px; padding: 2px; border: 1px solid #444; }.pos-name { color: #f1c40f; text-transform: uppercase; }.usr-name { color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }.modal-content { background: #222; color: #fff; border: 2px solid #f1c40f; }.member-card { background: #2c3e50; border-radius: 8px; cursor: pointer; padding: 10px; margin-bottom: 5px; }.member-card:hover { background: #f1c40f; color: #000; }</style></head><body class="container-fluid py-3"><h3>⚽ NEWCASTLE ASSISTANT STRATEGY CONSOLE</h3><p class="text-muted">Drag circles anywhere. Click a circle to name its position and assign players!</p><div class="pitch-environment" id="pitch"><div class="midfield-line"></div><div class="center-circle"></div><div class="penalty-box-top"></div><div class="penalty-box-bot"></div>' + nodesHtml + '</div><button class="btn btn-success btn-lg px-5 shadow mb-4" onclick="saveAndPostToDiscord()">Save & Send to Discord</button><div class="modal fade" id="positionModal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static"><div class="modal-dialog modal-dialog-centered"><div class="modal-content"><div class="modal-header border-secondary"><h5 class="modal-title">Set Position Name</h5></div><div class="modal-body text-start"><label class="form-label text-muted">What position is this circle? (e.g. GK, CB, Striker)</label><input type="text" class="form-control bg-dark text-white border-secondary" id="posNameInput" placeholder="Striker"></div><div class="modal-footer border-secondary"><button type="button" class="btn btn-warning w-100" onclick="submitPositionName()">Next: Choose Player ➡️</button></div></div></div></div><div class="modal fade" id="pickerModal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-dialog-scrollable"><div class="modal-content"><div class="modal-header border-secondary"><h5 class="modal-title">Select Team Member</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div><div class="modal-body"><div class="row g-2" id="memberListContainer"></div></div></div></div></div><script src="https://jsdelivr.net"></script><script>const sessionData = ' + JSON.stringify(session) + '; let activeEditIdx = null; let posModal, pickerModal; document.addEventListener("DOMContentLoaded", () => { posModal = new bootstrap.Modal(document.getElementById("positionModal")); pickerModal = new bootstrap.Modal(document.getElementById("pickerModal")); }); function startNodeDrag(e, idx) { if (e.target.closest(".label-container")) return; const node = document.getElementById("node_" + idx); const pitch = document.getElementById("pitch"); function onMouseMove(event) { const rect = pitch.getBoundingClientRect(); let x = ((event.clientX - rect.left) / rect.width) * 100; let y = ((event.clientY - rect.top) / rect.height) * 100; if(x >= 5 && x <= 95) node.style.left = x + "%"; if(y >= 5 && y <= 95) node.style.top = y + "%"; } document.addEventListener("mousemove", onMouseMove); document.addEventListener("mouseup", () => document.removeEventListener("mousemove", onMouseMove), {once: true}); } function handleNodeClick(idx) { activeEditIdx = idx; document.getElementById("posNameInput").value = sessionData.roster[idx].posLabel; posModal.show(); } function submitPositionName() { const inputVal = document.getElementById("posNameInput").value.trim(); const finalPosName = inputVal || "POS #" + (activeEditIdx + 1); sessionData.roster[activeEditIdx].posLabel = finalPosName; document.getElementById("lbl_pos_" + activeEditIdx).innerText = finalPosName; posModal.hide(); openPlayerPicker(); } function openPlayerPicker() { const container = document.getElementById("memberListContainer"); container.innerHTML = ""; sessionData.serverMembers.forEach(m => { const div = document.createElement("div"); div.className = "col-12 member-card d-flex align-items-center gap-3"; div.innerHTML = "<img src=\'" + m.avatar + "\' style=\'width:40px; height:40px; border-radius:50%;\' /><b>" + m.name + "</b>"; div.onclick = () => assignUser(m.name, m.avatar); container.appendChild(div); }); pickerModal.show(); } function assignUser(name, avatar) { pickerModal.hide(); document.getElementById("avatar_box_" + activeEditIdx).innerHTML = "<img src=\'" + avatar + "\' />"; document.getElementById("lbl_usr_" + activeEditIdx).innerText = name; sessionData.roster[activeEditIdx].assignedUser = { name, avatar }; } function saveAndPostToDiscord() { fetch("/api/save-lineup/" + sessionData.id, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roster: sessionData.roster }) }).then(() => alert("Lineup finalized! You can close this tab and check Discord.")); }</script></body></html>');
});

app.post('/api/save-lineup/:id', async (req, res) => {
  const session = liveSessions.get(req.params.id);
  if (!session) return res.sendStatus(404);

  session.roster = req.body.roster;

  const summaryEmbed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('📋 Squad Lineup Finalized')
    .setDescription('The customized tactical system build is complete:');

  session.roster.forEach((slot) => {
    const userDisplay = slot.assignedUser 
      ? '👤 **' + slot.assignedUser.name + '**\n[Profile Picture](' + slot.assignedUser.avatar + ')' 
      : '*Unassigned Empty Slot*';
    
    summaryEmbed.addFields({ name: 'Position: ' + slot.posLabel, value: userDisplay, inline: true });
  });

  try {
    const channel = await client.channels.fetch(session.channelId);
    await channel.send({ content: '✅ **Lineup successfully published by <@' + session.creatorId + '>!**', embeds: [summaryEmbed] });
  } catch (err) { console.error(err); }

  res.sendStatus(200);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Web dashboard environment online.'));

// BOT ENGINE
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once('ready', () => {
  console.log('Bot connection validated successfully! Authorized as ' + client.user.tag);
  
  const command = new SlashCommandBuilder()
    .setName('lineup')
    .setDescription('Open the football pitch workspace')
    .addIntegerOption(option =>
      option.setName('size')
        .setDescription('Select player count size (1 to 11)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(11));

  client.application.commands.create(command);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'lineup') return;

  const totalPlayers = interaction.options.getInteger('size');
  const sessionId = Math.random().toString(36).substring(2, 11);

  const membersFetched = await interaction.guild.members.fetch();
  const serverMembers = membersFetched.map(m => ({
    name: m.user.username,
    avatar: m.user.displayAvatarURL({ extension: 'png', size: 128 })
  }));

  liveSessions.set(sessionId, {
    id: sessionId,
    creatorId: interaction.user.id,
