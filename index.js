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
  process.env.RENDER_EXTERNAL_URL ||
  `http://localhost:${PORT}`
).replace(/\/$/, '');

const GUILD_ID =
  process.env.GUILD_ID ||
  '1542615988137099324';

const POSITION_CHANNEL_ID =
  process.env.POSITION_CHANNEL_ID ||
  '1542615989382942756';

const DISCORD_TOKEN =
  process.env.DISCORD_TOKEN;

const REFRESH_MS = 60 * 1000;
const POSITION_SCAN_PAGES = 10;
const SESSION_TIMEOUT_MS =
  6 * 60 * 60 * 1000;

if (!DISCORD_TOKEN) {
  console.error(
    'DISCORD_TOKEN is missing.'
  );
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
const guildSnapshots = new Map();

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
  'CF',
  'ST',
];

const FORMATIONS = {
  1: [
    { x: 50, y: 50 },
  ],

  2: [
    { x: 50, y: 84 },
    { x: 50, y: 18 },
  ],

  3: [
    { x: 50, y: 86 },
    { x: 30, y: 38 },
    { x: 70, y: 38 },
  ],

  4: [
    { x: 50, y: 87 },
    { x: 25, y: 60 },
    { x: 75, y: 60 },
    { x: 50, y: 30 },
  ],

  5: [
    { x: 50, y: 88 },
    { x: 22, y: 62 },
    { x: 78, y: 62 },
    { x: 35, y: 35 },
    { x: 65, y: 35 },
  ],

  6: [
    { x: 50, y: 89 },
    { x: 18, y: 63 },
    { x: 39, y: 67 },
    { x: 61, y: 67 },
    { x: 82, y: 63 },
    { x: 50, y: 32 },
  ],

  7: [
    { x: 50, y: 90 },
    { x: 16, y: 64 },
    { x: 33, y: 68 },
    { x: 50, y: 70 },
    { x: 67, y: 68 },
    { x: 84, y: 64 },
    { x: 50, y: 32 },
  ],

  8: [
    { x: 50, y: 90 },
    { x: 14, y: 65 },
    { x: 31, y: 69 },
    { x: 50, y: 71 },
    { x: 69, y: 69 },
    { x: 86, y: 65 },
    { x: 30, y: 36 },
    { x: 70, y: 36 },
  ],

  9: [
    { x: 50, y: 91 },
    { x: 12, y: 66 },
    { x: 27, y: 70 },
    { x: 42, y: 72 },
    { x: 58, y: 72 },
    { x: 73, y: 70 },
    { x: 88, y: 66 },
    { x: 33, y: 36 },
    { x: 67, y: 36 },
  ],

  10: [
    { x: 50, y: 91 },
    { x: 10, y: 67 },
    { x: 24, y: 71 },
    { x: 39, y: 73 },
    { x: 61, y: 73 },
    { x: 76, y: 71 },
    { x: 90, y: 67 },
    { x: 23, y: 39 },
    { x: 50, y: 32 },
    { x: 77, y: 39 },
  ],

  11: [
    { x: 50, y: 92 },
    { x: 9, y: 68 },
    { x: 25, y: 72 },
    { x: 38, y: 74 },
    { x: 50, y: 75 },
    { x: 62, y: 74 },
    { x: 75, y: 72 },
    { x: 91, y: 68 },
    { x: 20, y: 38 },
    { x: 50, y: 30 },
    { x: 80, y: 38 },
  ],
};

