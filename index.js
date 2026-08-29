const express = require('express');
const app = express();
const { Client, GatewayIntentBits, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

app.use(express.json());

const liveSessions = new Map();

// -------------------------------------------------------------
// DYNAMIC IMMERSIVE WEB APP SYSTEM (PITCH DASHBOARD)
// -------------------------------------------------------------
app.get('/pitch/:sessionId', (req, res) => {
  const session = liveSessions.get(req.params.sessionId);
  if (!session) return res.status(404).send('Lineup session expired or not found.');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Tactical Field Live Stream Console</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://jsdelivr.net" rel="stylesheet">
      <style>
        body { background: #111; color: #fff; font-family: 'Segoe UI', sans-serif; text-align: center; overflow-x: hidden; }
        .pitch-environment { 
          position: relative; width: 100%; max-width: 700px; height: 85vh; margin: 20px auto;
          background: linear-gradient(to bottom, #1e722a 50%, #15531e 50%);
          background-size: 100% 8%; 
          border: 4px solid rgba(255,255,255,0.8); border-radius: 12px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.6); overflow: hidden;
        }
        .midfield-line { position: absolute; top: 50%; left: 0; width: 100%; height: 4px; background: rgba(255,255,255,0.8); }
        .center-circle { position: absolute; top: 50%; left: 50%; width: 140px; height: 140px; border: 4px solid rgba(255,255,255,0.8); border-radius: 50%; transform: translate(-50%, -50%); }
        .penalty-box-top { position: absolute; top: 0; left: 50%; width: 260px; height: 130px; border: 4px dashed rgba(255,255,255,0.5); transform: translateX(-50%); border-top: none; }
        .penalty-box-bot { position: absolute; bottom: 0; left: 50%; width: 260px; height: 130px; border: 4px solid rgba(255,255,255,0.8); transform: translateX(-50%); border-bottom: none; }
        
        .player-node {
          position: absolute; width: 75px; height: 75px; background: #2c3e50;
          border: 3px solid #f1c40f; border-radius: 50%; cursor: move;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          transition: transform 0.1s ease, box-shadow 0.2s; box-shadow: 0 8px 15px rgba(0,0,0,0.4);
          transform: translate(-50%, -50%); z-index: 10;
        }
        .player-node:hover { box-shadow: 0 0 20px #f1c40f; scale: 1.08; }
        .player-node img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
        .label-container { position: absolute; bottom: -42px; width: 120px; font-size: 11px; font-weight: bold; background: rgba(0,0,0,0.85); border-radius: 4px; padding: 4px; border: 1px solid #444; }
        .pos-name { color: #f1c40f; text-transform: uppercase; letter-spacing: 0.5px; } 
        .usr-name { color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
        
        .modal-content { background: #222; color: #fff; border: 2px solid #f1c40f; }
        .member-card { background: #2c3e50; border-radius: 8px; cursor: pointer; transition: 0.2s; }
        .member-card:hover { background: #f1c40f; color: #000; transform: translateY(-3px); }
      </style>
    </head>
    <body class="container-fluid py-3">
      <h3>⚽ NEWCASTLE ASSISTANT STRATEGY CONSOLE</h3>
      <p class="text-muted">Format: <b class="text-white">\${session.total}v\${session.total}</b> | Drag circles anywhere. Click a circle to name its position and assign players!</p>
      
      <div class="pitch-environment" id="pitch">
        <div class="midfield-line"></div>
        <div class="center-circle"></div>
        <div class="penalty-box-top"></div>
        <div class="penalty-box-bot"></div>
        
        \${session.roster.map((player, idx) => {
          const pctY = 85 - (idx * (70 / Math.max(1, session.total - 1)));
          const pctX = 50 + (idx % 2 === 0 ? (idx * 3) : -(idx * 3));
          return \`
            <div class="player-node" id="node_\${idx}" style="left: \${pctX}%; top: \${pctY}%;" 
                 mousedown="startNodeDrag(event, \${idx})" onclick="handleNodeClick(\${idx})">
              <div id="avatar_box_\${idx}" class="w-100 h-100 d-flex align-items-center justify-content-center">
                <span style="font-size:24px; color:#95a5a6;">⚪</span>
              </div>
              <div class="label-container">
                <div class="pos-name" id="lbl_pos_\${idx}">\${player.posLabel}</div>
                <div class="usr-name" id="lbl_usr_\${idx}">Unassigned</div>
              </div>
            </div>
          \`;
        }).join('')}
      </div>

      <button class="btn btn-success btn-lg px-5 shadow mb-4" onclick="saveAndPostToDiscord()">Save & Send to Discord</button>

      <!-- Step 1: Position Name Prompt Modal -->
      <div class="modal fade" id="positionModal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header border-secondary"><h5 class="modal-title">Set Position Name</h5></div>
            <div class="modal-body text-start">
              <label class="form-label text-muted">What position is this circle? (e.g. GK, CB, Striker)</label>
              <input type="text" class="form-control bg-dark text-white border-secondary" id="posNameInput" placeholder="Striker">
            </div>
            <div class="modal-footer border-secondary">
              <button type="button" class="btn btn-warning w-100" onclick="submitPositionName()">Next: Choose Player ➡️</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 2: Member Selection Popup -->
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
        const sessionData = \${JSON.stringify(session)};
        let activeEditIdx = null;
        let posModal, pickerModal;

        document.addEventListener("DOMContentLoaded", () => {
          posModal = new bootstrap.Modal(document.getElementById('positionModal'));
          pickerModal = new bootstrap.Modal(document.getElementById('pickerModal'));
        });

        // Touch and Mouse drag engine controller maps
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
            container.innerHTML += \`
              <div class="col-12">
                <div class="member-card p-2 d-flex align-items-center gap-3" onclick="assignUser('\${m.name}', '\${m.avatar}')">
                  <img src="\${m.avatar}" style="width:40px; height:40px; border-radius:50%;" />
                  <b>\${m.name}</b>
                </div>
              </div>
            \`;
          });
          pickerModal.show();
        }

        function assignUser(name, avatar) {
          pickerModal.hide();
          document.getElementById('avatar_box_' + activeEditIdx).innerHTML = \`<img src="\${avatar}" />\`;
          document.getElementById('lbl_usr_' + activeEditIdx).innerText = name;
          sessionData.roster[activeEditIdx].assignedUser = { name, avatar };
        }

        function saveAndPostToDiscord() {
          fetch('/api/save-lineup/' + sessionData.id, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roster: sessionData.roster })
          }).then(() => alert('Lineup finalized! You can safely close this tab and check Discord.'));
        }
      </script>
    </body>
    </html>
  `);
});

