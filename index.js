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
app.use(express.json({ limit: '4mb' }));

const PORT = parseInt(process.env.PORT || '3000', 10);
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

const GUILD_ID =
  process.env.GUILD_ID || '1542615988137099324';

const POSITION_CHANNEL_ID =
  process.env.POSITION_CHANNEL_ID ||
  '1542615989382942756';

const REFRESH_MS = 60 * 1000;
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

const BASE_URL = (
  process.env.RENDER_EXTERNAL_URL ||
  `http://localhost:${PORT}`
).replace(/\/+$/, '');

if (!DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN is missing.');
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

let currentPlayers = new Map();
let currentPositions = new Map();
let lastRefresh = 0;

const POSITIONS = [
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
];

const FORMATIONS = {
  1: [{ x: 50, y: 50 }],

  2: [
    { x: 50, y: 80 },
    { x: 50, y: 20 },
  ],

  3: [
    { x: 50, y: 84 },
    { x: 30, y: 35 },
    { x: 70, y: 35 },
  ],

  4: [
    { x: 50, y: 86 },
    { x: 25, y: 55 },
    { x: 75, y: 55 },
    { x: 50, y: 28 },
  ],

  5: [
    { x: 50, y: 87 },
    { x: 20, y: 58 },
    { x: 80, y: 58 },
    { x: 35, y: 30 },
    { x: 65, y: 30 },
  ],

  6: [
    { x: 50, y: 88 },
    { x: 18, y: 60 },
    { x: 38, y: 63 },
    { x: 62, y: 63 },
    { x: 82, y: 60 },
    { x: 50, y: 30 },
  ],

  7: [
    { x: 50, y: 88 },
    { x: 15, y: 61 },
    { x: 32, y: 65 },
    { x: 50, y: 67 },
    { x: 68, y: 65 },
    { x: 85, y: 61 },
    { x: 50, y: 28 },
  ],

  8: [
    { x: 50, y: 89 },
    { x: 13, y: 63 },
    { x: 31, y: 67 },
    { x: 50, y: 69 },
    { x: 69, y: 67 },
    { x: 87, y: 63 },
    { x: 30, y: 31 },
    { x: 70, y: 31 },
  ],

  9: [
    { x: 50, y: 89 },
    { x: 12, y: 64 },
    { x: 27, y: 68 },
    { x: 42, y: 70 },
    { x: 58, y: 70 },
    { x: 73, y: 68 },
    { x: 88, y: 64 },
    { x: 32, y: 31 },
    { x: 68, y: 31 },
  ],

  10: [
    { x: 50, y: 90 },
    { x: 10, y: 65 },
    { x: 24, y: 69 },
    { x: 39, y: 71 },
    { x: 61, y: 71 },
    { x: 76, y: 69 },
    { x: 90, y: 65 },
    { x: 24, y: 34 },
    { x: 50, y: 28 },
    { x: 76, y: 34 },
  ],

  11: [
    { x: 50, y: 90 },
    { x: 9, y: 65 },
    { x: 24, y: 69 },
    { x: 38, y: 72 },
    { x: 50, y: 73 },
    { x: 62, y: 72 },
    { x: 76, y: 69 },
    { x: 91, y: 65 },
    { x: 19, y: 35 },
    { x: 50, y: 27 },
    { x: 81, y: 35 },
  ],
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getMemberName(member) {
  return (
    member.displayName ||
    member.user.globalName ||
    member.user.username
  );
}

function detectPosition(text) {
  const value = String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9/]+/g, ' ')
    .trim();

  const ordered = [...POSITIONS].sort(
    (a, b) => b.length - a.length
  );

  for (const pos of ordered) {
    const pattern = new RegExp(
      '(^|\\s)' +
        pos.replace('/', '\\/') +
        '(?=\\s|$)',
      'i'
    );

    if (pattern.test(value)) {
      return pos;
    }
  }

  return null;
}

function collectMessageText(message) {
  const parts = [];

  if (message.content) {
    parts.push(message.content);
  }

  for (const embed of message.embeds || []) {
    if (embed.title) {
      parts.push(embed.title);
    }

    if (embed.description) {
      parts.push(embed.description);
    }

    for (const field of embed.fields || []) {
      if (field.name) {
        parts.push(field.name);
      }

      if (field.value) {
        parts.push(field.value);
      }
    }
  }

  return parts.join('\n');
}

async function scanPositionChannel(guild, members) {
  const result = new Map();

  const channel = await client.channels
    .fetch(POSITION_CHANNEL_ID)
    .catch((error) => {
      console.error(
        'Position channel fetch failed:',
        error.message
      );
      return null;
    });

  if (
    !channel ||
    !channel.isTextBased() ||
    !channel.messages
  ) {
    console.error(
      'Cannot read position channel ' +
        POSITION_CHANNEL_ID
    );
    return result;
  }

  const memberById = new Map();

  for (const member of members) {
    memberById.set(member.id, member);
  }

  const nameEntries = members.map((member) => ({
    id: member.id,
    names: [
      member.displayName,
      member.user.username,
      member.user.globalName,
    ]
      .filter(Boolean)
      .map((x) => x.toLowerCase()),
  }));

  let before = null;

  for (let page = 0; page < 15; page += 1) {
    const options = { limit: 100 };

    if (before) {
      options.before = before;
    }

    const messages = await channel.messages
      .fetch(options)
      .catch((error) => {
        console.error(
          'Position messages fetch failed:',
          error.message
        );
        return null;
      });

    if (!messages || !messages.size) {
      break;
    }

    for (const message of messages.values()) {
      const text = collectMessageText(message);
      const position = detectPosition(text);

      if (!position) {
        continue;
      }

      let playerId = null;

      if (
        message.mentions &&
        message.mentions.users &&
        message.mentions.users.size
      ) {
        for (const user of message.mentions.users.values()) {
          if (memberById.has(user.id)) {
            playerId = user.id;
            break;
          }
        }
      }

      if (!playerId) {
        const lower = text.toLowerCase();

        const matches = nameEntries
          .filter((entry) =>
            entry.names.some(
              (name) =>
                name.length >= 2 &&
                lower.includes(name)
            )
          )
          .sort((a, b) => {
            const aLen = Math.max(
              ...a.names.map((x) => x.length)
            );
            const bLen = Math.max(
              ...b.names.map((x) => x.length)
            );

            return bLen - aLen;
          });

        if (matches.length) {
          playerId = matches[0].id;
        }
      }

      if (
        !playerId &&
        message.author &&
        memberById.has(message.author.id)
      ) {
        playerId = message.author.id;
      }

      if (playerId) {
        result.set(playerId, position);
      }
    }

    if (messages.size < 100) {
      break;
    }

    const last = messages.last();

    if (!last) {
      break;
    }

    before = last.id;
  }

  console.log(
    'Position scan found ' +
      result.size +
      ' players.'
  );

  return result;
}