function esc(value) {
  return String(
    value == null ? '' : value
  )
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function memberName(member) {
  return (
    member.displayName ||
    member.user.globalName ||
    member.user.username
  );
}

function positionFromText(text) {
  const upper =
    String(text || '')
      .toUpperCase()
      .replace(/[^A-Z0-9/]+/g, ' ')
      .trim();

  const sorted =
    POSITION_NAMES
      .slice()
      .sort(
        (a, b) =>
          b.length - a.length
      );

  for (const position of sorted) {
    const pattern =
      new RegExp(
        `(^|\\s)${position.replace('/', '\\/')}(?=\\s|$)`,
        'i'
      );

    if (pattern.test(upper)) {
      return position;
    }
  }

  return null;
}

function messageText(message) {
  const parts = [];

  if (message.content) {
    parts.push(message.content);
  }

  for (
    const embed of
    message.embeds || []
  ) {
    if (embed.title) {
      parts.push(embed.title);
    }

    if (embed.description) {
      parts.push(embed.description);
    }

    for (
      const field of
      embed.fields || []
    ) {
      if (field.name) {
        parts.push(field.name);
      }

      if (field.value) {
        parts.push(field.value);
      }
    }
  }

  return parts
    .filter(Boolean)
    .join('\n');
}

async function fetchAllMembers(guild) {
  try {
    await guild.members.fetch();
  } catch (error) {
    console.error(
      'Could not fetch members:',
      error.message
    );
  }

  return [
    ...guild.members.cache.values(),
  ].filter(
    member => !member.user.bot
  );
}

async function readPositions(
  guild,
  members
) {
  const result = new Map();

  const channel =
    await client.channels
      .fetch(POSITION_CHANNEL_ID)
      .catch(error => {
        console.error(
          'Could not fetch position channel:',
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
      'Position channel is not accessible:',
      POSITION_CHANNEL_ID
    );

    return result;
  }

  const byId = new Map();

  for (const member of members) {
    byId.set(member.id, member);
  }

  const candidates =
    members.map(member => ({
      id: member.id,
      names: [
        member.displayName,
        member.user.username,
        member.user.globalName,
      ]
        .filter(Boolean)
        .map(
          name =>
            name.toLowerCase()
        ),
    }));

  let before = null;

  for (
    let page = 0;
    page < POSITION_SCAN_PAGES;
    page += 1
  ) {
    const options = {
      limit: 100,
    };

    if (before) {
      options.before = before;
    }

    const messages =
      await channel.messages
        .fetch(options)
        .catch(error => {
          console.error(
            'Position message fetch failed:',
            error.message
          );

          return null;
        });

    if (
      !messages ||
      messages.size === 0
    ) {
      break;
    }

    for (
      const message
      of messages.values()
    ) {
      const text =
        messageText(message);

      const position =
        positionFromText(text);

      if (!position) {
        continue;
      }

      let playerId = null;

      /*
        1. Mentioned player.
      */
      if (
        message.mentions &&
        message.mentions.users &&
        message.mentions.users.size > 0
      ) {
        for (
          const mentioned
          of message.mentions.users.values()
        ) {
          if (byId.has(mentioned.id)) {
            playerId =
              mentioned.id;
            break;
          }
        }
      }

      /*
        2. Player name / username in message.
      */
      if (!playerId) {
        const lower =
          text.toLowerCase();

        const matches =
          candidates
            .filter(candidate =>
              candidate.names.some(
                name =>
                  name &&
                  lower.includes(name)
              )
            )
            .sort((a, b) => {
              const aLength =
                Math.max(
                  ...a.names.map(
                    name =>
                      name.length
                  )
                );

              const bLength =
                Math.max(
                  ...b.names.map(
                    name =>
                      name.length
                  )
                );

              return (
                bLength -
                aLength
              );
            });

        if (matches.length) {
          playerId =
            matches[0].id;
        }
      }

      /*
        3. If the player posted
           their own position.
      */
      if (
        !playerId &&
        message.author &&
        byId.has(
          message.author.id
        )
      ) {
        playerId =
          message.author.id;
      }

      if (
        playerId &&
        !result.has(playerId)
      ) {
        result.set(
          playerId,
          position
        );
      }
    }

    if (messages.size < 100) {
      break;
    }

    before =
      messages.last() &&
      messages.last().id;

    if (!before) {
      break;
    }
  }

  console.log(
    `Position scan found ${result.size} players with positions.`
  );

  return result;
}

function reconcileSessions(
  guildId,
  snapshot
) {
  for (
    const session
    of sessions.values()
  ) {
    if (
      session.guildId !==
      guildId
    ) {
      continue;
    }

    const activeIds =
      snapshot.playerIds;

    /*
      Remove people who left.
    */
    for (
      const slot of
      session.slots
    ) {
      if (
        slot.playerId &&
        !activeIds.has(
          slot.playerId
        )
      ) {
        slot.playerId =
          null;

        slot.position =
          '';
      }
    }

    session.bench =
      session.bench.filter(
        entry =>
          activeIds.has(
            entry.playerId
          )
      );

    /*
      Update positions automatically.
    */
    for (
      const player
      of snapshot.players
    ) {
      const channelPosition =
        player.position;

      if (
        channelPosition &&
        channelPosition !== 'UNSET'
      ) {
        session.positions[
          player.id
        ] =
          channelPosition;

        for (
          const slot
          of session.slots
        ) {
          if (
            slot.playerId ===
            player.id
          ) {
            slot.position =
              channelPosition;
          }
        }
      } else if (
        !session.positions[
          player.id
        ]
      ) {
        session.positions[
          player.id
        ] = 'UNSET';
      }
    }
  }
}

async function refreshGuildSnapshot(
  guild
) {
  const members =
    await fetchAllMembers(
      guild
    );

  const positions =
    await readPositions(
      guild,
      members
    );

  const players =
    members.map(member => ({
      id: member.id,

      name:
        memberName(member),

      username:
        member.user.username,

      avatar:
        member.displayAvatarURL({
          extension: 'png',
          size: 256,
          forceStatic: true,
        }),

      position:
        positions.get(
          member.id
        ) ||
        'UNSET',
    }));

  const snapshot = {
    updatedAt:
      Date.now(),

    players,

    playerIds:
      new Set(
        players.map(
          player =>
            player.id
        )
      ),

    positions,
  };

  guildSnapshots.set(
    guild.id,
    snapshot
  );

  reconcileSessions(
    guild.id,
    snapshot
  );

  console.log(
    `Player data refreshed for ${guild.name}: ${players.length} players`
  );
}

async function refreshAllGuilds() {
  const guilds =
    [...client.guilds.cache.values()];

  for (
    const guild
    of guilds
  ) {
    try {
      await refreshGuildSnapshot(
        guild
      );
    } catch (error) {
      console.error(
        `Refresh failed for ${guild.id}:`,
        error
      );
    }
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

  const slots =
    FORMATIONS[size].map(
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
    positions: {},
  };

  sessions.set(
    id,
    session
  );

  return session;
}

async function ensureSnapshot(
  guild
) {
  let snapshot =
    guildSnapshots.get(
      guild.id
    );

  if (
    !snapshot ||
    Date.now() -
      snapshot.updatedAt >
      REFRESH_MS
  ) {
    await refreshGuildSnapshot(
      guild
    );

    snapshot =
      guildSnapshots.get(
        guild.id
      );
  }

  return snapshot;
}

async function publicSession(
  session
) {
  const guild =
    await client.guilds.fetch(
      session.guildId
    );

  const snapshot =
    await ensureSnapshot(
      guild
    );

  return {
    id: session.id,

    size: session.size,

    updatedAt:
      snapshot?.updatedAt ||
      Date.now(),

    slots:
      session.slots,

    bench:
      session.bench,

    players:
      snapshot?.players || [],
  };
}

function pitchPage(
  sessionId
) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Newcastle Lineup</title>

<style>

*{
  box-sizing:border-box
}

html,
body{
  margin:0;
  height:100%;
  background:#070b12;
  color:#fff;
  font-family:Arial,Helvetica,sans-serif
}

body{
  overflow:hidden
}

.app{
  height:100dvh;
  display:flex;
  flex-direction:column
}

.top{
  min-height:62px;
  padding:8px 12px;
  background:#0d1420;
  border-bottom:1px solid #202a3a;
  display:flex;
  align-items:center;
  gap:10px
}

.top h1{
  font-size:17px;
  margin:0
}

.top small{
  opacity:.65
}

.actions{
  margin-left:auto;
  display:flex;
  gap:8px;
  flex-wrap:wrap
}

.btn{
  border:0;
  border-radius:10px;
  padding:10px 13px;
  background:#1c2738;
  color:#fff;
  font-weight:700;
  cursor:pointer
}

.btn.primary{
  background:#2f74ff
}

.btn.danger{
  background:#a72a3d
}

.main{
  flex:1;
  min-height:0;
  display:grid;
  grid-template-columns:minmax(0,1fr) 340px;
  gap:10px;
  padding:10px
}

.pitch-wrap{
  min-width:0;
  display:flex;
  align-items:center;
  justify-content:center;
  overflow:hidden
}

.pitch{
  position:relative;
  width:min(80vw,520px);
  aspect-ratio:2/3;
  border-radius:18px;
  border:4px solid #fff;
  box-shadow:0 20px 50px rgba(0,0,0,.35);
  touch-action:none;
  overflow:hidden;

  background:
    repeating-linear-gradient(
      to bottom,
      #16813e 0,
      #16813e 8.33%,
      #1a8c45 8.33%,
      #1a8c45 16.66%
    )
}

.pitch:before{
  content:"";
  position:absolute;
  left:0;
  right:0;
  top:50%;
  height:4px;
  background:#fff
}

.pitch:after{
  content:"";
  position:absolute;
  width:22%;
  aspect-ratio:1;
  border:3px solid #fff;
  border-radius:50%;
  left:39%;
  top:39%
}

.box-top,
.box-bottom{
  position:absolute;
  left:24%;
  width:52%;
  height:14%;
  border:3px solid #fff
}

.box-top{
  top:0;
  border-top:0
}

.box-bottom{
  bottom:0;
  border-bottom:0
}

.slot{
  position:absolute;
  width:76px;
  height:76px;
  transform:translate(-50%,-50%);
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  cursor:pointer;
  user-select:none;
  touch-action:none;
  z-index:5
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
  box-shadow:0 4px 15px rgba(0,0,0,.3)
}

.slot img{
  width:100%;
  height:100%;
  object-fit:cover
}

.initial{
  font-size:20px;
  font-weight:900
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
  text-overflow:ellipsis
}

.selected .circle{
  outline:4px solid #ffd32a
}

.side{
  min-height:0;
  background:#0d1420;
  border:1px solid #202a3a;
  border-radius:16px;
  display:flex;
  flex-direction:column;
  overflow:hidden
}

.search{
  padding:10px;
  border-bottom:1px solid #202a3a
}

.search input{
  width:100%;
  padding:11px;
  border:1px solid #2b3950;
  border-radius:10px;
  background:#080d15;
  color:#fff;
  outline:0
}

.players{
  flex:1;
  overflow:auto;
  padding:8px
}

.player-section{
  margin-bottom:10px
}

.section-title{
  font-size:12px;
  font-weight:900;
  opacity:.6;
  padding:6px 5px;
  text-transform:uppercase
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
  text-align:left
}

.player-row:hover{
  background:#182337
}

.player-row img,
.fallback-avatar{
  width:35px;
  height:35px;
  border-radius:50%;
  flex:none
}

.fallback-avatar{
  display:none;
  align-items:center;
  justify-content:center;
  background:#666;
  font-weight:900
}

.player-name{
  min-width:0;
  flex:1;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis
}

.mini-pos{
  font-size:10px;
  opacity:.6
}

.bench{
  border-top:1px solid #202a3a;
  padding:8px
}

.bench h3{
  margin:0 0 7px;
  font-size:12px;
  opacity:.7
}

.bench-grid{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  max-height:120px;
  overflow:auto
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
  cursor:pointer
}

.bench-chip img{
  width:22px;
  height:22px;
  border-radius:50%
}

.bottom{
  border-top:1px solid #202a3a;
  padding:8px;
  display:flex;
  gap:8px;
  flex-wrap:wrap
}

.tag{
  padding:6px 8px;
  border-radius:8px;
  background:#182337;
  font-size:12px
}

.modal{
  position:fixed;
  inset:0;
  background:rgba(0,0,0,.6);
  display:none;
  align-items:center;
  justify-content:center;
  padding:15px;
  z-index:50
}

.modal.show{
  display:flex
}

.modal-card{
  width:min(460px,100%);
  max-height:80dvh;
  overflow:auto;
  background:#0d1420;
  border:1px solid #2b3950;
  border-radius:16px;
  padding:14px
}

.modal-card h2{
  margin:0 0 10px;
  font-size:17px
}

.pos-grid{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:8px
}

.pos-btn{
  border:1px solid #2c3a51;
  background:#121c2c;
  color:#fff;
  border-radius:10px;
  padding:10px;
  cursor:pointer;
  font-weight:800
}

.status{
  position:fixed;
  left:50%;
  bottom:10px;
  transform:translateX(-50%);
  background:#0d1420;
  border:1px solid #32445f;
  border-radius:999px;
  padding:7px 12px;
  font-size:11px;
  opacity:.8;
  z-index:100
}

@media(max-width:900px){

  .main{
    grid-template-columns:1fr;
    grid-template-rows:minmax(0,1fr) 38dvh
  }

  .pitch{
    width:min(65vw,430px)
  }
}

@media(max-width:520px){

  .top{
    min-height:58px
  }

  .top h1{
    font-size:15px
  }

  .btn{
    padding:9px 10px;
    font-size:12px
  }

  .main{
    padding:6px;
    gap:6px
  }

  .pitch{
    width:min(78vw,380px)
  }

  .slot{
    width:64px;
    height:64px
  }

  .slot .circle{
    width:46px;
    height:46px
  }

  .slot .nm{
    font-size:10px;
    max-width:80px
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

      <button
        class="btn"
        id="clearBtn"
      >
        Clear
      </button>

      <button
        class="btn"
        id="positionBtn"
      >
        Position
      </button>

      <button
        class="btn danger"
        id="benchBtn"
      >
        Bench
      </button>

      <button
        class="btn primary"
        id="finishBtn"
      >
        FINISH
      </button>

    </div>

  </div>

  <div class="main">

    <div class="pitch-wrap">

      <div
        class="pitch"
        id="pitch"
      >

        <div class="box-top"></div>
        <div class="box-bottom"></div>

      </div>

    </div>

    <div class="side">

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

        <h3>
          BENCH — tap a player to restore
        </h3>

        <div
          class="bench-grid"
          id="bench"
        ></div>

      </div>

      <div class="bottom">

        <span class="tag">
          Tap a grey circle to select
        </span>

        <span class="tag">
          Drag to move
        </span>

        <span class="tag">
          Position updates every minute
        </span>

      </div>

    </div>

  </div>

</div>

<div
  class="modal"
  id="posModal"
>

  <div class="modal-card">

    <h2 id="posTitle">
      Choose position
    </h2>

    <div
      class="pos-grid"
      id="posGrid"
    ></div>

    <div
      style="font-size:12px;opacity:.55;margin-top:8px"
    >
      Positions are checked from Discord
      channel ${esc(POSITION_CHANNEL_ID)}.
    </div>

    <button
      class="btn"
      id="closePos"
      style="margin-top:10px;width:100%"
    >
      Cancel
    </button>

  </div>

</div>

<div
  class="status"
  id="status"
>
  Loading players...
</div>

<script>

const SID =
  ${JSON.stringify(sessionId)};

let state = null;
let selectedSlot = null;
let drag = null;
let moved = false;

const pitch =
  document.getElementById(
    'pitch'
  );

const status =
  document.getElementById(
    'status'
  );

const sub =
  document.getElementById(
    'sub'
  );

function player(id){

  if(!state){
    return null;
  }

  return (
    state.players.find(
      function(p){
        return p.id === id;
      }
    ) || null
  );
}

async function request(
  url,
  options
){

  const response =
    await fetch(
      url,
      options
    );

  let data = {};

  try{
    data =
      await response.json();
  }catch(error){}

  if(!response.ok){

    throw new Error(
      data.error ||
      'Request failed'
    );

  }

  return data;
}

async function loadState(){

  try{

    state =
      await request(
        '/api/session?id=' +
        encodeURIComponent(SID)
      );

    sub.textContent =
      state.size +
      'v' +
      state.size;

    status.textContent =
      'Players: ' +
      state.players.length +
      ' • auto-updates every minute';

    renderAll();

  }catch(error){

    console.error(error);

    sub.textContent =
      'Failed to load';

    status.textContent =
      error.message;

  }

}

async function refreshState(){

  if(!state){
    return;
  }

  try{

    const selectedPlayer =
      selectedSlot == null
        ? null
        : state.slots[selectedSlot]?.playerId;

    const data =
      await request(
        '/api/session?id=' +
        encodeURIComponent(SID)
      );

    state = data;

    if(selectedPlayer){

      const newSlot =
        state.slots.find(
          function(slot){
            return (
              slot.playerId ===
              selectedPlayer
            );
          }
        );

      selectedSlot =
        newSlot
          ? newSlot.index
          : null;

    }

    sub.textContent =
      state.size +
      'v' +
      state.size;

    status.textContent =
      'Players: ' +
      state.players.length +
      ' • updated ' +
      new Date(
        state.updatedAt
      ).toLocaleTimeString();

    renderAll();

  }catch(error){

    console.error(
      'Refresh failed:',
      error
    );

  }

}

function renderAll(){

  renderPitch();
  renderPlayers();
  renderBench();

}

function renderPitch(){

  pitch
    .querySelectorAll(
      '.slot'
    )
    .forEach(
      function(element){
        element.remove();
      }
    );

  state.slots.forEach(
    function(slot){

      const p =
        slot.playerId
          ? player(
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

      element.style.left =
        slot.x + '%';

      element.style.top =
        slot.y + '%';

      element.dataset.index =
        String(slot.index);

      const circle =
        document.createElement(
          'div'
        );

      circle.className =
        'circle';

      if(p){

        const image =
          document.createElement(
            'img'
          );

        image.src =
          p.avatar;

        image.alt = '';

        image.onerror =
          function(){

            image.remove();

            const initial =
              document.createElement(
                'div'
              );

            initial.className =
              'initial';

            initial.textContent =
              (
                p.name ||
                '?'
              )
              .slice(0,1)
              .toUpperCase();

            circle.appendChild(
              initial
            );

          };

        circle.appendChild(
          image
        );

      }else{

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
        'nm';

      name.textContent =
        p
          ? p.name
          : 'EMPTY';

      element.appendChild(
        circle
      );

      element.appendChild(
        name
      );

      element.addEventListener(
        'pointerdown',
        function(event){

          startDrag(
            event,
            slot.index
          );

        }
      );

      element.addEventListener(
        'click',
        function(){

          if(moved){

            moved =
              false;

            return;

          }

          selectedSlot =
            slot.index;

          renderPitch();

        }
      );

      pitch.appendChild(
        element
      );

    }
  );

}

function renderPlayers(){

  const query =
    document.getElementById(
      'search'
    )
    .value
    .trim()
    .toLowerCase();

  const assigned =
    new Set(
      state.slots
        .filter(
          function(slot){
            return !!slot.playerId;
          }
        )
        .map(
          function(slot){
            return slot.playerId;
          }
        )
    );

  const benched =
    new Set(
      state.bench.map(
        function(entry){
          return entry.playerId;
        }
      )
    );

  const groups = {};

  state.players.forEach(
    function(p){

      const matches =
        !query ||
        p.name
          .toLowerCase()
          .includes(query) ||
        p.position
          .toLowerCase()
          .includes(query);

      if(
        !matches ||
        assigned.has(p.id) ||
        benched.has(p.id)
      ){

        return;

      }

      const pos =
        p.position ||
        'UNSET';

      if(!groups[pos]){
        groups[pos] = [];
      }

      groups[pos].push(p);

    }
  );

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

  const keys =
    order
      .filter(
        function(pos){
          return groups[pos];
        }
      )
      .concat(
        Object.keys(
          groups
        ).filter(
          function(pos){
            return !order.includes(
              pos
            );
          }
        )
      );

  const wrap =
    document.getElementById(
      'players'
    );

  wrap.innerHTML = '';

  if(!keys.length){

    wrap.innerHTML =
      '<div style="padding:12px;opacity:.6">' +
      'No players found.' +
      '</div>';

    return;
  }

  keys.forEach(
    function(pos){

      const section =
        document.createElement(
          'section'
        );

      section.className =
        'player-section';

      const title =
        document.createElement(
          'div'
        );

      title.className =
        'section-title';

      title.textContent =
        pos;

      section.appendChild(
        title
      );

      groups[pos].forEach(
        function(p){

          const button =
            document.createElement(
              'button'
            );

          button.className =
            'player-row';

          const image =
            document.createElement(
              'img'
            );

          image.src =
            p.avatar;

          image.alt = '';

          const fallback =
            document.createElement(
              'span'
            );

          fallback.className =
            'fallback-avatar';

          fallback.textContent =
            (
              p.name ||
              '?'
            )
            .slice(0,1)
            .toUpperCase();

          image.onerror =
            function(){

              image.style.display =
                'none';

              fallback.style.display =
                'flex';

            };

          const name =
            document.createElement(
              'span'
            );

          name.className =
            'player-name';

          name.textContent =
            p.name;

          const mini =
            document.createElement(
              'span'
            );

          mini.className =
            'mini-pos';

          mini.textContent =
            p.position;

          button.appendChild(
            image
          );

          button.appendChild(
            fallback
          );

          button.appendChild(
            name
          );

          button.appendChild(
            mini
          );

          button.addEventListener(
            'click',
            function(){

              pickPlayer(
                p.id
              );

            }
          );

          section.appendChild(
            button
          );

        }
      );

      wrap.appendChild(
        section
      );

    }
  );

}

function renderBench(){

  const box =
    document.getElementById(
      'bench'
    );

  box.innerHTML = '';

  if(!state.bench.length){

    box.innerHTML =
      '<span style="opacity:.5;font-size:12px">' +
      'No bench players' +
      '</span>';

    return;
  }

  state.bench.forEach(
    function(entry){

      const p =
        player(
          entry.playerId
        );

      if(!p){
        return;
      }

      const button =
        document.createElement(
          'button'
        );

      button.className =
        'bench-chip';

      const image =
        document.createElement(
          'img'
        );

      image.src =
        p.avatar;

      image.alt = '';

      const name =
        document.createElement(
          'span'
        );

      name.textContent =
        p.name;

      button.appendChild(
        image
      );

      button.appendChild(
        name
      );

      button.addEventListener(
        'click',
        function(){

          restoreBench(
            p.id
          );

        }
      );

      box.appendChild(
        button
      );

    }
  );

}

async function pickPlayer(
  playerId
){

  if(
    selectedSlot == null
  ){

    const empty =
      state.slots.find(
        function(slot){
          return !slot.playerId;
        }
      );

    if(!empty){

      alert(
        'No empty pitch slot. Bench a player first.'
      );

      return;

    }

    selectedSlot =
      empty.index;

  }

  const slot =
    state.slots.find(
      function(item){
        return (
          item.index ===
          selectedSlot
        );
      }
    );

  if(!slot){
    return;
  }

  try{

    await request(
      '/api/assign',
      {
        method:'POST',

        headers:{
          'content-type':
            'application/json'
        },

        body:JSON.stringify({
          id:SID,
          slotIndex:
            slot.index,
          playerId
        })

      }
    );

    state.slots.forEach(
      function(other){

        if(
          other.index !==
            slot.index &&
          other.playerId ===
            playerId
        ){

          other.playerId =
            null;

          other.position =
            '';

        }

      }
    );

    state.bench =
      state.bench.filter(
        function(entry){
          return (
            entry.playerId !==
            playerId
          );
        }
      );

    slot.playerId =
      playerId;

    const p =
      player(playerId);

    if(
      p &&
      p.position !==
        'UNSET'
    ){

      slot.position =
        p.position;

    }

    renderAll();

  }catch(error){

    alert(
      error.message
    );

  }

}

function openPositionMenu(){

  if(
    selectedSlot == null
  ){

    alert(
      'Tap a pitch slot first.'
    );

    return;

  }

  const slot =
    state.slots[
      selectedSlot
    ];

  if(
    !slot ||
    !slot.playerId
  ){

    alert(
      'Assign a player first.'
    );

    return;

  }

  const p =
    player(
      slot.playerId
    );

  if(!p){
    return;
  }

  document
    .getElementById(
      'posTitle'
    )
    .textContent =
      'Position for ' +
      p.name;

  const grid =
    document.getElementById(
      'posGrid'
    );

  grid.innerHTML = '';

  [
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
  ].forEach(
    function(pos){

      const button =
        document.createElement(
          'button'
        );

      button.className =
        'pos-btn';

      button.textContent =
        pos;

      button.addEventListener(
        'click',
        function(){

          setPosition(
            pos
          );

        }
      );

      grid.appendChild(
        button
      );

    }
  );

  document
    .getElementById(
      'posModal'
    )
    .classList
    .add('show');

}

async function setPosition(
  position
){

  if(
    selectedSlot == null
  ){
    return;
  }

  try{

    await request(
      '/api/position',
      {
        method:'POST',

        headers:{
          'content-type':
            'application/json'
        },

        body:JSON.stringify({
          id:SID,
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

    if(slot){
      slot.position =
        position;

      if(slot.playerId){

        const p =
          player(
            slot.playerId
          );

        if(p){
          p.position =
            position;
        }

      }
    }

    document
      .getElementById(
        'posModal'
      )
      .classList
      .remove('show');

    renderAll();

  }catch(error){

    alert(
      error.message
    );

  }

}

async function benchSelected(){

  if(
    selectedSlot == null
  ){

    alert(
      'Select a player slot first.'
    );

    return;

  }

  const slot =
    state.slots[
      selectedSlot
    ];

  if(
    !slot ||
    !slot.playerId
  ){

    alert(
      'Select a player first.'
    );

    return;

  }

  const playerId =
    slot.playerId;

  try{

    await request(
      '/api/bench',
      {
        method:'POST',

        headers:{
          'content-type':
            'application/json'
        },

        body:JSON.stringify({
          id:SID,
          slotIndex:
            selectedSlot,
          playerId
        })

      }
    );

    state.bench.push({
      playerId,
      originalSlot:
        selectedSlot
    });

    slot.playerId =
      null;

    slot.position =
      '';

    selectedSlot =
      null;

    renderAll();

  }catch(error){

    alert(
      error.message
    );

  }

}

async function restoreBench(
  playerId
){

  const entry =
    state.bench.find(
      function(item){
        return (
          item.playerId ===
          playerId
        );
      }
    );

  if(!entry){
    return;
  }

  let slot =
    state.slots[
      entry.originalSlot
    ];

  if(
    !slot ||
    slot.playerId
  ){

    slot =
      state.slots.find(
        function(item){
          return !item.playerId;
        }
      );

  }

  if(!slot){

    alert(
      'No empty pitch slot available.'
    );

    return;

  }

  try{

    await request(
      '/api/restore',
      {
        method:'POST',

        headers:{
          'content-type':
            'application/json'
        },

        body:JSON.stringify({
          id:SID,
          playerId,
          slotIndex:
            slot.index
        })

      }
    );

    state.bench =
      state.bench.filter(
        function(item){
          return (
            item.playerId !==
            playerId
          );
        }
      );

    slot.playerId =
      playerId;

    const p =
      player(playerId);

    if(
      p &&
      p.position !==
        'UNSET'
    ){

      slot.position =
        p.position;

    }

    selectedSlot =
      slot.index;

    renderAll();

  }catch(error){

    alert(
      error.message
    );

  }

}

function startDrag(
  event,
  index
){

  if(
    event.pointerType ===
      'mouse' &&
    event.button !== 0
  ){

    return;

  }

  selectedSlot =
    index;

  moved = false;

  const element =
    event.currentTarget;

  const slot =
    state.slots[index];

  drag = {
    index,
    startX:
      event.clientX,

    startY:
      event.clientY,

    origX:
      slot.x,

    origY:
      slot.y,

    pointerId:
      event.pointerId,
  };

  try{

    element.setPointerCapture(
      event.pointerId
    );

  }catch(error){}

}

pitch.addEventListener(
  'pointermove',
  function(event){

    if(!drag){
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

    if(
      Math.abs(dx) +
      Math.abs(dy) >
      2
    ){

      moved = true;

    }

    let x =
      drag.origX + dx;

    let y =
      drag.origY + dy;

    x =
      Math.max(
        4,
        Math.min(
          96,
          Math.round(x / 2) * 2
        )
      );

    y =
      Math.max(
        5,
        Math.min(
          95,
          Math.round(y / 2) * 2
        )
      );

    const slot =
      state.slots[
        drag.index
      ];

    if(!slot){
      return;
    }

    slot.x =
      x;

    slot.y =
      y;

    const element =
      pitch.querySelector(
        '.slot[data-index="' +
        drag.index +
        '"]'
      );

    if(element){

      element.style.left =
        x + '%';

      element.style.top =
        y + '%';

    }

  }
);

pitch.addEventListener(
  'pointerup',
  async function(){

    if(!drag){
      return;
    }

    const current =
      drag;

    drag = null;

    if(!moved){
      return;
    }

    const slot =
      state.slots[
        current.index
      ];

    if(!slot){
      return;
    }

    try{

      await request(
        '/api/move',
        {
          method:'POST',

          headers:{
            'content-type':
              'application/json'
          },

          body:JSON.stringify({
            id:SID,
            slotIndex:
              slot.index,
            x:slot.x,
            y:slot.y
          })

        }
      );

    }catch(error){

      console.error(
        error
      );

    }

  }
);

pitch.addEventListener(
  'pointercancel',
  function(){

    drag = null;

  }
);

async function finish(){

  if(
    !window.confirm(
      'Post this lineup to Discord?'
    )
  ){

    return;

  }

  try{

    await request(
      '/final',
      {
        method:'POST',

        headers:{
          'content-type':
            'application/json'
        },

        body:JSON.stringify({
          id:SID
        })

      }
    );

    alert(
      'Lineup posted to Discord!'
    );

  }catch(error){

    alert(
      error.message
    );

  }

}

document
  .getElementById(
    'clearBtn'
  )
  .addEventListener(
    'click',
    function(){

      selectedSlot =
        null;

      renderPitch();

    }
  );

document
  .getElementById(
    'positionBtn'
  )
  .addEventListener(
    'click',
    openPositionMenu
  );

document
  .getElementById(
    'benchBtn'
  )
  .addEventListener(
    'click',
    benchSelected
  );

document
  .getElementById(
    'finishBtn'
  )
  .addEventListener(
    'click',
    finish
  );

document
  .getElementById(
    'closePos'
  )
  .addEventListener(
    'click',
    function(){

      document
        .getElementById(
          'posModal'
        )
        .classList
        .remove('show');

    }
  );

document
  .getElementById(
    'search'
  )
  .addEventListener(
    'input',
    renderPlayers
  );

loadState();

/*
  Frontend checks for new/left
  members and changed positions
  every minute.
*/
setInterval(
  refreshState,
  60000
);

</script>

</body>
</html>`;
}

async function fetchImageBuffer(
  url
) {
  try {

    const response =
      await fetch(
        url,
        {
          headers:{
            'User-Agent':
              'NewcastleAssistant/1.0'
          }
        }
      );

    if(
      !response.ok
    ){
      return null;
    }

    return Buffer.from(
      await response.arrayBuffer()
    );

  }catch(error){

    return null;

  }
}

async function avatarCircle(
  url,
  size
) {

  const input =
    await fetchImageBuffer(
      url
    );

  if(!input){
    return null;
  }

  try{

    const resized =
      await sharp(input)
        .resize(
          size,
          size,
          {
            fit:'cover'
          }
        )
        .png()
        .toBuffer();

    const mask =
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="' +
        size +
        '" height="' +
        size +
        '">' +
        '<circle cx="' +
        size / 2 +
        '" cy="' +
        size / 2 +
        '" r="' +
        size / 2 +
        '" fill="white"/>' +
        '</svg>'
      );

    return sharp(
      resized
    )
      .composite([
        {
          input: mask,
          blend:'dest-in',
        },
      ])
      .png()
      .toBuffer();

  }catch(error){

    return null;

  }

}

async function makeLineupImage(
  session
) {

  const width = 1200;
  const height = 1500;

  const pitchX = 240;
  const pitchY = 80;
  const pitchW = 720;
  const pitchH = 1080;

  const guild =
    await client.guilds.fetch(
      session.guildId
    );

  await guild.members
    .fetch()
    .catch(() => null);

  const roster = [];
  const avatarLayers = [];

  for (
    const slot of
    session.slots
  ) {

    const centerX =
      pitchX +
      (
        slot.x / 100
      ) *
      pitchW;

    const centerY =
      pitchY +
      (
        slot.y / 100
      ) *
      pitchH;

    const member =
      slot.playerId
        ? await guild.members
            .fetch(
              slot.playerId
            )
            .catch(() => null)
        : null;

    let avatar =
      null;

    if(member){

      avatar =
        await avatarCircle(
          member.displayAvatarURL({
            extension:'png',
            size:256,
            forceStatic:true,
          }),
          92
        );

    }

    roster.push({
      slot,
      member,
      centerX,
      centerY,
      avatar,
    });

  }

  const svg = [];

  svg.push(
    '<svg xmlns="http://www.w3.org/2000/svg" ' +
    'width="' +
    width +
    '" ' +
    'height="' +
    height +
    '">'
  );

  svg.push(
    '<defs>' +
      '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#07101b"/>' +
        '<stop offset="1" stop-color="#0e1b2d"/>' +
      '</linearGradient>' +
    '</defs>'
  );

  svg.push(
    '<rect width="1200" height="1500" fill="url(#bg)"/>'
  );

  svg.push(
    '<text x="600" y="45" text-anchor="middle" ' +
    'fill="#ffffff" font-family="Arial" ' +
    'font-size="31" font-weight="900">' +
    'NEWCASTLE LINEUP' +
    '</text>'
  );

  svg.push(
    '<rect x="' +
    pitchX +
    '" y="' +
    pitchY +
    '" width="' +
    pitchW +
    '" height="' +
    pitchH +
    '" rx="20" ' +
    'fill="#16813e" ' +
    'stroke="#ffffff" stroke-width="6"/>'
  );

  for(
    let i = 0;
    i < 12;
    i += 1
  ){

    svg.push(
      '<rect x="' +
      pitchX +
      '" y="' +
      (
        pitchY +
        (
          pitchH /
          12
        ) *
        i
      ) +
      '" width="' +
      pitchW +
      '" height="' +
      (
        pitchH /
        12
      ) +
      '" fill="' +
      (
        i % 2 === 0
          ? '#16813e'
          : '#1a8c45'
      ) +
      '"/>'
    );

  }

  svg.push(
    '<line x1="' +
    pitchX +
    '" y1="' +
    (
      pitchY +
      pitchH / 2
    ) +
    '" x2="' +
    (
      pitchX +
      pitchW
    ) +
    '" y2="' +
    (
      pitchY +
      pitchH / 2
    ) +
    '" stroke="#ffffff" stroke-width="5"/>'
  );

  svg.push(
    '<circle cx="' +
    (
      pitchX +
      pitchW / 2
    ) +
    '" cy="' +
    (
      pitchY +
      pitchH / 2
    ) +
    '" r="68" fill="none" ' +
    'stroke="#ffffff" stroke-width="5"/>'
  );

  svg.push(
    '<rect x="' +
    (
      pitchX +
      pitchW * .25
    ) +
    '" y="' +
    pitchY +
    '" width="' +
    (
      pitchW * .5
    ) +
    '" height="' +
    (
      pitchH * .14
    ) +
    '" fill="none" stroke="#ffffff" stroke-width="5"/>'
  );

  svg.push(
    '<rect x="' +
    (
      pitchX +
      pitchW * .25
    ) +
    '" y="' +
    (
      pitchY +
      pitchH * .86
    ) +
    '" width="' +
    (
      pitchW * .5
    ) +
    '" height="' +
    (
      pitchH * .14
    ) +
    '" fill="none" stroke="#ffffff" stroke-width="5"/>'
  );

  for(
    let index = 0;
    index < roster.length;
    index += 1
  ){

    const item =
      roster[index];

    const radius = 48;

    svg.push(
      '<circle cx="' +
      item.centerX +
      '" cy="' +
      item.centerY +
      '" r="52" fill="#ffffff"/>'
    );

    svg.push(
      '<circle cx="' +
      item.centerX +
      '" cy="' +
      item.centerY +
      '" r="' +
      radius +
      '" fill="#666666"/>'
    );

    if(!item.avatar){

      svg.push(
        '<text x="' +
        item.centerX +
        '" y="' +
        (
          item.centerY +
          13
        ) +
        '" text-anchor="middle" ' +
        'fill="#ffffff" font-family="Arial" ' +
        'font-size="34" font-weight="900">+</text>'
      );

    }

    const name =
      item.member
        ? memberName(
            item.member
          )
        : 'EMPTY';

    svg.push(
      '<text x="' +
      item.centerX +
      '" y="' +
      (
        item.centerY +
        70
      ) +
      '" text-anchor="middle" ' +
      'fill="#ffffff" font-family="Arial" ' +
      'font-size="17" font-weight="900">' +
      esc(name) +
      '</text>'
    );

    if(
      item.slot.position
    ){

      svg.push(
        '<text x="' +
        item.centerX +
        '" y="' +
        (
          item.centerY +
          91
        ) +
        '" text-anchor="middle" ' +
        'fill="#dce7ff" ' +
        'font-family="Arial" font-size="13" ' +
        'font-weight="800">' +
        esc(
          item.slot.position
        ) +
        '</text>'
      );

    }

    if(item.avatar){

      avatarLayers.push({
        input:
          item.avatar,

        left:
          Math.round(
            item.centerX -
            radius
          ),

        top:
          Math.round(
            item.centerY -
            radius
          ),
      });

    }

  }

  svg.push(
    '<text x="600" y="1225" text-anchor="middle" ' +
    'fill="#ffffff" font-family="Arial" ' +
    'font-size="25" font-weight="900">BENCH</text>'
  );

  let benchX = 150;
  let benchY = 1335;

  for(
    const entry
    of session.bench
  ){

    const member =
      await guild.members
        .fetch(
          entry.playerId
        )
        .catch(() => null);

    if(!member){
      continue;
    }

    if(
      benchX > 1050
    ){

      benchX = 150;
      benchY += 105;

    }

    svg.push(
      '<circle cx="' +
      benchX +
      '" cy="' +
      benchY +
      '" r="38" fill="#ffffff"/>'
    );

    svg.push(
      '<circle cx="' +
      benchX +
      '" cy="' +
      benchY +
      '" r="34" fill="#666666"/>'
    );

    const avatar =
      await avatarCircle(
        member.displayAvatarURL({
          extension:'png',
          size:256,
          forceStatic:true,
        }),
        68
      );

    if(avatar){

      avatarLayers.push({
        input: avatar,

        left:
          Math.round(
            benchX -
            34
          ),

        top:
          Math.round(
            benchY -
            34
          ),
      });

    }

    svg.push(
      '<text x="' +
      benchX +
      '" y="' +
      (
        benchY +
        57
      ) +
      '" text-anchor="middle" ' +
      'fill="#ffffff" font-family="Arial" ' +
      'font-size="14" font-weight="800">' +
      esc(
        memberName(
          member
        )
      ) +
      '</text>'
    );

    benchX += 145;

  }

  svg.push(
    '</svg>'
  );

  let image =
    await sharp(
      Buffer.from(
        svg.join('')
      )
    )
      .png()
      .toBuffer();

  if(
    avatarLayers.length
  ){

    image =
      await sharp(image)
        .composite(
          avatarLayers
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

    try{

      const command =
        new SlashCommandBuilder()
          .setName('lineup')
          .setDescription(
            'Create a football lineup'
          );

      const guild =
        client.guilds.cache.get(
          GUILD_ID
        );

      if(guild){

        await guild.commands.set([
          command.toJSON(),
        ]);

      }else{

        await client.application.commands.set([
          command.toJSON(),
        ]);

      }

      console.log(
        '/lineup registered'
      );

      const targetGuild =
        client.guilds.cache.get(
          GUILD_ID
        );

      if(targetGuild){

        await refreshGuildSnapshot(
          targetGuild
        );

      }

    }catch(error){

      console.error(
        'Startup setup error:',
        error
      );

    }

    setInterval(
      async () => {

        try{

          await refreshAllGuilds();

        }catch(error){

          console.error(
            'Minute refresh failed:',
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
  async member => {

    if(member.user.bot){
      return;
    }

    try{

      await refreshGuildSnapshot(
        member.guild
      );

    }catch(error){

      console.error(
        'Join refresh failed:',
        error
      );

    }

  }
);

client.on(
  'guildMemberRemove',
  async member => {

    try{

      await refreshGuildSnapshot(
        member.guild
      );

    }catch(error){

      console.error(
        'Leave refresh failed:',
        error
      );

    }

  }
);

client.on(
  'interactionCreate',
  async interaction => {

    if(
      interaction.isChatInputCommand() &&
      interaction.commandName ===
        'lineup'
    ){

      if(
        !interaction.guild ||
        !interaction.channel
      ){

        return interaction.reply({
          content:
            'Use this command inside a server.',
          ephemeral:true,
        });

      }

      const rows = [];

      for(
        let start = 1;
        start <= 11;
        start += 5
      ){

        const row =
          new ActionRowBuilder();

        for(
          let n = start;
          n < start + 5 &&
          n <= 11;
          n += 1
        ){

          row.addComponents(
            new ButtonBuilder()
              .setCustomId(
                'lineup_size_' +
                n
              )
              .setLabel(
                n +
                'v' +
                n
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

      return interaction.reply({
        content:
          'Choose your lineup size:',
        components:rows,
        ephemeral:true,
      });

    }

    if(
      interaction.isButton() &&
      interaction.customId.startsWith(
        'lineup_size_'
      )
    ){

      const size =
        Number(
          interaction.customId
            .split('_')
            .pop()
        );

      if(
        !interaction.guild ||
        !interaction.channel ||
        !FORMATIONS[size]
      ){
        return;
      }

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
          'Open the lineup editor: ' +
          url,
        components:[],
      });

    }

  }
);

app.get(
  '/health',
  (req, res) => {

    res
      .status(200)
      .send('OK');

  }
);

app.get(
  '/pitch',
  (req, res) => {

    const id =
      String(
        req.query.id || ''
      );

    const session =
      sessions.get(id);

    if(!session){

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

    if(!session){

      return res
        .status(404)
        .json({
          error:
            'Session not found',
        });

    }

    try{

      const data =
        await publicSession(
          session
        );

      return res.json(
        data
      );

    }catch(error){

      console.error(
        'Session API error:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'Could not load players.',
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

    if(!session){

      return res
        .status(404)
        .json({
          error:
            'Session not found',
        });

    }

    const slot =
      session.slots.find(
        item =>
          item.index ===
          Number(slotIndex)
      );

    if(
      !slot ||
      !playerId
    ){

      return res
        .status(400)
        .json({
          error:
            'Invalid slot or player.',
        });

    }

    const snapshot =
      guildSnapshots.get(
        session.guildId
      );

    if(
      snapshot &&
      !snapshot.playerIds.has(
        playerId
      )
    ){

      return res
        .status(400)
        .json({
          error:
            'That player is no longer in the server.',
        });

    }

    for(
      const other
      of session.slots
    ){

      if(
        other.index !==
          slot.index &&
        other.playerId ===
          playerId
      ){

        other.playerId =
          null;

        other.position =
          '';

      }

    }

    session.bench =
      session.bench.filter(
        entry =>
          entry.playerId !==
          playerId
      );

    slot.playerId =
      playerId;

    const knownPosition =
      session.positions[
        playerId
      ] ||
      snapshot?.positions.get(
        playerId
      ) ||
      'UNSET';

    if(
      knownPosition !==
      'UNSET'
    ){

      slot.position =
        knownPosition;

    }

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

    if(!session){

      return res
        .status(404)
        .json({
          error:
            'Session not found',
        });

    }

    const slot =
      session.slots.find(
        item =>
          item.index ===
          Number(slotIndex)
      );

    if(
      !slot ||
      !POSITION_NAMES.includes(
        String(position)
      )
    ){

      return res
        .status(400)
        .json({
          error:
            'Invalid position.',
        });

    }

    slot.position =
      String(position);

    if(slot.playerId){

      session.positions[
        slot.playerId
      ] =
        String(position);

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

    if(!session){

      return res
        .status(404)
        .json({
          error:
            'Session not found',
        });

    }

    const slot =
      session.slots.find(
        item =>
          item.index ===
          Number(slotIndex)
      );

    if(!slot){

      return res
        .status(400)
        .json({
          error:
            'Invalid slot.',
        });

    }

    const nx =
      Number(x);

    const ny =
      Number(y);

    if(
      !Number.isFinite(nx) ||
      !Number.isFinite(ny)
    ){

      return res
        .status(400)
        .json({
          error:
            'Invalid position coordinates.',
        });

    }

    slot.x =
      Math.max(
        4,
        Math.min(
          96,
          nx
        )
      );

    slot.y =
      Math.max(
        5,
        Math.min(
          95,
          ny
        )
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

    if(!session){

      return res
        .status(404)
        .json({
          error:
            'Session not found',
        });

    }

    const slot =
      session.slots.find(
        item =>
          item.index ===
          Number(slotIndex)
      );

    if(
      !slot ||
      slot.playerId !==
        playerId
    ){

      return res
        .status(400)
        .json({
          error:
            'Player is not in that slot.',
        });

    }

    if(
      !session.bench.some(
        entry =>
          entry.playerId ===
          playerId
      )
    ){

      session.bench.push({
        playerId,
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

    if(!session){

      return res
        .status(404)
        .json({
          error:
            'Session not found',
        });

    }

    const benchEntry =
      session.bench.find(
        entry =>
          entry.playerId ===
          playerId
      );

    if(!benchEntry){

      return res
        .status(400)
        .json({
          error:
            'Player is not on the bench.',
        });

    }

    const slot =
      session.slots.find(
        item =>
          item.index ===
          Number(slotIndex)
      );

    if(
      !slot ||
      slot.playerId
    ){

      return res
        .status(400)
        .json({
          error:
            'Slot unavailable.',
        });

    }

    session.bench =
      session.bench.filter(
        entry =>
          entry.playerId !==
          playerId
      );

    slot.playerId =
      playerId;

    const knownPosition =
      session.positions[
        playerId
      ] ||
      guildSnapshots.get(
        session.guildId
      )?.positions.get(
        playerId
      ) ||
      'UNSET';

    if(
      knownPosition !==
      'UNSET'
    ){

      slot.position =
        knownPosition;

    }

    return res.json({
      ok:true,
    });

  }
);

app.post(
  '/final',
  async (req, res) => {

    const session =
      sessions.get(
        String(
          req.body?.id ||
          ''
        )
      );

    if(!session){

      return res
        .status(404)
        .json({
          error:
            'Session not found',
        });

    }

    try{

      const channel =
        await client.channels.fetch(
          session.channelId
        );

      if(
        !channel ||
        !channel.isTextBased()
      ){

        throw new Error(
          'Original Discord channel is unavailable.'
        );

      }

      const image =
        await makeLineupImage(
          session
        );

      const attachment =
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
        files:[
          attachment
        ],
      });

      return res.json({
        ok:true,
      });

    }catch(error){

      console.error(
        'Final lineup failed:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to post lineup: ' +
            error.message,
        });

    }

  }
);

setInterval(
  () => {

    const cutoff =
      Date.now() -
      SESSION_TIMEOUT_MS;

    for(
      const [
        id,
        session
      ] of sessions
    ){

      if(
        session.createdAt <
        cutoff
      ){

        sessions.delete(
          id
        );

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
      'Web server listening on port ' +
      PORT
    );

  }
);

client.login(
  DISCORD_TOKEN
).catch(
  error => {

    console.error(
      'Discord login failed:',
      error
    );

    process.exit(1);

  }
);
