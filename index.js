const http = require('http');
const crypto = require('crypto');
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
  process.env.POSITION_CHANNEL_ID ||
  '1542615989382942756';

const BASE_URL = (
  process.env.RENDER_EXTERNAL_URL ||
  `http://localhost:${PORT}`
).replace(/\/+$/, '');

const REFRESH_MS = 60000;
const SESSION_TTL_MS =
  6 * 60 * 60 * 1000;

if (!TOKEN) {
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

let playersCache = new Map();
let positionsCache = new Map();
let lastRefresh = 0;

const POSITION_NAMES = [
  'GK',
  'LWB',
  'RWB',
  'CDM',
  'CAM',
  'CB',
  'LB',
  'RB',
  'DM',
  'CM',
  'LM',
  'RM',
  'LW',
  'RW',
  'CF',
  'ST',
];

const FORMATIONS = {
  1: [
    ['GK', 50, 50],
  ],

  2: [
    ['GK', 50, 84],
    ['ST', 50, 18],
  ],

  3: [
    ['GK', 50, 86],
    ['ST', 32, 20],
    ['ST', 68, 20],
  ],

  4: [
    ['GK', 50, 87],
    ['LB', 25, 60],
    ['RB', 75, 60],
    ['ST', 50, 18],
  ],

  5: [
    ['GK', 50, 88],
    ['LB', 18, 62],
    ['CB', 50, 62],
    ['RB', 82, 62],
    ['ST', 50, 18],
  ],

  6: [
    ['GK', 50, 88],
    ['LB', 15, 64],
    ['CB', 38, 64],
    ['CB', 62, 64],
    ['RB', 85, 64],
    ['ST', 50, 18],
  ],

  7: [
    ['GK', 50, 89],
    ['LB', 14, 64],
    ['CB', 34, 68],
    ['CB', 66, 68],
    ['RB', 86, 64],
    ['LW', 28, 36],
    ['ST', 68, 20],
  ],

  8: [
    ['GK', 50, 89],
    ['LB', 12, 65],
    ['CB', 31, 68],
    ['CB', 69, 68],
    ['RB', 88, 65],
    ['LM', 24, 38],
    ['RM', 76, 38],
    ['ST', 50, 18],
  ],

  9: [
    ['GK', 50, 90],
    ['LB', 11, 66],
    ['CB', 27, 70],
    ['CB', 50, 72],
    ['CB', 73, 70],
    ['RB', 89, 66],
    ['LW', 22, 38],
    ['RW', 78, 38],
    ['ST', 50, 17],
  ],

  10: [
    ['GK', 50, 90],
    ['LB', 9, 67],
    ['CB', 25, 71],
    ['CB', 39, 73],
    ['CB', 61, 73],
    ['RB', 91, 67],
    ['LM', 21, 42],
    ['RM', 79, 42],
    ['LW', 33, 24],
    ['ST', 67, 20],
  ],

  11: [
    ['GK', 50, 91],
    ['LB', 8, 69],
    ['CB', 27, 72],
    ['CB', 50, 74],
    ['CB', 73, 72],
    ['RB', 92, 69],
    ['LM', 17, 46],
    ['CM', 37, 48],
    ['CM', 63, 48],
    ['RM', 83, 46],
    ['ST', 50, 17],
  ],
};

function makeId() {
  return crypto.randomBytes(12).toString('hex');
}

function escapeHtml(value = '') {
  return String(value)
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
  const value =
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
    const escaped =
      position.replace(
        '/',
        '\\/'
      );

    const regex =
      new RegExp(
        '(^|\\s)' +
        escaped +
        '($|\\s)'
      );

    if (
      regex.test(value)
    ) {
      return position;
    }
  }

  return null;
}

function getMessageText(message) {
  const parts = [];

  if (message.content) {
    parts.push(
      message.content
    );
  }

  for (
    const embed
    of message.embeds || []
  ) {
    if (embed.title) {
      parts.push(
        embed.title
      );
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
        parts.push(
          field.name
        );
      }

      if (field.value) {
        parts.push(
          field.value
        );
      }
    }
  }

  return parts.join('\n');
}