async function refreshPlayerData() {
  const guild = await client.guilds
    .fetch(GUILD_ID)
    .catch(() => null);

  if (!guild) {
    throw new Error(
      'Guild ' + GUILD_ID + ' not found.'
    );
  }

  await guild.members.fetch();

  const members = [
    ...guild.members.cache.values(),
  ].filter(
    (member) => !member.user.bot
  );

  const positions =
    await scanPositionChannel(
      guild,
      members
    );

  const newPlayers = new Map();

  for (const member of members) {
    newPlayers.set(member.id, {
      id: member.id,
      name: getMemberName(member),
      username: member.user.username,
      avatar: member.displayAvatarURL({
        extension: 'png',
        size: 256,
        forceStatic: true,
      }),
      position:
        positions.get(member.id) ||
        currentPositions.get(member.id) ||
        'UNSET',
    });
  }

  currentPlayers = newPlayers;
  currentPositions = positions;
  lastRefresh = Date.now();

  /*
    Update every active lineup immediately.
  */
  for (const session of sessions.values()) {
    if (session.guildId !== guild.id) {
      continue;
    }

    /*
      Remove players who left.
    */
    for (const slot of session.slots) {
      if (
        slot.playerId &&
        !currentPlayers.has(slot.playerId)
      ) {
        slot.playerId = null;
        slot.position = '';
      }
    }

    /*
      Remove players from bench if they left.
    */
    session.bench =
      session.bench.filter((entry) =>
        currentPlayers.has(entry.playerId)
      );

    /*
      Update positions of players already
      placed on the pitch.
    */
    for (const slot of session.slots) {
      if (!slot.playerId) {
        continue;
      }

      const newPosition =
        currentPositions.get(
          slot.playerId
        );

      if (newPosition) {
        slot.position = newPosition;
      }
    }
  }

  console.log(
    'Refresh complete: ' +
      currentPlayers.size +
      ' server players.'
  );
}

async function ensureFreshData() {
  if (
    !lastRefresh ||
    Date.now() - lastRefresh >= REFRESH_MS
  ) {
    await refreshPlayerData();
  }
}

function createSession(
  guild,
  channel,
  size
) {
  const id =
    Date.now().toString(36) +
    '-' +
    Math.random()
      .toString(36)
      .slice(2, 10);

  const slots = FORMATIONS[size].map(
    (point, index) => ({
      index,
      x: point.x,
      y: point.y,
      playerId: null,
      position: '',
    })
  );

  const session = {
    id,
    guildId: guild.id,
    channelId: channel.id,
    size,
    createdAt: Date.now(),
    slots,
    bench: [],
  };

  sessions.set(id, session);

  return session;
}

function buildButtons() {
  const rows = [];

  for (let start = 1; start <= 11; start += 5) {
    const row =
      new ActionRowBuilder();

    for (
      let size = start;
      size <= Math.min(start + 4, 11);
      size += 1
    ) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(
            'lineup_' + size
          )
          .setLabel(
            size + 'v' + size
          )
          .setStyle(
            size === 11
              ? ButtonStyle.Primary
              : ButtonStyle.Secondary
          )
      );
    }

    rows.push(row);
  }

  return rows;
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
  height:100%;
  background:#080d14;
  color:#fff;
  font-family:Arial,Helvetica,sans-serif;
}

body{
  overflow:hidden;
}

.app{
  height:100dvh;
  display:flex;
  flex-direction:column;
}

.header{
  min-height:60px;
  display:flex;
  align-items:center;
  gap:10px;
  padding:8px 12px;
  background:#0d1520;
  border-bottom:1px solid #243044;
}

.header-title{
  font-weight:900;
  font-size:17px;
}

.header-sub{
  font-size:11px;
  opacity:.55;
  margin-top:2px;
}

.actions{
  margin-left:auto;
  display:flex;
  flex-wrap:wrap;
  gap:7px;
}

.button{
  border:0;
  background:#1b2738;
  color:#fff;
  border-radius:10px;
  padding:10px 12px;
  font-weight:800;
  cursor:pointer;
}

.button.primary{
  background:#2f74ff;
}

.button.danger{
  background:#a82c42;
}

.main{
  flex:1;
  min-height:0;
  display:grid;
  grid-template-columns:minmax(0,1fr) 350px;
  gap:10px;
  padding:10px;
}

.pitch-holder{
  min-width:0;
  display:flex;
  align-items:center;
  justify-content:center;
  overflow:hidden;
}

.pitch{
  position:relative;
  width:min(76vw,520px);
  aspect-ratio:2/3;
  border:4px solid #fff;
  border-radius:18px;
  overflow:hidden;
  touch-action:none;

  background:
    repeating-linear-gradient(
      to bottom,
      #16823f 0,
      #16823f 8.33%,
      #1a8d46 8.33%,
      #1a8d46 16.66%
    );
}

.pitch:before{
  content:"";
  position:absolute;
  left:0;
  right:0;
  top:50%;
  height:4px;
  background:#fff;
}

.pitch:after{
  content:"";
  position:absolute;
  width:22%;
  aspect-ratio:1;
  border:3px solid #fff;
  border-radius:50%;
  left:39%;
  top:39%;
}

.box1,
.box2{
  position:absolute;
  left:24%;
  width:52%;
  height:14%;
  border:3px solid #fff;
}

.box1{
  top:0;
  border-top:0;
}

.box2{
  bottom:0;
  border-bottom:0;
}

.slot{
  position:absolute;
  width:78px;
  height:78px;
  transform:translate(-50%,-50%);
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  user-select:none;
  touch-action:none;
  cursor:pointer;
  z-index:5;
}

.slot-circle{
  width:52px;
  height:52px;
  border:3px solid #fff;
  border-radius:50%;
  background:#666;
  overflow:hidden;
  display:flex;
  align-items:center;
  justify-content:center;
  box-shadow:0 4px 14px rgba(0,0,0,.35);
}

.slot-circle img{
  width:100%;
  height:100%;
  object-fit:cover;
}

.slot-initial{
  font-size:21px;
  font-weight:900;
}

.slot-name{
  max-width:100px;
  margin-top:2px;
  font-size:10px;
  font-weight:900;
  text-align:center;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  text-shadow:0 1px 3px #000;
}

