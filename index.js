const http = require('http');
const sharp = require('sharp');
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require('discord.js');

const PORT = Number(process.env.PORT || 3000);
const TOKEN = process.env.DISCORD_TOKEN;

const GUILD_ID =
  process.env.GUILD_ID ||
  '1542615988137099324';

const POSITION_CHANNEL_ID =
  process.env.POSITION_CHANNEL_ID ||
  '1542615989382942756';

const REFRESH_MS = 60000;
const SESSION_TTL =
  6 * 60 * 60 * 1000;

const BASE_URL = (
  process.env.RENDER_EXTERNAL_URL ||
  'http://localhost:' + PORT
).replace(/\/+$/, '');

if (!TOKEN) {
  console.error(
    'ERROR: DISCORD_TOKEN is missing.'
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

let playersCache = new Map();
let positionsCache = new Map();
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
  1: [
    { x: 50, y: 50 },
  ],

  2: [
    { x: 50, y: 84 },
    { x: 50, y: 18 },
  ],

  3: [
    { x: 50, y: 86 },
    { x: 30, y: 40 },
    { x: 70, y: 40 },
  ],

  4: [
    { x: 50, y: 87 },
    { x: 25, y: 60 },
    { x: 75, y: 60 },
    { x: 50, y: 30 },
  ],

  5: [
    { x: 50, y: 88 },
    { x: 20, y: 62 },
    { x: 80, y: 62 },
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
    { x: 30, y: 35 },
    { x: 70, y: 35 },
  ],

  9: [
    { x: 50, y: 91 },
    { x: 12, y: 66 },
    { x: 27, y: 70 },
    { x: 42, y: 72 },
    { x: 58, y: 72 },
    { x: 73, y: 70 },
    { x: 88, y: 66 },
    { x: 32, y: 36 },
    { x: 68, y: 36 },
  ],

  10: [
    { x: 50, y: 91 },
    { x: 10, y: 67 },
    { x: 24, y: 71 },
    { x: 39, y: 73 },
    { x: 61, y: 73 },
    { x: 76, y: 71 },
    { x: 90, y: 67 },
    { x: 24, y: 38 },
    { x: 50, y: 30 },
    { x: 76, y: 38 },
  ],

  11: [
    { x: 50, y: 92 },
    { x: 9, y: 68 },
    { x: 24, y: 72 },
    { x: 38, y: 74 },
    { x: 50, y: 75 },
    { x: 62, y: 74 },
    { x: 76, y: 72 },
    { x: 91, y: 68 },
    { x: 20, y: 39 },
    { x: 50, y: 30 },
    { x: 80, y: 39 },
  ],
};

function esc(value) {
  return String(value == null ? '' : value)
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

function normalizeText(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9/]+/g, ' ')
    .trim();
}