function findPlayerInMessage(
  message,
  text,
  members
) {
  const validIds =
    new Set(
      members.map(
        member =>
          member.id
      )
    );

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
        validIds.has(
          user.id
        )
      ) {
        return user.id;
      }
    }
  }

  /*
    Player name in message.
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
      member.user.globalName,
      member.user.username,
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
        lower.includes(
          name
        )
      ) {
        if (
          !best ||
          name.length >
            best.length
        ) {
          best = {
            id: member.id,
            length:
              name.length,
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
    !message.author.bot &&
    validIds.has(
      message.author.id
    )
  ) {
    return message.author.id;
  }

  return null;
}

async function scanPositions(
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

  let before = null;

  /*
    Search up to 1,000 recent
    messages every refresh.
  */
  for (
    let page = 0;
    page < 10;
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

    /*
      Newest messages are fetched
      first, so newest position wins.
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
        findPlayerInMessage(
          message,
          text,
          members
        );

      if (
        playerId &&
        !result.has(
          playerId
        )
      ) {
        result.set(
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
    'Position scan found ' +
    result.size +
    ' players.'
  );

  return result;
}

async function refreshServer() {
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

  const latestPositions =
    await scanPositions(
      guild,
      members
    );

  const nextPlayers =
    new Map();

  for (
    const member
    of members
  ) {
    nextPlayers.set(
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

  /*
    Completely replace the cache,
    so players who leave disappear.
  */
  playersCache =
    nextPlayers;

  positionsCache =
    latestPositions;

  lastRefresh =
    Date.now();

  const activeIds =
    new Set(
      members.map(
        member =>
          member.id
      )
    );

  for (
    const session
    of sessions.values()
  ) {
    /*
      Remove players that left.
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
      Automatically update
      existing players' positions.
    */
    for (
      const slot
      of session.slots
    ) {
      if (
        slot.playerId &&
        latestPositions.has(
          slot.playerId
        )
      ) {
        slot.position =
          latestPositions.get(
            slot.playerId
          );
      }
    }

    /*
      Remove bench players that left.
    */
    session.bench =
      session.bench.filter(
        entry =>
          activeIds.has(
            entry.playerId
          )
      );
  }

  console.log(
    '60-second refresh: ' +
    members.length +
    ' members / ' +
    latestPositions.size +
    ' positions'
  );
}

function createSession(
  interaction,
  size
) {
  const slots =
    FORMATIONS[size].map(
      (point, index) => ({
        index,

        x:
          point[1],

        y:
          point[2],

        playerId:
          null,

        position:
          '',
      })
    );

  const session = {
    id:
      makeId(),

    creatorId:
      interaction.user.id,

    guildId:
      interaction.guildId,

    channelId:
      interaction.channelId,

    size,

    slots,

    bench: [],

    createdAt:
      Date.now(),
  };

  sessions.set(
    session.id,
    session
  );

  return session;
}

