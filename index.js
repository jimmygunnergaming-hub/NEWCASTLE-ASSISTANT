const express = require('express');
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require('discord.js');
const sharp = require('sharp');

const app = express();
app.use(express.json({ limit: '2mb' }));

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (
  process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`
).replace(/\/$/, '');

const POSITION_GUILD_ID =
  process.env.POSITION_GUILD_ID || '1542615988137099324';

const POSITION_CHANNEL_ID =
  process.env.POSITION_CHANNEL_ID || '1542615989382942756';

const GUILD_ID =
  process.env.GUILD_ID || POSITION_GUILD_ID;

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN environment variable.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const sessions = new Map();

const POSITION_NAMES = [
  'GK',
  'CB',
  'LB',
  'RB',
  'LWB',
  'RWB',
  'DM',
  'CDM',
  'CM',
  'CAM',
  'LM',
  'RM',
  'LW',
  'RW',
  'ST',
  'CF',
  'LW/RW',
  'CB/LB',
  'CB/RB',
];

const FORMATIONS = {
  1: [{ x: 50, y: 50 }],

  2: [
    { x: 50, y: 83 },
    { x: 50, y: 17 },
  ],

  3: [
    { x: 50, y: 84 },
    { x: 30, y: 38 },
    { x: 70, y: 38 },
  ],

  4: [
    { x: 50, y: 86 },
    { x: 25, y: 60 },
    { x: 75, y: 60 },
    { x: 50, y: 30 },
  ],

  5: [
    { x: 50, y: 87 },
    { x: 22, y: 62 },
    { x: 78, y: 62 },
    { x: 35, y: 36 },
    { x: 65, y: 36 },
  ],

  6: [
    { x: 50, y: 87 },
    { x: 18, y: 61 },
    { x: 50, y: 66 },
    { x: 82, y: 61 },
    { x: 32, y: 35 },
    { x: 68, y: 35 },
  ],

  7: [
    { x: 50, y: 87 },
    { x: 18, y: 63 },
    { x: 50, y: 68 },
    { x: 82, y: 63 },
    { x: 22, y: 36 },
    { x: 50, y: 30 },
    { x: 78, y: 36 },
  ],

  8: [
    { x: 50, y: 88 },
    { x: 14, y: 64 },
    { x: 38, y: 68 },
    { x: 62, y: 68 },
    { x: 86, y: 64 },
    { x: 27, y: 36 },
    { x: 50, y: 29 },
    { x: 73, y: 36 },
  ],

  9: [
    { x: 50, y: 89 },
    { x: 13, y: 67 },
    { x: 32, y: 71 },
    { x: 50, y: 73 },
    { x: 68, y: 71 },
    { x: 87, y: 67 },
    { x: 22, y: 38 },
    { x: 50, y: 30 },
    { x: 78, y: 38 },
  ],

  10: [
    { x: 50, y: 90 },
    { x: 10, y: 69 },
    { x: 30, y: 72 },
    { x: 50, y: 74 },
    { x: 70, y: 72 },
    { x: 90, y: 69 },
    { x: 17, y: 39 },
    { x: 39, y: 33 },
    { x: 61, y: 33 },
    { x: 83, y: 39 },
  ],

  11: [
    { x: 50, y: 90 },
    { x: 9, y: 69 },
    { x: 28, y: 73 },
    { x: 50, y: 75 },
    { x: 72, y: 73 },
    { x: 91, y: 69 },
    { x: 16, y: 42 },
    { x: 36, y: 36 },
    { x: 64, y: 36 },
    { x: 84, y: 42 },
    { x: 50, y: 19 },
  ],
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeXml(value) {
  return escapeHtml(value);
}

function normalisePosition(text) {
  const s = String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9/ -]/g, ' ');

  for (const pos of POSITION_NAMES) {
    const escaped = pos.replace('/', '\\/');
    const rx = new RegExp(`(^|\\b)${escaped}($|\\b)`);

    if (rx.test(s)) {
      return pos;
    }
  }

  return 'UNSET';
}

function extractPositionFromMessage(message, membersById) {
  const chunks = [];

  if (message.content) {
    chunks.push(message.content);
  }

  for (const embed of message.embeds || []) {
    if (embed.title) chunks.push(embed.title);
    if (embed.description) chunks.push(embed.description);

    for (const field of embed.fields || []) {
      chunks.push(field.name, field.value);
    }
  }

  const text = chunks.filter(Boolean).join('\n');

  const position = normalisePosition(text);

  if (position === 'UNSET') {
    return null;
  }

  let userId = message.author?.id;

  if (message.mentions?.users?.size) {
    const mentioned = message.mentions.users.first();

    if (mentioned) {
      userId = mentioned.id;
    }
  }

  if (userId && membersById.has(userId)) {
    return {
      userId,
      position,
    };
  }

  const lowerText = text.toLowerCase();

  for (const [id, member] of membersById.entries()) {
    const names = [
      member.displayName,
      member.user.username,
      member.user.globalName,
    ]
      .filter(Boolean)
      .map(name => String(name).toLowerCase());

    if (names.some(name => lowerText.includes(name))) {
      return {
        userId: id,
        position,
      };
    }
  }

  return null;
}

async function getPositionMap(guild) {
  const result = new Map();

  try {
    await guild.members.fetch();
  } catch (err) {
    console.error('members.fetch failed:', err.message);
  }

  const membersById = new Map();

  for (const member of guild.members.cache.values()) {
    if (!member.user.bot) {
      membersById.set(member.id, member);
    }
  }

  const channel = await client.channels
    .fetch(POSITION_CHANNEL_ID)
    .catch(() => null);

  if (!channel || !channel.isTextBased()) {
    console.error('Position channel could not be loaded.');
    return result;
  }

  let before;

  for (let page = 0; page < 10; page++) {
    const options = {
      limit: 100,
    };

    if (before) {
      options.before = before;
    }

    const messages = await channel.messages
      .fetch(options)
      .catch(err => {
        console.error(
          'Position channel fetch failed:',
          err.message
        );

        return null;
      });

    if (!messages || messages.size === 0) {
      break;
    }

    for (const message of messages.values()) {
      const parsed = extractPositionFromMessage(
        message,
        membersById
      );

      if (
        parsed &&
        !result.has(parsed.userId)
      ) {
        result.set(
          parsed.userId,
          parsed.position
        );
      }
    }

    before = messages.last()?.id;

    if (messages.size < 100) {
      break;
    }
  }

  return result;
}

function createSession(guild, channel, size) {
  const id =
    `${Date.now().toString(36)}-` +
    `${Math.random().toString(36).slice(2, 9)}`;

  const formation = FORMATIONS[size];

  const slots = formation.map((p, i) => ({
    index: i,
    x: p.x,
    y: p.y,
    originalX: p.x,
    originalY: p.y,
    playerId: null,
    position: '',
  }));

  const session = {
    id,
    guildId: guild.id,
    channelId: channel.id,
    size,
    createdAt: Date.now(),
    slots,
    bench: [],
    positions: {},
  };

  sessions.set(id, session);

  return session;
}

function publicSession(session, members) {
  return {
    id: session.id,
    size: session.size,
    slots: session.slots,
    bench: session.bench,

    players: members.map(member => ({
      id: member.id,
      name:
        member.displayName ||
        member.user.globalName ||
        member.user.username,

      username: member.user.username,

      avatar: member.displayAvatarURL({
        extension: 'png',
        size: 128,
      }),

      position:
        session.positions[member.id] ||
        'UNSET',
    })),
  };
}

function pitchPage(sessionId) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"
>

<title>Newcastle Lineup</title>

<style>

*{
  box-sizing:border-box;
}

html,body{
  margin:0;
  background:#070b12;
  color:#fff;
  font-family:Arial,Helvetica,sans-serif;
  height:100%;
}

body{
  overflow:hidden;
}

.app{
  height:100dvh;
  display:flex;
  flex-direction:column;
}

.top{
  min-height:62px;
  display:flex;
  align-items:center;
  gap:10px;
  padding:8px 12px;
  background:#0d1420;
  border-bottom:1px solid #202a3a;
}

.top h1{
  font-size:17px;
  margin:0;
}

.top small{
  opacity:.65;
}

.actions{
  margin-left:auto;
  display:flex;
  gap:8px;
  flex-wrap:wrap;
}

.btn{
  border:0;
  border-radius:10px;
  padding:10px 13px;
  background:#1c2738;
  color:#fff;
  font-weight:700;
  cursor:pointer;
}

.btn.primary{
  background:#2f74ff;
}

.btn.danger{
  background:#a72a3d;
}

.main{
  flex:1;
  min-height:0;
  display:grid;
  grid-template-columns:minmax(0,1fr) 340px;
  gap:10px;
  padding:10px;
}

.pitch-wrap{
  min-width:0;
  display:flex;
  align-items:center;
  justify-content:center;
  overflow:hidden;
}

.pitch{
  position:relative;
  width:min(80vw,520px);
  aspect-ratio:2/3;
  border-radius:18px;

  background:
    repeating-linear-gradient(
      to bottom,
      #16813e 0,
      #16813e 8.33%,
      #1a8c45 8.33%,
      #1a8c45 16.66%
    );

  border:4px solid rgba(255,255,255,.9);
  box-shadow:0 20px 50px rgba(0,0,0,.35);
  touch-action:none;
  overflow:hidden;
}

.pitch:before{
  content:"";
  position:absolute;
  inset:0;

  background:
    linear-gradient(
      transparent 49.7%,
      rgba(255,255,255,.9) 49.7%,
      rgba(255,255,255,.9) 50.3%,
      transparent 50.3%
    );
}

.pitch:after{
  content:"";
  position:absolute;
  width:22%;
  aspect-ratio:1;
  border:3px solid rgba(255,255,255,.9);
  border-radius:50%;
  left:39%;
  top:39%;
}

.line-top,
.line-bottom{
  position:absolute;
  left:24%;
  width:52%;
  height:14%;
  border:3px solid rgba(255,255,255,.9);
}

.line-top{
  top:0;
  border-top:0;
}

.line-bottom{
  bottom:0;
  border-bottom:0;
}

.goal-top,
.goal-bottom{
  position:absolute;
  left:40%;
  width:20%;
  height:3%;
  background:rgba(255,255,255,.9);
}

.goal-top{
  top:-1px;
}

.goal-bottom{
  bottom:-1px;
}

.slot{
  position:absolute;
  width:76px;
  height:76px;
  transform:translate(-50%,-50%);
  border-radius:50%;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  cursor:pointer;
  user-select:none;
  touch-action:none;
}

.slot .circle{
  width:52px;
  height:52px;
  border-radius:50%;
  background:#666;
  border:3px solid #fff;
  display:flex;
  align-items:center;
  justify-content:center;
  overflow:hidden;
  box-shadow:0 4px 15px rgba(0,0,0,.3);
}

.slot img{
  width:100%;
  height:100%;
  object-fit:cover;
}

.slot .initial{
  font-size:20px;
  font-weight:900;
}

.slot .nm{
  max-width:100px;
  margin-top:3px;
  text-align:center;
  font-size:11px;
  font-weight:800;
  text-shadow:0 1px 3px #000;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}

.empty .circle{
  opacity:.95;
}

.selected .circle{
  outline:4px solid #ffd32a;
}

.side{
  min-height:0;
  background:#0d1420;
  border:1px solid #202a3a;
  border-radius:16px;
  display:flex;
  flex-direction:column;
  overflow:hidden;
}

.search{
  padding:10px;
  border-bottom:1px solid #202a3a;
}

.search input{
  width:100%;
  padding:11px;
  border:1px solid #2b3950;
  border-radius:10px;
  background:#080d15;
  color:#fff;
  outline:0;
}

.players{
  overflow:auto;
  padding:8px;
}

.player-section{
  margin-bottom:10px;
}

.section-title{
  font-size:12px;
  font-weight:900;
  opacity:.6;
  padding:6px 5px;
  text-transform:uppercase;
}

.player-row{
  width:100%;
  display:flex;
  align-items:center;
  gap:9px;
  border:0;
  background:#121b2a;
  color:#fff;
  padding:9px;
  border-radius:10px;
  margin-bottom:6px;
  cursor:pointer;
  text-align:left;
}

.player-row:hover{
  background:#182337;
}

.player-row img,
.fallback-avatar{
  width:35px;
  height:35px;
  border-radius:50%;
  flex:none;
}

.fallback-avatar{
  display:none;
  align-items:center;
  justify-content:center;
  background:#666;
  font-weight:900;
}

.player-name{
  min-width:0;
  flex:1;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}

.mini-pos{
  font-size:10px;
  opacity:.6;
}

.bottom{
  border-top:1px solid #202a3a;
  padding:8px;
  display:flex;
  gap:8px;
  flex-wrap:wrap;
}

.tag{
  padding:6px 8px;
  border-radius:8px;
  background:#182337;
  font-size:12px;
}

.bench{
  border-top:1px solid #202a3a;
  padding:8px;
}

.bench h3{
  margin:0 0 7px;
  font-size:12px;
  opacity:.7;
}

.bench-grid{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  max-height:120px;
  overflow:auto;
}

.bench-chip{
  border:0;
  background:#192235;
  color:#fff;
  border-radius:999px;
  padding:6px 9px;
  display:flex;
  align-items:center;
  gap:5px;
  cursor:pointer;
}

.bench-chip img{
  width:22px;
  height:22px;
  border-radius:50%;
}

.modal{
  position:fixed;
  inset:0;
  background:rgba(0,0,0,.6);
  display:none;
  align-items:center;
  justify-content:center;
  padding:15px;
  z-index:50;
}

.modal.show{
  display:flex;
}

.modal-card{
  width:min(460px,100%);
  max-height:80dvh;
  overflow:auto;
  background:#0d1420;
  border:1px solid #2b3950;
  border-radius:16px;
  padding:14px;
}

.modal-card h2{
  margin:0 0 10px;
  font-size:17px;
}

.pos-grid{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:8px;
}

.pos-btn{
  border:1px solid #2c3a51;
  background:#121c2c;
  color:#fff;
  border-radius:10px;
  padding:10px;
  cursor:pointer;
  font-weight:800;
}

.hint{
  font-size:12px;
  opacity:.55;
  margin-top:8px;
}

@media(max-width:900px){

  .main{
    grid-template-columns:1fr;
    grid-template-rows:minmax(0,1fr) 38dvh;
  }

  .pitch{
    width:min(65vw,430px);
  }

  .side{
    min-height:0;
  }

  .players{
    padding-bottom:70px;
  }
}

@media(max-width:520px){

  .top{
    min-height:58px;
  }

  .top h1{
    font-size:15px;
  }

  .btn{
    padding:9px 10px;
    font-size:12px;
  }

  .main{
    padding:6px;
    gap:6px;
  }

  .pitch{
    width:min(78vw,380px);
  }

  .slot{
    width:64px;
    height:64px;
  }

  .slot .circle{
    width:46px;
    height:46px;
  }

  .slot .nm{
    font-size:10px;
    max-width:80px;
  }
}

</style>
</head>

<body>

<div class="app">

  <div class="top">

    <div>
      <h1>NEWCASTLE LINEUP</h1>
      <small id="sub">Loading...</small>
    </div>

    <div class="actions">
      <button class="btn" onclick="clearSelection()">Clear</button>
      <button class="btn" onclick="positionSelected()">Position</button>
      <button class="btn" onclick="benchSelected()">Bench</button>
      <button class="btn primary" onclick="finish()">FINISH</button>
    </div>

  </div>

  <div class="main">

    <div class="pitch-wrap">

      <div class="pitch" id="pitch">

        <div class="line-top"></div>
        <div class="line-bottom"></div>
        <div class="goal-top"></div>
        <div class="goal-bottom"></div>

      </div>

    </div>

    <div class="side">

      <div class="search">
        <input
          id="search"
          placeholder="Search players..."
          oninput="renderPlayers()"
        >
      </div>

      <div class="players" id="players"></div>

      <div class="bench">

        <h3>
          BENCH — tap a bench player to restore them
        </h3>

        <div
          class="bench-grid"
          id="bench"
        ></div>

      </div>

      <div class="bottom">

        <span class="tag">
          Tap a grey circle to assign
        </span>

        <span class="tag">
          Drag to move
        </span>

        <span class="tag">
          Position button sets position
        </span>

      </div>

    </div>

  </div>

</div>

<div class="modal" id="posModal">

  <div class="modal-card">

    <h2 id="posTitle">
      Choose position
    </h2>

    <div
      class="pos-grid"
      id="posGrid"
    ></div>

    <div class="hint">
      Positions shown here come from channel ${POSITION_CHANNEL_ID}.
    </div>

    <button
      class="btn"
      style="margin-top:10px;width:100%"
      onclick="closePos()"
    >
      Cancel
    </button>

  </div>

</div>

<script>

const sid = ${JSON.stringify(sessionId)};

let state = null;
let selectedSlot = null;
let dragging = null;

const pitch = document.getElementById('pitch');

async function load() {

  try {

    const response = await fetch(
      '/api/session?id=' +
      encodeURIComponent(sid)
    );

    if (!response.ok) {
      document.getElementById('sub').textContent =
        'Session expired';
      return;
    }

    state = await response.json();

    document.getElementById('sub').textContent =
      state.size + 'v' + state.size;

    renderAll();

  } catch (error) {

    console.error(error);

    document.getElementById('sub').textContent =
      'Could not load lineup';

  }

}

function esc(s) {

  return String(s ?? '').replace(
    /[&<>\"']/g,
    c => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '\"':'&quot;',
      "'":'&#39;'
    }[c])
  );

}

function player(id) {

  return state.players.find(
    p => p.id === id
  );

}

function renderAll() {

  renderPitch();
  renderPlayers();
  renderBench();

}

function renderPitch() {

  pitch
    .querySelectorAll('.slot')
    .forEach(e => e.remove());

  state.slots.forEach(slot => {

    const p =
      slot.playerId
        ? player(slot.playerId)
        : null;

    const el =
      document.createElement('div');

    el.className =
      'slot' +
      (selectedSlot === slot.index ? ' selected' : '') +
      (p ? '' : ' empty');

    el.style.left =
      slot.x + '%';

    el.style.top =
      slot.y + '%';

    el.dataset.index =
      slot.index;

    const circle =
      document.createElement('div');

    circle.className =
      'circle';

    if (p) {

      const img =
        document.createElement('img');

      img.src =
        p.avatar;

      img.onerror = () => {

        img.remove();

        const initial =
          document.createElement('div');

        initial.className =
          'initial';

        initial.textContent =
          (p.name || '?')
            .slice(0,1)
            .toUpperCase();

        circle.appendChild(initial);

      };

      circle.appendChild(img);

    } else {

      circle.innerHTML =
        '<span style="font-size:25px">+</span>';

    }

    const nm =
      document.createElement('div');

    nm.className =
      'nm';

    nm.textContent =
      p ? p.name : 'EMPTY';

    el.appendChild(circle);
    el.appendChild(nm);

    el.onclick = () => {

      selectedSlot =
        slot.index;

      renderPitch();

    };

    el.onpointerdown =
      event => startDrag(
        event,
        slot.index
      );

    pitch.appendChild(el);

  });

}

function renderPlayers() {

  if (!state) return;

  const query =
    document.getElementById('search')
      .value
      .trim()
      .toLowerCase();

  const assigned =
    new Set(
      state.slots
        .filter(s => s.playerId)
        .map(s => s.playerId)
    );

  const benched =
    new Set(
      state.bench.map(
        b => b.playerId
      )
    );

  const available =
    state.players.filter(p => {

      const matchesSearch =
        !query ||
        p.name.toLowerCase().includes(query) ||
        p.position.toLowerCase().includes(query);

      return (
        !assigned.has(p.id) &&
        !benched.has(p.id) &&
        matchesSearch
      );

    });

  const groups = {};

  available.forEach(p => {

    if (!groups[p.position]) {
      groups[p.position] = [];
    }

    groups[p.position].push(p);

  });

  const order = [
    'GK',
    'CB',
    'LB',
    'RB',
    'LWB',
    'RWB',
    'DM',
    'CDM',
    'CM',
    'CAM',
    'LM',
    'RM',
    'LW',
    'RW',
    'CF',
    'ST',
    'UNSET'
  ];

  const keys = [
    ...order.filter(
      key => groups[key]
    ),
    ...Object.keys(groups)
      .filter(
        key => !order.includes(key)
      )
  ];

  let html = '';

  keys.forEach(position => {

    html +=
      '<section class="player-section">' +
      '<div class="section-title">' +
      esc(position) +
      '</div>';

    groups[position].forEach(p => {

      html +=
        '<button class="player-row" ' +
        'onclick="pickPlayer(\\'' +
        p.id +
        '\\')">' +

        '<img src="' +
        esc(p.avatar) +
        '" ' +
        'onerror="this.style.display=\\'none\\';' +
        'this.nextElementSibling.style.display=\\'flex\\'">' +

        '<span class="fallback-avatar">' +
        esc(
          (p.name || '?')
            .slice(0,1)
            .toUpperCase()
        ) +
        '</span>' +

        '<span class="player-name">' +
        esc(p.name) +
        '</span>' +

        '<span class="mini-pos">' +
        esc(p.position) +
        '</span>' +

        '</button>';

    });

    html += '</section>';

  });

  document.getElementById('players')
    .innerHTML = html;

}

function renderBench() {

  const container =
    document.getElementById('bench');

  if (!state.bench.length) {

    container.innerHTML =
      '<span style="opacity:.45;font-size:12px">' +
      'No players on bench' +
      '</span>';

    return;
  }

  container.innerHTML =
    state.bench.map(b => {

      const p =
        player(b.playerId);

      if (!p) return '';

      return `
        <button
          class="bench-chip"
          onclick="restoreBench('${p.id}')"
        >
          <img
            src="${esc(p.avatar)}"
            onerror="this.style.display='none'"
          >
          ${esc(p.name)}
        </button>
      `;

    }).join('');

}

async function pickPlayer(id) {

  if (selectedSlot === null) {

    alert(
      'Tap a pitch slot first.'
    );

    return;

  }

  const slot =
    state.slots.find(
      s => s.index === selectedSlot
    );

  if (!slot) return;

  const response =
    await fetch('/api/assign', {
      method:'POST',
      headers:{
        'content-type':
          'application/json'
      },
      body:JSON.stringify({
        id:sid,
        slotIndex:selectedSlot,
        playerId:id
      })
    });

  if (!response.ok) {

    alert('Could not assign player.');
    return;

  }

  const old =
    state.slots.find(
      s =>
        s.playerId === id &&
        s.index !== selectedSlot
    );

  if (old) {
    old.playerId = null;
  }

  state.bench =
    state.bench.filter(
      b => b.playerId !== id
    );

  slot.playerId = id;

  renderAll();

}

function clearSelection() {

  selectedSlot = null;
  renderPitch();

}

function positionSelected() {

  if (selectedSlot === null) {

    alert(
      'Select a player slot first.'
    );

    return;

  }

  const slot =
    state.slots.find(
      s => s.index === selectedSlot
    );

  if (!slot || !slot.playerId) {

    alert(
      'Select a player first.'
    );

    return;

  }

  openPos(selectedSlot);

}

function openPos(slotIndex) {

  const slot =
    state.slots.find(
      s => s.index === slotIndex
    );

  if (!slot || !slot.playerId) return;

  const p =
    player(slot.playerId);

  if (!p) return;

  document.getElementById('posTitle')
    .textContent =
    'Position for ' + p.name;

  const positions = [
    'GK',
    'CB',
    'LB',
    'RB',
    'LWB',
    'RWB',
    'DM',
    'CDM',
    'CM',
    'CAM',
    'LM',
    'RM',
    'LW',
    'RW',
    'CF',
    'ST'
  ];

  document.getElementById('posGrid')
    .innerHTML =
      positions.map(pos => `
        <button
          class="pos-btn"
          onclick="setPosition('${pos}')"
        >
          ${pos}
        </button>
      `).join('');

  document.getElementById('posModal')
    .classList.add('show');

}

function closePos() {

  document.getElementById('posModal')
    .classList.remove('show');

}

async function setPosition(position) {

  if (selectedSlot === null) return;

  const response =
    await fetch('/api/position', {
      method:'POST',
      headers:{
        'content-type':
          'application/json'
      },
      body:JSON.stringify({
        id:sid,
        slotIndex:selectedSlot,
        position
      })
    });

  if (!response.ok) {

    alert('Could not set position.');
    return;

  }

  const slot =
    state.slots.find(
      s => s.index === selectedSlot
    );

  if (slot) {

    slot.position =
      position;

    if (slot.playerId) {

      const p =
        player(slot.playerId);

      if (p) {
        p.position =
          position;
      }

    }

  }

  closePos();
  renderAll();

}

function benchSelected() {

  if (selectedSlot === null) {

    alert(
      'Select a player slot first.'
    );

    return;

  }

  const slot =
    state.slots.find(
      s => s.index === selectedSlot
    );

  if (!slot || !slot.playerId) {

    alert(
      'Select a player first.'
    );

    return;

  }

  sendToBench(
    selectedSlot,
    slot.playerId
  );

}

async function sendToBench(
  slotIndex,
  playerId
) {

  const response =
    await fetch('/api/bench', {
      method:'POST',
      headers:{
        'content-type':
          'application/json'
      },
      body:JSON.stringify({
        id:sid,
        slotIndex,
        playerId
      })
    });

  if (!response.ok) {

    alert(
      'Could not move player to bench.'
    );

    return;

  }

  const slot =
    state.slots.find(
      s => s.index === slotIndex
    );

  if (!slot) return;

  state.bench.push({
    playerId,
    originalSlot:slotIndex
  });

  slot.playerId = null;
  slot.position = '';

  selectedSlot = null;

  renderAll();

}

async function restoreBench(id) {

  const benchEntry =
    state.bench.find(
      b => b.playerId === id
    );

  if (!benchEntry) return;

  let slot =
    state.slots.find(
      s =>
        s.index === benchEntry.originalSlot &&
        !s.playerId
    );

  if (!slot) {

    slot =
      state.slots.find(
        s => !s.playerId
      );

  }

  if (!slot) {

    alert(
      'No empty slot available.'
    );

    return;

  }

  const response =
    await fetch('/api/restore', {
      method:'POST',
      headers:{
        'content-type':
          'application/json'
      },
      body:JSON.stringify({
        id:sid,
        playerId:id,
        slotIndex:slot.index
      })
    });

  if (!response.ok) {

    alert(
      'Could not restore player.'
    );

    return;

  }

  state.bench =
    state.bench.filter(
      b => b.playerId !== id
    );

  slot.playerId =
    id;

  selectedSlot =
    slot.index;

  renderAll();

}

function startDrag(event, slotIndex) {

  if (!state) return;

  event.preventDefault();

  const slot =
    state.slots.find(
      s => s.index === slotIndex
    );

  if (!slot) return;

  selectedSlot =
    slotIndex;

  dragging = {
    slotIndex,
    pointerId:event.pointerId
  };

  try {
    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  } catch {}

}

pitch.addEventListener(
  'pointermove',
  async event => {

    if (!dragging) return;

    const rect =
      pitch.getBoundingClientRect();

    let x =
      ((event.clientX - rect.left) /
      rect.width) * 100;

    let y =
      ((event.clientY - rect.top) /
      rect.height) * 100;

    x =
      Math.max(4, Math.min(96, x));

    y =
      Math.max(5, Math.min(95, y));

    // Grid snapping
    x =
      Math.round(x / 2) * 2;

    y =
      Math.round(y / 2) * 2;

    const slot =
      state.slots.find(
        s =>
          s.index === dragging.slotIndex
      );

    if (!slot) return;

    slot.x = x;
    slot.y = y;

    const el =
      document.querySelector(
        '.slot[data-index="' +
        dragging.slotIndex +
        '"]'
      );

    if (el) {

      el.style.left =
        x + '%';

      el.style.top =
        y + '%';

    }

  }
);

pitch.addEventListener(
  'pointerup',
  async () => {

    if (!dragging) return;

    const slot =
      state.slots.find(
        s =>
          s.index === dragging.slotIndex
      );

    if (slot) {

      await fetch('/api/move', {
        method:'POST',
        headers:{
          'content-type':
            'application/json'
        },
        body:JSON.stringify({
          id:sid,
          slotIndex:slot.index,
          x:slot.x,
          y:slot.y
        })
      });

    }

    dragging = null;
    renderPitch();

  }
);

pitch.addEventListener(
  'pointercancel',
  () => {
    dragging = null;
  }
);

pitch.addEventListener(
  'dblclick',
  event => {

    const slot =
      event.target.closest?.('.slot');

    if (!slot) return;

    const index =
      Number(slot.dataset.index);

    selectedSlot =
      index;

    openPos(index);

  }
);

pitch.addEventListener(
  'contextmenu',
  event => {
    event.preventDefault();
  }
);

async function finish() {

  if (!confirm(
    'Post this lineup to Discord?'
  )) {
    return;
  }

  const response =
    await fetch('/final', {
      method:'POST',
      headers:{
        'content-type':
          'application/json'
      },
      body:JSON.stringify({
        id:sid
      })
    });

  const result =
    await response.json()
      .catch(() => ({}));

  if (!response.ok) {

    alert(
      result.error ||
      'Failed to post lineup'
    );

    return;

  }

  alert(
    'Lineup posted to Discord!'
  );

}

load();

</script>

</body>
</html>`;
}