.slot.selected .slot-circle{
  outline:4px solid #ffd329;
}

.sidebar{
  min-height:0;
  display:flex;
  flex-direction:column;
  overflow:hidden;
  background:#0d1520;
  border:1px solid #243044;
  border-radius:16px;
}

.search{
  padding:10px;
  border-bottom:1px solid #243044;
}

.search input{
  width:100%;
  padding:11px;
  border-radius:10px;
  border:1px solid #33445e;
  background:#080d14;
  color:#fff;
  outline:0;
}

.players{
  flex:1;
  min-height:0;
  overflow:auto;
  padding:8px;
}

.group{
  margin-bottom:10px;
}

.group-title{
  padding:5px;
  font-size:11px;
  font-weight:900;
  opacity:.55;
  text-transform:uppercase;
}

.player{
  width:100%;
  display:flex;
  align-items:center;
  gap:8px;
  padding:8px;
  margin-bottom:6px;
  border:0;
  border-radius:10px;
  background:#131e2e;
  color:#fff;
  text-align:left;
  cursor:pointer;
}

.player img,
.player-fallback{
  width:36px;
  height:36px;
  border-radius:50%;
  flex:none;
}

.player img{
  object-fit:cover;
}

.player-fallback{
  display:none;
  align-items:center;
  justify-content:center;
  background:#666;
  font-weight:900;
}

.player-name{
  flex:1;
  min-width:0;
  overflow:hidden;
  white-space:nowrap;
  text-overflow:ellipsis;
}

.player-position{
  font-size:10px;
  opacity:.55;
}

.bench{
  border-top:1px solid #243044;
  padding:8px;
}

.bench-title{
  font-size:11px;
  font-weight:900;
  opacity:.55;
  margin-bottom:7px;
}

.bench-list{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  max-height:120px;
  overflow:auto;
}

.bench-player{
  display:flex;
  align-items:center;
  gap:6px;
  border:0;
  border-radius:100px;
  background:#192438;
  color:#fff;
  padding:6px 9px;
  cursor:pointer;
}

.bench-player img{
  width:22px;
  height:22px;
  border-radius:50%;
}

.modal{
  position:fixed;
  inset:0;
  display:none;
  align-items:center;
  justify-content:center;
  background:rgba(0,0,0,.65);
  padding:15px;
  z-index:30;
}

.modal.open{
  display:flex;
}

.modal-card{
  width:min(440px,100%);
  background:#0d1520;
  border:1px solid #33445e;
  border-radius:16px;
  padding:14px;
}

.position-grid{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:8px;
}

.position-button{
  border:1px solid #33445e;
  background:#151f30;
  color:#fff;
  border-radius:10px;
  padding:11px;
  font-weight:900;
  cursor:pointer;
}

.status{
  position:fixed;
  left:50%;
  bottom:10px;
  transform:translateX(-50%);
  padding:7px 12px;
  border-radius:999px;
  background:#0d1520;
  border:1px solid #33445e;
  font-size:11px;
  z-index:100;
}

@media(max-width:900px){
  .main{
    grid-template-columns:1fr;
    grid-template-rows:minmax(0,1fr) 38dvh;
  }

  .pitch{
    width:min(68vw,430px);
  }
}

@media(max-width:520px){
  .actions{
    gap:5px;
  }

  .button{
    padding:8px 9px;
    font-size:11px;
  }

  .main{
    padding:6px;
    gap:6px;
  }

  .pitch{
    width:78vw;
  }

  .slot{
    width:66px;
    height:66px;
  }

  .slot-circle{
    width:45px;
    height:45px;
  }

  .slot-name{
    max-width:80px;
  }
}
</style>
</head>

<body>

<div class="app">

  <div class="header">

    <div>
      <div class="header-title">
        NEWCASTLE LINEUP
      </div>

      <div
        class="header-sub"
        id="subtitle"
      >
        Loading...
      </div>
    </div>

    <div class="actions">

      <button
        class="button"
        id="clear"
      >
        Clear
      </button>

      <button
        class="button"
        id="position"
      >
        Position
      </button>

      <button
        class="button danger"
        id="bench"
      >
        Bench
      </button>

      <button
        class="button primary"
        id="finish"
      >
        FINISH
      </button>

    </div>

  </div>

  <div class="main">

    <div class="pitch-holder">

      <div
        class="pitch"
        id="pitch"
      >

        <div class="box1"></div>
        <div class="box2"></div>

      </div>

    </div>

    <div class="sidebar">

      <div class="search">

        <input
          id="search"
          placeholder="Search players..."
        >

      </div>

      <div
        class="players"
        id="players"
      ></div>

      <div class="bench">

        <div class="bench-title">
          BENCH — TAP TO RESTORE
        </div>

        <div
          class="bench-list"
          id="benchList"
        ></div>

      </div>

    </div>

  </div>

</div>

<div
  class="modal"
  id="modal"
>

  <div class="modal-card">

    <h3 id="modalTitle">
      Choose Position
    </h3>

    <div
      class="position-grid"
      id="positionGrid"
    ></div>

    <button
      class="button"
      id="closeModal"
      style="width:100%;margin-top:10px"
    >
      Cancel
    </button>

  </div>

</div>

<div
  class="status"
  id="status"
>
  Loading...
</div>

<script>

const SESSION_ID =
  ${JSON.stringify(sessionId)};

let state = null;
let selectedSlot = null;
let drag = null;
let moved = false;

const pitch =
  document.getElementById('pitch');

const status =
  document.getElementById('status');

function findPlayer(id) {
  if (!state) {
    return null;
  }

  return (
    state.players.find(
      (player) => player.id === id
    ) || null
  );
}

async function api(
  url,
  options
) {
  const response =
    await fetch(url, options);

  let data = {};

  try {
    data =
      await response.json();
  } catch (error) {}

  if (!response.ok) {
    throw new Error(
      data.error ||
      'Request failed.'
    );
  }

  return data;
}

async function load() {
  try {
    state =
      await api(
        '/api/session?id=' +
        encodeURIComponent(
          SESSION_ID
        )
      );

    document.getElementById(
      'subtitle'
    ).textContent =
      state.size +
      'v' +
      state.size;

    status.textContent =
      state.players.length +
      ' players • checks every minute';

    draw();
  } catch (error) {
    console.error(error);

    status.textContent =
      error.message;
  }
}