function readBody(req) {
  return new Promise(
    (resolve, reject) => {
      let data = '';

      req.on(
        'data',
        chunk => {
          data += chunk;

          if (
            data.length >
            2_000_000
          ) {
            reject(
              new Error(
                'Request too large'
              )
            );
          }
        }
      );

      req.on(
        'end',
        () => {
          if (!data) {
            resolve({});
            return;
          }

          try {
            resolve(
              JSON.parse(data)
            );
          } catch {
            reject(
              new Error(
                'Invalid JSON'
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

function sendJson(
  res,
  status,
  data
) {
  res.statusCode =
    status;

  res.setHeader(
    'Content-Type',
    'application/json; charset=utf-8'
  );

  res.setHeader(
    'Cache-Control',
    'no-store'
  );

  res.end(
    JSON.stringify(data)
  );
}

function sendHtml(
  res,
  status,
  data
) {
  res.statusCode =
    status;

  res.setHeader(
    'Content-Type',
    'text/html; charset=utf-8'
  );

  res.end(data);
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
                256,
              forceStatic:
                true,
            }),

          position:
            positionsCache.get(
              member.id
            ) ||
            'UNSET',
        })
      ),
  };
}

function pitchPage(
  session
) {
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
box-sizing:border-box
}

html,body{
margin:0;
height:100%;
background:#07130c;
color:#fff;
font-family:Arial,sans-serif
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
display:flex;
align-items:center;
gap:10px;
padding:8px 12px;
background:#08110c;
border-bottom:1px solid #243029
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
gap:6px;
flex-wrap:wrap
}

.btn{
border:0;
border-radius:9px;
padding:9px 11px;
background:#223027;
color:#fff;
font-weight:800
}

.finish{
background:#15803d
}

.benchBtn{
background:#8a2739
}

.main{
flex:1;
min-height:0;
display:grid;
grid-template-columns:minmax(0,1fr) 340px;
gap:9px;
padding:9px
}

.pitchWrap{
min-width:0;
display:flex;
align-items:center;
justify-content:center;
overflow:hidden
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
#238044 0,
#238044 8.33%,
#1d713b 8.33%,
#1d713b 16.66%
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

.box{
position:absolute;
left:24%;
width:52%;
height:14%;
border:3px solid #fff
}

.topbox{
top:0;
border-top:0
}

.botbox{
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
touch-action:none;
user-select:none;
z-index:5
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
box-shadow:0 4px 12px rgba(0,0,0,.35)
}

.circle img{
width:100%;
height:100%;
object-fit:cover
}

.initial{
font-weight:900;
font-size:20px
}

.slotName{
max-width:95px;
font-size:10px;
font-weight:900;
margin-top:3px;
white-space:nowrap;
overflow:hidden;
text-overflow:ellipsis;
text-shadow:0 1px 3px #000
}

.selected .circle{
outline:4px solid #ffd42a
}

.side{
min-height:0;
display:flex;
flex-direction:column;
overflow:hidden;
background:#0d1711;
border:1px solid #243029;
border-radius:14px
}

.search{
padding:9px;
border-bottom:1px solid #243029
}

.search input{
width:100%;
background:#07100b;
color:#fff;
border:1px solid #36483c;
border-radius:9px;
padding:10px
}

.players{
flex:1;
overflow:auto;
padding:8px
}

.section{
margin-bottom:8px
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
background:#142019;
color:#fff;
border-radius:9px;
padding:8px;
margin-bottom:5px;
text-align:left;
cursor:pointer
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

.pname{
flex:1;
min-width:0;
overflow:hidden;
white-space:nowrap;
text-overflow:ellipsis
}

.ppos{
font-size:10px;
opacity:.55
}

.bench{
border-top:1px solid #243029;
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
max-height:120px;
overflow:auto
}

.benchItem{
border:0;
background:#19271f;
color:#fff;
border-radius:999px;
padding:6px 9px;
display:flex;
align-items:center;
gap:5px;
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
display:none;
align-items:center;
justify-content:center;
background:rgba(0,0,0,.7);
padding:15px;
z-index:50
}

.modal.show{
display:flex
}

.card{
width:min(430px,100%);
background:#0d1711;
border:1px solid #3b4c40;
border-radius:14px;
padding:14px
}

.grid{
display:grid;
grid-template-columns:repeat(3,1fr);
gap:7px
}

.pos{
border:1px solid #3b4c40;
background:#16221b;
color:#fff;
border-radius:9px;
padding:10px;
font-weight:900;
cursor:pointer
}

.close{
width:100%;
margin-top:8px
}

.hint{
font-size:11px;
opacity:.55;
margin-top:8px
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

.btn{
padding:8px 9px;
font-size:11px
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
${session.size}v${session.size} • checking every minute
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
class="btn benchBtn"
onclick="benchSelected()"
>
Bench
</button>

<button
class="btn finish"
onclick="finishLineup()"
>
FINISH
</button>

</div>

</div>

<div class="main">

<div class="pitchWrap">

<div
class="pitch"
id="pitch"
>

<div class="box topbox"></div>
<div class="box botbox"></div>

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

<div class="card">

<h3 id="modalTitle">
Choose Position
</h3>

<div
class="grid"
id="positionGrid"
></div>

<button
class="btn close"
onclick="closePosition()"
>
Cancel
</button>

<div class="hint">
Positions are checked from the Discord position channel.
</div>

</div>

</div>

<script>

const SESSION =
${JSON.stringify(session.id)};

const CREATOR =
${JSON.stringify(session.creatorId)};

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

async function api(
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
await api(
"/api/session/" +
SESSION
);

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
selectedSlot === null
? null
: state.slots[
selectedSlot
]
? state.slots[
selectedSlot
].playerId
: null;

state =
await api(
"/api/session/" +
SESSION
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
);

el.style.left =
slot.x +
"%";

el.style.top =
slot.y +
"%";

el.dataset.index =
slot.index;

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

circle.innerHTML =
'<span style="font-size:24px">+</span>';

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

el.onclick =
function(){

if(moved){

moved =
false;

return;

}

selectedSlot =
slot.index;

renderPitch();

};

el.onpointerdown =
function(event){

startDrag(
event,
slot.index
);

};

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
(
p.name ||
"?"
)
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
"pname";

name.textContent =
p.name;

const position =
document.createElement(
"span"
);

position.className =
"ppos";

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
playerId
){

let slot =
selectedSlot ===
null
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

await api(
"/api/assign",
{
method:"POST",
headers:{
"Content-Type":
"application/json"
},
body:
JSON.stringify({
session:
SESSION,
uid:
CREATOR,
slot:
slot.index,
userId:
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
entry =>
entry.playerId !==
playerId
);

slot.playerId =
playerId;

const p =
getPlayer(
playerId
);

if(p){

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
"Select a player first."
);

return;

}

document.getElementById(
"positionGrid"
).innerHTML =
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
]
.map(
position =>
'<button class="pos" onclick="choosePosition(\\'' +
position +
'\\')">' +
position +
'</button>'
)
.join("");

document.getElementById(
"modal"
)
.classList
.add(
"show"
);

}

async function choosePosition(
position
){

try{

await api(
"/api/position",
{
method:"POST",
headers:{
"Content-Type":
"application/json"
},
body:
JSON.stringify({
session:
SESSION,
uid:
CREATOR,
slot:
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

const playerId =
slot.playerId;

try{

await api(
"/api/bench",
{
method:"POST",
headers:{
"Content-Type":
"application/json"
},
body:
JSON.stringify({
session:
SESSION,
uid:
CREATOR,
slot:
selectedSlot
})
}
);

state.bench.push({
playerId:
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

await api(
"/api/restore",
{
method:"POST",
headers:{
"Content-Type":
"application/json"
},
body:
JSON.stringify({
session:
SESSION,
uid:
CREATOR,
playerId,
slot:
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

if(p){

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
index,
startX:
event.clientX,
startY:
event.clientY,
startSlotX:
slot.x,
startSlotY:
slot.y,
moved:
false
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
3
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
drag.startSlotX +
dx
) /
5
) *
5
)
);

slot.y =
Math.max(
5,
Math.min(
95,
Math.round(
(
drag.startSlotY +
dy
) /
5
) *
5
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

api(
"/api/move",
{
method:"POST",
headers:{
"Content-Type":
"application/json"
},
body:
JSON.stringify({
session:
SESSION,
uid:
CREATOR,
slot:
slot.index,
x:
slot.x,
y:
slot.y
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

document.getElementById(
"search"
)
.addEventListener(
"input",
renderPlayers
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

await api(
"/api/finish/" +
SESSION,
{
method:"POST",
headers:{
"Content-Type":
"application/json"
},
body:
JSON.stringify({
uid:
CREATOR
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

load();

setInterval(
refresh,
60000
);

</script>

</body>
</html>`;
}

async function getAvatarData(
url
) {

  try {

    const response =
      await fetch(url);

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
          96,
          96,
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

  } catch (error) {

    console.error(
      'Avatar download failed:',
      error.message
    );

    return null;
  }
}

async function createPitchImage(
  session
) {

  const width = 1200;
  const height = 1500;

  const pitchX = 240;
  const pitchY = 70;
  const pitchW = 720;
  const pitchH = 1080;

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
    '<text x="600" y="42" text-anchor="middle" fill="white" font-family="Arial" font-size="30" font-weight="900">NEWCASTLE LINEUP</text>'
  );

  svg.push(
    `<rect x="${pitchX}" y="${pitchY}" width="${pitchW}" height="${pitchH}" rx="20" fill="#178640" stroke="white" stroke-width="6"/>`
  );

  for(
    let i = 0;
    i < 12;
    i += 1
  ){

    svg.push(
      `<rect x="${pitchX}" y="${pitchY + (pitchH / 12) * i}" width="${pitchW}" height="${pitchH / 12}" fill="${i % 2 ? '#1b8d46' : '#178640'}"/>`
    );

  }

  svg.push(
    `<line x1="${pitchX}" y1="${pitchY + pitchH / 2}" x2="${pitchX + pitchW}" y2="${pitchY + pitchH / 2}" stroke="white" stroke-width="5"/>`
  );

  svg.push(
    `<circle cx="${pitchX + pitchW / 2}" cy="${pitchY + pitchH / 2}" r="68" fill="none" stroke="white" stroke-width="5"/>`
  );

  svg.push(
    `<rect x="${pitchX + pitchW * 0.25}" y="${pitchY}" width="${pitchW * 0.5}" height="${pitchH * 0.14}" fill="none" stroke="white" stroke-width="5"/>`
  );

  svg.push(
    `<rect x="${pitchX + pitchW * 0.25}" y="${pitchY + pitchH * 0.86}" width="${pitchW * 0.5}" height="${pitchH * 0.14}" fill="none" stroke="white" stroke-width="5"/>`
  );

  for(
    const slot
    of session.slots
  ){

    const cx =
      pitchX +
      slot.x / 100 *
      pitchW;

    const cy =
      pitchY +
      slot.y / 100 *
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
      `<circle cx="${cx}" cy="${cy}" r="52" fill="white"/>`
    );

    svg.push(
      `<circle cx="${cx}" cy="${cy}" r="48" fill="#666"/>`
    );

    if(member){

      const avatar =
        await getAvatarData(
          member.displayAvatarURL({
            extension:
              'png',
            size:
              256,
            forceStatic:
              true,
          })
        );

      if(avatar){

        svg.push(
          `<clipPath id="player${slot.index}"><circle cx="${cx}" cy="${cy}" r="48"/></clipPath>`
        );

        svg.push(
          `<image href="${avatar}" x="${cx - 48}" y="${cy - 48}" width="96" height="96" preserveAspectRatio="xMidYMid slice" clip-path="url(#player${slot.index})"/>`
        );

      }else{

        svg.push(
          `<text x="${cx}" y="${cy + 12}" text-anchor="middle" fill="white" font-family="Arial" font-size="32" font-weight="900">${escapeHtml(
            getName(member).slice(0,1)
          )}</text>`
        );

      }

      svg.push(
        `<text x="${cx}" y="${cy + 70}" text-anchor="middle" fill="white" font-family="Arial" font-size="17" font-weight="900">${escapeHtml(
          getName(member)
        )}</text>`
      );

      svg.push(
        `<text x="${cx}" y="${cy + 91}" text-anchor="middle" fill="#dce7ff" font-family="Arial" font-size="13" font-weight="800">${escapeHtml(
          slot.position ||
          'UNSET'
        )}</text>`
      );

    }else{

      svg.push(
        `<text x="${cx}" y="${cy + 12}" text-anchor="middle" fill="white" font-family="Arial" font-size="32" font-weight="900">+</text>`
      );

      svg.push(
        `<text x="${cx}" y="${cy + 70}" text-anchor="middle" fill="white" font-family="Arial" font-size="17" font-weight="900">EMPTY</text>`
      );

    }

  }

  svg.push(
    '<text x="600" y="1240" text-anchor="middle" fill="white" font-family="Arial" font-size="25" font-weight="900">BENCH</text>'
  );

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
        .catch(
          () => null
        );

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
        100;

    }

    svg.push(
      `<circle cx="${benchX}" cy="${benchY}" r="38" fill="white"/>`
    );

    const avatar =
      await getAvatarData(
        member.displayAvatarURL({
          extension:
            'png',
          size:
            128,
          forceStatic:
            true,
        })
      );

    if(avatar){

      svg.push(
        `<clipPath id="bench${entry.playerId}"><circle cx="${benchX}" cy="${benchY}" r="34"/></clipPath>`
      );

      svg.push(
        `<image href="${avatar}" x="${benchX - 34}" y="${benchY - 34}" width="68" height="68" preserveAspectRatio="xMidYMid slice" clip-path="url(#bench${entry.playerId})"/>`
      );

    }else{

      svg.push(
        `<circle cx="${benchX}" cy="${benchY}" r="34" fill="#666"/>`
      );

      svg.push(
        `<text x="${benchX}" y="${benchY + 9}" text-anchor="middle" fill="white" font-family="Arial" font-size="22" font-weight="900">${escapeHtml(
          getName(member).slice(0,1)
        )}</text>`
      );

    }

    svg.push(
      `<text x="${benchX}" y="${benchY + 57}" text-anchor="middle" fill="white" font-family="Arial" font-size="14" font-weight="800">${escapeHtml(
        getName(member)
      )}</text>`
    );

    benchX +=
      145;

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

app = {
  get() {},
  post() {},
};

const server =
  http.createServer(
    async (
      req,
      res
    ) => {

      try {

        const url =
          new URL(
            req.url,
            `http://${req.headers.host || 'localhost'}`
          );

        /*
          HEALTH
        */
        if(
          req.method ===
            'GET' &&
          url.pathname ===
            '/health'
        ){

          return sendJson(
            res,
            200,
            {
              online:
                true,

              discord:
                client.isReady(),

              players:
                playersCache.size,

              positions:
                positionsCache.size,
            }
          );

        }

        /*
          PITCH
        */
        if(
          req.method ===
            'GET' &&
          url.pathname.startsWith(
            '/pitch/'
          )
        ){

          const id =
            url.pathname.split(
              '/'
            )[2];

          const session =
            sessions.get(
              id
            );

          if(!session){

            return sendHtml(
              res,
              404,
              '<h2>Lineup not found or expired.</h2>'
            );

          }

          return sendHtml(
            res,
            200,
            pitchPage(
              session
            )
          );

        }

        /*
          GET SESSION
        */
        if(
          req.method ===
            'GET' &&
          url.pathname.startsWith(
            '/api/session/'
          )
        ){

          const id =
            url.pathname.split(
              '/'
            )[3];

          const session =
            sessions.get(
              id
            );

          if(!session){

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
            .fetch();

          const members =
            [
              ...guild.members.cache.values(),
            ].filter(
              member =>
                !member.user.bot
            );

          /*
            Re-check positions whenever
            the editor asks for fresh data.
          */
          const map =
            await scanPositions(
              guild,
              members
            );

          positionsCache =
            map;

          lastRefresh =
            Date.now();

          /*
            Replace player cache so
            joins and leaves are reflected.
          */
          playersCache =
            new Map();

          for(
            const member
            of members
          ){

            playersCache.set(
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
                  map.get(
                    member.id
                  ) ||
                  'UNSET',
              }
            );

          }

          for(
            const slot
            of session.slots
          ){

            if(
              slot.playerId &&
              map.has(
                slot.playerId
              )
            ){

              slot.position =
                map.get(
                  slot.playerId
                );

            }

            if(
              slot.playerId &&
              !playersCache.has(
                slot.playerId
              )
            ){

              slot.playerId =
                null;

              slot.position =
                '';

            }

          }

          session.bench =
            session.bench.filter(
              entry =>
                playersCache.has(
                  entry.playerId
                )
            );

          return sendJson(
            res,
            200,
            {
              id:
                session.id,

              size:
                session.size,

              updatedAt:
                lastRefresh,

              players:
                [
                  ...playersCache.values(),
                ],

              slots:
                session.slots,

              bench:
                session.bench,
            }
          );

        }

        if(
          req.method ===
          'POST'
        ){

          const body =
            await readBody(
              req
            );

          /*
            ASSIGN
          */
          if(
            url.pathname ===
            '/api/assign'
          ){

            const session =
              sessions.get(
                body.session
              );

            if(!session){

              return sendJson(
                res,
                404,
                {
                  error:
                    'Session not found',
                }
              );

            }

            if(
              body.uid !==
              session.creatorId
            ){

              return sendJson(
                res,
                403,
                {
                  error:
                    'You cannot edit this lineup.',
                }
              );

            }

            const slot =
              session.slots[
                Number(
                  body.slot
                )
              ];

            if(!slot){

              return sendJson(
                res,
                400,
                {
                  error:
                    'Invalid slot.',
                }
              );

            }

            const guild =
              await client.guilds.fetch(
                session.guildId
              );

            const member =
              await guild.members.fetch(
                body.userId
              )
              .catch(
                () => null
              );

            if(
              !member ||
              member.user.bot
            ){

              return sendJson(
                res,
                404,
                {
                  error:
                    'Player not found.',
                }
              );

            }

            /*
              A player can only exist
              in one pitch slot.
            */
            for(
              const other
              of session.slots
            ){

              if(
                other.index !==
                  slot.index &&
                other.playerId ===
                  member.id
              ){

                other.playerId =
                  null;

                other.position =
                  '';

              }

            }

            /*
              Assigning a player removes
              them from the bench.
            */
            session.bench =
              session.bench.filter(
                entry =>
                  entry.playerId !==
                  member.id
              );

            slot.playerId =
              member.id;

            slot.position =
              positionsCache.get(
                member.id
              ) ||
              'UNSET';

            return sendJson(
              res,
              200,
              {
                success:
                  true,

                slot,
              }
            );

          }

          /*
            CHANGE POSITION
          */
          if(
            url.pathname ===
            '/api/position'
          ){

            const session =
              sessions.get(
                body.session
              );

            if(!session){

              return sendJson(
                res,
                404,
                {
                  error:
                    'Session not found',
                }
              );

            }

            if(
              body.uid !==
              session.creatorId
            ){

              return sendJson(
                res,
                403,
                {
                  error:
                    'You cannot edit this lineup.',
                }
              );

            }

            const slot =
              session.slots[
                Number(
                  body.slot
                )
              ];

            const position =
              String(
                body.position ||
                ''
              )
              .trim()
              .slice(
                0,
                20
              );

            if(
              !slot ||
              !position
            ){

              return sendJson(
                res,
                400,
                {
                  error:
                    'Invalid position.',
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

            return sendJson(
              res,
              200,
              {
                success:
                  true,

                slot,
              }
            );

          }

          /*
            MOVE
          */
          if(
            url.pathname ===
            '/api/move'
          ){

            const session =
              sessions.get(
                body.session
              );

            if(!session){

              return sendJson(
                res,
                404,
                {
                  error:
                    'Session not found',
                }
              );

            }

            if(
              body.uid !==
              session.creatorId
            ){

              return sendJson(
                res,
                403,
                {
                  error:
                    'You cannot edit this lineup.',
                }
              );

            }

            const slot =
              session.slots[
                Number(
                  body.slot
                )
              ];

            const x =
              Number(
                body.x
              );

            const y =
              Number(
                body.y
              );

            if(
              !slot ||
              !Number.isFinite(x) ||
              !Number.isFinite(y)
            ){

              return sendJson(
                res,
                400,
                {
                  error:
                    'Invalid movement.',
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
                success:
                  true,

                slot,
              }
            );

          }

          /*
            BENCH
          */
          if(
            url.pathname ===
            '/api/bench'
          ){

            const session =
              sessions.get(
                body.session
              );

            if(!session){

              return sendJson(
                res,
                404,
                {
                  error:
                    'Session not found',
                }
              );

            }

            if(
              body.uid !==
              session.creatorId
            ){

              return sendJson(
                res,
                403,
                {
                  error:
                    'You cannot edit this lineup.',
                }
              );

            }

            const slot =
              session.slots[
                Number(
                  body.slot
                )
              ];

            if(
              !slot ||
              !slot.playerId
            ){

              return sendJson(
                res,
                400,
                {
                  error:
                    'No player in that slot.',
                }
              );

            }

            if(
              !session.bench.some(
                entry =>
                  entry.playerId ===
                  slot.playerId
              )
            ){

              session.bench.push({
                playerId:
                  slot.playerId,

                originalSlot:
                  slot.index,
              });

            }

            /*
              IMPORTANT:
              The slot remains in the
              exact same place, but becomes
              an empty grey slot.
            */
            slot.playerId =
              null;

            slot.position =
              '';

            return sendJson(
              res,
              200,
              {
                success:
                  true,

                slot,
              }
            );

          }

          /*
            RESTORE BENCH
          */
          if(
            url.pathname ===
            '/api/restore'
          ){

            const session =
              sessions.get(
                body.session
              );

            if(!session){

              return sendJson(
                res,
                404,
                {
                  error:
                    'Session not found',
                }
              );

            }

            if(
              body.uid !==
              session.creatorId
            ){

              return sendJson(
                res,
                403,
                {
                  error:
                    'You cannot edit this lineup.',
                }
              );

            }

            const entry =
              session.bench.find(
                item =>
                  item.playerId ===
                  body.playerId
              );

            if(!entry){

              return sendJson(
                res,
                400,
                {
                  error:
                    'Player is not on the bench.',
                }
              );

            }

            const slot =
              session.slots[
                Number(
                  body.slot
                )
              ];

            if(
              !slot ||
              slot.playerId
            ){

              return sendJson(
                res,
                400,
                {
                  error:
                    'That slot is occupied.',
                }
              );

            }

            session.bench =
              session.bench.filter(
                item =>
                  item.playerId !==
                  body.playerId
              );

            slot.playerId =
              body.playerId;

            slot.position =
              positionsCache.get(
                body.playerId
              ) ||
              'UNSET';

            return sendJson(
              res,
              200,
              {
                success:
                  true,

                slot,
              }
            );

          }

          /*
            FINISH
          */
          if(
            url.pathname.startsWith(
              '/api/finish/'
            )
          ){

            const id =
              url.pathname.split(
                '/'
              )[3];

            const session =
              sessions.get(
                id
              );

            if(!session){

              return sendJson(
                res,
                404,
                {
                  error:
                    'Session not found',
                }
              );

            }

            if(
              body.uid !==
              session.creatorId
            ){

              return sendJson(
                res,
                403,
                {
                  error:
                    'You cannot finish this lineup.',
                }
              );

            }

            const image =
              await createPitchImage(
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

            const channel =
              await client.channels.fetch(
                session.channelId
              );

            await channel.send({
              content:
                '**NEWCASTLE LINEUP TODAY ENJOY**',

              files:[
                attachment,
              ],
            });

            session.finished =
              true;

            return sendJson(
              res,
              200,
              {
                success:
                  true,
              }
            );

          }

        }

        return sendJson(
          res,
          404,
          {
            error:
              'Not found',
          }
        );

      } catch(error) {

        console.error(
          'HTTP error:',
          error
        );

        if(
          !res.headersSent
        ){

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

    } catch(error) {

      console.error(
        'Command registration failed:',
        error
      );

    }

    try {

      await refreshServer();

    } catch(error) {

      console.error(
        'Initial player refresh failed:',
        error
      );

    }

    setInterval(
      async () => {

        try {

          await refreshServer();

        } catch(error) {

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

    try {

      await refreshServer();

    } catch(error) {

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

    try {

      await refreshServer();

    } catch(error) {

      console.error(
        'Leave refresh failed:',
        error
      );

    }

  }
);

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

/*
  Clean up old sessions.
*/
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