async function imageToDataUri(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'NewcastleAssistant/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const buffer =
      Buffer.from(
        await response.arrayBuffer()
      );

    const png =
      await sharp(buffer)
        .png()
        .resize(92, 92, {
          fit:'cover',
        })
        .toBuffer();

    return (
      'data:image/png;base64,' +
      png.toString('base64')
    );

  } catch {
    return null;
  }
}

async function makeLineupImage(session) {

  const width = 1200;
  const height = 1500;

  const pitchX = 250;
  const pitchY = 80;

  const pitchW = 700;
  const pitchH = 1050;

  const guild =
    await client.guilds
      .fetch(session.guildId)
      .catch(() => null);

  const roster = [];

  for (const slot of session.slots) {

    if (!slot.playerId) {

      roster.push({
        slot,
        member:null,
        avatar:null,
      });

      continue;
    }

    const member =
      guild
        ? await guild.members
            .fetch(slot.playerId)
            .catch(() => null)
        : null;

    const avatar =
      member
        ? await imageToDataUri(
            member.displayAvatarURL({
              extension:'png',
              size:128,
            })
          )
        : null;

    roster.push({
      slot,
      member,
      avatar,
    });

  }

  const svg = [];

  svg.push(
    `<svg xmlns="http://www.w3.org/2000/svg"
      width="${width}"
      height="${height}"
      viewBox="0 0 ${width} ${height}">`
  );

  svg.push(`
    <defs>
      <linearGradient
        id="bg"
        x1="0"
        y1="0"
        x2="0"
        y2="1"
      >
        <stop
          offset="0"
          stop-color="#07101b"
        />
        <stop
          offset="1"
          stop-color="#0e1b2d"
        />
      </linearGradient>
    </defs>
  `);

  svg.push(`
    <rect
      width="1200"
      height="1500"
      fill="url(#bg)"
    />
  `);

  svg.push(`
    <text
      x="600"
      y="45"
      text-anchor="middle"
      fill="#ffffff"
      font-family="Arial"
      font-size="30"
      font-weight="800"
    >
      NEWCASTLE LINEUP
    </text>
  `);

  svg.push(`
    <rect
      x="${pitchX}"
      y="${pitchY}"
      width="${pitchW}"
      height="${pitchH}"
      rx="20"
      fill="#188842"
      stroke="#fff"
      stroke-width="6"
    />
  `);

  for (let i = 1; i < 12; i++) {

    svg.push(`
      <rect
        x="${pitchX}"
        y="${pitchY +
          (pitchH / 12) * i}"
        width="${pitchW}"
        height="${pitchH / 12}"
        fill="${
          i % 2
            ? '#188842'
            : '#1b9148'
        }"
        opacity=".95"
      />
    `);

  }

  svg.push(`
    <line
      x1="${pitchX}"
      y1="${pitchY + pitchH / 2}"
      x2="${pitchX + pitchW}"
      y2="${pitchY + pitchH / 2}"
      stroke="#fff"
      stroke-width="5"
      opacity=".9"
    />
  `);

  svg.push(`
    <circle
      cx="${pitchX + pitchW / 2}"
      cy="${pitchY + pitchH / 2}"
      r="70"
      fill="none"
      stroke="#fff"
      stroke-width="5"
    />
  `);

  svg.push(`
    <rect
      x="${pitchX + pitchW * .25}"
      y="${pitchY}"
      width="${pitchW * .5}"
      height="${pitchH * .14}"
      fill="none"
      stroke="#fff"
      stroke-width="5"
    />
  `);

  svg.push(`
    <rect
      x="${pitchX + pitchW * .25}"
      y="${pitchY + pitchH * .86}"
      width="${pitchW * .5}"
      height="${pitchH * .14}"
      fill="none"
      stroke="#fff"
      stroke-width="5"
    />
  `);

  for (const item of roster) {

    const slot =
      item.slot;

    const cx =
      pitchX +
      (slot.x / 100) * pitchW;

    const cy =
      pitchY +
      (slot.y / 100) * pitchH;

    const r = 48;

    svg.push(`
      <circle
        cx="${cx}"
        cy="${cy}"
        r="${r + 4}"
        fill="#fff"
        opacity=".95"
      />
    `);

    if (item.avatar) {

      svg.push(`
        <circle
          cx="${cx}"
          cy="${cy}"
          r="${r}"
          fill="#666"
        />

        <image
          href="${item.avatar}"
          x="${cx - r}"
          y="${cy - r}"
          width="${r * 2}"
          height="${r * 2}"
          preserveAspectRatio="xMidYMid slice"
          clip-path="circle(${r}px at ${cx}px ${cy}px)"
        />
      `);

    } else {

      svg.push(`
        <circle
          cx="${cx}"
          cy="${cy}"
          r="${r}"
          fill="#666"
        />

        <text
          x="${cx}"
          y="${cy + 15}"
          text-anchor="middle"
          fill="#fff"
          font-family="Arial"
          font-size="34"
          font-weight="900"
        >
          +
        </text>
      `);

    }

    const name =
      item.member
        ? (
            item.member.displayName ||
            item.member.user.username
          )
        : 'EMPTY';

    const position =
      slot.position || '';

    svg.push(`
      <text
        x="${cx}"
        y="${cy + 70}"
        text-anchor="middle"
        fill="#fff"
        font-family="Arial"
        font-size="18"
        font-weight="800"
      >
        ${escapeXml(name)}
      </text>
    `);

    if (position) {

      svg.push(`
        <text
          x="${cx}"
          y="${cy + 92}"
          text-anchor="middle"
          fill="#d7e3ff"
          font-family="Arial"
          font-size="14"
          font-weight="700"
        >
          ${escapeXml(position)}
        </text>
      `);

    }

  }

  svg.push(`
    <text
      x="600"
      y="1185"
      text-anchor="middle"
      fill="#fff"
      font-family="Arial"
      font-size="22"
      font-weight="800"
    >
      BENCH
    </text>
  `);

  let bx = 150;
  let by = 1240;

  for (const benchPlayer of session.bench) {

    const member =
      guild
        ? await guild.members
            .fetch(benchPlayer.playerId)
            .catch(() => null)
        : null;

    const avatar =
      member
        ? await imageToDataUri(
            member.displayAvatarURL({
              extension:'png',
              size:96,
            })
          )
        : null;

    if (bx > 1000) {

      bx = 150;
      by += 120;

    }

    svg.push(`
      <circle
        cx="${bx}"
        cy="${by}"
        r="38"
        fill="#fff"
      />
    `);

    if (avatar) {

      svg.push(`
        <circle
          cx="${bx}"
          cy="${by}"
          r="34"
          fill="#666"
        />

        <image
          href="${avatar}"
          x="${bx - 34}"
          y="${by - 34}"
          width="68"
          height="68"
          preserveAspectRatio="xMidYMid slice"
        />
      `);

    } else {

      svg.push(`
        <circle
          cx="${bx}"
          cy="${by}"
          r="34"
          fill="#666"
        />
      `);

    }

    const name =
      member
        ? (
            member.displayName ||
            member.user.username
          )
        : 'Unknown';

    svg.push(`
      <text
        x="${bx}"
        y="${by + 60}"
        text-anchor="middle"
        fill="#fff"
        font-family="Arial"
        font-size="16"
        font-weight="700"
      >
        ${escapeXml(name)}
      </text>
    `);

    bx += 145;

  }

  svg.push('</svg>');

  return sharp(
    Buffer.from(
      svg.join('')
    )
  )
    .png()
    .toBuffer();

}