async function minuteRefresh() {
  try {
    const oldSelectedPlayer =
      selectedSlot == null
        ? null
        : state &&
          state.slots[
            selectedSlot
          ] &&
          state.slots[
            selectedSlot
          ].playerId;

    state =
      await api(
        '/api/session?id=' +
        encodeURIComponent(
          SESSION_ID
        )
      );

    if (oldSelectedPlayer) {
      const slot =
        state.slots.find(
          (item) =>
            item.playerId ===
            oldSelectedPlayer
        );

      selectedSlot =
        slot
          ? slot.index
          : null;
    }

    status.textContent =
      state.players.length +
      ' players • updated ' +
      new Date(
        state.updatedAt
      ).toLocaleTimeString();

    draw();
  } catch (error) {
    console.error(
      'Minute refresh failed:',
      error
    );
  }
}

function draw() {
  drawPitch();
  drawPlayers();
  drawBench();
}

function drawPitch() {
  pitch
    .querySelectorAll('.slot')
    .forEach(
      (element) =>
        element.remove()
    );

  state.slots.forEach(
    (slot) => {

      const p =
        slot.playerId
          ? findPlayer(
              slot.playerId
            )
          : null;

      const element =
        document.createElement(
          'div'
        );

      element.className =
        'slot' +
        (
          selectedSlot ===
          slot.index
            ? ' selected'
            : ''
        );

      element.dataset.index =
        String(slot.index);

      element.style.left =
        slot.x + '%';

      element.style.top =
        slot.y + '%';

      const circle =
        document.createElement(
          'div'
        );

      circle.className =
        'slot-circle';

      if (p) {

        const img =
          document.createElement(
            'img'
          );

        img.src =
          p.avatar;

        img.onerror =
          function() {

            img.remove();

            const initial =
              document.createElement(
                'div'
              );

            initial.className =
              'slot-initial';

            initial.textContent =
              p.name
                .slice(0,1)
                .toUpperCase();

            circle.appendChild(
              initial
            );
          };

        circle.appendChild(
          img
        );

      } else {

        const plus =
          document.createElement(
            'span'
          );

        plus.textContent =
          '+';

        plus.style.fontSize =
          '25px';

        circle.appendChild(
          plus
        );
      }

      const name =
        document.createElement(
          'div'
        );

      name.className =
        'slot-name';

      name.textContent =
        p ? p.name : 'EMPTY';

      element.appendChild(
        circle
      );

      element.appendChild(
        name
      );

      element.addEventListener(
        'pointerdown',
        function(event) {
          startDrag(
            event,
            slot.index
          );
        }
      );

      element.addEventListener(
        'click',
        function() {

          if (moved) {
            moved = false;
            return;
          }

          selectedSlot =
            slot.index;

          drawPitch();
        }
      );

      pitch.appendChild(
        element
      );
    }
  );
}

function drawPlayers() {

  const search =
    document.getElementById(
      'search'
    )
    .value
    .trim()
    .toLowerCase();

  const used =
    new Set(
      state.slots
        .filter(
          (slot) =>
            Boolean(
              slot.playerId
            )
        )
        .map(
          (slot) =>
            slot.playerId
        )
    );

  const benched =
    new Set(
      state.bench.map(
        (entry) =>
          entry.playerId
      )
    );

  const groups = {};

  state.players.forEach(
    (p) => {

      if (
        used.has(p.id) ||
        benched.has(p.id)
      ) {
        return;
      }

      const matches =
        !search ||
        p.name
          .toLowerCase()
          .includes(search) ||
        p.position
          .toLowerCase()
          .includes(search);

      if (!matches) {
        return;
      }

      const position =
        p.position || 'UNSET';

      if (!groups[position]) {
        groups[position] = [];
      }

      groups[position].push(p);
    }
  );

  const order = [
    ...POSITIONS,
    'UNSET',
  ];

  const keys =
    order
      .filter(
        (position) =>
          groups[position]
      )
      .concat(
        Object.keys(groups).filter(
          (position) =>
            !order.includes(
              position
            )
        )
      );

  const container =
    document.getElementById(
      'players'
    );

  container.innerHTML = '';

  keys.forEach(
    (position) => {

      const group =
        document.createElement(
          'div'
        );

      group.className =
        'group';

      const heading =
        document.createElement(
          'div'
        );

      heading.className =
        'group-title';

      heading.textContent =
        position;

      group.appendChild(
        heading
      );

      groups[position].forEach(
        (p) => {

          const button =
            document.createElement(
              'button'
            );

          button.className =
            'player';

          const img =
            document.createElement(
              'img'
            );

          img.src =
            p.avatar;

          const fallback =
            document.createElement(
              'div'
            );

          fallback.className =
            'player-fallback';

          fallback.textContent =
            p.name
              .slice(0,1)
              .toUpperCase();

          img.onerror =
            function() {

              img.style.display =
                'none';

              fallback.style.display =
                'flex';
            };

          const name =
            document.createElement(
              'div'
            );

          name.className =
            'player-name';

          name.textContent =
            p.name;

          const positionText =
            document.createElement(
              'div'
            );

          positionText.className =
            'player-position';

          positionText.textContent =
            p.position;

          button.appendChild(img);
          button.appendChild(fallback);
          button.appendChild(name);
          button.appendChild(positionText);

          button.addEventListener(
            'click',
            function() {

              assignPlayer(
                p.id
              );
            }
          );

          group.appendChild(
            button
          );
        }
      );

      container.appendChild(
        group
      );
    }
  );
}

function drawBench() {

  const container =
    document.getElementById(
      'benchList'
    );

  container.innerHTML = '';

  if (!state.bench.length) {

    container.innerHTML =
      '<span style="opacity:.5;font-size:12px">' +
      'No bench players' +
      '</span>';

    return;
  }

  state.bench.forEach(
    (entry) => {

      const p =
        findPlayer(
          entry.playerId
        );

      if (!p) {
        return;
      }

      const button =
        document.createElement(
          'button'
        );

      button.className =
        'bench-player';

      const img =
        document.createElement(
          'img'
        );

      img.src =
        p.avatar;

      const text =
        document.createElement(
          'span'
        );

      text.textContent =
        p.name;

      button.appendChild(img);
      button.appendChild(text);

      button.addEventListener(
        'click',
        function() {

          restoreBench(
            p.id
          );
        }
      );

      container.appendChild(
        button
      );
    }
  );
}

