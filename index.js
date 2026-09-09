const http = require('http');
const { URL } = require('url');
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

class MiniApp {
  constructor() {
    this.routes = [];
  }

  use() {}

  get(path, handler) {
    this.routes.push({
      method: 'GET',
      path,
      handler,
    });
  }

  post(path, handler) {
    this.routes.push({
      method: 'POST',
      path,
      handler,
    });
  }

  listen(port, host, callback) {
    const server = http.createServer(
      async (req, res) => {
        try {
          const url = new URL(
            req.url,
            'http://localhost'
          );

          req.query =
            Object.fromEntries(
              url.searchParams.entries()
            );

          req.path = url.pathname;
          req.body = {};

          if (req.method === 'POST') {
            req.body =
              await new Promise(
                (resolve, reject) => {
                  let data = '';

                  req.on(
                    'data',
                    chunk => {
                      data += chunk;

                      if (
                        data.length >
                        2 * 1024 * 1024
                      ) {
                        reject(
                          new Error(
                            'Request too large'
                          )
                        );

                        req.destroy();
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

          res.status = code => {
            res.statusCode = code;
            return res;
          };

          res.json = value => {
            res.setHeader(
              'Content-Type',
              'application/json; charset=utf-8'
            );

            res.end(
              JSON.stringify(value)
            );
          };

          res.send = value => {
            if (Buffer.isBuffer(value)) {
              res.end(value);
            } else {
              res.setHeader(
                'Content-Type',
                'text/html; charset=utf-8'
              );

              res.end(
                String(value)
              );
            }
          };

          const route =
            this.routes.find(
              item =>
                item.method ===
                  req.method &&
                item.path ===
                  url.pathname
            );

          if (!route) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }

          await route.handler(
            req,
            res
          );

        } catch (error) {
          console.error(
            'HTTP error:',
            error
          );

          if (!res.headersSent) {
            res.statusCode = 500;

            res.setHeader(
              'Content-Type',
              'application/json; charset=utf-8'
            );

            res.end(
              JSON.stringify({
                error:
                  error.message,
              })
            );
          } else {
            res.end();
          }
        }
      }
    );

    return server.listen(
      port,
      host,
      callback
    );
  }
}

const app = new MiniApp();

const PORT = Number(
  process.env.PORT || 3000
);

const BASE_URL = (
  process.env.RENDER_EXTERNAL_URL ||
  `http://localhost:${PORT}`
).replace(/\/$/, '');

const POSITION_GUILD_ID =
  process.env.POSITION_GUILD_ID ||
  '1542615988137099324';

const POSITION_CHANNEL_ID =
  process.env.POSITION_CHANNEL_ID ||
  '1542615989382942756';

const GUILD_ID =
  process.env.GUILD_ID ||
  POSITION_GUILD_ID;

const DISCORD_TOKEN =
  process.env.DISCORD_TOKEN;

if (!DISCORD_TOKEN) {
  console.error(
    'Missing DISCORD_TOKEN environment variable.'
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
  1: [
    {
      x: 50,
      y: 50,
    },
  ],

  2: [
    {
      x: 50,
      y: 83,
    },
    {
      x: 50,
      y: 17,
    },
  ],

  3: [
    {
      x: 50,
      y: 84,
    },
    {
      x: 30,
      y: 38,
    },
    {
      x: 70,
      y: 38,
    },
  ],

  4: [
    {
      x: 50,
      y: 86,
    },
    {
      x: 25,
      y: 60,
    },
    {
      x: 75,
      y: 60,
    },
    {
      x: 50,
      y: 30,
    },
  ],

  5: [
    {
      x: 50,
      y: 87,
    },
    {
      x: 22,
      y: 62,
    },
    {
      x: 78,
      y: 62,
    },
    {
      x: 35,
      y: 36,
    },
    {
      x: 65,
      y: 36,
    },
  ],

  6: [
    {
      x: 50,
      y: 87,
    },
    {
      x: 18,
      y: 61,
    },
    {
      x: 50,
      y: 66,
    },
    {
      x: 82,
      y: 61,
    },
    {
      x: 32,
      y: 35,
    },
    {
      x: 68,
      y: 35,
    },
  ],

  7: [
    {
      x: 50,
      y: 87,
    },
    {
      x: 18,
      y: 63,
    },
    {
      x: 50,
      y: 68,
    },
    {
      x: 82,
      y: 63,
    },
    {
      x: 22,
      y: 36,
    },
    {
      x: 50,
      y: 30,
    },
    {
      x: 78,
      y: 36,
    },
  ],

  8: [
    {
      x: 50,
      y: 88,
    },
    {
      x: 14,
      y: 64,
    },
    {
      x: 38,
      y: 68,
    },
    {
      x: 62,
      y: 68,
    },
    {
      x: 86,
      y: 64,
    },
    {
      x: 27,
      y: 36,
    },
    {
      x: 50,
      y: 29,
    },
    {
      x: 73,
      y: 36,
    },
  ],

  9: [
    {
      x: 50,
      y: 89,
    },
    {
      x: 13,
      y: 67,
    },
    {
      x: 32,
      y: 71,
    },
    {
      x: 50,
      y: 73,
    },
    {
      x: 68,
      y: 71,
    },
    {
      x: 87,
      y: 67,
    },
    {
      x: 22,
      y: 38,
    },
    {
      x: 50,
      y: 30,
    },
    {
      x: 78,
      y: 38,
    },
  ],

  10: [
    {
      x: 50,
      y: 90,
    },
    {
      x: 10,
      y: 69,
    },
    {
      x: 30,
      y: 72,
    },
    {
      x: 50,
      y: 74,
    },
    {
      x: 70,
      y: 72,
    },
    {
      x: 90,
      y: 69,
    },
    {
      x: 17,
      y: 39,
    },
    {
      x: 39,
      y: 33,
    },
    {
      x: 61,
      y: 33,
    },
    {
      x: 83,
      y: 39,
    },
  ],

  11: [
    {
      x: 50,
      y: 90,
    },
    {
      x: 9,
      y: 69,
    },
    {
      x: 28,
      y: 73,
    },
    {
      x: 50,
      y: 75,
    },
    {
      x: 72,
      y: 73,
    },
    {
      x: 91,
      y: 69,
    },
    {
      x: 16,
      y: 42,
    },
    {
      x: 36,
      y: 36,
    },
    {
      x: 64,
      y: 36,
    },
    {
      x: 84,
      y: 42,
    },
    {
      x: 50,
      y: 19,
    },
  ],
};

function escapeHtml(value) {
  return String(
    value == null ? '' : value
  )
    .replace(
      /&/g,
      '&amp;'
    )
    .replace(
      /</g,
      '&lt;'
    )
    .replace(
      />/g,
      '&gt;'
    )
    .replace(
      /"/g,
      '&quot;'
    )
    .replace(
      /'/g,
      '&#39;'
    );
}

function escapeXml(value) {
  return escapeHtml(value);
}

function normalisePosition(text) {
  const s =
    String(text || '')
      .toUpperCase()
      .replace(
        /[^A-Z0-9/ -]/g,
        ' '
      );

  const ordered =
    [...POSITION_NAMES].sort(
      (a, b) =>
        b.length - a.length
    );

  for (
    const pos of ordered
  ) {
    const rx =
      new RegExp(
        '(^|\\b)' +
          pos.replace(
            '/',
            '\\/'
          ) +
          '($|\\b)'
      );

    if (rx.test(s)) {
      return pos;
    }
  }

  return 'UNSET';
}

function extractPositionFromMessage(
  message,
  membersById
) {
  const chunks = [];

  if (message.content) {
    chunks.push(
      message.content
    );
  }

  for (
    const embed
    of message.embeds || []
  ) {
    if (embed.title) {
      chunks.push(
        embed.title
      );
    }

    if (embed.description) {
      chunks.push(
        embed.description
      );
    }

    for (
      const field
      of embed.fields || []
    ) {
      chunks.push(
        field.name,
        field.value
      );
    }
  }

  const text =
    chunks
      .filter(Boolean)
      .join('\n');

  const position =
    normalisePosition(text);

  if (
    position ===
    'UNSET'
  ) {
    return null;
  }

  let userId = null;

  /*
    First: explicit mention.
  */
  if (
    message.mentions?.users?.size
  ) {
    for (
      const mentioned
      of message.mentions.users.values()
    ) {
      if (
        membersById.has(
          mentioned.id
        )
      ) {
        userId =
          mentioned.id;

        break;
      }
    }
  }

  /*
    Second: find player name
    inside message.
  */
  if (!userId) {

    const lowerText =
      text.toLowerCase();

    let best = null;

    for (
      const [
        id,
        member
      ]
      of membersById.entries()
    ) {

      const names = [
        member.displayName,
        member.user.username,
        member.user.globalName,
      ]
        .filter(Boolean)
        .map(
          value =>
            String(
              value
            ).toLowerCase()
        );

      for (
        const name
        of names
      ) {

        if (
          name.length >= 2 &&
          lowerText.includes(
            name
          )
        ) {

          if (
            !best ||
            name.length >
              best.length
          ) {

            best = {
              id,
              length:
                name.length,
            };

          }

        }

      }

    }

    if (best) {
      userId =
        best.id;
    }
  }

  /*
    Third: player posted their
    own position.
  */
  if (
    !userId &&
    message.author &&
    !message.author.bot &&
    membersById.has(
      message.author.id
    )
  ) {
    userId =
      message.author.id;
  }

  if (!userId) {
    return null;
  }

  return {
    userId,
    position,
  };
}

async function getPositionMap(
  guild
) {
  const result =
    new Map();

  try {
    await guild.members.fetch();
  } catch (error) {
    console.error(
      'members.fetch failed:',
      error.message
    );
  }

  const membersById =
    new Map();

  for (
    const member
    of guild.members.cache.values()
  ) {
    if (
      !member.user.bot
    ) {
      membersById.set(
        member.id,
        member
      );
    }
  }

  const channel =
    await client.channels
      .fetch(
        POSITION_CHANNEL_ID
      )
      .catch(error => {
        console.error(
          'position channel failed:',
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

  let before = null;

  /*
    Newest messages first.
    The first position found for a
    player wins, so the newest
    position replaces old ones.
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
            'position messages failed:',
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

      const parsed =
        extractPositionFromMessage(
          message,
          membersById
        );

      if (
        parsed &&
        !result.has(
          parsed.userId
        )
      ) {

        result.set(
          parsed.userId,
          parsed.position
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

function createSession(
  guild,
  channel,
  size
) {
  const id =
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

  const slots =
    FORMATIONS[size].map(
      (point, index) => ({
        index,
        x: point.x,
        y: point.y,
        originalX:
          point.x,
        originalY:
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
    positions: {},
  };

  sessions.set(
    id,
    session
  );

  return session;
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
            member.displayName ||
            member.user.username,

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
            session.positions[
              member.id
            ] ||
            'UNSET',
        })
      ),
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

*{box-sizing:border-box}

html,body{
margin:0;
background:#070b12;
color:#fff;
font-family:Arial,Helvetica,sans-serif;
height:100%
}

body{overflow:hidden}

.app{
height:100dvh;
display:flex;
flex-direction:column
}

.top{
height:62px;
display:flex;
align-items:center;
gap:10px;
padding:8px 12px;
background:#0d1420;
border-bottom:1px solid #202a3a
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
background:repeating-linear-gradient(
to bottom,
#16813e 0,
#16813e 8.33%,
#1a8c45 8.33%,
#1a8c45 16.66%
);
border:4px solid rgba(255,255,255,.9);
box-shadow:0 20px 50px rgba(0,0,0,.35);
touch-action:none;
overflow:hidden
}

.pitch:before{
content:"";
position:absolute;
inset:0;
background:linear-gradient(
transparent 49.7%,
rgba(255,255,255,.9) 49.7%,
rgba(255,255,255,.9) 50.3%,
transparent 50.3%
)
}

.pitch:after{
content:"";
position:absolute;
width:22%;
aspect-ratio:1;
border:3px solid rgba(255,255,255,.9);
border-radius:50%;
left:39%;
top:39%
}

.line-top,
.line-bottom{
position:absolute;
left:24%;
width:52%;
height:14%;
border:3px solid rgba(255,255,255,.9)
}

.line-top{
top:0;
border-top:0
}

.line-bottom{
bottom:0;
border-bottom:0
}

.goal-top,
.goal-bottom{
position:absolute;
left:40%;
width:20%;
height:3%;
background:rgba(255,255,255,.9)
}

.goal-top{
top:-1px
}

.goal-bottom{
bottom:-1px
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
touch-action:none
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

.slot .initial{
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

.empty .circle{
opacity:.95
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

.hint{
font-size:12px;
opacity:.55;
margin-top:8px
}

@media(max-width:900px){

.main{
grid-template-columns:1fr;
grid-template-rows:minmax(0,1fr) 38dvh
}

.pitch{
width:min(65vw,430px)
}

.side{
min-height:0
}

.players{
padding-bottom:70px
}

}

@media(max-width:520px){

.top{
height:58px
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
onclick="clearSelection()"
>
Clear
</button>

<button
class="btn"
onclick="positionSelected()"
>
Position
</button>

<button
class="btn"
onclick="benchSelected()"
>
Bench
</button>

<button
class="btn primary"
onclick="finish()"
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

<div
class="players"
id="players"
></div>

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
Position refreshes every minute
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

<div class="hint">
Positions are checked from Discord channel
${POSITION_CHANNEL_ID}.
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

const sid =
${JSON.stringify(sessionId)};

let state = null;
let selectedSlot = null;
let dragging = null;
let moved = false;

const pitch =
document.getElementById(
"pitch"
);

async function load(){

try{

const r =
await fetch(
"/api/session?id=" +
encodeURIComponent(
sid
)
);

if(!r.ok){

document.getElementById(
"sub"
).textContent =
"Session expired";

return;

}

state =
await r.json();

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

if(!state){
return;
}

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

const r =
await fetch(
"/api/session?id=" +
encodeURIComponent(
sid
)
);

if(!r.ok){
return;
}

state =
await r.json();

if(oldPlayer){

const slot =
state.slots.find(
s =>
s.playerId ===
oldPlayer
);

selectedSlot =
slot
? slot.index
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

function player(id){

return state.players.find(
p =>
p.id ===
id
) || null;

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
? player(
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

const ini =
document.createElement(
"div"
);

ini.className =
"initial";

ini.textContent =
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
ini
);

};

circle.appendChild(
img
);

}else{

circle.innerHTML =
'<span style="font-size:25px">+</span>';

}

const nm =
document.createElement(
"div"
);

nm.className =
"nm";

nm.textContent =
p
? p.name
: "EMPTY";

el.appendChild(
circle
);

el.appendChild(
nm
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
function(e){

startDrag(
e,
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

if(!state){
return;
}

const q =
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

const available =
state.players.filter(
p =>
!assigned.has(p.id) &&
!benched.has(p.id) &&
(
!q ||
p.name
.toLowerCase()
.includes(q) ||
p.position
.toLowerCase()
.includes(q)
)
);

const groups = {};

available.forEach(
p => {

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
k =>
groups[k]
),
...Object.keys(
groups
).filter(
k =>
!order.includes(k)
)
];

let html =
"";

keys.forEach(
pos => {

html +=
'<section class="player-section">' +
'<div class="section-title">' +
escapeClient(pos) +
'</div>';

groups[pos].forEach(
p => {

html +=
'<button class="player-row" onclick="pickPlayer(\\'' +
escapeClient(p.id) +
'\\')">' +

'<img src="' +
escapeClient(p.avatar) +
'" onerror="this.style.display=\\'none\\';this.nextElementSibling.style.display=\\'flex\\'" alt="">' +

'<span class="fallback-avatar">' +
escapeClient(
(
p.name ||
"?"
)
.slice(
0,
1
)
.toUpperCase()
) +
'</span>' +

'<span class="player-name">' +
escapeClient(
p.name
) +
'</span>' +

'<span class="mini-pos">' +
escapeClient(
p.position
) +
'</span>' +

'</button>';

}
);

html +=
"</section>";

}
);

document.getElementById(
"players"
).innerHTML =
html ||
'<div style="padding:12px;opacity:.6">No players found.</div>';

}

function escapeClient(
value
){

return String(
value == null
? ""
: value
)
.replace(
/&/g,
"&amp;"
)
.replace(
/</g,
"&lt;"
)
.replace(
/>/g,
"&gt;"
)
.replace(
/"/g,
"&quot;"
)
.replace(
/'/g,
"&#39;"
);

}

function renderBench(){

const box =
document.getElementById(
"bench"
);

let html =
"";

state.bench.forEach(
b => {

const p =
player(
b.playerId
);

if(!p){
return;
}

html +=
'<button class="bench-chip" onclick="restoreBench(\\'' +
escapeClient(
b.playerId
) +
'\\')">' +

'<img src="' +
escapeClient(
p.avatar
) +
'">' +

'<span>' +
escapeClient(
p.name
) +
'</span>' +

'</button>';

}
);

box.innerHTML =
html ||
'<span style="opacity:.5;font-size:12px">No bench players</span>';

}

async function pickPlayer(
id
){

let slot =
selectedSlot != null
? state.slots[
selectedSlot
]
: state.slots.find(
s =>
!s.playerId
);

if(!slot){

alert(
"No empty slot."
);

return;

}

try{

const r =
await fetch(
"/api/assign",
{
method:
"POST",
headers:{
"content-type":
"application/json"
},
body:
JSON.stringify({
id:
sid,
slotIndex:
slot.index,
playerId:
id
})
}
);

if(!r.ok){

const data =
await r.json()
.catch(
() => ({})
);

alert(
data.error ||
"Could not assign player."
);

return;

}

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
player(id);

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

function positionSelected(){

if(
selectedSlot ===
null
){

alert(
"Tap a player slot first."
);

return;

}

openPos(
selectedSlot
);

}

function openPos(
index
){

const slot =
state.slots[
index
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
player(
slot.playerId
);

if(!p){
return;
}

selectedSlot =
index;

document.getElementById(
"posTitle"
).textContent =
"Position for " +
p.name;

const positions = [
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
];

document.getElementById(
"posGrid"
).innerHTML =
positions.map(
pos =>
'<button class="pos-btn" onclick="setPos(\\'' +
pos +
'\\')">' +
pos +
'</button>'
).join("");

document.getElementById(
"posModal"
).classList.add(
"show"
);

}

function setPos(
pos
){

if(
selectedSlot ===
null
){
return;
}

state.slots =
state.slots.map(
slot =>
slot.index ===
selectedSlot
? {
...slot,
position:
pos
}
: slot
);

sync(
"/api/position",
{
slotIndex:
selectedSlot,
position:
pos
}
);

closePos();
renderPitch();

}

function closePos(){

document.getElementById(
"posModal"
).classList.remove(
"show"
);

}

async function sync(
url,
data
){

try{

await fetch(
url,
{
method:
"POST",
headers:{
"content-type":
"application/json"
},
body:
JSON.stringify({
id:
sid,
...data
})
}
);

}catch(error){

console.error(
error
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

await sync(
"/api/bench",
{
slotIndex:
selectedSlot,
playerId:
pid
}
);

state.bench =
[
...state.bench,
{
playerId:
pid,
originalSlot:
selectedSlot
}
];

slot.playerId =
null;

slot.position =
"";

selectedSlot =
null;

renderAll();

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

await sync(
"/api/restore",
{
playerId:
id,
slotIndex:
slot.index
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
player(id);

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

}

function startDrag(
event,
index
){

const el =
event.currentTarget;

const slot =
state.slots[
index
];

dragging =
{
index,
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

try{

el.setPointerCapture(
event.pointerId
);

}catch(error){}

el.onpointermove =
function(e){

moveDrag(e);

};

el.onpointerup =
function(){

endDrag();

};

el.onpointercancel =
function(){

endDrag();

};

}

function moveDrag(
event
){

if(!dragging){
return;
}

const rect =
pitch.getBoundingClientRect();

const dx =
(
event.clientX -
dragging.startX
) /
rect.width *
100;

const dy =
(
event.clientY -
dragging.startY
) /
rect.height *
100;

if(
Math.abs(dx) +
Math.abs(dy) >
2
){

dragging.moved =
true;

}

const grid =
2;

let x =
dragging.origX +
dx;

let y =
dragging.origY +
dy;

x =
Math.max(
4,
Math.min(
96,
Math.round(
x / grid
) * grid
)
);

y =
Math.max(
5,
Math.min(
95,
Math.round(
y / grid
) * grid
)
);

const slot =
state.slots[
dragging.index
];

slot.x =
x;

slot.y =
y;

const el =
pitch.querySelector(
'.slot[data-index="' +
dragging.index +
'"]'
);

if(el){

el.style.left =
x +
"%";

el.style.top =
y +
"%";

}

}

function endDrag(){

if(!dragging){
return;
}

const current =
dragging;

dragging =
null;

if(
current.moved
){

const slot =
state.slots[
current.index
];

sync(
"/api/move",
{
slotIndex:
slot.index,
x:
slot.x,
y:
slot.y
}
);

}

}

async function finish(){

if(
!confirm(
"Post this lineup to Discord?"
)
){
return;
}

try{

const response =
await fetch(
"/final",
{
method:
"POST",
headers:{
"content-type":
"application/json"
},
body:
JSON.stringify({
id:
sid
})
}
);

const result =
await response
.json()
.catch(
() => ({})
);

if(!response.ok){

alert(
result.error ||
"Failed to post lineup."
);

return;

}

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

async function imageToDataUri(
url
) {

  try {

    const response =
      await fetch(
        url,
        {
          headers:{
            'User-Agent':
              'NewcastleAssistant/1.0',
          },
        }
      );

    if(
      !response.ok
    ) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }

    const buffer =
      Buffer.from(
        await response.arrayBuffer()
      );

    const png =
      await sharp(
        buffer
      )
        .png()
        .resize(
          92,
          92,
          {
            fit:
              'cover',
          }
        )
        .toBuffer();

    return (
      'data:image/png;base64,' +
      png.toString(
        'base64'
      )
    );

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

  const width = 1200;
  const height = 1500;

  const pitchX = 250;
  const pitchY = 80;
  const pitchW = 700;
  const pitchH = 1050;

  const roster = [];

  const guild =
    await client.guilds
      .fetch(
        session.guildId
      )
      .catch(
        () => null
      );

  for (
    const slot
    of session.slots
  ) {

    if(
      !slot.playerId
    ) {

      roster.push({
        slot,
        member:
          null,
        avatar:
          null,
      });

      continue;
    }

    const member =
      guild
        ? await guild.members
            .fetch(
              slot.playerId
            )
            .catch(
              () => null
            )
        : null;

    const avatar =
      member
        ? await imageToDataUri(
            member.displayAvatarURL({
              extension:
                'png',
              size:
                128,
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
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
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
    '<text x="600" y="45" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="30" font-weight="800">' +
      'NEWCASTLE LINEUP' +
    '</text>'
  );

  svg.push(
    `<rect x="${pitchX}" y="${pitchY}" width="${pitchW}" height="${pitchH}" rx="20" fill="#188842" stroke="#fff" stroke-width="6"/>`
  );

  for(
    let i = 1;
    i < 12;
    i += 1
  ) {

    svg.push(
      `<rect x="${pitchX}" y="${pitchY + (pitchH / 12) * i}" width="${pitchW}" height="${pitchH / 12}" fill="${i % 2 ? '#188842' : '#1b9148'}" opacity=".95"/>`
    );

  }

  svg.push(
    `<line x1="${pitchX}" y1="${pitchY + pitchH / 2}" x2="${pitchX + pitchW}" y2="${pitchY + pitchH / 2}" stroke="#fff" stroke-width="5" opacity=".9"/>`
  );

  svg.push(
    `<circle cx="${pitchX + pitchW / 2}" cy="${pitchY + pitchH / 2}" r="70" fill="none" stroke="#fff" stroke-width="5"/>`
  );

  svg.push(
    `<rect x="${pitchX + pitchW * .25}" y="${pitchY}" width="${pitchW * .5}" height="${pitchH * .14}" fill="none" stroke="#fff" stroke-width="5"/>`
  );

  svg.push(
    `<rect x="${pitchX + pitchW * .25}" y="${pitchY + pitchH * .86}" width="${pitchW * .5}" height="${pitchH * .14}" fill="none" stroke="#fff" stroke-width="5"/>`
  );

  svg.push(
    `<rect x="${pitchX + pitchW * .40}" y="${pitchY - 2}" width="${pitchW * .20}" height="12" fill="#fff"/>`
  );

  svg.push(
    `<rect x="${pitchX + pitchW * .40}" y="${pitchY + pitchH - 10}" width="${pitchW * .20}" height="12" fill="#fff"/>`
  );

  for(
    const item
    of roster
  ) {

    const slot =
      item.slot;

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

    const r = 48;

    svg.push(
      `<circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="#fff" opacity=".95"/>`
    );

    if(
      item.avatar
    ) {

      svg.push(
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#666"/><image href="${item.avatar}" x="${cx-r}" y="${cy-r}" width="${r*2}" height="${r*2}" preserveAspectRatio="xMidYMid slice" clip-path="circle(${r}px at ${cx}px ${cy}px)"/>`
      );

    } else {

      svg.push(
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#666"/><text x="${cx}" y="${cy+15}" text-anchor="middle" fill="#fff" font-family="Arial" font-size="34" font-weight="900">+</text>`
      );

    }

    const name =
      item.member
        ? (
            item.member.displayName ||
            item.member.user.username
          )
        : 'EMPTY';

    svg.push(
      `<text x="${cx}" y="${cy+70}" text-anchor="middle" fill="#fff" font-family="Arial" font-size="18" font-weight="800">${escapeXml(name)}</text>`
    );

    if(
      slot.position
    ) {

      svg.push(
        `<text x="${cx}" y="${cy+92}" text-anchor="middle" fill="#d7e3ff" font-family="Arial" font-size="14" font-weight="700">${escapeXml(slot.position)}</text>`
      );

    }

  }

  svg.push(
    '<text x="600" y="1185" text-anchor="middle" fill="#fff" font-family="Arial" font-size="22" font-weight="800">BENCH</text>'
  );

  let bx = 150;
  let by = 1240;

  for(
    const b
    of session.bench
  ) {

    const member =
      guild
        ? await guild.members
            .fetch(
              b.playerId
            )
            .catch(
              () => null
            )
        : null;

    if(
      bx > 1000
    ) {

      bx = 150;
      by += 120;

    }

    svg.push(
      `<circle cx="${bx}" cy="${by}" r="38" fill="#fff"/>`
    );

    const avatar =
      member
        ? await imageToDataUri(
            member.displayAvatarURL({
              extension:
                'png',
              size:
                96,
            })
          )
        : null;

    if(
      avatar
    ) {

      svg.push(
        `<circle cx="${bx}" cy="${by}" r="34" fill="#666"/><image href="${avatar}" x="${bx-34}" y="${by-34}" width="68" height="68" preserveAspectRatio="xMidYMid slice"/>`
      );

    } else {

      svg.push(
        `<circle cx="${bx}" cy="${by}" r="34" fill="#666"/>`
      );

    }

    const name =
      member
        ? (
            member.displayName ||
            member.user.username
          )
        : 'Unknown';

    svg.push(
      `<text x="${bx}" y="${by+60}" text-anchor="middle" fill="#fff" font-family="Arial" font-size="16" font-weight="700">${escapeXml(name)}</text>`
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

async function getSessionMembers(
  session
) {

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

  const positionMap =
    await getPositionMap(
      guild
    );

  for(
    const member
    of members
  ) {

    session.positions[
      member.id
    ] =
      positionMap.get(
        member.id
      ) ||
      session.positions[
        member.id
      ] ||
      'UNSET';

  }

  return {
    guild,
    members,
  };
}

client.once(
  'ready',
  async () => {

    console.log(
      `Logged in as ${client.user.tag}`
    );

    const command =
      new SlashCommandBuilder()
        .setName(
          'lineup'
        )
        .setDescription(
          'Create a football lineup'
        )
        .addIntegerOption(
          option =>
            option
              .setName(
                'size'
              )
              .setDescription(
                'Team size'
              )
              .setRequired(
                false
              )
              .setMinValue(
                1
              )
              .setMaxValue(
                11
              )
        );

    try {

      const guild =
        client.guilds.cache.get(
          GUILD_ID
        );

      if(guild) {

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

    } catch(error) {

      console.error(
        'Command registration failed:',
        error
      );

    }

    /*
      Initial position scan.
    */
    try {

      const guild =
        client.guilds.cache.get(
          GUILD_ID
        );

      if(guild) {

        await guild.members
          .fetch();

        const map =
          await getPositionMap(
            guild
          );

        globalThis.__positionMap =
          map;

      }

    } catch(error) {

      console.error(
        'Initial position scan failed:',
        error
      );

    }

    /*
      Refresh players + positions
      every 60 seconds.
    */
    setInterval(
      async () => {

        try {

          const guild =
            client.guilds.cache.get(
              GUILD_ID
            );

          if(!guild){
            return;
          }

          await guild.members
            .fetch();

          const members =
            [
              ...guild.members.cache.values(),
            ].filter(
              member =>
                !member.user.bot
            );

          const map =
            await getPositionMap(
              guild
            );

          globalThis.__positionMap =
            map;

          const activeIds =
            new Set(
              members.map(
                member =>
                  member.id
              )
            );

          for(
            const session
            of sessions.values()
          ) {

            if(
              session.guildId !==
              guild.id
            ) {

              continue;

            }

            /*
              Remove players who left.
            */
            for(
              const slot
              of session.slots
            ) {

              if(
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

              /*
                Update position of
                players already on pitch.
              */
              if(
                slot.playerId
              ) {

                const position =
                  map.get(
                    slot.playerId
                  );

                if(position){

                  slot.position =
                    position;

                }

              }

            }

            /*
              Remove players who left
              from bench.
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
            activeIds.size +
            ' members, ' +
            map.size +
            ' positions.'
          );

        } catch(error) {

          console.error(
            '60-second refresh failed:',
            error
          );

        }

      },
      60000
    );

  }
);

client.on(
  'interactionCreate',
  async interaction => {

    if(
      !interaction.isChatInputCommand() ||
      interaction.commandName !==
        'lineup'
    ) {

      return;

    }

    try {

      const guild =
        interaction.guild;

      if(!guild) {

        return interaction.reply({
          content:
            'Use this command inside a server.',
          ephemeral:true,
        });

      }

      const size =
        interaction.options
          .getInteger(
            'size'
          );

      if(size) {

        const session =
          createSession(
            guild,
            interaction.channel,
            size
          );

        const url =
          `${BASE_URL}/pitch?id=${encodeURIComponent(session.id)}`;

        return interaction.reply({
          content:
            `Open the lineup editor: ${url}`,
          ephemeral:true,
        });

      }

      const rows = [];

      for(
        let start = 1;
        start <= 11;
        start += 5
      ) {

        const row =
          new ActionRowBuilder();

        for(
          let n = start;
          n < start + 5 &&
          n <= 11;
          n += 1
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
        components:
          rows,
        ephemeral:true,
      });

    } catch(error) {

      console.error(
        'lineup command error:',
        error
      );

      if(
        !interaction.replied &&
        !interaction.deferred
      ) {

        await interaction.reply({
          content:
            'Could not start lineup editor.',
          ephemeral:true,
        })
        .catch(
          () => null
        );

      }

    }

  }
);

client.on(
  'interactionCreate',
  async interaction => {

    if(
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

    if(
      size < 1 ||
      size > 11
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
        `${BASE_URL}/pitch?id=${encodeURIComponent(session.id)}`;

      await interaction.update({
        content:
          `Open the lineup editor: ${url}`,
        components:[],
      });

    } catch(error) {

      console.error(
        'size button error:',
        error
      );

      await interaction.update({
        content:
          'Could not create the lineup editor.',
        components:[],
      })
      .catch(
        () => null
      );

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

    const session =
      sessions.get(
        req.query.id
      );

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

    const session =
      sessions.get(
        req.query.id
      );

    if(!session){

      return res
        .status(404)
        .json({
          error:
            'Session not found',
        });

    }

    try {

      const {
        members,
      } =
        await getSessionMembers(
          session
        );

      return res.json(
        publicSession(
          session,
          members
        )
      );

    } catch(error) {

      console.error(
        'session api error:',
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
    } =
      req.body || {};

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

    const slot =
      session.slots.find(
        s =>
          s.index ===
          Number(
            slotIndex
          )
      );

    if(!slot){

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
          s.playerId ===
            playerId &&
          s.index !==
            slot.index
      );

    if(already){

      already.playerId =
        null;

      already.position =
        '';

    }

    session.bench =
      session.bench.filter(
        b =>
          b.playerId !==
          playerId
      );

    slot.playerId =
      playerId;

    const positionMap =
      globalThis.__positionMap ||
      new Map();

    const knownPosition =
      positionMap.get(
        playerId
      );

    if(
      knownPosition
    ) {

      slot.position =
        knownPosition;

      session.positions[
        playerId
      ] =
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
    } =
      req.body || {};

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

    const slot =
      session.slots.find(
        s =>
          s.index ===
          Number(
            slotIndex
          )
      );

    if(!slot){

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
      ).slice(
        0,
        12
      );

    if(
      slot.playerId
    ){

      session.positions[
        slot.playerId
      ] =
        slot.position;

      const map =
        globalThis.__positionMap ||
        new Map();

      map.set(
        slot.playerId,
        slot.position
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
    } =
      req.body || {};

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

    const slot =
      session.slots.find(
        s =>
          s.index ===
          Number(
            slotIndex
          )
      );

    if(!slot){

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
    } =
      req.body || {};

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

    const slot =
      session.slots.find(
        s =>
          s.index ===
          Number(
            slotIndex
          )
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
            'Player is not in that slot',
        });

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
    } =
      req.body || {};

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

    const b =
      session.bench.find(
        entry =>
          entry.playerId ===
          playerId
      );

    if(!b){

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
          Number(
            slotIndex
          )
      );

    if(
      !slot ||
      slot.playerId
    ){

      return res
        .status(400)
        .json({
          error:
            'Slot unavailable',
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

    const map =
      globalThis.__positionMap ||
      new Map();

    const position =
      map.get(
        playerId
      );

    if(position){

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

    const session =
      sessions.get(
        req.body?.id
      );

    if(!session){

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

      if(
        !channel?.isTextBased()
      ){

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
        files:[
          file,
        ],
      });

      return res.json({
        ok:true,
      });

    } catch(error) {

      console.error(
        'final post failed:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            `Failed to post lineup: ${error.message}`,
        });

    }

  }
);

setInterval(
  () => {

    const cutoff =
      Date.now() -
      6 * 60 * 60 * 1000;

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
  error => {

    console.error(
      'Discord login failed:',
      error
    );

    process.exit(1);

  }
);