function detectPosition(text) {
  const value =
    normalizeText(text);

  const ordered =
    POSITIONS
      .slice()
      .sort(
        (a, b) =>
          b.length - a.length
      );

  for (const pos of ordered) {
    const re =
      new RegExp(
        '(^|\\s)' +
          pos.replace('/', '\\/') +
          '(?=\\s|$)',
        'i'
      );

    if (re.test(value)) {
      return pos;
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
    const embed
    of message.embeds || []
  ) {
    if (embed.title) {
      parts.push(embed.title);
    }

    if (embed.description) {
      parts.push(embed.description);
    }

    for (
      const field
      of embed.fields || []
    ) {
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

function findPlayerByName(
  text,
  members
) {
  const lower =
    String(text || '')
      .toLowerCase();

  let best = null;

  for (
    const member
    of members
  ) {
    const names = [
      member.displayName,
      member.user.username,
      member.user.globalName,
    ]
      .filter(Boolean)
      .map(
        value =>
          String(value).toLowerCase()
      );

    for (
      const name
      of names
    ) {
      if (
        name.length >= 2 &&
        lower.includes(name)
      ) {
        if (
          !best ||
          name.length >
            best.length
        ) {
          best = {
            id: member.id,
            length: name.length,
          };
        }
      }
    }
  }

  return best
    ? best.id
    : null;
}

async function fetchPositionMap(
  guild,
  members
) {
  const result =
    new Map();

  const channel =
    await client.channels
      .fetch(
        POSITION_CHANNEL_ID
      )
      .catch(error => {
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
      'Position channel is not readable:',
      POSITION_CHANNEL_ID
    );

    return result;
  }

  const memberIds =
    new Set(
      members.map(
        member => member.id
      )
    );

  let before = null;

  for (
    let page = 0;
    page < 15;
    page += 1
  ) {
    const options = {
      limit: 100,
    };

    if (before) {
      options.before =
        before;
    }

    const messages =
      await channel.messages
        .fetch(options)
        .catch(error => {
          console.error(
            'Position messages fetch failed:',
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
        detectPosition(text);

      if (!position) {
        continue;
      }

      let playerId = null;

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
            memberIds.has(
              user.id
            )
          ) {
            playerId =
              user.id;

            break;
          }
        }
      }

      if (!playerId) {
        playerId =
          findPlayerByName(
            text,
            members
          );
      }

      if (
        !playerId &&
        message.author &&
        !message.author.bot &&
        memberIds.has(
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

    if (
      messages.size < 100
    ) {
      break;
    }

    const last =
      messages.last();

    if (!last) {
      break;
    }

    before =
      last.id;
  }

  console.log(
    'Position scan found ' +
      result.size +
      ' players.'
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
    [
      ...guild.members.cache.values(),
    ].filter(
      member =>
        !member.user.bot
    );

  const positions =
    await fetchPositionMap(
      guild,
      members
    );

  const next =
    new Map();

  for (
    const member
    of members
  ) {
    next.set(
      member.id,
      {
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
      }
    );
  }

  playersCache =
    next;

  positionsCache =
    positions;

  lastRefresh =
    Date.now();

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
        slot.playerId =
          null;

        slot.position =
          '';
      }

      if (slot.playerId) {
        const pos =
          positionsCache.get(
            slot.playerId
          );

        if (pos) {
          slot.position =
            pos;
        }
      }
    }

    session.bench =
      session.bench.filter(
        entry =>
          playersCache.has(
            entry.playerId
          )
      );
  }

  console.log(
    'Player refresh complete:',
    playersCache.size,
    'members;',
    positionsCache.size,
    'positions.'
  );
}

async function ensureFresh() {
  if (
    !lastRefresh ||
    Date.now() -
      lastRefresh >=
      REFRESH_MS
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
  };

  sessions.set(
    id,
    session
  );

  return session;
}

function readBody(req) {
  return new Promise(
    (resolve, reject) => {
      let body = '';

      req.on(
        'data',
        chunk => {
          body += chunk;

          if (
            body.length >
            2 * 1024 * 1024
          ) {
            reject(
              new Error(
                'Request too large.'
              )
            );

            req.destroy();
          }
        }
      );

      req.on(
        'end',
        () => {
          if (!body) {
            resolve({});
            return;
          }

          try {
            resolve(
              JSON.parse(body)
            );
          } catch (error) {
            reject(
              new Error(
                'Invalid JSON.'
              )
            );
          }
        }
      );

      req.on(
        'error',
        reject
      );
    }
  );
}

function send(
  res,
  status,
  body,
  contentType
) {
  const data =
    Buffer.isBuffer(body)
      ? body
      : Buffer.from(
          String(body)
        );

  res.writeHead(
    status,
    {
      'Content-Type':
        contentType ||
        'text/plain; charset=utf-8',

      'Content-Length':
        data.length,

      'Cache-Control':
        'no-store',
    }
  );

  res.end(data);
}

function json(
  res,
  status,
  value
) {
  send(
    res,
    status,
    JSON.stringify(value),
    'application/json; charset=utf-8'
  );
}

function getSession(id) {
  return sessions.get(
    String(id || '')
  );
}

function pageHtml(sessionId) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
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

.title{
font-size:17px;
font-weight:900;
}

.sub{
font-size:11px;
opacity:.55;
margin-top:2px;
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
width:min(76vw,520px);
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
box-shadow:0 4px 15px rgba(0,0,0,.35);
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
outline:4px solid #ffd32a;
}

.side{
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
border:1px solid #2b3950;
border-radius:10px;
background:#080d15;
color:#fff;
outline:0;
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
border:0;
background:#121b2a;
color:#fff;
padding:8px;
border-radius:10px;
margin-bottom:6px;
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
white-space:nowrap;
overflow:hidden;
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
max-height:120px;
overflow:auto;
}

.bench-item{
border:0;
background:#192235;
color:#fff;
border-radius:999px;
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
background:rgba(0,0,0,.6);
padding:15px;
z-index:50;
}

.modal.show{
display:flex;
}

.modal-card{
width:min(440px,100%);
background:#0d1420;
border:1px solid #2b3950;
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

.top{
min-height:58px;
}

.title{
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

.slot-name{
max-width:80px;
}

}

</style>

</head>

<body>

<div class="app">

<div class="top">

<div>
<div class="title">
NEWCASTLE LINEUP
</div>

<div
class="sub"
id="sub"
>
Loading...
</div>
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
__SESSION_ID__;

let state = null;
let selectedSlot = null;
let drag = null;
let moved = false;

const pitch =
document.getElementById(
"pitch"
);

const status =
document.getElementById(
"status"
);

function getPlayer(id){

return state.players.find(
function(p){
return p.id === id;
}
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
"Request failed."
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
" players • checks every minute";

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
selectedSlot === null
? null
: state &&
state.slots[
selectedSlot
]
? state.slots[
selectedSlot
].playerId
: null;

state =
await api(
"/api/session?id=" +
encodeURIComponent(
SESSION_ID
)
);

if(selectedPlayer){

const slot =
state.slots.find(
function(s){
return (
s.playerId ===
selectedPlayer
);
}
);

selectedSlot =
slot
? slot.index
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
function(e){
e.remove();
}
);

state.slots.forEach(
function(slot){

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
String(
slot.index
);

el.style.left =
slot.x +
"%";

el.style.top =
slot.y +
"%";

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
(
p.name ||
"?"
)
.slice(
0,
1
)
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
p
? p.name
: "EMPTY";

el.appendChild(
circle
);

el.appendChild(
name
);

el.addEventListener(
"pointerdown",
function(event){

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
function(s){
return !!s.playerId;
}
)
.map(
function(s){
return s.playerId;
}
)
);

const benched =
new Set(
state.bench.map(
function(b){
return b.playerId;
}
)
);

const groups = {};

state.players.forEach(
function(p){

if(
assigned.has(
p.id
) ||
benched.has(
p.id
)
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
groups[pos] =
[];
}

groups[pos].push(
p
);

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
function(x){
return groups[x];
}
)
.concat(
Object.keys(
groups
)
.filter(
function(x){
return !order.includes(x);
}
)
);

const box =
document.getElementById(
"players"
);

box.innerHTML =
"";

keys.forEach(
function(pos){

const title =
document.createElement(
"div"
);

title.className =
"group-title";

title.textContent =
pos;

box.appendChild(
title
);

groups[pos].forEach(
function(p){

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
.slice(
0,
1
)
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

const position =
document.createElement(
"span"
);

position.className =
"player-pos";

position.textContent =
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
position
);

button.onclick =
function(){

pickPlayer(
p.id
);

};

box.appendChild(
button
);

}
);

}
);

}

function renderBench(){

const box =
document.getElementById(
"benchList"
);

box.innerHTML =
"";

if(!state.bench.length){

box.innerHTML =
'<span style="opacity:.5;font-size:12px">No bench players</span>';

return;

}

state.bench.forEach(
function(entry){

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

const img =
document.createElement(
"img"
);

img.src =
p.avatar;

const text =
document.createElement(
"span"
);

text.textContent =
p.name;

button.appendChild(
img
);

button.appendChild(
text
);

button.onclick =
function(){

restoreBench(
p.id
);

};

box.appendChild(
button
);

}
);

}

async function pickPlayer(
id
){

if(
selectedSlot ===
null
){

const empty =
state.slots.find(
function(s){
return !s.playerId;
}
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
function(s){
return (
s.index ===
selectedSlot
);
}
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
playerId:id
})
}
);

state.slots.forEach(
function(other){

if(
other.index !==
slot.index &&
other.playerId ===
id
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
function(b){
return b.playerId !== id;
}
);

slot.playerId =
id;

const p =
getPlayer(id);

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

grid.innerHTML =
"";

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
function(pos){

const button =
document.createElement(
"button"
);

button.className =
"position-button";

button.textContent =
pos;

button.onclick =
function(){

setPosition(
pos
);

};

grid.appendChild(
button
);

}
);

document.getElementById(
"modal"
)
.classList
.add(
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

document.getElementById(
"modal"
)
.classList
.remove(
"show"
);

renderAll();

}catch(error){

alert(
error.message
);

}

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

const pid =
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
playerId:pid
})
}
);

state.bench.push({
playerId:pid,
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
id
){

const entry =
state.bench.find(
function(b){
return b.playerId === id;
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
function(s){
return !s.playerId;
}
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
playerId:id,
slotIndex:
slot.index
})
}
);

state.bench =
state.bench.filter(
function(b){
return b.playerId !== id;
}
);

slot.playerId =
id;

const p =
getPlayer(id);

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

drag = {
index:index,
startX:event.clientX,
startY:event.clientY,
startSlotX:slot.x,
startSlotY:slot.y
};

moved =
false;

try{

event.currentTarget.setPointerCapture(
event.pointerId
);

}catch(error){}

}

pitch.addEventListener(
"pointermove",
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
)
/
rect.width
*
100;

const dy =
(
event.clientY -
drag.startY
)
/
rect.height
*
100;

if(
Math.abs(dx) +
Math.abs(dy) >
2
){

moved =
true;

}

const slot =
state.slots[
drag.index
];

slot.x =
Math.round(
Math.max(
4,
Math.min(
96,
drag.startSlotX +
dx
)
) / 2
) * 2;

slot.y =
Math.round(
Math.max(
5,
Math.min(
95,
drag.startSlotY +
dy
)
) / 2
) * 2;

const el =
pitch.querySelector(
'.slot[data-index="' +
drag.index +
'"]'
);

if(el){

el.style.left =
slot.x +
"%";

el.style.top =
slot.y +
"%";

}

}
);

pitch.addEventListener(
"pointerup",
async function(){

if(!drag){
return;
}

const current =
drag;

drag =
null;

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

pitch.addEventListener(
"pointercancel",
function(){

drag =
null;

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
function(){

document.getElementById(
"modal"
)
.classList
.remove(
"show"
);

};

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

setInterval(
refresh,
60000
);

</script>

</body>
</html>`;
}

function makePage(
  sessionId
) {
  return pageHtml(
    sessionId
  ).replace(
    '__SESSION_ID__',
    JSON.stringify(
      String(sessionId)
    )
  );
}

async function avatarPng(
  url,
  size
) {

  try {

    const response =
      await fetch(
        url,
        {
          headers:{
            'User-Agent':
              'Newcastle-Assistant/1.0',
          },
        }
      );

    if(!response.ok){
      return null;
    }

    const input =
      Buffer.from(
        await response.arrayBuffer()
      );

    return await sharp(input)
      .resize(
        size,
        size,
        {
          fit:'cover',
        }
      )
      .png()
      .toBuffer();

  } catch(error) {

    console.error(
      'Avatar fetch failed:',
      error.message
    );

    return null;
  }
}

async function makeLineupImage(
  session
) {

  const WIDTH =
    1200;

  const HEIGHT =
    1500;

  const PITCH_X =
    240;

  const PITCH_Y =
    70;

  const PITCH_W =
    720;

  const PITCH_H =
    1080;

  const guild =
    await client.guilds.fetch(
      session.guildId
    );

  await guild.members
    .fetch()
    .catch(() => null);

  const overlays = [];

  let svg =
    '<svg xmlns="http://www.w3.org/2000/svg" ' +
    'width="1200" height="1500">';

  svg +=
    '<rect width="1200" height="1500" fill="#08111c"/>';

  svg +=
    '<text x="600" y="42" ' +
    'text-anchor="middle" ' +
    'fill="white" ' +
    'font-family="Arial" ' +
    'font-size="30" ' +
    'font-weight="900">' +
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
    '" rx="20" ' +
    'fill="#178640" ' +
    'stroke="white" ' +
    'stroke-width="6"/>';

  for(
    let i = 0;
    i < 12;
    i += 1
  ){

    svg +=
      '<rect x="' +
      PITCH_X +
      '" y="' +
      (
        PITCH_Y +
        PITCH_H *
        i /
        12
      ) +
      '" width="' +
      PITCH_W +
      '" height="' +
      (
        PITCH_H /
        12
      ) +
      '" fill="' +
      (
        i % 2 === 0
          ? '#178640'
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
      PITCH_H /
      2
    ) +
    '" x2="' +
    (
      PITCH_X +
      PITCH_W
    ) +
    '" y2="' +
    (
      PITCH_Y +
      PITCH_H /
      2
    ) +
    '" stroke="white" stroke-width="5"/>';

  svg +=
    '<circle cx="600" cy="610" ' +
    'r="68" fill="none" ' +
    'stroke="white" stroke-width="5"/>';

  svg +=
    '<rect x="420" y="70" ' +
    'width="360" height="151" ' +
    'fill="none" stroke="white" stroke-width="5"/>';

  svg +=
    '<rect x="420" y="999" ' +
    'width="360" height="151" ' +
    'fill="none" stroke="white" stroke-width="5"/>';

  for(
    let i = 0;
    i < session.slots.length;
    i += 1
  ){

    const slot =
      session.slots[i];

    const cx =
      PITCH_X +
      slot.x /
      100 *
      PITCH_W;

    const cy =
      PITCH_Y +
      slot.y /
      100 *
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
      '" r="48" fill="#666"/>';

    if(member){

      const avatar =
        await avatarPng(
          member.displayAvatarURL({
            extension:'png',
            size:256,
            forceStatic:true,
          }),
          96
        );

      if(avatar){

        overlays.push({
          input:avatar,

          left:
            Math.round(
              cx - 48
            ),

          top:
            Math.round(
              cy - 48
            ),
        });

      }else{

        svg +=
          '<text x="' +
          cx +
          '" y="' +
          (
            cy + 12
          ) +
          '" text-anchor="middle" ' +
          'fill="white" font-family="Arial" ' +
          'font-size="32" font-weight="900">' +
          esc(
            getName(
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
        esc(
          getName(member)
        ) +
        '</text>';

      if(
        slot.position
      ){

        svg +=
          '<text x="' +
          cx +
          '" y="' +
          (
            cy + 91
          ) +
          '" text-anchor="middle" ' +
          'fill="#dce7ff" ' +
          'font-family="Arial" font-size="13" ' +
          'font-weight="800">' +
          esc(
            slot.position
          ) +
          '</text>';

      }

    }else{

      svg +=
        '<text x="' +
        cx +
        '" y="' +
        (
          cy + 12
        ) +
        '" text-anchor="middle" ' +
        'fill="white" font-family="Arial" ' +
        'font-size="32" font-weight="900">+</text>';

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
    '<text x="600" y="1230" ' +
    'text-anchor="middle" ' +
    'fill="white" font-family="Arial" ' +
    'font-size="25" font-weight="900">' +
    'BENCH' +
    '</text>';

  let benchX =
    150;

  let benchY =
    1335;

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
      benchX >
      1050
    ){

      benchX =
        150;

      benchY +=
        105;

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
      await avatarPng(
        member.displayAvatarURL({
          extension:'png',
          size:128,
          forceStatic:true,
        }),
        68
      );

    if(avatar){

      overlays.push({
        input:avatar,

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
        benchY + 57
      ) +
      '" text-anchor="middle" ' +
      'fill="white" font-family="Arial" ' +
      'font-size="14" font-weight="800">' +
      esc(
        getName(member)
      ) +
      '</text>';

    benchX +=
      145;
  }

  svg +=
    '</svg>';

  let image =
    await sharp(
      Buffer.from(svg)
    )
      .png()
      .toBuffer();

  if(
    overlays.length
  ){

    image =
      await sharp(
        image
      )
        .composite(
          overlays
        )
        .png()
        .toBuffer();

  }

  return image;
}

function getName(member) {
  return (
    member.displayName ||
    member.user.globalName ||
    member.user.username
  );
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
          )
          .toJSON();

      const guild =
        client.guilds.cache.get(
          GUILD_ID
        );

      if(guild){

        await guild.commands.set([
          command,
        ]);

      }else{

        await client.application.commands.set([
          command,
        ]);

      }

      console.log(
        '/lineup registered'
      );

    }catch(error){

      console.error(
        'Command registration failed:',
        error
      );

    }

    try{

      await refreshPlayers();

    }catch(error){

      console.error(
        'Initial player refresh failed:',
        error
      );

    }

    setInterval(
      async () => {

        try{

          await refreshPlayers();

        }catch(error){

          console.error(
            '60-second refresh failed:',
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

    if(
      member.guild.id !==
      GUILD_ID ||
      member.user.bot
    ){

      return;

    }

    try{

      await refreshPlayers();

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

    if(
      member.guild.id !==
      GUILD_ID
    ){

      return;

    }

    try{

      await refreshPlayers();

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
            'Use /lineup inside a server.',
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
          n <=
          Math.min(
            start + 4,
            11
          );
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
        components:
          rows,
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
            .replace(
              'lineup_size_',
              ''
            )
        );

      if(
        !interaction.guild ||
        !interaction.channel ||
        !FORMATIONS[size]
      ){

        return;

      }

      try{

        await ensureFresh();

        const session =
          makeSession(
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

      }catch(error){

        console.error(
          'Lineup button failed:',
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

const server =
  http.createServer(
    async (req,res) => {

      try{

        const url =
          new URL(
            req.url,
            'http://localhost'
          );

        const path =
          url.pathname;

        if(
          req.method === 'GET' &&
          path === '/health'
        ){

          return send(
            res,
            200,
            'OK'
          );

        }

        if(
          req.method === 'GET' &&
          path === '/pitch'
        ){

          const session =
            getSession(
              url.searchParams.get(
                'id'
              )
            );

          if(!session){

            return send(
              res,
              404,
              'Lineup session not found or expired.'
            );

          }

          return send(
            res,
            200,
            makePage(
              session.id
            ),
            'text/html; charset=utf-8'
          );

        }

        if(
          req.method === 'GET' &&
          path === '/api/session'
        ){

          const session =
            getSession(
              url.searchParams.get(
                'id'
              )
            );

          if(!session){

            return json(
              res,
              404,
              {
                error:
                  'Session not found.',
              }
            );

          }

          try{

            await ensureFresh();

            for(
              const slot
              of session.slots
            ){

              if(
                slot.playerId
              ){

                const position =
                  positionsCache.get(
                    slot.playerId
                  );

                if(position){

                  slot.position =
                    position;

                }

              }

            }

            const players =
              [
                ...playersCache.values(),
              ].map(
                player => ({
                  ...player,

                  position:
                    positionsCache.get(
                      player.id
                    ) ||
                    'UNSET',
                })
              );

            return json(
              res,
              200,
              {
                id:session.id,
                size:session.size,
                updatedAt:lastRefresh,
                players,
                slots:
                  session.slots,
                bench:
                  session.bench,
              }
            );

          }catch(error){

            console.error(
              'Session endpoint failed:',
              error
            );

            return json(
              res,
              500,
              {
                error:
                  'Could not load Discord players. ' +
                  error.message,
              }
            );

          }

        }

        if(
          req.method === 'POST'
        ){

          const body =
            await readBody(req);

          if(
            path ===
            '/api/assign'
          ){

            const session =
              getSession(
                body.id
              );

            if(!session){

              return json(
                res,
                404,
                {
                  error:
                    'Session not found.',
                }
              );

            }

            const slot =
              session.slots.find(
                s =>
                  s.index ===
                  Number(
                    body.slotIndex
                  )
              );

            const playerId =
              String(
                body.playerId ||
                ''
              );

            if(!slot){

              return json(
                res,
                400,
                {
                  error:
                    'Slot not found.',
                }
              );

            }

            if(
              !playersCache.has(
                playerId
              )
            ){

              return json(
                res,
                400,
                {
                  error:
                    'Player is not in the server.',
                }
              );

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
                b =>
                  b.playerId !==
                  playerId
              );

            slot.playerId =
              playerId;

            const pos =
              positionsCache.get(
                playerId
              );

            if(pos){

              slot.position =
                pos;

            }

            return json(
              res,
              200,
              {
                ok:true,
              }
            );

          }

          if(
            path ===
            '/api/position'
          ){

            const session =
              getSession(
                body.id
              );

            if(!session){

              return json(
                res,
                404,
                {
                  error:
                    'Session not found.',
                }
              );

            }

            const position =
              String(
                body.position ||
                ''
              );

            if(
              !POSITIONS.includes(
                position
              )
            ){

              return json(
                res,
                400,
                {
                  error:
                    'Invalid position.',
                }
              );

            }

            const slot =
              session.slots.find(
                s =>
                  s.index ===
                  Number(
                    body.slotIndex
                  )
              );

            if(!slot){

              return json(
                res,
                400,
                {
                  error:
                    'Slot not found.',
                }
              );

            }

            slot.position =
              position;

            if(
              slot.playerId
            ){

              positionsCache.set(
                slot.playerId,
                position
              );

            }

            return json(
              res,
              200,
              {
                ok:true,
              }
            );

          }

          if(
            path ===
            '/api/move'
          ){

            const session =
              getSession(
                body.id
              );

            if(!session){

              return json(
                res,
                404,
                {
                  error:
                    'Session not found.',
                }
              );

            }

            const slot =
              session.slots.find(
                s =>
                  s.index ===
                  Number(
                    body.slotIndex
                  )
              );

            if(!slot){

              return json(
                res,
                400,
                {
                  error:
                    'Slot not found.',
                }
              );

            }

            const x =
              Number(body.x);

            const y =
              Number(body.y);

            if(
              !Number.isFinite(x) ||
              !Number.isFinite(y)
            ){

              return json(
                res,
                400,
                {
                  error:
                    'Invalid coordinates.',
                }
              );

            }

            slot.x =
              Math.max(
                4,
                Math.min(
                  96,
                  x
                )
              );

            slot.y =
              Math.max(
                5,
                Math.min(
                  95,
                  y
                )
              );

            return json(
              res,
              200,
              {
                ok:true,
              }
            );

          }

          if(
            path ===
            '/api/bench'
          ){

            const session =
              getSession(
                body.id
              );

            if(!session){

              return json(
                res,
                404,
                {
                  error:
                    'Session not found.',
                }
              );

            }

            const playerId =
              String(
                body.playerId ||
                ''
              );

            const slot =
              session.slots.find(
                s =>
                  s.index ===
                  Number(
                    body.slotIndex
                  )
              );

            if(
              !slot ||
              slot.playerId !==
              playerId
            ){

              return json(
                res,
                400,
                {
                  error:
                    'Player is not in that slot.',
                }
              );

            }

            if(
              !session.bench.some(
                b =>
                  b.playerId ===
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

            return json(
              res,
              200,
              {
                ok:true,
              }
            );

          }

          if(
            path ===
            '/api/restore'
          ){

            const session =
              getSession(
                body.id
              );

            if(!session){

              return json(
                res,
                404,
                {
                  error:
                    'Session not found.',
                }
              );

            }

            const playerId =
              String(
                body.playerId ||
                ''
              );

            const entry =
              session.bench.find(
                b =>
                  b.playerId ===
                  playerId
              );

            if(!entry){

              return json(
                res,
                400,
                {
                  error:
                    'Player is not on the bench.',
                }
              );

            }

            const slot =
              session.slots.find(
                s =>
                  s.index ===
                  Number(
                    body.slotIndex
                  )
              );

            if(
              !slot ||
              slot.playerId
            ){

              return json(
                res,
                400,
                {
                  error:
                    'Slot unavailable.',
                }
              );

            }

            session.bench =
              session.bench.filter(
                b =>
                  b.playerId !==
                  playerId
              );

            slot.playerId =
              playerId;

            const pos =
              positionsCache.get(
                playerId
              );

            if(pos){

              slot.position =
                pos;

            }

            return json(
              res,
              200,
              {
                ok:true,
              }
            );

          }

          if(
            path ===
            '/final'
          ){

            const session =
              getSession(
                body.id
              );

            if(!session){

              return json(
                res,
                404,
                {
                  error:
                    'Session not found.',
                }
              );

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
                  'Discord channel unavailable.'
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

              return json(
                res,
                200,
                {
                  ok:true,
                }
              );

            }catch(error){

              console.error(
                'Final post failed:',
                error
              );

              return json(
                res,
                500,
                {
                  error:
                    'Failed to post lineup: ' +
                    error.message,
                }
              );

            }

          }

        }

        return send(
          res,
          404,
          'Not found.'
        );

      }catch(error){

        console.error(
          'HTTP error:',
          error
        );

        return json(
          res,
          500,
          {
            error:
              error.message,
          }
        );

      }

    }
  );

server.listen(
  PORT,
  '0.0.0.0',
  () => {

    console.log(
      'Web server listening on 0.0.0.0:' +
      PORT
    );

  }
);

setInterval(
  () => {

    const cutoff =
      Date.now() -
      SESSION_TTL;

    for(
      const [
        id,
        session
      ]
      of sessions
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

client.login(
  TOKEN
).catch(
  error => {

    console.error(
      'Discord login failed:',
      error
    );

    process.exit(1);

  }
);
