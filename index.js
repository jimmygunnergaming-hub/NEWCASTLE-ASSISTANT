const express = require("express");
const sharp = require("sharp");
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require("discord.js");

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = Number(process.env.PORT || 3000);
const TOKEN = process.env.DISCORD_TOKEN;

const GUILD_ID =
  process.env.GUILD_ID || "1542615988137099324";

const POSITION_CHANNEL_ID =
  process.env.POSITION_CHANNEL_ID ||
  "1542615989382942756";

const REFRESH_INTERVAL = 60 * 1000;
const SESSION_TIMEOUT = 6 * 60 * 60 * 1000;

const BASE_URL = (
  process.env.RENDER_EXTERNAL_URL ||
  `http://localhost:${PORT}`
).replace(/\/+$/, "");

if (!TOKEN) {
  console.error("DISCORD_TOKEN is missing.");
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

let playersCache = new Map();
let positionsCache = new Map();
let lastRefresh = 0;

const POSITIONS = [
  "GK",
  "CB",
  "LB",
  "RB",
  "LWB",
  "RWB",
  "DM",
  "CDM",
  "CM",
  "CAM",
  "LM",
  "RM",
  "LW",
  "RW",
  "CF",
  "ST",
];

const FORMATIONS = {
  1: [
    { x: 50, y: 50 },
  ],

  2: [
    { x: 50, y: 84 },
    { x: 50, y: 20 },
  ],

  3: [
    { x: 50, y: 86 },
    { x: 30, y: 40 },
    { x: 70, y: 40 },
  ],

  4: [
    { x: 50, y: 88 },
    { x: 25, y: 60 },
    { x: 75, y: 60 },
    { x: 50, y: 30 },
  ],

  5: [
    { x: 50, y: 88 },
    { x: 20, y: 61 },
    { x: 80, y: 61 },
    { x: 35, y: 35 },
    { x: 65, y: 35 },
  ],

  6: [
    { x: 50, y: 89 },
    { x: 18, y: 62 },
    { x: 38, y: 67 },
    { x: 62, y: 67 },
    { x: 82, y: 62 },
    { x: 50, y: 32 },
  ],

  7: [
    { x: 50, y: 90 },
    { x: 16, y: 63 },
    { x: 33, y: 68 },
    { x: 50, y: 70 },
    { x: 67, y: 68 },
    { x: 84, y: 63 },
    { x: 50, y: 32 },
  ],

  8: [
    { x: 50, y: 90 },
    { x: 14, y: 64 },
    { x: 31, y: 69 },
    { x: 50, y: 71 },
    { x: 69, y: 69 },
    { x: 86, y: 64 },
    { x: 30, y: 35 },
    { x: 70, y: 35 },
  ],

  9: [
    { x: 50, y: 91 },
    { x: 12, y: 65 },
    { x: 27, y: 70 },
    { x: 42, y: 72 },
    { x: 58, y: 72 },
    { x: 73, y: 70 },
    { x: 88, y: 65 },
    { x: 32, y: 36 },
    { x: 68, y: 36 },
  ],

  10: [
    { x: 50, y: 91 },
    { x: 10, y: 66 },
    { x: 24, y: 71 },
    { x: 39, y: 73 },
    { x: 61, y: 73 },
    { x: 76, y: 71 },
    { x: 90, y: 66 },
    { x: 24, y: 38 },
    { x: 50, y: 30 },
    { x: 76, y: 38 },
  ],

  11: [
    { x: 50, y: 92 },
    { x: 9, y: 67 },
    { x: 24, y: 71 },
    { x: 38, y: 74 },
    { x: 50, y: 75 },
    { x: 62, y: 74 },
    { x: 76, y: 71 },
    { x: 91, y: 67 },
    { x: 20, y: 39 },
    { x: 50, y: 30 },
    { x: 80, y: 39 },
  ],
};

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getName(member) {
  return (
    member.displayName ||
    member.user.globalName ||
    member.user.username
  );
}

function cleanText(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9/]+/g, " ")
    .trim();
}

function detectPosition(text) {
  const cleaned = cleanText(text);

  const sorted = [...POSITIONS].sort(
    (a, b) => b.length - a.length
  );

  for (const position of sorted) {
    const regex = new RegExp(
      "(^|\\s)" +
        position.replace("/", "\\/") +
        "(?=\\s|$)",
      "i"
    );

    if (regex.test(cleaned)) {
      return position;
    }
  }

  return null;
}

function getMessageText(message) {
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

  return parts.join("\n");
}

function findPlayerInText(text, members) {
  const lower = String(text || "").toLowerCase();

  const matches = [];

  for (const member of members) {
    const possibleNames = [
      member.displayName,
      member.user.username,
      member.user.globalName,
    ]
      .filter(Boolean)
      .map((name) => String(name).toLowerCase());

    for (const name of possibleNames) {
      if (
        name.length >= 2 &&
        lower.includes(name)
      ) {
        matches.push({
          id: member.id,
          length: name.length,
        });
      }
    }
  }

  matches.sort(
    (a, b) => b.length - a.length
  );

  return matches.length
    ? matches[0].id
    : null;
}