async function assignPlayer(
  playerId
) {

  if (
    selectedSlot ===
    null
  ) {

    const free =
      state.slots.find(
        (slot) =>
          !slot.playerId
      );

    if (!free) {

      alert(
        'No empty slot available.'
      );

      return;
    }

    selectedSlot =
      free.index;
  }

  const slot =
    state.slots[
      selectedSlot
    ];

  if (!slot) {
    return;
  }

  try {

    await api(
      '/api/assign',
      {
        method:'POST',
        headers:{
          'content-type':
            'application/json'
        },
        body:JSON.stringify({
          id: SESSION_ID,
          slotIndex:
            slot.index,
          playerId
        })
      }
    );

    state.slots.forEach(
      (other) => {

        if (
          other.index !==
            slot.index &&
          other.playerId ===
            playerId
        ) {

          other.playerId =
            null;

          other.position =
            '';
        }
      }
    );

    state.bench =
      state.bench.filter(
        (entry) =>
          entry.playerId !==
          playerId
      );

    slot.playerId =
      playerId;

    const p =
      findPlayer(
        playerId
      );

    if (
      p &&
      p.position !==
      'UNSET'
    ) {
      slot.position =
        p.position;
    }

    draw();

  } catch(error) {

    alert(
      error.message
    );
  }
}

function openPositionMenu() {

  if (
    selectedSlot ===
    null
  ) {

    alert(
      'Select a player first.'
    );

    return;
  }

  const slot =
    state.slots[
      selectedSlot
    ];

  if (
    !slot ||
    !slot.playerId
  ) {

    alert(
      'Select a player first.'
    );

    return;
  }

  const p =
    findPlayer(
      slot.playerId
    );

  if (!p) {
    return;
  }

  document.getElementById(
    'modalTitle'
  ).textContent =
    'Position for ' +
    p.name;

  const grid =
    document.getElementById(
      'positionGrid'
    );

  grid.innerHTML = '';

  POSITIONS.forEach(
    (position) => {

      const button =
        document.createElement(
          'button'
        );

      button.className =
        'position-button';

      button.textContent =
        position;

      button.addEventListener(
        'click',
        function() {
          setPosition(
            position
          );
        }
      );

      grid.appendChild(
        button
      );
    }
  );

  document.getElementById(
    'modal'
  ).classList.add(
    'open'
  );
}

async function setPosition(
  position
) {

  if (
    selectedSlot ===
    null
  ) {
    return;
  }

  try {

    await api(
      '/api/position',
      {
        method:'POST',
        headers:{
          'content-type':
            'application/json'
        },
        body:JSON.stringify({
          id: SESSION_ID,
          slotIndex:
            selectedSlot,
          position
        })
      }
    );

    const slot =
      state.slots[
        selectedSlot
      ];

    if (slot) {

      slot.position =
        position;

      if (slot.playerId) {

        const p =
          findPlayer(
            slot.playerId
          );

        if (p) {
          p.position =
            position;
        }
      }
    }

    document.getElementById(
      'modal'
    ).classList.remove(
      'open'
    );

    draw();

  } catch(error) {

    alert(
      error.message
    );
  }
}

async function benchSelected() {

  if (
    selectedSlot ===
    null
  ) {

    alert(
      'Select a player first.'
    );

    return;
  }

  const slot =
    state.slots[
      selectedSlot
    ];

  if (
    !slot ||
    !slot.playerId
  ) {

    alert(
      'Select a player first.'
    );

    return;
  }

  try {

    await api(
      '/api/bench',
      {
        method:'POST',
        headers:{
          'content-type':
            'application/json'
        },
        body:JSON.stringify({
          id: SESSION_ID,
          slotIndex:
            selectedSlot,
          playerId:
            slot.playerId
        })
      }
    );

    state.bench.push({
      playerId:
        slot.playerId,

      originalSlot:
        slot.index
    });

    slot.playerId =
      null;

    slot.position =
      '';

    selectedSlot =
      null;

    draw();

  } catch(error) {

    alert(
      error.message
    );
  }
}

async function restoreBench(
  playerId
) {

  const entry =
    state.bench.find(
      (item) =>
        item.playerId ===
        playerId
    );

  if (!entry) {
    return;
  }

  let slot =
    state.slots[
      entry.originalSlot
    ];

  if (
    !slot ||
    slot.playerId
  ) {

    slot =
      state.slots.find(
        (item) =>
          !item.playerId
      );
  }

  if (!slot) {

    alert(
      'No empty pitch slot.'
    );

    return;
  }

  try {

    await api(
      '/api/restore',
      {
        method:'POST',
        headers:{
          'content-type':
            'application/json'
        },
        body:JSON.stringify({
          id: SESSION_ID,
          playerId,
          slotIndex:
            slot.index
        })
      }
    );

    state.bench =
      state.bench.filter(
        (item) =>
          item.playerId !==
          playerId
      );

    slot.playerId =
      playerId;

    const p =
      findPlayer(
        playerId
      );

    if (
      p &&
      p.position !==
      'UNSET'
    ) {

      slot.position =
        p.position;
    }

    selectedSlot =
      slot.index;

    draw();

  } catch(error) {

    alert(
      error.message
    );
  }
}

function startDrag(
  event,
  slotIndex
) {

  selectedSlot =
    slotIndex;

  moved = false;

  const slot =
    state.slots[
      slotIndex
    ];

  drag = {
    index:
      slotIndex,

    pointerId:
      event.pointerId,

    startX:
      event.clientX,

    startY:
      event.clientY,

    startSlotX:
      slot.x,

    startSlotY:
      slot.y,
  };

  try {
    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  } catch(error) {}
}

pitch.addEventListener(
  'pointermove',
  function(event) {

    if (!drag) {
      return;
    }

    const rect =
      pitch.getBoundingClientRect();

    const dx =
      (
        event.clientX -
        drag.startX
      ) /
      rect.width *
      100;

    const dy =
      (
        event.clientY -
        drag.startY
      ) /
      rect.height *
      100;

    if (
      Math.abs(dx) +
      Math.abs(dy) >
      2
    ) {
      moved = true;
    }

    const slot =
      state.slots[
        drag.index
      ];

    if (!slot) {
      return;
    }

    let x =
      drag.startSlotX + dx;

    let y =
      drag.startSlotY + dy;

    x =
      Math.round(
        Math.max(
          4,
          Math.min(96, x)
        ) / 2
      ) * 2;

    y =
      Math.round(
        Math.max(
          5,
          Math.min(95, y)
        ) / 2
      ) * 2;

    slot.x = x;
    slot.y = y;

    const element =
      pitch.querySelector(
        '.slot[data-index="' +
        drag.index +
        '"]'
      );

    if (element) {

      element.style.left =
        x + '%';

      element.style.top =
        y + '%';
    }
  }
);

