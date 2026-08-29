const express = require('express');
const app = express();
const { Client, GatewayIntentBits, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

app.use(express.json());

const liveSessions = new Map();

// -------------------------------------------------------------
// DYNAMIC IMMERSIVE WEB APP SYSTEM (FOOTBALL PITCH DASHBOARD)
// -------------------------------------------------------------
app.get('/pitch/:sessionId', (req, res) => {
  const session = liveSessions.get(req.params.sessionId);
  if (!session) return res.status(404).send('Lineup session expired.');

  // Generate the circles dynamically based on the requested number from 1 to 11
  let nodesHtml = '';
  session.roster.forEach((player, idx) => {
    // Spreads the initial positions evenly down the pitch line as unassigned grey dots
    const pctY = 80 - (idx * (65 / Math.max(1, session.total - 1)));
    const pctX = 50;
    
    nodesHtml += '<div class="player-node" id="node_' + idx + '" style="left: ' + pctX + '%; top: ' + pctY + '%;" mousedown="startNodeDrag(event, ' + idx + ')" onclick="handleNodeClick(' + idx + ')">';
    nodesHtml += '<div id="avatar_box_' + idx + '" class="avatar-circle">⚪</div>';
    nodesHtml += '<div class="label-container">';
    nodesHtml += '<div class="pos-name" id="lbl_pos_' + idx + '">' + player.posLabel + '</div>';
    nodesHtml += '<div class="usr-name" id="lbl_usr_' + idx + '">Unassigned</div>';
    nodesHtml += '</div></div>';
  });

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Tactical Field Live Console</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://jsdelivr.net" rel="stylesheet">
      <style>
        body { background: #111; color: #fff; font-family: 'Segoe UI', sans-serif; text-align: center; overflow-x: hidden; padding: 15px; }
        .pitch-environment { 
          position: relative; width: 100%; max-width: 650px; height: 85vh; margin: 15px auto;
          background: #27ae60;
          background-image: linear-gradient(rgba(255,255,255,0.1) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,0.1) 2px, transparent 2px);
          background-size: 100% 10%; /* Creates pitch grass cut stripes look */
          border: 4px solid #fff; border-radius: 8px;
          box-shadow: 0 15px 35px rgba(0,0,0,0.5); overflow: hidden;
        }
        /* Realistic Football Pitch Arena Lines */
        .midfield-line { position: absolute; top: 50%; left: 0; width: 100%; height: 4px; background: #fff; }
        .center-circle { position: absolute; top: 50%; left: 50%; width: 130px; height: 130px; border: 4px solid #fff; border-radius: 50%; transform: translate(-50%, -50%); }
        .penalty-box-top { position: absolute; top: 0; left: 50%; width: 240px; height: 120px; border: 4px solid #fff; transform: translateX(-50%); border-top: none; }
        .penalty-box-bot { position: absolute; bottom: 0; left: 50%; width: 240px; height: 120px; border: 4px solid #fff; transform: translateX(-50%); border-bottom: none; }
        
        /* Tactical Player Circles */
        .player-node {
          position: absolute; width: 65px; height: 65px; background: #7f8c8d; /* Starts as Grey Dot */
          border: 3px solid #fff; border-radius: 50%; cursor: move;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          transform: translate(-50%, -50%); z-index: 10; box-shadow: 0 6px 12px rgba(0,0,0,0.3);
        }
        .avatar-circle { font-size: 20px; color: #fff; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
        .player-node img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
        .label-container { position: absolute; bottom: -45px; width: 110px; font-size: 11px; font-weight: bold; background: rgba(0,0,0,0.85); border-radius: 4px; padding: 2px; border: 1px solid #444; }
        .pos-name { color: #f1c40f; text-transform: uppercase; } 
        .usr-name { color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        
        .modal-content { background: #222; color: #fff; border: 2px solid #f1c40f; }
        .member-card { background: #2c3e50; border-radius: 8px; cursor: pointer; transition: 0.2s; }
        .member-card:hover { background: #f1c40f; color: #000; transform: translateY(-2px); }
      </style>
    </head>
    <body>
      <h3>⚽ NEWCASTLE STRATEGY BOARD</h3>
      <p class="text-muted">Drag grey circles anywhere to position them. Click a circle to name its position and assign players!</p>
      
      <div class="pitch-environment" id="pitch">
        <div class="midfield-line"></div>
        <div class="center-circle"></div>
        <div class="penalty-box-top"></div>
        <div class="penalty-box-bot"></div>
        ${nodesHtml}
      </div>

      <button class="btn btn-success btn-lg px-5 shadow mb-4" onclick="saveAndPostToDiscord()">Save & Send to Discord</button>

      <!-- Step 1: Position Name Form Popup -->
      <div class="modal fade" id="positionModal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header border-secondary"><h5 class="modal-title">Set Position Name</h5></div>
            <div class="modal-body text-start">
              <label class="form-label text-muted">What position is this circle? (e.g. GK, CB, Striker, LW)</label>
              <input type="text" class="form-control bg-dark text-white border-secondary" id="posNameInput" placeholder="Striker">
            </div>
            <div class="modal-footer border-secondary">
              <button type="button" class="btn btn-warning w-100" onclick="submitPositionName()">Next: Choose Player ➡️</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 2: Member Roster Card Panel -->
      <div class="modal fade" id="pickerModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header border-secondary"><h5 class="modal-title">Select Team Member</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
            <div class="modal-body"><div class="row g-2" id="memberListContainer"></div></div>
          </div>
        </div>
      </div>

      <script src="https://jsdelivr.net"></script>
      <script>
        const sessionData = ${JSON.stringify(session)};
        let activeEditIdx = null;
        let posModal, pickerModal;

        document.addEventListener("DOMContentLoaded", () => {
          posModal = new bootstrap.Modal(document.getElementById('positionModal'));
          pickerModal = new bootstrap.Modal(document.getElementById('pickerModal'));
        });

        // Universal drag mechanic handler engine
        function startNodeDrag(e, idx) {
          if (e.target.closest('.label-container')) return;
          const node = document.getElementById('node_' + idx);
          const pitch = document.getElementById('pitch');
          
          function onMouseMove(event) {
            const rect = pitch.getBoundingClientRect();
            let x = ((event.clientX - rect.left) / rect.width) * 100;
            let y = ((event.clientY - rect.top) / rect.height) * 100;
            if(x >= 5 && x <= 95) node.style.left = x + '%';
            if(y >= 5 && y <= 95) node.style.top = y + '%';
          }
          
          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', () => document.removeEventListener('mousemove', onMouseMove), {once: true});
        }

        // When a user clicks directly on a circle node object
        function handleNodeClick(idx) {
          activeEditIdx = idx;
          document.getElementById('posNameInput').value = sessionData.roster[idx].posLabel;
          posModal.show();
        }

        function submitPositionName() {
          const inputVal = document.getElementById('posNameInput').value.trim();
          const finalPosName = inputVal || "POS #" + (activeEditIdx + 1);
          
          sessionData.roster[activeEditIdx].posLabel = finalPosName;
          document.getElementById('lbl_pos_' + activeEditIdx).innerText = finalPosName;
          
          posModal.hide();
          openPlayerPicker();
        }

        function openPlayerPicker() {
          const container = document.getElementById('memberListContainer');
          container.innerHTML = '';
          
          sessionData.serverMembers.forEach(m => {
            const div = document.createElement('div');
            div.className = 'col-12 member-card p-2 d-flex align-items-center gap-3';
            div.innerHTML = '<img src="' + m.avatar + '" style="width:40px; height:40px; border-radius:50%;" /><b>' + m.name + '</b>';
            div.onclick = () => assignUser(m.name, m.avatar);
            container.appendChild(div);
          });
          pickerModal.show();
        }

        function assignUser(name, avatar) {
          pickerModal.hide();
          const nodeEl = document.getElementById('node_' + activeEditIdx);
          nodeEl.style.background = '#2c3e50'; // Changes from grey dot to active profile background
          
          document.getElementById('avatar_box_' + activeEditIdx).innerHTML = '<img src="' + avatar + '" />';
          document.getElementById('lbl_usr_' + activeEditIdx).innerText = name;
          sessionData.roster[activeEditIdx].assignedUser = { name, avatar };
        }

        function saveAndPostToDiscord() {
          fetch('/api/save-lineup/' + sessionData.id, {
            method: 'POST',