async function getSessionMembers(session) {

  const guild =
    await client.guilds.fetch(
      session.guildId
    );

  await guild.members
    .fetch()
    .catch(() => null);

  const members =
    [...guild.members.cache.values()]
      .filter(
        member => !member.user.bot
      );

  const positionMap =
    await getPositionMap(guild);

  for (const member of members) {

    session.positions[member.id] =
      positionMap.get(member.id) ||
      session.positions[member.id] ||
      'UNSET';

  }

  return {
    guild,
    members,
  };

}

client.once('ready', async () => {

  console.log(
    `Logged in as ${client.user.tag}`
  );

  const command =
    new SlashCommandBuilder()
      .setName('lineup')
      .setDescription(
        'Create a football lineup'
      )
      .addIntegerOption(option =>
        option
          .setName('size')
          .setDescription(
            'Team size'
          )
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(11)
      );

  try {

    const guild =
      client.guilds.cache.get(
        GUILD_ID
      );

    if (guild) {

      await guild.commands.set([
        command.toJSON(),
      ]);

    } else {

      await client.application.commands.set([
        command.toJSON(),
      ]);

    }

    console.log(
      'Registered /lineup'
    );

  } catch (err) {

    console.error(
      'Command registration failed:',
      err
    );

  }

});

client.on(
  'interactionCreate',
  async interaction => {

    if (
      !interaction.isChatInputCommand() ||
      interaction.commandName !== 'lineup'
    ) {
      return;
    }

    try {

      const guild =
        interaction.guild;

      if (!guild) {

        return interaction.reply({
          content:
            'Use this command inside a server.',
          ephemeral:true,
        });

      }

      const size =
        interaction.options
          .getInteger('size');

      if (size) {

        const session =
          createSession(
            guild,
            interaction.channel,
            size
          );

        const url =
          `${BASE_URL}/pitch?id=` +
          encodeURIComponent(
            session.id
          );

        return interaction.reply({
          content:
            `Open the lineup editor: ${url}`,
          ephemeral:true,
        });

      }

      const rows = [];

      for (
        let start = 1;
        start <= 11;
        start += 5
      ) {

        const row =
          new ActionRowBuilder();

        for (
          let n = start;
          n < start + 5 && n <= 11;
          n++
        ) {

          row.addComponents(
            new ButtonBuilder()
              .setCustomId(
                `lineup_size_${n}`
              )
              .setLabel(
                `${n}v${n}`
              )
              .setStyle(
                n === 11
                  ? ButtonStyle.Primary
                  : ButtonStyle.Secondary
              )
          );

        }

        rows.push(row);

      }

      await interaction.reply({
        content:
          'Choose your lineup size:',
        components:rows,
        ephemeral:true,
      });

    } catch (err) {

      console.error(
        'lineup command error:',
        err
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {

        await interaction.reply({
          content:
            'Could not start lineup editor.',
          ephemeral:true,
        }).catch(() => null);

      }

    }

  }
);

client.on(
  'interactionCreate',
  async interaction => {

    if (
      !interaction.isButton() ||
      !interaction.customId.startsWith(
        'lineup_size_'
      )
    ) {
      return;
    }

    const size =
      Number(
        interaction.customId
          .split('_')
          .pop()
      );

    if (
      !(size >= 1 && size <= 11)
    ) {
      return;
    }

    try {

      const session =
        createSession(
          interaction.guild,
          interaction.channel,
          size
        );

      const url =
        `${BASE_URL}/pitch?id=` +
        encodeURIComponent(
          session.id
        );

      await interaction.update({
        content:
          `Open the lineup editor: ${url}`,
        components:[],
      });

    } catch (err) {

      console.error(
        'size button error:',
        err
      );

      await interaction.update({
        content:
          'Could not create the lineup editor.',
        components:[],
      }).catch(() => null);

    }

  }
);

app.get(
  '/health',
  (req, res) => {
    res.status(200).send('OK');
  }
);

app.get(
  '/pitch',
  (req, res) => {

    const session =
      sessions.get(
        req.query.id
      );

    if (!session) {

      return res
        .status(404)
        .send(
          'Lineup session not found or expired.'
        );

    }

    res.send(
      pitchPage(session.id)
    );

  }
);

app.get(
  '/api/session',
  async (req, res) => {

    const session =
      sessions.get(
        req.query.id
      );

    if (!session) {

      return res
        .status(404)
        .json({
          error:
            'Session not found',
        });

    }

    try {

      const { members } =
        await getSessionMembers(
          session
        );

      res.json(
        publicSession(
          session,
          members
        )
      );

    } catch (err) {

      console.error(
        'session api error:',
        err
      );

      res
        .status(500)
        .json({
          error:
            'Could not load players',
        });

    }

  }
);

app.post(
  '/api/assign',
  (req, res) => {

    const {
      id,
      slotIndex,
      playerId,
    } = req.body || {};

    const session =
      sessions.get(id);

    if (!session) {

      return res
        .status(404)
        .json({
          error:
            'Session not found',
        });

    }

    const slot =
      session.slots.find(
        s =>
          s.index ===
          Number(slotIndex)
      );

    if (!slot) {

      return res
        .status(400)
        .json({
          error:
            'Slot not found',
        });

    }

    const already =
      session.slots.find(
        s =>
          s.playerId === playerId &&
          s.index !== slot.index
      );

    if (already) {
      already.playerId = null;
    }

    session.bench =
      session.bench.filter(
        b =>
          b.playerId !== playerId
      );

    slot.playerId =
      playerId;

    res.json({
      ok:true,
    });

  }
);

app.post(
  '/api/position',
  (req, res) => {

    const {
      id,
      slotIndex,
      position,
    } = req.body || {};

    const session =
      sessions.get(id);

    if (!session) {

      return res
        .status(404)
        .json({
          error:
            'Session not found',
        });

    }

    const slot =
      session.slots.find(
        s =>
          s.index ===
          Number(slotIndex)
      );

    if (!slot) {

      return res
        .status(400)
        .json({
          error:
            'Slot not found',
        });

    }

    slot.position =
      String(
        position || ''
      ).slice(0,12);

    if (slot.playerId) {

      session.positions[
        slot.playerId
      ] =
        slot.position;

    }

    res.json({
      ok:true,
    });

  }
);

app.post(
  '/api/move',
  (req, res) => {

    const {
      id,
      slotIndex,
      x,
      y,
    } = req.body || {};

    const session =
      sessions.get(id);

    if (!session) {

      return res
        .status(404)
        .json({
          error:
            'Session not found',
        });

    }

    const slot =
      session.slots.find(
        s =>
          s.index ===
          Number(slotIndex)
      );

    if (!slot) {

      return res
        .status(400)
        .json({
          error:
            'Slot not found',
        });

    }

    slot.x =
      Math.max(
        4,
        Math.min(
          96,
          Number(x)
        )
      );

    slot.y =
      Math.max(
        5,
        Math.min(
          95,
          Number(y)
        )
      );

    res.json({
      ok:true,
    });

  }
);

app.post(
  '/api/bench',
  (req, res) => {

    const {
      id,
      slotIndex,
      playerId,
    } = req.body || {};

    const session =
      sessions.get(id);

    if (!session) {

      return res
        .status(404)
        .json({
          error:
            'Session not found',
        });

    }

    const slot =
      session.slots.find(
        s =>
          s.index ===
          Number(slotIndex)
      );

    if (
      !slot ||
      slot.playerId !== playerId
    ) {

      return res
        .status(400)
        .json({
          error:
            'Player is not in that slot',
        });

    }

    if (
      !session.bench.some(
        b =>
          b.playerId === playerId
      )
    ) {

      session.bench.push({
        playerId,
        originalSlot:
          slot.index,
      });

    }

    slot.playerId = null;
    slot.position = '';

    res.json({
      ok:true,
    });

  }
);

app.post(
  '/api/restore',
  (req, res) => {

    const {
      id,
      playerId,
      slotIndex,
    } = req.body || {};

    const session =
      sessions.get(id);

    if (!session) {

      return res
        .status(404)
        .json({
          error:
            'Session not found',
        });

    }

    const bench =
      session.bench.find(
        b =>
          b.playerId === playerId
      );

    if (!bench) {

      return res
        .status(400)
        .json({
          error:
            'Not on bench',
        });

    }

    const slot =
      session.slots.find(
        s =>
          s.index ===
          Number(slotIndex)
      );

    if (
      !slot ||
      slot.playerId
    ) {

      return res
        .status(400)
        .json({
          error:
            'Slot unavailable',
        });

    }

    session.bench =
      session.bench.filter(
        b =>
          b.playerId !== playerId
      );

    slot.playerId =
      playerId;

    res.json({
      ok:true,
    });

  }
);

app.post(
  '/final',
  async (req, res) => {

    const session =
      sessions.get(
        req.body?.id
      );

    if (!session) {

      return res
        .status(404)
        .json({
          error:
            'Session not found',
        });

    }

    try {

      const channel =
        await client.channels.fetch(
          session.channelId
        );

      if (
        !channel ||
        !channel.isTextBased()
      ) {

        throw new Error(
          'Original channel not available'
        );

      }

      const image =
        await makeLineupImage(
          session
        );

      const file =
        new AttachmentBuilder(
          image,
          {
            name:
              'newcastle-lineup.png',
          }
        );

      await channel.send({
        content:
          '**NEWCASTLE LINEUP TODAY ENJOY**',
        files:[file],
      });

      res.json({
        ok:true,
      });

    } catch (err) {

      console.error(
        'final post failed:',
        err
      );

      res
        .status(500)
        .json({
          error:
            `Failed to post lineup: ${err.message}`,
        });

    }

  }
);

setInterval(
  () => {

    const cutoff =
      Date.now() -
      6 * 60 * 60 * 1000;

    for (
      const [id, session]
      of sessions
    ) {

      if (
        session.createdAt <
        cutoff
      ) {

        sessions.delete(id);

      }

    }

  },
  30 * 60 * 1000
).unref();

app.listen(
  PORT,
  '0.0.0.0',
  () => {

    console.log(
      `Web server listening on 0.0.0.0:${PORT}`
    );

  }
);

client.login(
  DISCORD_TOKEN
).catch(err => {

  console.error(
    'Discord login failed:',
    err
  );

  process.exit(1);

});