pitch.addEventListener(
  'pointerup',
  async function() {

    if (!drag) {
      return;
    }

    const finished =
      drag;

    drag = null;

    if (!moved) {
      return;
    }

    const slot =
      state.slots[
        finished.index
      ];

    if (!slot) {
      return;
    }

    try {

      await api(
        '/api/move',
        {
          method:'POST',
          headers:{
            'content-type':
              'application/json'
          },
          body:JSON.stringify({
            id: SESSION_ID,
            slotIndex:
              slot.index,
            x: slot.x,
            y: slot.y
          })
        }
      );

    } catch(error) {

      console.error(
        error
      );
    }
  }
);

document.getElementById(
  'clear'
).addEventListener(
  'click',
  function() {
    selectedSlot = null;
    drawPitch();
  }
);

document.getElementById(
  'position'
).addEventListener(
  'click',
  openPositionMenu
);

document.getElementById(
  'bench'
).addEventListener(
  'click',
  benchSelected
);

document.getElementById(
  'finish'
).addEventListener(
  'click',
  async function() {

    if (
      !confirm(
        'Post this lineup to Discord?'
      )
    ) {
      return;
    }

    try {

      await api(
        '/final',
        {
          method:'POST',
          headers:{
            'content-type':
              'application/json'
          },
          body:JSON.stringify({
            id: SESSION_ID
          })
        }
      );

      alert(
        'Lineup posted to Discord!'
      );

    } catch(error) {

      alert(
        error.message
      );
    }
  }
);

document.getElementById(
  'closeModal'
).addEventListener(
  'click',
  function() {

    document.getElementById(
      'modal'
    ).classList.remove(
      'open'
    );

  }
);

document.getElementById(
  'search'
).addEventListener(
  'input',
  drawPlayers
);

load();

/*
  Client checks again every minute.
*/
setInterval(
  minuteRefresh,
  60000
);

</script>

