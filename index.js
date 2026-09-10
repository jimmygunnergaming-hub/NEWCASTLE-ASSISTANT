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
  process.env.GUILD_ID || '1542615988137099324';

const POSITION_CHANNEL_ID =
  process.env.POSITION_CHANNEL_ID || '1542615989382942756';

const BASE_URL = (
  process.env.RENDER_EXTERNAL_URL ||
  ('http://localhost:' + PORT)
).replace(/\/+$/, '');

if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN');
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
const players = new Map();
const positions = new Map();

let lastRefresh = 0;

const REFRESH_MS = 60000;
const SESSION_TTL_MS =
  6 * 60 * 60 * 1000;

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
    { x: 33, y: 35 },
    { x: 67, y: 35 },
  ],

  10: [
    { x: 50, y: 91 },
    { x: 10, y: 67 },
    { x: 24, y: 71 },
    { x: 39, y: 73 },
    { x: 61, y: 73 },
    { x: 76, y: 71 },
    { x: 90, y: 67 },
    { x: 24, y: 37 },
    { x: 50, y: 30 },
    { x: 76, y: 37 },
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

function escapeHtml(value) {
  return String(
    value == null ? '' : value
  )
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getName(member) {
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

function findPosition(text) {
  const clean =
    normalizeText(text);

  const sorted =
    POSITION_NAMES
      .slice()
      .sort(
        (a, b) =>
          b.length - a.length
      );

  for (
    const position
    of sorted
  ) {
    const regex =
      new RegExp(
        '(^|\\s)' +
        position.replace(
          '/',
          '\\/'
        ) +
        '($|\\s)'
      );

    if (
      regex.test(clean)
    ) {
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

  for (
    const embed
    of message.embeds || []
  ) {
    if (embed.title) {
      parts.push(embed.title);
    }

    if (embed.description) {
      parts.push(
        embed.description
      );
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

function findPlayerFromMessage(
  message,
  text,
  members
) {
  /*
    Mentioned player first.
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
        members.some(
          member =>
            member.id ===
            user.id
        )
      ) {
        return user.id;
      }
    }
  }

  /*
    Player name in message.
    This allows:
    "Jimmy - ST"
    "Jimmy ST"
    "Jimmy is ST"
  */
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
        name =>
          String(
            name
          ).toLowerCase()
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

  if (best) {
    return best.id;
  }

  /*
    Player posted their own
    position.
  */
  if (
    message.author &&
    !message.author.bot
  ) {
    const ownMember =
      members.find(
        member =>
          member.id ===
          message.author.id
      );

    if (ownMember) {
      return ownMember.id;
    }
  }

  return null;
}

async function scanPositions(
  guild,
  members
) {
  const found =
    new Map();

  const channel =
    await client.channels
      .fetch(
        POSITION_CHANNEL_ID
      )
      .catch(error => {
        console.error(
          'Position channel error:',
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

    return found;
  }

  let before = null;

  /*
    Scan recent position messages.
  */
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
            'Message fetch error:',
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

    /*
      Discord fetch gives newest
      messages first. Therefore the
      first position we find for a
      player is their newest one.
    */
    for (
      const message
      of messages.values()
    ) {
      const text =
        getMessageText(
          message
        );

      const position =
        findPosition(
          text
        );

      if (!position) {
        continue;
      }

      const playerId =
        findPlayerFromMessage(
          message,
          text,
          members
        );

      if (
        playerId &&
        !found.has(
          playerId
        )
      ) {
        found.set(
          playerId,
          position
        );
      }
    }

    const last =
      messages.last();

    if (!last) {
      break;
    }

    before =
      last.id;

    if (
      messages.size < 100
    ) {
      break;
    }
  }

  console.log(
    'Found ' +
      found.size +
      ' player positions.'
  );

  return found;
}

async function refreshServer() {
  const guild =
    await client.guilds.fetch(
      GUILD_ID
    );

  await guild.members
    .fetch()
    .catch(error => {
      console.error(
        'Member fetch error:',
        error.message
      );
    });

  const members =
    [
      ...guild.members.cache.values(),
    ].filter(
      member =>
        !member.user.bot
    );

  const latestPositions =
    await scanPositions(
      guild,
      members
    );

  const activeIds =
    new Set(
      members.map(
        member =>
          member.id
      )
    );

  /*
    Replace player cache.
    This automatically adds new
    players and removes players
    who have left.
  */
  players.clear();

  for (
    const member
    of members
  ) {
    players.set(
      member.id,
      {
        id:
          member.id,

        name:
          getName(member),

        username:
          member.user.username,

        avatar:
          member.displayAvatarURL({
            extension:
              'png',
            size:
              256,
            forceStatic:
              true,
          }),

        position:
          latestPositions.get(
            member.id
          ) ||
          'UNSET',
      }
    );
  }

  positions.clear();

  for (
    const [
      id,
      position
    ]
    of latestPositions
  ) {
    positions.set(
      id,
      position
    );
  }

  /*
    Update every open lineup.
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
      Remove people who left.
    */
    for (
      const slot
      of session.slots
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

    /*
      Update positions.
    */
    for (
      const slot
      of session.slots
    ) {
      if (
        slot.playerId &&
        positions.has(
          slot.playerId
        )
      ) {
        slot.position =
          positions.get(
            slot.playerId
          );
      }
    }

    /*
      Remove departed bench
      players.
    */
    session.bench =
      session.bench.filter(
        entry =>
          activeIds.has(
            entry.playerId
          )
      );
  }

  lastRefresh =
    Date.now();

  console.log(
    'REFRESH COMPLETE: ' +
      players.size +
      ' players, ' +
      positions.size +
      ' positions.'
  );
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

        x:
          point.x,

        y:
          point.y,

        playerId:
          null,

        position:
          '',
      })
    );

  const session = {
    id,

    guildId:
      guild.id,

    channelId:
      channel.id,

    size,

    createdAt:
      Date.now(),

    slots,

    bench: [],
  };

  sessions.set(
    id,
    session
  );

  return session;
}

function sendJson(
  res,
  code,
  value
) {
  const data =
    JSON.stringify(
      value
    );

  res.statusCode =
    code;

  res.setHeader(
    'Content-Type',
    'application/json; charset=utf-8'
  );

  res.setHeader(
    'Cache-Control',
    'no-store'
  );

  res.end(
    data
  );
}

function sendText(
  res,
  code,
  value,
  contentType
) {
  res.statusCode =
    code;

  res.setHeader(
    'Content-Type',
    contentType ||
      'text/plain; charset=utf-8'
  );

  res.end(
    value
  );
}

function readJsonBody(req) {
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
          } catch {
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

function makePage(
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
min-height:60px;
display:flex;
align-items:center;
gap:10px;
padding:8px 12px;
background:#0d1420;
border-bottom:1px solid #202a3a
}

.title{
font-size:17px;
font-weight:900
}

.sub{
font-size:11px;
opacity:.6;
margin-top:2px
}

.actions{
margin-left:auto;
display:flex;
gap:7px;
flex-wrap:wrap
}

.btn{
border:0;
border-radius:10px;
padding:9px 11px;
background:#1c2738;
color:#fff;
font-weight:800;
cursor:pointer
}

.primary{
background:#2f74ff
}

.danger{
background:#a72a3d
}

.main{
flex:1;
min-height:0;
display:grid;
grid-template-columns:minmax(0,1fr) 340px;
gap:9px;
padding:9px
}

.pitchHolder{
min-width:0;
display:flex;
align-items:center;
justify-content:center;
overflow:hidden
}

.pitch{
position:relative;
width:min(77vw,520px);
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

.boxTop,
.boxBottom{
position:absolute;
left:24%;
width:52%;
height:14%;
border:3px solid #fff
}

.boxTop{
top:0;
border-top:0
}

.boxBottom{
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

.circle{
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

.circle img{
width:100%;
height:100%;
object-fit:cover
}

.initial{
font-size:20px;
font-weight:900
}

.slotName{
max-width:100px;
margin-top:3px;
font-size:10px;
font-weight:900;
text-align:center;
white-space:nowrap;
overflow:hidden;
text-overflow:ellipsis;
text-shadow:0 1px 3px #000
}

.selected .circle{
outline:4px solid #ffd32a
}

.side{
min-height:0;
display:flex;
flex-direction:column;
overflow:hidden;
background:#0d1420;
border:1px solid #202a3a;
border-radius:15px
}

.search{
padding:9px;
border-bottom:1px solid #202a3a
}

.search input{
width:100%;
padding:10px;
border:1px solid #2b3950;
border-radius:9px;
background:#080d15;
color:#fff;
outline:0
}

.players{
flex:1;
overflow:auto;
padding:8px
}

.sectionTitle{
font-size:11px;
font-weight:900;
opacity:.6;
padding:5px
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
border-radius:9px;
margin-bottom:5px;
cursor:pointer;
text-align:left
}

.player img,
.fallback{
width:35px;
height:35px;
border-radius:50%;
flex:none
}

.player img{
object-fit:cover
}

.fallback{
display:none;
align-items:center;
justify-content:center;
background:#666;
font-weight:900
}

.playerName{
min-width:0;
flex:1;
white-space:nowrap;
overflow:hidden;
text-overflow:ellipsis
}

.playerPos{
font-size:10px;
opacity:.55
}

.bench{
border-top:1px solid #202a3a;
padding:8px
}

.benchTitle{
font-size:11px;
font-weight:900;
opacity:.6;
margin-bottom:7px
}

.benchList{
display:flex;
flex-wrap:wrap;
gap:5px;
max-height:110px;
overflow:auto
}

.benchItem{
border:0;
background:#192235;
color:#fff;
border-radius:999px;
padding:6px 9px;
display:flex;
align-items:center;
gap:6px;
cursor:pointer
}

.benchItem img{
width:22px;
height:22px;
border-radius:50%
}

.modal{
position:fixed;
inset:0;
background:rgba(0,0,0,.65);
display:none;
align-items:center;
justify-content:center;
padding:15px;
z-index:50
}

.modal.show{
display:flex
}

.modalCard{
width:min(440px,100%);
background:#0d1420;
border:1px solid #2b3950;
border-radius:15px;
padding:14px
}

.positionGrid{
display:grid;
grid-template-columns:repeat(3,1fr);
gap:7px
}

.positionButton{
border:1px solid #33445e;
background:#121c2c;
color:#fff;
border-radius:9px;
padding:10px;
font-weight:900;
cursor:pointer
}

@media(max-width:900px){

.main{
grid-template-columns:1fr;
grid-template-rows:minmax(0,1fr) 38dvh
}

.pitch{
width:min(68vw,430px)
}

}

@media(max-width:520px){

.top{
min-height:58px
}

.title{
font-size:14px
}

.btn{
padding:8px 9px;
font-size:11px
}

.main{
padding:6px;
gap:6px
}

.pitch{
width:78vw
}

.slot{
width:64px;
height:64px
}

.circle{
width:45px;
height:45px
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
onclick="clearSelection()"
>
Clear
</button>

<button
class="btn"
onclick="openPosition()"
>
Position
</button>

<button
class="btn danger"
onclick="benchSelected()"
>
Bench
</button>

<button
class="btn primary"
onclick="finishLineup()"
>
FINISH
</button>

</div>

</div>

<div class="main">

<div class="pitchHolder">

<div
class="pitch"
id="pitch"
>

<div class="boxTop"></div>
<div class="boxBottom"></div>

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

<div class="benchTitle">
BENCH — TAP TO RESTORE
</div>

<div
class="benchList"
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

<div class="modalCard">

<h3 id="modalTitle">
Choose Position
</h3>

<div
class="positionGrid"
id="positionGrid"
></div>

<button
class="btn"
style="width:100%;margin-top:9px"
onclick="closePosition()"
>
Cancel
</button>

</div>

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
"pitch"
);

function getPlayer(id){

return state.players.find(
p =>
p.id === id
) || null;

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

const data =
await response
.json()
.catch(
() => ({})
);

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
await request(
"/api/session?id=" +
encodeURIComponent(
SID
)
);

document.getElementById(
"sub"
).textContent =
state.size +
"v" +
state.size;

renderAll();

}catch(error){

console.error(
error
);

document.getElementById(
"sub"
).textContent =
"Failed to load";

}

}

async function refresh(){

try{

const oldPlayer =
selectedSlot == null
? null
: state.slots[
selectedSlot
]
? state.slots[
selectedSlot
].playerId
: null;

state =
await request(
"/api/session?id=" +
encodeURIComponent(
SID
)
);

if(oldPlayer){

const newSlot =
state.slots.find(
s =>
s.playerId ===
oldPlayer
);

selectedSlot =
newSlot
? newSlot.index
: null;

}

renderAll();

}catch(error){

console.error(
"Refresh failed:",
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
e =>
e.remove()
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
) +
(
p
? ""
: " empty"
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
p.name
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
"24px";

circle.appendChild(
plus
);

}

const name =
document.createElement(
"div"
);

name.className =
"slotName";

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

el.addEventListener(
"pointerdown",
function(event){

startDrag(
event,
slot.index
);

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
s =>
s.playerId
)
.map(
s =>
s.playerId
)
);

const benched =
new Set(
state.bench.map(
b =>
b.playerId
)
);

const groups = {};

state.players.forEach(
p => {

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

if(
query &&
!p.name
.toLowerCase()
.includes(query) &&
!p.position
.toLowerCase()
.includes(query)
){

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
[
...order.filter(
x =>
groups[x]
),
...Object.keys(
groups
).filter(
x =>
!order.includes(x)
)
];

const box =
document.getElementById(
"players"
);

box.innerHTML =
"";

keys.forEach(
pos => {

const title =
document.createElement(
"div"
);

title.className =
"sectionTitle";

title.textContent =
pos;

box.appendChild(
title
);

groups[pos].forEach(
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
"playerName";

name.textContent =
p.name;

const position =
document.createElement(
"span"
);

position.className =
"playerPos";

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
b => {

const p =
getPlayer(
b.playerId
);

if(!p){
return;
}

const button =
document.createElement(
"button"
);

button.className =
"benchItem";

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

let slot =
selectedSlot == null
? state.slots.find(
s =>
!s.playerId
)
: state.slots[
selectedSlot
];

if(!slot){

alert(
"No empty slot available."
);

return;

}

try{

await request(
"/api/assign",
{
method:"POST",
headers:{
"content-type":
"application/json"
},
body:
JSON.stringify({
id:SID,
slotIndex:
slot.index,
playerId:id
})
}
);

state.slots.forEach(
s => {

if(
s.index !==
slot.index &&
s.playerId ===
id
){

s.playerId =
null;

s.position =
"";

}

}
);

state.bench =
state.bench.filter(
b =>
b.playerId !==
id
);

slot.playerId =
id;

const p =
getPlayer(
id
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

function clearSelection(){

selectedSlot =
null;

renderPitch();

}

function openPosition(){

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
"Assign a player first."
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
position => {

const button =
document.createElement(
"button"
);

button.className =
"positionButton";

button.textContent =
position;

button.onclick =
function(){

setPosition(
position
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

await request(
"/api/position",
{
method:"POST",
headers:{
"content-type":
"application/json"
},
body:
JSON.stringify({
id:SID,
slotIndex:
selectedSlot,
position
})
}
);

state.slots[
selectedSlot
].position =
position;

const p =
getPlayer(
state.slots[
selectedSlot
].playerId
);

if(p){

p.position =
position;

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
)
.classList
.remove(
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

const id =
slot.playerId;

try{

await request(
"/api/bench",
{
method:"POST",
headers:{
"content-type":
"application/json"
},
body:
JSON.stringify({
id:SID,
slotIndex:
selectedSlot,
playerId:id
})
}
);

state.bench.push({
playerId:id,
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
b =>
b.playerId ===
id
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
s =>
!s.playerId
);

}

if(!slot){

alert(
"No empty slot available."
);

return;

}

try{

await request(
"/api/restore",
{
method:"POST",
headers:{
"content-type":
"application/json"
},
body:
JSON.stringify({
id:SID,
playerId:id,
slotIndex:
slot.index
})
}
);

state.bench =
state.bench.filter(
b =>
b.playerId !==
id
);

slot.playerId =
id;

if(
positions.has
){

}

const p =
getPlayer(
id
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

drag = {
index:index,
startX:
event.clientX,
startY:
event.clientY,
origX:
slot.x,
origY:
slot.y,
moved:
false
};

moved =
false;

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

drag.moved =
true;

moved =
true;

}

const slot =
state.slots[
drag.index
];

slot.x =
Math.max(
4,
Math.min(
96,
Math.round(
(
drag.origX +
dx
) /
2
) *
2
)
);

slot.y =
Math.max(
5,
Math.min(
95,
Math.round(
(
drag.origY +
dy
) /
2
) *
2
)
);

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
function(){

if(!drag){
return;
}

const current =
drag;

drag =
null;

if(
!current.moved
){

return;

}

const slot =
state.slots[
current.index
];

request(
"/api/move",
{
method:"POST",
headers:{
"content-type":
"application/json"
},
body:
JSON.stringify({
id:SID,
slotIndex:
slot.index,
x:slot.x,
y:slot.y
})
}
)
.catch(
console.error
);

}
);

pitch.addEventListener(
"pointercancel",
function(){

drag =
null;

}
);

async function finishLineup(){

if(
!confirm(
"Post this lineup to Discord?"
)
){

return;

}

try{

await request(
"/final",
{
method:"POST",
headers:{
"content-type":
"application/json"
},
body:
JSON.stringify({
id:SID
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

}

document.getElementById(
"search"
)
.addEventListener(
"input",
renderPlayers
);

load();

setInterval(
refresh,
60000
);

</script>

</body>
</html>`;
}

async function avatarDataUri(
url
) {

  try {

    const response =
      await fetch(
        url
      );

    if (
      !response.ok
    ) {
      return null;
    }

    const buffer =
      Buffer.from(
        await response.arrayBuffer()
      );

    const png =
      await sharp(
        buffer
      )
        .resize(
          92,
          92,
          {
            fit:
              'cover',
          }
        )
        .png()
        .toBuffer();

    return (
      'data:image/png;base64,' +
      png.toString(
        'base64'
      )
    );

  } catch {
    return null;
  }
}

async function makeLineupImage(
  session
) {

  const width = 1200;
  const height = 1500;

  const pitchX = 250;
  const pitchY = 80;
  const pitchW = 700;
  const pitchH = 1050;

  const guild =
    await client.guilds.fetch(
      session.guildId
    );

  await guild.members
    .fetch()
    .catch(
      () => null
    );

  const svg = [];

  svg.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
  );

  svg.push(
    '<rect width="1200" height="1500" fill="#08111c"/>'
  );

  svg.push(
    '<text x="600" y="45" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="30" font-weight="900">NEWCASTLE LINEUP</text>'
  );

  svg.push(
    `<rect x="${pitchX}" y="${pitchY}" width="${pitchW}" height="${pitchH}" rx="20" fill="#178640" stroke="#ffffff" stroke-width="6"/>`
  );

  for (
    let i = 0;
    i < 12;
    i += 1
  ) {

    svg.push(
      `<rect x="${pitchX}" y="${pitchY + (pitchH / 12) * i}" width="${pitchW}" height="${pitchH / 12}" fill="${i % 2 === 0 ? '#178640' : '#1b8d46'}"/>`
    );

  }

  svg.push(
    `<line x1="${pitchX}" y1="${pitchY + pitchH / 2}" x2="${pitchX + pitchW}" y2="${pitchY + pitchH / 2}" stroke="#ffffff" stroke-width="5"/>`
  );

  svg.push(
    `<circle cx="${pitchX + pitchW / 2}" cy="${pitchY + pitchH / 2}" r="68" fill="none" stroke="#ffffff" stroke-width="5"/>`
  );

  svg.push(
    `<rect x="${pitchX + pitchW * 0.25}" y="${pitchY}" width="${pitchW * 0.5}" height="${pitchH * 0.14}" fill="none" stroke="#ffffff" stroke-width="5"/>`
  );

  svg.push(
    `<rect x="${pitchX + pitchW * 0.25}" y="${pitchY + pitchH * 0.86}" width="${pitchW * 0.5}" height="${pitchH * 0.14}" fill="none" stroke="#ffffff" stroke-width="5"/>`
  );

  for (
    const slot
    of session.slots
  ) {

    const cx =
      pitchX +
      (
        slot.x / 100
      ) *
      pitchW;

    const cy =
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
            .catch(
              () => null
            )
        : null;

    svg.push(
      `<circle cx="${cx}" cy="${cy}" r="52" fill="#ffffff"/>`
    );

    svg.push(
      `<circle cx="${cx}" cy="${cy}" r="48" fill="#666666"/>`
    );

    if (
      member
    ) {

      const avatar =
        await avatarDataUri(
          member.displayAvatarURL({
            extension:
              'png',
            size:
              256,
            forceStatic:
              true,
          })
        );

      if (avatar) {

        svg.push(
          `<image href="${avatar}" x="${cx - 48}" y="${cy - 48}" width="96" height="96" preserveAspectRatio="xMidYMid slice"/>`
        );

      } else {

        svg.push(
          `<text x="${cx}" y="${cy + 13}" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="32" font-weight="900">${escapeHtml(
            getName(member).slice(0,1)
          )}</text>`
        );

      }

      svg.push(
        `<text x="${cx}" y="${cy + 70}" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="17" font-weight="900">${escapeXml(
          getName(member)
        )}</text>`
      );

      if (
        slot.position
      ) {

        svg.push(
          `<text x="${cx}" y="${cy + 91}" text-anchor="middle" fill="#dce7ff" font-family="Arial" font-size="13" font-weight="800">${escapeXml(
            slot.position
          )}</text>`
        );

      }

    } else {

      svg.push(
        `<text x="${cx}" y="${cy + 13}" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="32" font-weight="900">+</text>`
      );

      svg.push(
        `<text x="${cx}" y="${cy + 70}" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="17" font-weight="900">EMPTY</text>`
      );

    }

  }

  svg.push(
    '<text x="600" y="1230" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="25" font-weight="900">BENCH</text>'
  );

  let bx = 150;
  let by = 1335;

  for (
    const entry
    of session.bench
  ) {

    const member =
      await guild.members
        .fetch(
          entry.playerId
        )
        .catch(
          () => null
        );

    if (!member) {
      continue;
    }

    if (
      bx > 1050
    ) {

      bx = 150;
      by += 105;

    }

    svg.push(
      `<circle cx="${bx}" cy="${by}" r="38" fill="#ffffff"/>`
    );

    const avatar =
      await avatarDataUri(
        member.displayAvatarURL({
          extension:
            'png',
          size:
            128,
          forceStatic:
            true,
        })
      );

    if (avatar) {

      svg.push(
        `<image href="${avatar}" x="${bx - 34}" y="${by - 34}" width="68" height="68" preserveAspectRatio="xMidYMid slice"/>`
      );

    } else {

      svg.push(
        `<circle cx="${bx}" cy="${by}" r="34" fill="#666"/>`
      );

    }

    svg.push(
      `<text x="${bx}" y="${by + 57}" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="14" font-weight="800">${escapeXml(
        getName(member)
      )}</text>`
    );

    bx += 145;

  }

  svg.push(
    '</svg>'
  );

  return sharp(
    Buffer.from(
      svg.join('')
    )
  )
    .png()
    .toBuffer();
}

function escapeXml(value) {
  return escapeHtml(value);
}

client.once(
  'ready',
  async () => {

    console.log(
      'Logged in as ' +
      client.user.tag
    );

    try {

      const command =
        new SlashCommandBuilder()
          .setName(
            'lineup'
          )
          .setDescription(
            'Create a football lineup'
          );

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
        '/lineup registered'
      );

    } catch (error) {

      console.error(
        'Command registration failed:',
        error
      );

    }

    try {

      await refreshServer();

    } catch (error) {

      console.error(
        'Initial refresh failed:',
        error
      );

    }

    setInterval(
      async () => {

        try {

          await refreshServer();

        } catch (error) {

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

const server =
  http.createServer(
    async (req, res) => {

      try {

        const url =
          new URL(
            req.url,
            'http://localhost'
          );

        if (
          req.method ===
            'GET' &&
          url.pathname ===
            '/health'
        ) {

          return sendText(
            res,
            200,
            'OK'
          );

        }

        if (
          req.method ===
            'GET' &&
          url.pathname ===
            '/pitch'
        ) {

          const session =
            sessions.get(
              url.searchParams.get(
                'id'
              )
            );

          if (!session) {

            return sendText(
              res,
              404,
              'Lineup session not found or expired.'
            );

          }

          return sendText(
            res,
            200,
            pitchPage(
              session.id
            ),
            'text/html; charset=utf-8'
          );

        }

        if (
          req.method ===
            'GET' &&
          url.pathname ===
            '/api/session'
        ) {

          const session =
            sessions.get(
              url.searchParams.get(
                'id'
              )
            );

          if (!session) {

            return sendJson(
              res,
              404,
              {
                error:
                  'Session not found',
              }
            );

          }

          const guild =
            await client.guilds.fetch(
              session.guildId
            );

          await guild.members
            .fetch()
            .catch(
              () => null
            );

          const members =
            [
              ...guild.members.cache.values(),
            ].filter(
              member =>
                !member.user.bot
            );

          /*
            Update positions before
            returning the page.
          */
          const map =
            await getPositionMap(
              guild
            );

          for(
            const slot
            of session.slots
          ) {

            if (
              slot.playerId &&
              map.has(
                slot.playerId
              )
            ) {

              slot.position =
                map.get(
                  slot.playerId
                );

            }

          }

          for(
            const [
              id,
              pos
            ]
            of map
          ) {

            positions.set(
              id,
              pos
            );

            const p =
              players.get(
                id
              );

            if(p){
              p.position =
                pos;
            }

          }

          const result =
            publicSession(
              session,
              members
            );

          return sendJson(
            res,
            200,
            result
          );

        }

        if (
          req.method ===
          'POST'
        ) {

          const body =
            await readJsonBody(
              req
            );

          const session =
            sessions.get(
              String(
                body.id || ''
              )
            );

          if (!session) {

            return sendJson(
              res,
              404,
              {
                error:
                  'Session not found',
              }
            );

          }

          if (
            url.pathname ===
            '/api/assign'
          ) {

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

            if (
              !slot ||
              !players.has(
                playerId
              )
            ) {

              return sendJson(
                res,
                400,
                {
                  error:
                    'Invalid player or slot',
                }
              );

            }

            for(
              const other
              of session.slots
            ) {

              if(
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

            session.bench =
              session.bench.filter(
                b =>
                  b.playerId !==
                  playerId
              );

            slot.playerId =
              playerId;

            if(
              positions.has(
                playerId
              )
            ) {

              slot.position =
                positions.get(
                  playerId
                );

            }

            return sendJson(
              res,
              200,
              {
                ok:true,
              }
            );

          }

          if (
            url.pathname ===
            '/api/position'
          ) {

            const slot =
              session.slots.find(
                s =>
                  s.index ===
                  Number(
                    body.slotIndex
                  )
              );

            const position =
              String(
                body.position || ''
              );

            if(
              !slot ||
              !POSITIONS.includes(
                position
              )
            ) {

              return sendJson(
                res,
                400,
                {
                  error:
                    'Invalid position or slot',
                }
              );

            }

            slot.position =
              position;

            if(
              slot.playerId
            ) {

              positions.set(
                slot.playerId,
                position
              );

            }

            return sendJson(
              res,
              200,
              {
                ok:true,
              }
            );

          }

          if (
            url.pathname ===
            '/api/move'
          ) {

            const slot =
              session.slots.find(
                s =>
                  s.index ===
                  Number(
                    body.slotIndex
                  )
              );

            if(!slot){

              return sendJson(
                res,
                400,
                {
                  error:
                    'Slot not found',
                }
              );

            }

            const x =
              Number(
                body.x
              );

            const y =
              Number(
                body.y
              );

            if(
              !Number.isFinite(x) ||
              !Number.isFinite(y)
            ) {

              return sendJson(
                res,
                400,
                {
                  error:
                    'Invalid coordinates',
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

            return sendJson(
              res,
              200,
              {
                ok:true,
              }
            );

          }

          if (
            url.pathname ===
            '/api/bench'
          ) {

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

            if(
              !slot ||
              slot.playerId !==
                playerId
            ) {

              return sendJson(
                res,
                400,
                {
                  error:
                    'Player is not in that slot',
                }
              );

            }

            if(
              !session.bench.some(
                b =>
                  b.playerId ===
                  playerId
              )
            ) {

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

            return sendJson(
              res,
              200,
              {
                ok:true,
              }
            );

          }

          if (
            url.pathname ===
            '/api/restore'
          ) {

            const playerId =
              String(
                body.playerId ||
                ''
              );

            const bench =
              session.bench.find(
                b =>
                  b.playerId ===
                  playerId
              );

            if(!bench){

              return sendJson(
                res,
                400,
                {
                  error:
                    'Player is not on bench',
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
            ) {

              return sendJson(
                res,
                400,
                {
                  error:
                    'Slot unavailable',
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

            if(
              positions.has(
                playerId
              )
            ) {

              slot.position =
                positions.get(
                  playerId
                );

            }

            return sendJson(
              res,
              200,
              {
                ok:true,
              }
            );

          }

          if (
            url.pathname ===
            '/final'
          ) {

            try {

              const channel =
                await client.channels.fetch(
                  session.channelId
                );

              if(
                !channel ||
                !channel.isTextBased()
              ) {

                throw new Error(
                  'Discord channel unavailable'
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
                files:[
                  file,
                ],
              });

              return sendJson(
                res,
                200,
                {
                  ok:true,
                }
              );

            } catch(error) {

              console.error(
                'Final lineup error:',
                error
              );

              return sendJson(
                res,
                500,
                {
                  error:
                    error.message,
                }
              );

            }

          }

        }

        return sendText(
          res,
          404,
          'Not found'
        );

      } catch(error) {

        console.error(
          'HTTP error:',
          error
        );

        return sendJson(
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

function getPositionMap(guild) {
  return scanPositions(
    guild,
    [...guild.members.cache.values()]
      .filter(
        member =>
          !member.user.bot
      )
  );
}

function publicSession(
  session,
  members
) {

  return {
    id:
      session.id,

    size:
      session.size,

    updatedAt:
      lastRefresh,

    slots:
      session.slots,

    bench:
      session.bench,

    players:
      members.map(
        member => ({
          id:
            member.id,

          name:
            getName(member),

          username:
            member.user.username,

          avatar:
            member.displayAvatarURL({
              extension:
                'png',
              size:
                128,
            }),

          position:
            positions.get(
              member.id
            ) ||
            session.slots.find(
              s =>
                s.playerId ===
                member.id
            )?.position ||
            'UNSET',
        })
      ),
  };

}

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
      SESSION_TTL_MS;

    for(
      const [
        id,
        session
      ]
      of sessions
    ) {

      if(
        session.createdAt <
        cutoff
      ) {

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