async function scanPositionChannel(guild, members) {
  const result = new Map();

  const channel = await client.channels
    .fetch(POSITION_CHANNEL_ID)
    .catch((error) => {
      console.error(
        "Position channel fetch failed:",
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
      "Cannot read position channel:",
      POSITION_CHANNEL_ID
    );

    return result;
  }

  const memberMap = new Map(
    members.map((member) => [
      member.id,
      member,
    ])
  );

  let before = null;

  for (let page = 0; page < 15; page += 1) {
    const options = {
      limit: 100,
    };

    if (before) {
      options.before = before;
    }

    const messages =
      await channel.messages
        .fetch(options)
        .catch((error) => {
          console.error(
            "Position messages failed:",
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

    for (const message of messages.values()) {
      const text =
        getMessageText(message);

      const position =
        detectPosition(text);

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
        message.mentions.users.size
      ) {
        for (
          const user
          of message.mentions.users.values()
        ) {
          if (
            memberMap.has(user.id)
          ) {
            playerId = user.id;
            break;
          }
        }
      }

      /*
        2. Player name in message.
        This happens BEFORE checking
        the message author so that a
        staff member posting
        "Jimmy - ST" does not get
        incorrectly assigned ST.
      */
      if (!playerId) {
        playerId =
          findPlayerInText(
            text,
            members
          );
      }

      /*
        3. If the actual player posted
        "I am ST", use the author.
        Never use a bot author.
      */
      if (
        !playerId &&
        message.author &&
        !message.author.bot &&
        memberMap.has(
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

    const last =
      messages.last();

    if (!last) {
      break;
    }

    before = last.id;
  }

  console.log(
    "Position scan found " +
      result.size +
      " players."
  );

  return result;
}

async function refreshPlayers() {
  const guild =
    await client.guilds.fetch(
      GUILD_ID
    );

  await guild.members.fetch();

  const members =
    [...guild.members.cache.values()]
      .filter(
        (member) =>
          !member.user.bot
      );

  const foundPositions =
    await scanPositionChannel(
      guild,
      members
    );

  const nextPlayers =
    new Map();

  for (const member of members) {
    const position =
      foundPositions.get(
        member.id
      ) ||
      "UNSET";

    nextPlayers.set(
      member.id,
      {
        id: member.id,
        name: getName(member),
        username:
          member.user.username,
        avatar:
          member.displayAvatarURL({
            extension: "png",
            size: 256,
            forceStatic: true,
          }),
        position,
      }
    );
  }

  playersCache =
    nextPlayers;

  positionsCache =
    foundPositions;

  lastRefresh =
    Date.now();

  /*
    Update all active lineup sessions.
  */
  for (
    const session
    of sessions.values()
  ) {
    if (
      session.guildId !==
      guild.id
    ) {
      continue;
    }

    /*
      Remove players that left
      the server.
    */
    for (
      const slot
      of session.slots
    ) {
      if (
        slot.playerId &&
        !playersCache.has(
          slot.playerId
        )
      ) {
        slot.playerId = null;
        slot.position = "";
      }
    }

    /*
      Remove players from bench
      if they left.
    */
    session.bench =
      session.bench.filter(
        (entry) =>
          playersCache.has(
            entry.playerId
          )
      );

    /*
      Update positions on the pitch
      automatically.
    */
    for (
      const slot
      of session.slots
    ) {
      if (!slot.playerId) {
        continue;
      }

      const currentPosition =
        positionsCache.get(
          slot.playerId
        );

      if (currentPosition) {
        slot.position =
          currentPosition;
      }
    }
  }

  console.log(
    "60-second refresh: " +
      playersCache.size +
      " players"
  );
}

async function ensurePlayersFresh() {
  if (
    !lastRefresh ||
    Date.now() - lastRefresh >=
      REFRESH_INTERVAL
  ) {
    await refreshPlayers();
  }
}

function makeSession(
  guild,
  channel,
  size
) {
  const id =
    Date.now().toString(36) +
    "-" +
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
        position: "",
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

  sessions.set(
    id,
    session
  );

  return session;
}

function buildSizeRows() {
  const rows = [];

  for (
    let start = 1;
    start <= 11;
    start += 5
  ) {
    const row =
      new ActionRowBuilder();

    for (
      let size = start;
      size <=
        Math.min(
          start + 4,
          11
        );
      size += 1
    ) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(
            "lineup_size_" +
              size
          )
          .setLabel(
            size +
              "v" +
              size
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

const PAGE = `
<!doctype html>
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
  background:#070b12;
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

.top{
  min-height:62px;
  padding:8px 12px;
  display:flex;
  align-items:center;
  gap:10px;
  background:#0d1420;
  border-bottom:1px solid #202a3a;
}

.top h1{
  margin:0;
  font-size:17px;
}

.top small{
  opacity:.65;
}

.actions{
  margin-left:auto;
  display:flex;
  gap:7px;
  flex-wrap:wrap;
}

.btn{
  border:0;
  border-radius:10px;
  padding:10px 12px;
  background:#1c2738;
  color:#fff;
  font-weight:800;
  cursor:pointer;
}

.primary{
  background:#2f74ff;
}

.danger{
  background:#a72a3d;
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
  width:min(75vw,520px);
  aspect-ratio:2/3;
  border:4px solid #fff;
  border-radius:18px;
  overflow:hidden;
  touch-action:none;

  background:
    repeating-linear-gradient(
      to bottom,
      #16813e 0,
      #16813e 8.33%,
      #1a8c45 8.33%,
      #1a8c45 16.66%
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

.box-top,
.box-bottom{
  position:absolute;
  left:24%;
  width:52%;
  height:14%;
  border:3px solid #fff;
}

.box-top{
  top:0;
  border-top:0;
}

.box-bottom{
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
  cursor:pointer;
  user-select:none;
  touch-action:none;
  z-index:5;
}

.circle{
  width:52px;
  height:52px;
  border-radius:50%;
  border:3px solid #fff;
  background:#666;
  overflow:hidden;
  display:flex;
  align-items:center;
  justify-content:center;
}

.circle img{
  width:100%;
  height:100%;
  object-fit:cover;
}

.initial{
  font-size:20px;
  font-weight:900;
}

.slot-name{
  max-width:100px;
  margin-top:3px;
  text-align:center;
  font-size:10px;
  font-weight:900;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  text-shadow:0 1px 4px #000;
}

.selected .circle{
  outline:4px solid #ffd329;
}

.sidebar{
  min-height:0;
  display:flex;
  flex-direction:column;
  overflow:hidden;
  background:#0d1420;
  border:1px solid #202a3a;
  border-radius:16px;
}

.search{
  padding:10px;
  border-bottom:1px solid #202a3a;
}

.search input{
  width:100%;
  padding:11px;
  border-radius:10px;
  border:1px solid #33445e;
  background:#080d14;
  color:#fff;
  outline:none;
}

.players{
  flex:1;
  min-height:0;
  overflow:auto;
  padding:8px;
}

.group-title{
  padding:5px;
  font-size:11px;
  font-weight:900;
  opacity:.6;
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
  cursor:pointer;
  text-align:left;
}

.player img,
.fallback{
  width:36px;
  height:36px;
  border-radius:50%;
  flex:none;
}

.player img{
  object-fit:cover;
}

.fallback{
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

.player-pos{
  font-size:10px;
  opacity:.55;
}

.bench{
  border-top:1px solid #202a3a;
  padding:8px;
}

.bench-title{
  font-size:11px;
  font-weight:900;
  opacity:.6;
  margin-bottom:7px;
}

.bench-list{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  max-height:110px;
  overflow:auto;
}

.bench-item{
  border:0;
  border-radius:999px;
  background:#192235;
  color:#fff;
  padding:6px 9px;
  display:flex;
  align-items:center;
  gap:6px;
  cursor:pointer;
}

.bench-item img{
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
  z-index:50;
}

.modal.show{
  display:flex;
}

.modal-card{
  width:min(440px,100%);
  background:#0d1420;
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
  background:#141f30;
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
  background:#0d1420;
  border:1px solid #33445e;
  border-radius:999px;
  padding:7px 12px;
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

  .top h1{
    font-size:14px;
  }

  .btn{
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
    width:65px;
    height:65px;
  }

  .circle{
    width:45px;
    height:45px;
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

<div class="pitch-holder">

<div
class="pitch"
id="pitch"
>

<div class="box-top"></div>
<div class="box-bottom"></div>

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
class="btn"
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
"__SESSION_ID__";

let state = null;
let selectedSlot = null;
let drag = null;
let moved = false;

const pitch =
document.getElementById("pitch");

const status =
document.getElementById("status");

function getPlayer(id){
  return state.players.find(
    p => p.id === id
  ) || null;
}

async function api(
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
      "Request failed"
    );
  }

  return data;
}

async function load(){

  try{

    state =
      await api(
        "/api/session?id=" +
        encodeURIComponent(
          SESSION_ID
        )
      );

    document.getElementById(
      "sub"
    ).textContent =
      state.size +
      "v" +
      state.size;

    status.textContent =
      state.players.length +
      " players • updates every minute";

    renderAll();

  }catch(error){

    status.textContent =
      error.message;

    console.error(error);

  }
}

async function refresh(){

  try{

    const selectedPlayer =
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
        "/api/session?id=" +
        encodeURIComponent(
          SESSION_ID
        )
      );

    if(selectedPlayer){

      const replacement =
        state.slots.find(
          s =>
            s.playerId ===
            selectedPlayer
        );

      selectedSlot =
        replacement
          ? replacement.index
          : null;
    }

    status.textContent =
      state.players.length +
      " players • updated " +
      new Date(
        state.updatedAt
      ).toLocaleTimeString();

    renderAll();

  }catch(error){

    console.error(
      "Minute refresh:",
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
      ".slot"
    )
    .forEach(
      e => e.remove()
    );

  state.slots.forEach(
    slot => {

      const p =
        slot.playerId
          ? getPlayer(
              slot.playerId
            )
          : null;

      const el =
        document.createElement(
          "div"
        );

      el.className =
        "slot" +
        (
          selectedSlot ===
          slot.index
            ? " selected"
            : ""
        );

      el.dataset.index =
        String(slot.index);

      el.style.left =
        slot.x + "%";

      el.style.top =
        slot.y + "%";

      const circle =
        document.createElement(
          "div"
        );

      circle.className =
        "circle";

      if(p){

        const img =
          document.createElement(
            "img"
          );

        img.src =
          p.avatar;

        img.onerror =
          function(){

            img.remove();

            const initial =
              document.createElement(
                "div"
              );

            initial.className =
              "initial";

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

      }else{

        const plus =
          document.createElement(
            "span"
          );

        plus.textContent =
          "+";

        plus.style.fontSize =
          "25px";

        circle.appendChild(
          plus
        );

      }

      const name =
        document.createElement(
          "div"
        );

      name.className =
        "slot-name";

      name.textContent =
        p ? p.name : "EMPTY";

      el.appendChild(
        circle
      );

      el.appendChild(
        name
      );

      el.addEventListener(
        "pointerdown",
        event => {

          selectedSlot =
            slot.index;

          startDrag(
            event,
            slot.index
          );

        }
      );

      el.addEventListener(
        "click",
        () => {

          if(moved){
            moved = false;
            return;
          }

          selectedSlot =
            slot.index;

          renderPitch();

        }
      );

      pitch.appendChild(
        el
      );

    }
  );
}

function renderPlayers(){

  const query =
    document.getElementById(
      "search"
    )
    .value
    .trim()
    .toLowerCase();

  const assigned =
    new Set(
      state.slots
        .filter(
          s => !!s.playerId
        )
        .map(
          s => s.playerId
        )
    );

  const bench =
    new Set(
      state.bench.map(
        b => b.playerId
      )
    );

  const groups = {};

  state.players.forEach(
    p => {

      if(
        assigned.has(p.id) ||
        bench.has(p.id)
      ){
        return;
      }

      const matches =
        !query ||
        p.name
          .toLowerCase()
          .includes(query) ||
        p.position
          .toLowerCase()
          .includes(query);

      if(!matches){
        return;
      }

      const pos =
        p.position ||
        "UNSET";

      if(!groups[pos]){
        groups[pos] = [];
      }

      groups[pos].push(p);

    }
  );

  const order = [
    "GK",
    "CB",
    "LB",
    "RB",
    "LWB",
    "RWB",
    "DM",
    "CDM",
    "CM",
    "CAM",
    "LM",
    "RM",
    "LW",
    "RW",
    "CF",
    "ST",
    "UNSET"
  ];

  const keys =
    order
      .filter(
        p => groups[p]
      )
      .concat(
        Object.keys(
          groups
        ).filter(
          p =>
            !order.includes(p)
        )
      );

  const container =
    document.getElementById(
      "players"
    );

  container.innerHTML = "";

  keys.forEach(
    position => {

      const title =
        document.createElement(
          "div"
        );

      title.className =
        "group-title";

      title.textContent =
        position;

      container.appendChild(
        title
      );

      groups[position].forEach(
        p => {

          const button =
            document.createElement(
              "button"
            );

          button.className =
            "player";

          const img =
            document.createElement(
              "img"
            );

          img.src =
            p.avatar;

          const fallback =
            document.createElement(
              "div"
            );

          fallback.className =
            "fallback";

          fallback.textContent =
            p.name
              .slice(0,1)
              .toUpperCase();

          img.onerror =
            function(){

              img.style.display =
                "none";

              fallback.style.display =
                "flex";

            };

          const name =
            document.createElement(
              "span"
            );

          name.className =
            "player-name";

          name.textContent =
            p.name;

          const pos =
            document.createElement(
              "span"
            );

          pos.className =
            "player-pos";

          pos.textContent =
            p.position;

          button.appendChild(
            img
          );

          button.appendChild(
            fallback
          );

          button.appendChild(
            name
          );

          button.appendChild(
            pos
          );

          button.addEventListener(
            "click",
            () =>
              pickPlayer(p.id)
          );

          container.appendChild(
            button
          );

        }
      );

    }
  );
}

function renderBench(){

  const container =
    document.getElementById(
      "benchList"
    );

  container.innerHTML = "";

  if(!state.bench.length){

    container.innerHTML =
      '<span style="opacity:.5;font-size:12px">No bench players</span>';

    return;
  }

  state.bench.forEach(
    entry => {

      const p =
        getPlayer(
          entry.playerId
        );

      if(!p){
        return;
      }

      const button =
        document.createElement(
          "button"
        );

      button.className =
        "bench-item";

      const image =
        document.createElement(
          "img"
        );

      image.src =
        p.avatar;

      const text =
        document.createElement(
          "span"
        );

      text.textContent =
        p.name;

      button.appendChild(
        image
      );

      button.appendChild(
        text
      );

      button.addEventListener(
        "click",
        () =>
          restoreBench(p.id)
      );

      container.appendChild(
        button
      );

    }
  );
}

async function pickPlayer(
  playerId
){

  if(
    selectedSlot ===
    null
  ){

    const empty =
      state.slots.find(
        s => !s.playerId
      );

    if(!empty){

      alert(
        "No empty slot available."
      );

      return;
    }

    selectedSlot =
      empty.index;
  }

  const slot =
    state.slots.find(
      s =>
        s.index ===
        selectedSlot
    );

  if(!slot){
    return;
  }

  try{

    await api(
      "/api/assign",
      {
        method:"POST",
        headers:{
          "content-type":
            "application/json"
        },
        body:
          JSON.stringify({
            id:SESSION_ID,
            slotIndex:
              slot.index,
            playerId
          })
      }
    );

    state.slots.forEach(
      other => {

        if(
          other.index !==
            slot.index &&
          other.playerId ===
            playerId
        ){

          other.playerId =
            null;

          other.position =
            "";

        }

      }
    );

    state.bench =
      state.bench.filter(
        b =>
          b.playerId !==
          playerId
      );

    slot.playerId =
      playerId;

    const p =
      getPlayer(playerId);

    if(
      p &&
      p.position !==
      "UNSET"
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

function openPosition(){

  if(
    selectedSlot ===
    null
  ){

    alert(
      "Select a pitch slot first."
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
      "Select a player first."
    );

    return;
  }

  const p =
    getPlayer(
      slot.playerId
    );

  document.getElementById(
    "modalTitle"
  ).textContent =
    "Position for " +
    p.name;

  const grid =
    document.getElementById(
      "positionGrid"
    );

  grid.innerHTML = "";

  [
    "GK",
    "CB",
    "LB",
    "RB",
    "LWB",
    "RWB",
    "DM",
    "CDM",
    "CM",
    "CAM",
    "LM",
    "RM",
    "LW",
    "RW",
    "CF",
    "ST"
  ].forEach(
    position => {

      const button =
        document.createElement(
          "button"
        );

      button.className =
        "position-button";

      button.textContent =
        position;

      button.addEventListener(
        "click",
        () =>
          setPosition(position)
      );

      grid.appendChild(
        button
      );

    }
  );

  document.getElementById(
    "modal"
  ).classList.add(
    "show"
  );
}

async function setPosition(
  position
){

  if(
    selectedSlot ===
    null
  ){
    return;
  }

  try{

    await api(
      "/api/position",
      {
        method:"POST",
        headers:{
          "content-type":
            "application/json"
        },
        body:
          JSON.stringify({
            id:SESSION_ID,
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
          getPlayer(
            slot.playerId
          );

        if(p){
          p.position =
            position;
        }

      }
    }

    closePosition();
    renderAll();

  }catch(error){

    alert(
      error.message
    );

  }
}

function closePosition(){

  document.getElementById(
    "modal"
  ).classList.remove(
    "show"
  );

}

async function benchSelected(){

  if(
    selectedSlot ===
    null
  ){

    alert(
      "Select a player first."
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
      "Select a player first."
    );

    return;
  }

  const playerId =
    slot.playerId;

  try{

    await api(
      "/api/bench",
      {
        method:"POST",
        headers:{
          "content-type":
            "application/json"
        },
        body:
          JSON.stringify({
            id:SESSION_ID,
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
      "";

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
      b =>
        b.playerId ===
        playerId
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
        s => !s.playerId
      );

  }

  if(!slot){

    alert(
      "No empty pitch slot available."
    );

    return;
  }

  try{

    await api(
      "/api/restore",
      {
        method:"POST",
        headers:{
          "content-type":
            "application/json"
        },
        body:
          JSON.stringify({
            id:SESSION_ID,
            playerId,
            slotIndex:
              slot.index
          })
      }
    );

    state.bench =
      state.bench.filter(
        b =>
          b.playerId !==
          playerId
      );

    slot.playerId =
      playerId;

    const p =
      getPlayer(
        playerId
      );

    if(
      p &&
      p.position !==
      "UNSET"
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

  const slot =
    state.slots[
      index
    ];

  if(!slot){
    return;
  }

  moved = false;

  drag = {
    index,
    startX:
      event.clientX,
    startY:
      event.clientY,
    originalX:
      slot.x,
    originalY:
      slot.y
  };

  try{
    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  }catch(error){}

}

pitch.addEventListener(
  "pointermove",
  event => {

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
      drag.originalX +
      dx;

    let y =
      drag.originalY +
      dy;

    x =
      Math.round(
        Math.max(
          4,
          Math.min(
            96,
            x
          )
        ) / 2
      ) * 2;

    y =
      Math.round(
        Math.max(
          5,
          Math.min(
            95,
            y
          )
        ) / 2
      ) * 2;

    const slot =
      state.slots[
        drag.index
      ];

    slot.x = x;
    slot.y = y;

    const element =
      pitch.querySelector(
        '.slot[data-index="' +
        drag.index +
        '"]'
      );

    if(element){

      element.style.left =
        x + "%";

      element.style.top =
        y + "%";

    }

  }
);

pitch.addEventListener(
  "pointerup",
  async () => {

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

    try{

      await api(
        "/api/move",
        {
          method:"POST",
          headers:{
            "content-type":
              "application/json"
          },
          body:
            JSON.stringify({
              id:SESSION_ID,
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

document.getElementById(
  "clearBtn"
).onclick =
function(){

  selectedSlot =
    null;

  renderPitch();

};

document.getElementById(
  "positionBtn"
).onclick =
openPosition;

document.getElementById(
  "benchBtn"
).onclick =
benchSelected;

document.getElementById(
  "closeModal"
).onclick =
closePosition;

document.getElementById(
  "search"
).oninput =
renderPlayers;

document.getElementById(
  "finishBtn"
).onclick =
async function(){

  if(
    !confirm(
      "Post this lineup to Discord?"
    )
  ){
    return;
  }

  try{

    await api(
      "/final",
      {
        method:"POST",
        headers:{
          "content-type":
            "application/json"
        },
        body:
          JSON.stringify({
            id:SESSION_ID
          })
      }
    );

    alert(
      "Lineup posted to Discord!"
    );

  }catch(error){

    alert(
      error.message
    );

  }
};

load();

/*
  Refresh every minute.
*/
setInterval(
  refresh,
  60000
);

</script>

</body>
</html>
`;

function createPage(sessionId) {
  return PAGE.replace(
    "__SESSION_ID__",
    String(sessionId)
  );
}

async function downloadAvatar(
  url,
  size
) {
  try {
    const response =
      await fetch(
        url,
        {
          headers: {
            "User-Agent":
              "Newcastle-Assistant",
          },
        }
      );

    if (!response.ok) {
      return null;
    }

    const input =
      Buffer.from(
        await response.arrayBuffer()
      );

    const resized =
      await sharp(input)
        .resize(
          size,
          size,
          {
            fit: "cover",
          }
        )
        .png()
        .toBuffer();

    return resized;

  } catch (error) {
    console.error(
      "Avatar download failed:",
      error.message
    );

    return null;
  }
}

async function makeCircularAvatar(
  url,
  size
) {
  const avatar =
    await downloadAvatar(
      url,
      size
    );

  if (!avatar) {
    return null;
  }

  try {

    const mask =
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
          <circle
            cx="${size / 2}"
            cy="${size / 2}"
            r="${size / 2}"
            fill="white"
          />
        </svg>`
      );

    return await sharp(avatar)
      .composite([
        {
          input: mask,
          blend: "dest-in",
        },
      ])
      .png()
      .toBuffer();

  } catch (error) {

    return avatar;

  }
}

async function makeLineupImage(
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

  const overlays = [];

  let svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">`;

  svg +=
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="#08111c"/>`;

  svg +=
    `<text x="600" y="42" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="30" font-weight="900">NEWCASTLE LINEUP</text>`;

  svg +=
    `<rect x="${PITCH_X}" y="${PITCH_Y}" width="${PITCH_W}" height="${PITCH_H}" rx="20" fill="#178640" stroke="#ffffff" stroke-width="6"/>`;

  for (
    let i = 0;
    i < 12;
    i += 1
  ) {
    svg +=
      `<rect x="${PITCH_X}" y="${PITCH_Y + PITCH_H * i / 12}" width="${PITCH_W}" height="${PITCH_H / 12}" fill="${i % 2 === 0 ? "#178640" : "#1b8d46"}"/>`;
  }

  svg +=
    `<line x1="${PITCH_X}" y1="${PITCH_Y + PITCH_H / 2}" x2="${PITCH_X + PITCH_W}" y2="${PITCH_Y + PITCH_H / 2}" stroke="#ffffff" stroke-width="5"/>`;

  svg +=
    `<circle cx="${PITCH_X + PITCH_W / 2}" cy="${PITCH_Y + PITCH_H / 2}" r="68" fill="none" stroke="#ffffff" stroke-width="5"/>`;

  svg +=
    `<rect x="${PITCH_X + PITCH_W * 0.25}" y="${PITCH_Y}" width="${PITCH_W * 0.5}" height="${PITCH_H * 0.14}" fill="none" stroke="#ffffff" stroke-width="5"/>`;

  svg +=
    `<rect x="${PITCH_X + PITCH_W * 0.25}" y="${PITCH_Y + PITCH_H * 0.86}" width="${PITCH_W * 0.5}" height="${PITCH_H * 0.14}" fill="none" stroke="#ffffff" stroke-width="5"/>`;

  for (
    let i = 0;
    i < session.slots.length;
    i += 1
  ) {
    const slot =
      session.slots[i];

    const cx =
      PITCH_X +
      slot.x / 100 *
        PITCH_W;

    const cy =
      PITCH_Y +
      slot.y / 100 *
        PITCH_H;

    const radius = 48;

    const member =
      slot.playerId
        ? await guild.members
            .fetch(slot.playerId)
            .catch(() => null)
        : null;

    svg +=
      `<circle cx="${cx}" cy="${cy}" r="52" fill="#ffffff"/>`;

    svg +=
      `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#666666"/>`;

    if (member) {

      const avatar =
        await makeCircularAvatar(
          member.displayAvatarURL({
            extension: "png",
            size: 256,
            forceStatic: true,
          }),
          96
        );

      if (avatar) {

        overlays.push({
          input: avatar,
          left:
            Math.round(
              cx - 48
            ),
          top:
            Math.round(
              cy - 48
            ),
        });

      } else {

        svg +=
          `<text x="${cx}" y="${cy + 12}" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="32" font-weight="900">${escapeHtml(
            getName(member).slice(0, 1)
          )}</text>`;

      }

      svg +=
        `<text x="${cx}" y="${cy + 70}" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="17" font-weight="900">${escapeHtml(
          getName(member)
        )}</text>`;

      if (slot.position) {

        svg +=
          `<text x="${cx}" y="${cy + 91}" text-anchor="middle" fill="#dce7ff" font-family="Arial" font-size="13" font-weight="800">${escapeHtml(
            slot.position
          )}</text>`;

      }

    } else {

      svg +=
        `<text x="${cx}" y="${cy + 12}" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="32" font-weight="900">+</text>`;

      svg +=
        `<text x="${cx}" y="${cy + 70}" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="17" font-weight="900">EMPTY</text>`;
    }
  }

  svg +=
    `<text x="600" y="1230" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="25" font-weight="900">BENCH</text>`;

  let benchX = 150;
  let benchY = 1335;

  for (
    const entry
    of session.bench
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
      benchY += 105;
    }

    svg +=
      `<circle cx="${benchX}" cy="${benchY}" r="38" fill="#ffffff"/>`;

    svg +=
      `<circle cx="${benchX}" cy="${benchY}" r="34" fill="#666666"/>`;

    const avatar =
      await makeCircularAvatar(
        member.displayAvatarURL({
          extension: "png",
          size: 256,
          forceStatic: true,
        }),
        68
      );

    if (avatar) {

      overlays.push({
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
      `<text x="${benchX}" y="${benchY + 57}" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="14" font-weight="800">${escapeHtml(
        getName(member)
      )}</text>`;

    benchX += 145;
  }

  svg +=
    "</svg>";

  let image =
    await sharp(
      Buffer.from(svg)
    )
      .png()
      .toBuffer();

  if (overlays.length) {
    image =
      await sharp(image)
        .composite(overlays)
        .png()
        .toBuffer();
  }

  return image;
}

client.once(
  "ready",
  async () => {

    console.log(
      "Logged in as " +
        client.user.tag
    );

    try {

      const command =
        new SlashCommandBuilder()
          .setName("lineup")
          .setDescription(
            "Create a football lineup"
          )
          .toJSON();

      const guild =
        client.guilds.cache.get(
          GUILD_ID
        );

      if (guild) {

        await guild.commands.set([
          command,
        ]);

      } else {

        await client.application.commands.set([
          command,
        ]);

      }

      console.log(
        "/lineup registered"
      );

    } catch (error) {

      console.error(
        "Command registration failed:",
        error
      );

    }

    try {

      await refreshPlayers();

    } catch (error) {

      console.error(
        "Initial player refresh failed:",
        error
      );

    }

    setInterval(
      async () => {

        try {

          await refreshPlayers();

        } catch (error) {

          console.error(
            "60-second refresh failed:",
            error
          );

        }

      },
      REFRESH_INTERVAL
    );
  }
);

client.on(
  "interactionCreate",
  async (interaction) => {

    if (
      interaction.isChatInputCommand() &&
      interaction.commandName ===
        "lineup"
    ) {

      if (
        !interaction.guild ||
        !interaction.channel
      ) {

        return interaction.reply({
          content:
            "Use /lineup inside a server.",
          ephemeral: true,
        });

      }

      return interaction.reply({
        content:
          "Choose your lineup size:",
        components:
          buildSizeRows(),
        ephemeral: true,
      });
    }

    if (
      interaction.isButton() &&
      interaction.customId.startsWith(
        "lineup_size_"
      )
    ) {

      const size =
        Number(
          interaction.customId.replace(
            "lineup_size_",
            ""
          )
        );

      if (
        !interaction.guild ||
        !interaction.channel ||
        !FORMATIONS[size]
      ) {

        return interaction.reply({
          content:
            "Invalid lineup size.",
          ephemeral:true,
        });

      }

      try {

        await ensurePlayersFresh();

        const session =
          makeSession(
            interaction.guild,
            interaction.channel,
            size
          );

        const url =
          BASE_URL +
          "/pitch?id=" +
          encodeURIComponent(
            session.id
          );

        return interaction.update({
          content:
            "Open the lineup editor:\n" +
            url,
          components: [],
        });

      } catch (error) {

        console.error(
          "Lineup button failed:",
          error
        );

        return interaction.update({
          content:
            "Could not start lineup editor.",
          components: [],
        });

      }
    }
  }
);

app.get(
  "/health",
  (req, res) => {
    res.status(200).send("OK");
  }
);

app.get(
  "/pitch",
  (req, res) => {

    const session =
      sessions.get(
        String(
          req.query.id || ""
        )
      );

    if (!session) {

      return res
        .status(404)
        .send(
          "Lineup session not found or expired."
        );

    }

    return res.send(
      createPage(
        session.id
      )
    );
  }
);

app.get(
  "/api/session",
  async (req, res) => {

    const session =
      sessions.get(
        String(
          req.query.id || ""
        )
      );

    if (!session) {

      return res
        .status(404)
        .json({
          error:
            "Session not found.",
        });

    }

    try {

      await ensurePlayersFresh();

      const players =
        [...playersCache.values()]
          .map((player) => ({
            ...player,
            position:
              positionsCache.get(
                player.id
              ) ||
              player.position ||
              "UNSET",
          }));

      /*
        Apply newest positions to
        this session every API call.
      */
      for (
        const slot
        of session.slots
      ) {

        if (!slot.playerId) {
          continue;
        }

        const position =
          positionsCache.get(
            slot.playerId
          );

        if (position) {
          slot.position =
            position;
        }
      }

      return res.json({
        id: session.id,
        size: session.size,
        updatedAt: lastRefresh,
        players,
        slots: session.slots,
        bench: session.bench,
      });

    } catch (error) {

      console.error(
        "Session API failed:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Could not load players.",
        });

    }
  }
);

app.post(
  "/api/assign",
  (req, res) => {

    const {
      id,
      slotIndex,
      playerId,
    } = req.body || {};

    const session =
      sessions.get(
        String(id || "")
      );

    if (!session) {

      return res
        .status(404)
        .json({
          error:
            "Session not found.",
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
            "Slot not found.",
        });

    }

    const pid =
      String(playerId || "");

    if (
      !playersCache.has(pid)
    ) {

      return res
        .status(400)
        .json({
          error:
            "Player is not in the server.",
        });

    }

    /*
      Remove the player from any
      previous pitch slot.
    */
    for (
      const other
      of session.slots
    ) {

      if (
        other.index !==
          slot.index &&
        other.playerId === pid
      ) {

        other.playerId = null;
        other.position = "";
      }
    }

    /*
      Assignment removes them from
      bench.
    */
    session.bench =
      session.bench.filter(
        (entry) =>
          entry.playerId !== pid
      );

    slot.playerId =
      pid;

    const position =
      positionsCache.get(pid);

    if (position) {
      slot.position =
        position;
    }

    return res.json({
      ok: true,
    });
  }
);

app.post(
  "/api/position",
  (req, res) => {

    const {
      id,
      slotIndex,
      position,
    } = req.body || {};

    const session =
      sessions.get(
        String(id || "")
      );

    if (!session) {

      return res
        .status(404)
        .json({
          error:
            "Session not found.",
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
            "Invalid position.",
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
            "Slot not found.",
        });

    }

    slot.position =
      String(position);

    if (slot.playerId) {
      positionsCache.set(
        slot.playerId,
        String(position)
      );
    }

    return res.json({
      ok: true,
    });
  }
);

app.post(
  "/api/move",
  (req, res) => {

    const {
      id,
      slotIndex,
      x,
      y,
    } = req.body || {};

    const session =
      sessions.get(
        String(id || "")
      );

    if (!session) {

      return res
        .status(404)
        .json({
          error:
            "Session not found.",
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
            "Slot not found.",
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
            "Invalid coordinates.",
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
      ok: true,
    });
  }
);

app.post(
  "/api/bench",
  (req, res) => {

    const {
      id,
      slotIndex,
      playerId,
    } = req.body || {};

    const session =
      sessions.get(
        String(id || "")
      );

    if (!session) {

      return res
        .status(404)
        .json({
          error:
            "Session not found.",
        });

    }

    const pid =
      String(playerId || "");

    const slot =
      session.slots.find(
        (item) =>
          item.index ===
          Number(slotIndex)
      );

    if (
      !slot ||
      slot.playerId !== pid
    ) {

      return res
        .status(400)
        .json({
          error:
            "Player is not in that slot.",
        });

    }

    const already =
      session.bench.some(
        (entry) =>
          entry.playerId === pid
      );

    if (!already) {

      session.bench.push({
        playerId: pid,
        originalSlot:
          slot.index,
      });

    }

    slot.playerId =
      null;

    slot.position =
      "";

    return res.json({
      ok: true,
    });
  }
);

app.post(
  "/api/restore",
  (req, res) => {

    const {
      id,
      playerId,
      slotIndex,
    } = req.body || {};

    const session =
      sessions.get(
        String(id || "")
      );

    if (!session) {

      return res
        .status(404)
        .json({
          error:
            "Session not found.",
        });

    }

    const pid =
      String(playerId || "");

    const benchEntry =
      session.bench.find(
        (entry) =>
          entry.playerId === pid
      );

    if (!benchEntry) {

      return res
        .status(400)
        .json({
          error:
            "Player is not on the bench.",
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
            "Slot unavailable.",
        });

    }

    session.bench =
      session.bench.filter(
        (entry) =>
          entry.playerId !== pid
      );

    slot.playerId =
      pid;

    const position =
      positionsCache.get(pid);

    if (position) {
      slot.position =
        position;
    }

    return res.json({
      ok: true,
    });
  }
);

app.post(
  "/final",
  async (req, res) => {

    const session =
      sessions.get(
        String(
          req.body?.id || ""
        )
      );

    if (!session) {

      return res
        .status(404)
        .json({
          error:
            "Session not found.",
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
          "Discord channel unavailable."
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
              "newcastle-lineup.png",
          }
        );

      await channel.send({
        content:
          "**NEWCASTLE LINEUP TODAY ENJOY**",
        files: [
          file,
        ],
      });

      return res.json({
        ok: true,
      });

    } catch (error) {

      console.error(
        "Final image/post failed:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Failed to post lineup: " +
            error.message,
        });

    }
  }
);

setInterval(
  () => {

    const cutoff =
      Date.now() -
      SESSION_TIMEOUT;

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
  "0.0.0.0",
  () => {

    console.log(
      "Web server listening on port " +
        PORT
    );

  }
);

client.login(
  TOKEN
).catch(
  (error) => {

    console.error(
      "Discord login failed:",
      error
    );

    process.exit(1);

  }
);