</body>
</html>`;
}

async function getAvatarPng(
  url,
  size
) {
  try {

    const response =
      await fetch(url, {
        headers: {
          'User-Agent':
            'Newcastle-Assistant',
        },
      });

    if (!response.ok) {
      return null;
    }

    const buffer =
      Buffer.from(
        await response.arrayBuffer()
      );

    const rounded =
      await sharp(buffer)
        .resize(size, size, {
          fit: 'cover',
        })
        .png()
        .toBuffer();

    return rounded;

  } catch(error) {

    console.error(
      'Avatar error:',
      error.message
    );

    return null;
  }
}

async function makeImage(
  session
) {
  const WIDTH = 1200;
  const HEIGHT = 1500;

  const PITCH_X = 240;
  const PITCH_Y = 70;
  const PITCH_W = 720;
  const PITCH_H = 1080;

  const guild =
    await client.guilds.fetch(
      session.guildId
    );

  await guild.members
    .fetch()
    .catch(() => null);

  const imageOverlays = [];

  let svg =
    '<svg xmlns="http://www.w3.org/2000/svg" ' +
    'width="' +
    WIDTH +
    '" height="' +
    HEIGHT +
    '">';

  svg +=
    '<rect width="1200" height="1500" fill="#09111c"/>';

  svg +=
    '<text x="600" y="42" ' +
    'text-anchor="middle" ' +
    'fill="white" font-family="Arial" ' +
    'font-size="30" font-weight="900">' +
    'NEWCASTLE LINEUP' +
    '</text>';

  svg +=
    '<rect x="' +
    PITCH_X +
    '" y="' +
    PITCH_Y +
    '" width="' +
    PITCH_W +
    '" height="' +
    PITCH_H +
    '" rx="18" fill="#178440" ' +
    'stroke="white" stroke-width="6"/>';

  for (
    let i = 0;
    i < 12;
    i += 1
  ) {

    svg +=
      '<rect x="' +
      PITCH_X +
      '" y="' +
      (
        PITCH_Y +
        (PITCH_H / 12) * i
      ) +
      '" width="' +
      PITCH_W +
      '" height="' +
      (
        PITCH_H / 12
      ) +
      '" fill="' +
      (
        i % 2 === 0
          ? '#178440'
          : '#1b8d46'
      ) +
      '"/>';

  }

  svg +=
    '<line x1="' +
    PITCH_X +
    '" y1="' +
    (
      PITCH_Y +
      PITCH_H / 2
    ) +
    '" x2="' +
    (
      PITCH_X +
      PITCH_W
    ) +
    '" y2="' +
    (
      PITCH_Y +
      PITCH_H / 2
    ) +
    '" stroke="white" stroke-width="5"/>';

  svg +=
    '<circle cx="' +
    (
      PITCH_X +
      PITCH_W / 2
    ) +
    '" cy="' +
    (
      PITCH_Y +
      PITCH_H / 2
    ) +
    '" r="68" fill="none" ' +
    'stroke="white" stroke-width="5"/>';

  svg +=
    '<rect x="' +
    (
      PITCH_X +
      PITCH_W * .25
    ) +
    '" y="' +
    PITCH_Y +
    '" width="' +
    (
      PITCH_W * .5
    ) +
    '" height="' +
    (
      PITCH_H * .14
    ) +
    '" fill="none" stroke="white" stroke-width="5"/>';

  svg +=
    '<rect x="' +
    (
      PITCH_X +
      PITCH_W * .25
    ) +
    '" y="' +
    (
      PITCH_Y +
      PITCH_H * .86
    ) +
    '" width="' +
    (
      PITCH_W * .5
    ) +
    '" height="' +
    (
      PITCH_H * .14
    ) +
    '" fill="none" stroke="white" stroke-width="5"/>';

  for (
    let i = 0;
    i < session.slots.length;
    i += 1
  ) {

    const slot =
      session.slots[i];

    const cx =
      PITCH_X +
      (
        slot.x / 100
      ) *
      PITCH_W;

    const cy =
      PITCH_Y +
      (
        slot.y / 100
      ) *
      PITCH_H;

    const member =
      slot.playerId
        ? await guild.members
            .fetch(
              slot.playerId
            )
            .catch(() => null)
        : null;

    svg +=
      '<circle cx="' +
      cx +
      '" cy="' +
      cy +
      '" r="52" fill="white"/>';

    svg +=
      '<circle cx="' +
      cx +
      '" cy="' +
      cy +
      '" r="47" fill="#666"/>';

    if (member) {

      const avatar =
        await getAvatarPng(
          member.displayAvatarURL({
            extension:'png',
            size:256,
            forceStatic:true,
          }),
          94
        );

      if (avatar) {

        imageOverlays.push({
          input: avatar,

          left:
            Math.round(cx - 47),

          top:
            Math.round(cy - 47),
        });

      } else {

        svg +=
          '<text x="' +
          cx +
          '" y="' +
          (
            cy + 13
          ) +
          '" text-anchor="middle" ' +
          'fill="white" font-family="Arial" ' +
          'font-size="34" font-weight="900">' +
          escapeHtml(
            getMemberName(
              member
            ).slice(0,1)
          ) +
          '</text>';

      }

      svg +=
        '<text x="' +
        cx +
        '" y="' +
        (
          cy + 70
        ) +
        '" text-anchor="middle" ' +
        'fill="white" font-family="Arial" ' +
        'font-size="17" font-weight="900">' +
        escapeHtml(
          getMemberName(member)
        ) +
        '</text>';

      if (slot.position) {

        svg +=
          '<text x="' +
          cx +
          '" y="' +
          (
            cy + 91
          ) +
          '" text-anchor="middle" ' +
          'fill="#e0eaff" ' +
          'font-family="Arial" font-size="13" ' +
          'font-weight="800">' +
          escapeHtml(
            slot.position
          ) +
          '</text>';
      }

    } else {

      svg +=
        '<text x="' +
        cx +
        '" y="' +
        (
          cy + 13
        ) +
        '" text-anchor="middle" ' +
        'fill="white" font-family="Arial" ' +
        'font-size="34" font-weight="900">+</text>';

      svg +=
        '<text x="' +
        cx +
        '" y="' +
        (
          cy + 70
        ) +
        '" text-anchor="middle" ' +
        'fill="white" font-family="Arial" ' +
        'font-size="17" font-weight="900">' +
        'EMPTY' +
        '</text>';
    }
  }

  svg +=
    '<text x="600" y="1240" ' +
    'text-anchor="middle" fill="white" ' +
    'font-family="Arial" font-size="25" ' +
    'font-weight="900">BENCH</text>';

  let benchX = 150;
  let benchY = 1325;

  for (
    const entry of session.bench
  ) {

    const member =
      await guild.members
        .fetch(entry.playerId)
        .catch(() => null);

    if (!member) {
      continue;
    }

    if (benchX > 1050) {
      benchX = 150;
      benchY += 100;
    }

    svg +=
      '<circle cx="' +
      benchX +
      '" cy="' +
      benchY +
      '" r="38" fill="white"/>';

    svg +=
      '<circle cx="' +
      benchX +
      '" cy="' +
      benchY +
      '" r="34" fill="#666"/>';

    const avatar =
      await getAvatarPng(
        member.displayAvatarURL({
          extension:'png',
          size:256,
          forceStatic:true,
        }),
        68
      );

    if (avatar) {

      imageOverlays.push({
        input: avatar,
        left:
          Math.round(
            benchX - 34
          ),
        top:
          Math.round(
            benchY - 34
          ),
      });

    }

    svg +=
      '<text x="' +
      benchX +
      '" y="' +
      (
        benchY + 56
      ) +
      '" text-anchor="middle" ' +
      'fill="white" font-family="Arial" ' +
      'font-size="14" font-weight="800">' +
      escapeHtml(
        getMemberName(member)
      ) +
      '</text>';

    benchX += 145;
  }

  svg += '</svg>';

  let image =
    await sharp(
      Buffer.from(svg)
    )
      .png()
      .toBuffer();

  if (imageOverlays.length) {

    image =
      await sharp(image)
        .composite(
          imageOverlays
        )
        .png()
        .toBuffer();

  }

  return image;
}

client.once(
  'ready',
  async () => {

    console.log(
      'Logged in as ' +
      client.user.tag
    );

    try {

      const guild =
        client.guilds.cache.get(
          GUILD_ID
        );

      const command =
        new SlashCommandBuilder()
          .setName('lineup')
          .setDescription(
            'Create a football lineup'
          )
          .toJSON();

      if (guild) {

        await guild.commands.set([
          command
        ]);

      } else {

        await client.application.commands.set([
          command
        ]);

      }

      console.log(
        '/lineup registered'
      );

      try {

        await refreshPlayerData();

      } catch (error) {

        console.error(
          'Initial player refresh failed:',
          error
        );

      }

    } catch(error) {

      console.error(
        'Startup error:',
        error
      );

    }

    setInterval(
      async () => {

        try {

          await refreshPlayerData();

        } catch(error) {

          console.error(
            '60 second refresh failed:',
            error
          );

        }

      },
      REFRESH_MS
    );
  }
);

client.on(
  'guildMemberAdd',
  async (member) => {

    if (
      member.guild.id !==
      GUILD_ID ||
      member.user.bot
    ) {
      return;
    }

    try {
      await refreshPlayerData();
    } catch(error) {
      console.error(
        'Member join refresh failed:',
        error
      );
    }
  }
);

client.on(
  'guildMemberRemove',
  async (member) => {

    if (
      member.guild.id !==
      GUILD_ID
    ) {
      return;
    }

    try {
      await refreshPlayerData();
    } catch(error) {
      console.error(
        'Member leave refresh failed:',
        error
      );
    }
  }
);

client.on(
  'interactionCreate',
  async (interaction) => {

    if (
      interaction.isChatInputCommand() &&
      interaction.commandName ===
        'lineup'
    ) {

      if (
        !interaction.guild ||
        !interaction.channel
      ) {

        return interaction.reply({
          content:
            'Use /lineup inside your server.',
          ephemeral:true,
        });

      }

      return interaction.reply({
        content:
          'Choose your lineup size:',
        components:
          buildButtons(),
        ephemeral:true,
      });
    }

    if (
      interaction.isButton() &&
      interaction.customId.startsWith(
        'lineup_'
      )
    ) {

      const size =
        Number(
          interaction.customId
            .replace(
              'lineup_',
              ''
            )
        );

      if (
        !interaction.guild ||
        !interaction.channel ||
        !FORMATIONS[size]
      ) {

        return interaction.reply({
          content:
            'Invalid lineup size.',
          ephemeral:true,
        });

      }

      try {

        await ensureFreshData();

        const session =
          createSession(
            interaction.guild,
            interaction.channel,
            size
          );

        const url =
          BASE_URL +
          '/pitch?id=' +
          encodeURIComponent(
            session.id
          );

        return interaction.update({
          content:
            'Open the lineup editor:\n' +
            url,
          components:[],
        });

      } catch(error) {

        console.error(
          'Lineup button error:',
          error
        );

        return interaction.update({
          content:
            'Could not start lineup editor.',
          components:[],
        });

      }
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
  async (req, res) => {

    const id =
      String(
        req.query.id || ''
      );

    const session =
      sessions.get(id);

    if (!session) {

      return res
        .status(404)
        .send(
          'Lineup session not found or expired.'
        );

    }

    return res.send(
      pitchPage(
        session.id
      )
    );
  }
);

app.get(
  '/api/session',
  async (req, res) => {

    const id =
      String(
        req.query.id || ''
      );

    const session =
      sessions.get(id);

    if (!session) {

      return res
        .status(404)
        .json({
          error:
            'Session expired.'
        });
    }

    try {

      await ensureFreshData();

      const players =
        [...currentPlayers.values()]
        .map((player) => ({
          ...player,
          position:
            currentPositions.get(
              player.id
            ) ||
            player.position ||
            'UNSET',
        }));

      return res.json({
        id: session.id,
        size: session.size,
        updatedAt: lastRefresh,
        players,
        slots: session.slots,
        bench: session.bench,
      });

    } catch(error) {

      console.error(
        'Session API error:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'Could not refresh player data.'
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
      sessions.get(
        String(id || '')
      );

    if (!session) {

      return res
        .status(404)
        .json({
          error:
            'Session expired.'
        });
    }

    const slot =
      session.slots.find(
        (item) =>
          item.index ===
          Number(slotIndex)
      );

    if (!slot) {

      return res
        .status(400)
        .json({
          error:
            'Slot not found.'
        });
    }

    if (
      !currentPlayers.has(
        String(playerId)
      )
    ) {

      return res
        .status(400)
        .json({
          error:
            'Player is no longer in the server.'
        });
    }

    for (
      const other of
      session.slots
    ) {

      if (
        other.index !==
          slot.index &&
        other.playerId ===
          String(playerId)
      ) {

        other.playerId =
          null;

        other.position =
          '';
      }
    }

    slot.playerId =
      String(playerId);

    const position =
      currentPositions.get(
        String(playerId)
      );

    if (position) {
      slot.position =
        position;
    }

    session.bench =
      session.bench.filter(
        (entry) =>
          entry.playerId !==
          String(playerId)
      );

    return res.json({
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
      sessions.get(
        String(id || '')
      );

    if (!session) {

      return res
        .status(404)
        .json({
          error:
            'Session expired.'
        });
    }

    if (
      !POSITIONS.includes(
        String(position)
      )
    ) {

      return res
        .status(400)
        .json({
          error:
            'Invalid position.'
        });
    }

    const slot =
      session.slots.find(
        (item) =>
          item.index ===
          Number(slotIndex)
      );

    if (!slot) {

      return res
        .status(400)
        .json({
          error:
            'Slot not found.'
        });
    }

    slot.position =
      String(position);

    if (slot.playerId) {
      currentPositions.set(
        slot.playerId,
        String(position)
      );
    }

    return res.json({
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
      sessions.get(
        String(id || '')
      );

    if (!session) {

      return res
        .status(404)
        .json({
          error:
            'Session expired.'
        });
    }

    const slot =
      session.slots.find(
        (item) =>
          item.index ===
          Number(slotIndex)
      );

    if (!slot) {

      return res
        .status(400)
        .json({
          error:
            'Slot not found.'
        });
    }

    const nx =
      Number(x);

    const ny =
      Number(y);

    if (
      !Number.isFinite(nx) ||
      !Number.isFinite(ny)
    ) {

      return res
        .status(400)
        .json({
          error:
            'Invalid coordinates.'
        });
    }

    slot.x =
      Math.max(
        4,
        Math.min(96, nx)
      );

    slot.y =
      Math.max(
        5,
        Math.min(95, ny)
      );

    return res.json({
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
      sessions.get(
        String(id || '')
      );

    if (!session) {

      return res
        .status(404)
        .json({
          error:
            'Session expired.'
        });
    }

    const slot =
      session.slots.find(
        (item) =>
          item.index ===
          Number(slotIndex)
      );

    if (
      !slot ||
      slot.playerId !==
        String(playerId)
    ) {

      return res
        .status(400)
        .json({
          error:
            'Player not in that slot.'
        });
    }

    const already =
      session.bench.some(
        (entry) =>
          entry.playerId ===
          String(playerId)
      );

    if (!already) {

      session.bench.push({
        playerId:
          String(playerId),

        originalSlot:
          slot.index,
      });
    }

    slot.playerId =
      null;

    slot.position =
      '';

    return res.json({
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
      sessions.get(
        String(id || '')
      );

    if (!session) {

      return res
        .status(404)
        .json({
          error:
            'Session expired.'
        });
    }

    const entry =
      session.bench.find(
        (item) =>
          item.playerId ===
          String(playerId)
      );

    if (!entry) {

      return res
        .status(400)
        .json({
          error:
            'Player is not on bench.'
        });
    }

    const slot =
      session.slots.find(
        (item) =>
          item.index ===
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
            'Slot is occupied.'
        });
    }

    session.bench =
      session.bench.filter(
        (item) =>
          item.playerId !==
          String(playerId)
      );

    slot.playerId =
      String(playerId);

    const position =
      currentPositions.get(
        String(playerId)
      );

    if (position) {
      slot.position =
        position;
    }

    return res.json({
      ok:true,
    });
  }
);

app.post(
  '/final',
  async (req, res) => {

    const id =
      String(
        req.body?.id || ''
      );

    const session =
      sessions.get(id);

    if (!session) {

      return res
        .status(404)
        .json({
          error:
            'Session expired.'
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
          'Discord channel is unavailable.'
        );
      }

      const image =
        await makeImage(
          session
        );

      const attachment =
        new AttachmentBuilder(
          image,
          {
            name:
              'newcastle-lineup.png'
          }
        );

      await channel.send({
        content:
          '**NEWCASTLE LINEUP TODAY ENJOY**',
        files:[
          attachment
        ],
      });

      return res.json({
        ok:true,
      });

    } catch(error) {

      console.error(
        'Final lineup error:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to create/post lineup: ' +
            error.message
        });
    }
  }
);

setInterval(
  () => {

    const cutoff =
      Date.now() -
      SESSION_TTL_MS;

    for (
      const [
        id,
        session
      ] of sessions
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
      'Web server listening on 0.0.0.0:' +
      PORT
    );

  }
);

client.login(
  DISCORD_TOKEN
).catch(
  (error) => {

    console.error(
      'Discord login failed:',
      error
    );

    process.exit(1);
  }
);
