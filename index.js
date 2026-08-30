const http = require("http");
const crypto = require("crypto");
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const PORT = Number(process.env.PORT) || 3000;

if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

/*
===========================================================
LINEUP SESSIONS
===========================================================
*/

const sessions = new Map();

function makeId() {
  return crypto.randomBytes(18).toString("hex");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/*
===========================================================
POSITIONS
===========================================================
*/

const formationPositions = {
  1: [
    ["GK", 50, 88]
  ],

  2: [
    ["GK", 50, 88],
    ["ST", 50, 20]
  ],

  3: [
    ["GK", 50, 88],
    ["ST", 35, 20],
    ["ST", 65, 20]
  ],

  4: [
    ["GK", 50, 88],
    ["LB", 25, 55],
    ["RB", 75, 55],
    ["ST", 50, 18]
  ],

  5: [
    ["GK", 50, 88],
    ["LB", 18, 58],
    ["CB", 50, 58],
    ["RB", 82, 58],
    ["ST", 50, 18]
  ],

  6: [
    ["GK", 50, 88],
    ["LB", 18, 60],
    ["CB", 38, 60],
    ["CB", 62, 60],
    ["RB", 82, 60],
    ["ST", 50, 18]
  ],

  7: [
    ["GK", 50, 88],
    ["LB", 15, 62],
    ["CB", 38, 62],
    ["CB", 62, 62],
    ["RB", 85, 62],
    ["LW", 32, 30],
    ["ST", 68, 30]
  ],

  8: [
    ["GK", 50, 88],
    ["LB", 12, 62],
    ["CB", 35, 65],
    ["CB", 65, 65],
    ["RB", 88, 62],
    ["LM", 25, 35],
    ["RM", 75, 35],
    ["ST", 50, 15]
  ],

  9: [
    ["GK", 50, 88],
    ["LB", 12, 65],
    ["CB", 30, 68],
    ["CB", 50, 68],
    ["CB", 70, 68],
    ["RB", 88, 65],
    ["LW", 25, 35],
    ["RW", 75, 35],
    ["ST", 50, 15]
  ],

  10: [
    ["GK", 50, 88],
    ["LB", 10, 67],
    ["CB", 28, 70],
    ["CB", 50, 70],
    ["CB", 72, 70],
    ["RB", 90, 67],
    ["LM", 22, 40],
    ["RM", 78, 40],
    ["LW", 35, 20],
    ["ST", 65, 20]
  ],

  11: [
    ["GK", 50, 90],
    ["LB", 10, 68],
    ["CB", 30, 72],
    ["CB", 50, 72],
    ["CB", 70, 72],
    ["RB", 90, 68],
    ["LM", 20, 45],
    ["CM", 40, 45],
    ["CM", 60, 45],
    ["RM", 80, 45],
    ["ST", 50, 15]
  ]
};

/*
===========================================================
CREATE SESSION
===========================================================
*/

function createSession(interaction, size) {
  const id = makeId();

  const positions = formationPositions[size];

  const roster = positions.map((position, index) => ({
    slot: index,
    position: position[0],
    x: position[1],
    y: position[2],
    userId: null,
    name: "",
    avatar: ""
  }));

  const session = {
    id,
    creatorId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    size,
    roster,
    finished: false,
    createdAt: Date.now()
  };

  sessions.set(id, session);

  return session;
}

/*
===========================================================
BASE URL
===========================================================
*/

function getBaseUrl() {
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, "");
  }

  return `http://localhost:${PORT}`;
}

/*
===========================================================
DISCORD READY
===========================================================
*/

client.once("ready", async () => {
  console.log(`✅ Logged into Discord as ${client.user.tag}`);
  console.log(`🌐 Website: ${getBaseUrl()}`);

  const command = new SlashCommandBuilder()
    .setName("lineup")
    .setDescription("Create a football lineup")
    .addIntegerOption(option =>
      option
        .setName("size")
        .setDescription("Choose the number of players")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(11)
    );

  try {
    await client.application.commands.set([command]);
    console.log("✅ /lineup registered successfully.");
  } catch (error) {
    console.error("❌ Failed to register /lineup:", error);
  }
});

/*
===========================================================
DISCORD INTERACTIONS
===========================================================
*/

client.on("interactionCreate", async interaction => {
  try {

    /*
    -------------------------------------------------------
    /lineup
    -------------------------------------------------------
    */

    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "lineup"
    ) {

      const size = interaction.options.getInteger("size");

      const session = createSession(interaction, size);

      const url =
        `${getBaseUrl()}/pitch?session=${session.id}`;

      const button = new ButtonBuilder()
        .setLabel("⚽ Open Lineup Editor")
        .setStyle(ButtonStyle.Link)
        .setURL(url);

      const row =
        new ActionRowBuilder()
          .addComponents(button);

      await interaction.reply({
        content:
          `⚽ **${size}v${size} LINEUP**\n\n` +
          `Your private lineup editor is ready.\n` +
          `Only **you** can edit this lineup.\n\n` +
          `Click below to open the pitch.`,
        components: [row],
        ephemeral: true
      });

      return;
    }

    /*
    -------------------------------------------------------
    FINISH BUTTON
    -------------------------------------------------------
    */

    if (
      interaction.isButton() &&
      interaction.customId.startsWith("finish_")
    ) {

      const sessionId =
        interaction.customId.replace("finish_", "");

      const session =
        sessions.get(sessionId);

      if (!session) {
        return interaction.reply({
          content: "❌ This lineup no longer exists.",
          ephemeral: true
        });
      }

      if (interaction.user.id !== session.creatorId) {
        return interaction.reply({
          content:
            "❌ Only the person who started the lineup can finish it.",
          ephemeral: true
        });
      }

      session.finished = true;

      const url =
        `${getBaseUrl()}/final?session=${session.id}`;

      const filled =
        session.roster.filter(player => player.userId);

      const lines =
        filled.map(player =>
          `**${player.position}** — ${player.name}`
        );

      await interaction.reply({
        content:
          `🏁 **FINAL LINEUP**\n\n` +
          `${lines.join("\n") || "No players assigned."}\n\n` +
          `🔗 ${url}`,
        ephemeral: false
      });

      return;
    }

  } catch (error) {

    console.error("❌ Interaction error:", error);

    if (!interaction.replied && !interaction.deferred) {

      await interaction.reply({
        content: "❌ Something went wrong.",
        ephemeral: true
      });

    }
  }
});

/*
===========================================================
WEB SERVER
===========================================================
*/

const server = http.createServer(async (req, res) => {

  try {

    const url = new URL(
      req.url,
      `http://${req.headers.host || "localhost"}`
    );

    /*
    -------------------------------------------------------
    HEALTH CHECK
    -------------------------------------------------------
    */

    if (url.pathname === "/health") {

      return sendJson(res, 200, {
        online: true,
        discord: client.isReady(),
        bot: client.user
          ? client.user.tag
          : null,
        port: PORT
      });

    }

    /*
    -------------------------------------------------------
    PITCH
    -------------------------------------------------------
    */

    if (url.pathname === "/pitch") {

      const sessionId =
        url.searchParams.get("session");

      const session =
        sessions.get(sessionId);

      if (!session) {

        return sendHtml(
          res,
          404,
          errorPage("Lineup not found.")
        );

      }

      return sendHtml(
        res,
        200,
        pitchPage(session)
      );

    }

    /*
    -------------------------------------------------------
    FINAL
    -------------------------------------------------------
    */

    if (url.pathname === "/final") {

      const sessionId =
        url.searchParams.get("session");

      const session =
        sessions.get(sessionId);

      if (!session || !session.finished) {

        return sendHtml(
          res,
          404,
          errorPage("This lineup has not been finished.")
        );

      }

      return sendHtml(
        res,
        200,
        finalPage(session)
      );

    }

    /*
    -------------------------------------------------------
    SESSION API
    -------------------------------------------------------
    */

    if (
      url.pathname === "/api/session" &&
      req.method === "GET"
    ) {

      const sessionId =
        url.searchParams.get("session");

      const session =
        sessions.get(sessionId);

      if (!session) {

        return sendJson(res, 404, {
          error: "Session not found"
        });

      }

      const guild =
        client.guilds.cache.get(session.guildId);

      let players = [];

      if (guild) {

        try {

          const members =
            await guild.members.fetch();

          players =
            members
              .filter(member => !member.user.bot)
              .map(member => ({
                id: member.user.id,
                name: member.displayName,
                username: member.user.username,
                avatar:
                  member.user.displayAvatarURL({
                    extension: "png",
                    size: 128
                  })
              }));

        } catch (error) {

          console.error(
            "❌ Member fetch failed:",
            error
          );

        }
      }

      return sendJson(res, 200, {
        session: {
          id: session.id,
          creatorId: session.creatorId,
          size: session.size,
          finished: session.finished,
          roster: session.roster
        },
        players
      });

    }

    /*
    -------------------------------------------------------
    ASSIGN PLAYER
    -------------------------------------------------------
    */

    if (
      url.pathname === "/api/assign" &&
      req.method === "POST"
    ) {

      const body =
        await readBody(req);

      const session =
        sessions.get(body.session);

      if (!session) {

        return sendJson(res, 404, {
          error: "Session not found"
        });

      }

      if (session.finished) {

        return sendJson(res, 403, {
          error: "Lineup already finished"
        });

      }

      const slot =
        session.roster[Number(body.slot)];

      if (!slot) {

        return sendJson(res, 400, {
          error: "Invalid slot"
        });

      }

      if (!body.userId) {

        return sendJson(res, 400, {
          error: "Player ID is required"
        });

      }

      const guild =
        client.guilds.cache.get(session.guildId);

      if (!guild) {

        return sendJson(res, 500, {
          error: "Discord server unavailable"
        });

      }

      let member;

      try {

        member =
          await guild.members.fetch(body.userId);

      } catch {

        return sendJson(res, 404, {
          error: "Player not found in the Discord server"
        });

      }

      if (!member || member.user.bot) {

        return sendJson(res, 404, {
          error: "Player not found"
        });

      }

      slot.userId =
        member.user.id;

      slot.name =
        member.displayName;

      slot.avatar =
        member.user.displayAvatarURL({
          extension: "png",
          size: 256
        });

      return sendJson(res, 200, {
        success: true,
        slot
      });

    }

    /*
    -------------------------------------------------------
    POSITION
    -------------------------------------------------------
    */

    if (
      url.pathname === "/api/position" &&
      req.method === "POST"
    ) {

      const body =
        await readBody(req);

      const session =
        sessions.get(body.session);

      if (!session) {

        return sendJson(res, 404, {
          error: "Session not found"
        });

      }

      if (session.finished) {

        return sendJson(res, 403, {
          error: "Lineup already finished"
        });

      }

      const slot =
        session.roster[Number(body.slot)];

      if (!slot) {

        return sendJson(res, 400, {
          error: "Invalid slot"
        });

      }

      const position =
        String(body.position || "")
          .trim()
          .slice(0, 12);

      if (!position) {

        return sendJson(res, 400, {
          error: "Position is required"
        });

      }

      slot.position =
        position;

      return sendJson(res, 200, {
        success: true,
        slot
      });

    }

    /*
    -------------------------------------------------------
    MOVE PLAYER
    -------------------------------------------------------
    */

    if (
      url.pathname === "/api/move" &&
      req.method === "POST"
    ) {

      const body =
        await readBody(req);

      const session =
        sessions.get(body.session);

      if (!session) {

        return sendJson(res, 404, {
          error: "Session not found"
        });

      }

      if (session.finished) {

        return sendJson(res, 403, {
          error: "Lineup already finished"
        });

      }

      const slot =
        session.roster[Number(body.slot)];

      if (!slot) {

        return sendJson(res, 400, {
          error: "Invalid slot"
        });

      }

      const x =
        Number(body.x);

      const y =
        Number(body.y);

      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y)
      ) {

        return sendJson(res, 400, {
          error: "Invalid coordinates"
        });

      }

      slot.x =
        Math.max(
          4,
          Math.min(96, x)
        );

      slot.y =
        Math.max(
          4,
          Math.min(96, y)
        );

      return sendJson(res, 200, {
        success: true,
        slot
      });

    }

    /*
    -------------------------------------------------------
    FINISH LINEUP
    -------------------------------------------------------
    */

    if (
      url.pathname === "/api/finish" &&
      req.method === "POST"
    ) {

      const body =
        await readBody(req);

      const session =
        sessions.get(body.session);

      if (!session) {

        return sendJson(res, 404, {
          error: "Session not found"
        });

      }

      if (session.finished) {

        return sendJson(res, 400, {
          error: "Lineup already finished"
        });

      }

      session.finished = true;

      const finalUrl =
        `${getBaseUrl()}/final?session=${session.id}`;

      return sendJson(res, 200, {
        success: true,
        url: finalUrl
      });

    }

    /*
    -------------------------------------------------------
    404
    -------------------------------------------------------
    */

    return sendHtml(
      res,
      404,
      errorPage("Page not found.")
    );

  } catch (error) {

    console.error("❌ HTTP error:", error);

    return sendJson(
      res,
      500,
      {
        error: "Internal server error"
      }
    );

  }

});

/*
===========================================================
START WEB SERVER
===========================================================
*/

server.listen(PORT, "0.0.0.0", () => {

  console.log(
    `🌐 Web server running on 0.0.0.0:${PORT}`
  );

});

/*
===========================================================
DISCORD LOGIN
===========================================================
*/

client.login(TOKEN)
  .then(() => {
    console.log("🔌 Discord login successful.");
  })
  .catch(error => {

    console.error(
      "❌ Discord login failed:",
      error
    );

    process.exit(1);

  });

/*
===========================================================
HELPERS
===========================================================
*/

function sendHtml(res, status, html) {

  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });

  res.end(html);

}

function sendJson(res, status, data) {

  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });

  res.end(
    JSON.stringify(data)
  );

}

function readBody(req) {

  return new Promise((resolve, reject) => {

    let data = "";

    req.on("data", chunk => {

      data += chunk;

      if (data.length > 1000000) {

        reject(
          new Error("Request too large")
        );

        req.destroy();

      }

    });

    req.on("end", () => {

      if (!data) {
        resolve({});
        return;
      }

      try {

        resolve(
          JSON.parse(data)
        );

      } catch {

        resolve({});

      }

    });

    req.on("error", reject);

  });

}

function errorPage(message) {

  return `
<!DOCTYPE html>
<html>

<head>

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>Lineup</title>

<style>

body{
  margin:0;
  background:#101318;
  color:white;
  font-family:Arial,sans-serif;
  display:flex;
  justify-content:center;
  align-items:center;
  min-height:100vh;
}

.box{
  background:#191e26;
  padding:30px;
  border-radius:18px;
  text-align:center;
}

</style>

</head>

<body>

<div class="box">

<h1>⚽ Lineup</h1>

<p>${escapeHtml(message)}</p>

</div>

</body>

</html>
`;

}

/*
===========================================================
PITCH PAGE
===========================================================
*/

function pitchPage(session) {

  const safeId =
    escapeHtml(session.id);

  return `
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1,maximum-scale=1"
>

<title>Football Lineup</title>

<style>

*{
  box-sizing:border-box;
}

body{
  margin:0;
  background:#0d1117;
  color:white;
  font-family:Arial,Helvetica,sans-serif;
  overflow-x:hidden;
}

.top{
  position:sticky;
  top:0;
  z-index:20;
  background:#11161d;
  border-bottom:1px solid #252d38;
  padding:14px 18px;
  display:flex;
  justify-content:space-between;
  align-items:center;
}

.title{
  font-weight:800;
  font-size:20px;
}

.subtitle{
  color:#8f9aaa;
  font-size:12px;
  margin-top:3px;
}

.finish{
  border:0;
  border-radius:10px;
  background:#27ae60;
  color:white;
  padding:11px 17px;
  font-weight:800;
  cursor:pointer;
}

.finish:disabled{
  opacity:.6;
  cursor:not-allowed;
}

.layout{
  display:flex;
  gap:18px;
  padding:18px;
  max-width:1450px;
  margin:auto;
}

.pitchWrap{
  flex:1;
  display:flex;
  justify-content:center;
}

.pitch{
  width:min(700px,94vw);
  aspect-ratio:68/105;
  position:relative;
  border-radius:18px;
  overflow:hidden;

  background:
    repeating-linear-gradient(
      0deg,
      #238b4d 0px,
      #238b4d 70px,
      #269653 70px,
      #269653 140px
    );

  box-shadow:
    0 25px 70px rgba(0,0,0,.5),
    inset 0 0 0 2px rgba(255,255,255,.12);
}

.line{
  position:absolute;
  border:2px solid rgba(255,255,255,.8);
}

.outer{
  inset:3%;
}

.half{
  left:3%;
  right:3%;
  top:50%;
  border-top:2px solid rgba(255,255,255,.8);
}

.circle{
  position:absolute;
  width:18%;
  aspect-ratio:1;
  left:41%;
  top:41%;
  border:2px solid rgba(255,255,255,.8);
  border-radius:50%;
}

.boxTop{
  position:absolute;
  width:45%;
  height:15%;
  left:27.5%;
  top:3%;
  border:2px solid rgba(255,255,255,.8);
}

.boxBottom{
  position:absolute;
  width:45%;
  height:15%;
  left:27.5%;
  bottom:3%;
  border:2px solid rgba(255,255,255,.8);
}

.player{
  position:absolute;
  width:70px;
  height:86px;
  transform:translate(-50%,-50%);
  cursor:pointer;
  user-select:none;
  touch-action:none;
  text-align:center;
  z-index:5;
}

.avatar{
  width:52px;
  height:52px;
  margin:auto;
  border-radius:50%;
  background:#747b84;
  border:3px solid rgba(255,255,255,.95);
  overflow:hidden;
  display:flex;
  justify-content:center;
  align-items:center;
  font-weight:900;
  font-size:22px;
}

.avatar img{
  width:100%;
  height:100%;
  object-fit:cover;
}

.playerName{
  font-size:11px;
  font-weight:800;
  margin-top:3px;
  white-space:nowrap;
  text-shadow:0 2px 4px #000;
}

.position{
  color:#d8f7e2;
  font-size:10px;
  font-weight:700;
  text-shadow:0 2px 4px #000;
}

.panel{
  width:320px;
  background:#151a21;
  border:1px solid #252d38;
  border-radius:16px;
  padding:16px;
  height:max-content;
}

.panel h2{
  margin:0 0 12px;
  font-size:17px;
}

.info{
  background:#1c232c;
  border-radius:10px;
  padding:11px;
  color:#aab4c2;
  font-size:13px;
  line-height:1.5;
  margin-bottom:12px;
}

.tool{
  width:100%;
  padding:12px;
  border:0;
  border-radius:10px;
  background:#252e39;
  color:white;
  margin-top:8px;
  font-weight:700;
  cursor:pointer;
}

.tool.active{
  background:#2563eb;
}

.selected{
  outline:3px solid #f1c40f;
  border-radius:12px;
}

.playerList{
  max-height:430px;
  overflow:auto;
  margin-top:12px;
}

.playerOption{
  display:flex;
  align-items:center;
  gap:10px;
  padding:9px;
  border-radius:9px;
  cursor:pointer;
}

.playerOption:hover{
  background:#252e39;
}

.playerOption img{
  width:36px;
  height:36px;
  border-radius:50%;
}

.playerOption span{
  font-size:13px;
  font-weight:700;
}

.hidden{
  display:none!important;
}

@media(max-width:900px){

  .layout{
    flex-direction:column;
  }

  .panel{
    width:100%;
  }

  .pitch{
    width:96vw;
  }

}

</style>

</head>

<body>

<div class="top">

<div>

<div class="title">
⚽ Football Lineup
</div>

<div class="subtitle">
${session.size}v${session.size} • Private editor
</div>

</div>

<button
  class="finish"
  onclick="finishLineup()"
>
✓ FINISH LINEUP
</button>

</div>

<div class="layout">

<div class="pitchWrap">

<div
  class="pitch"
  id="pitch"
>

<div class="line outer"></div>

<div class="half"></div>

<div class="circle"></div>

<div class="boxTop"></div>

<div class="boxBottom"></div>

</div>

</div>

<div class="panel">

<h2>
Lineup Controls
</h2>

<div class="info">

Click a grey circle to choose a player.<br>

Click <b>Position</b> to type their position.<br>

Click <b>Move</b>, then drag them anywhere.<br>

Double-click the player to stop moving.

</div>

<button
  class="tool"
  id="moveButton"
  onclick="toggleMove()"
>
↔ Move Player
</button>

<button
  class="tool"
  onclick="setPosition()"
>
⚽ Position
</button>

<div
  id="selectedText"
  class="info"
>
No player selected.
</div>

<div
  id="playerList"
  class="playerList hidden"
></div>

</div>

</div>

<script>

const SESSION =
  "${safeId}";

let state = null;
let players = [];
let selectedSlot = null;
let moving = false;
let dragging = false;

async function loadData(){

  try{

    const response =
      await fetch(
        "/api/session?session=" +
        encodeURIComponent(SESSION)
      );

    const data =
      await response.json();

    if(data.error){

      alert(data.error);
      return;

    }

    state =
      data.session;

    players =
      data.players || [];

    drawPitch();

  }catch(error){

    console.error(error);

    alert(
      "Could not connect to the lineup server."
    );

  }

}

function drawPitch(){

  const pitch =
    document.getElementById("pitch");

  pitch
    .querySelectorAll(".player")
    .forEach(el =>
      el.remove()
    );

  state.roster.forEach(
    (slot,index)=>{

      const player =
        document.createElement("div");

      player.className =
        "player";

      player.dataset.slot =
        index;

      player.style.left =
        slot.x + "%";

      player.style.top =
        slot.y + "%";

      if(index === selectedSlot){

        player.classList.add(
          "selected"
        );

      }

      let avatar = "";

      if(slot.avatar){

        avatar =
          '<img src="' +
          escapeHtml(slot.avatar) +
          '">';

      }else{

        avatar =
          '<span>?</span>';

      }

      player.innerHTML =

        '<div class="avatar">' +
        avatar +
        '</div>' +

        '<div class="position">' +
        escapeHtml(slot.position) +
        '</div>' +

        '<div class="playerName">' +
        escapeHtml(
          slot.name ||
          "Select Player"
        ) +
        '</div>';

      player.addEventListener(
        "click",
        event => {

          event.stopPropagation();

          selectSlot(index);

          if(!moving){

            showPlayers();

          }

        }
      );

      player.addEventListener(
        "dblclick",
        event => {

          event.stopPropagation();

          moving = false;
          dragging = false;

          document
            .getElementById(
              "moveButton"
            )
            .classList.remove(
              "active"
            );

          document
            .getElementById(
              "moveButton"
            )
            .textContent =
              "↔ Move Player";

        }
      );

      player.addEventListener(
        "pointerdown",
        event => {

          if(!moving) return;

          event.preventDefault();

          selectSlot(index);

          dragging = true;

          player.setPointerCapture(
            event.pointerId
          );

        }
      );

      player.addEventListener(
        "pointermove",
        event => {

          if(
            !moving ||
            !dragging
          ) return;

          const rect =
            pitch.getBoundingClientRect();

          let x =
            (
              (event.clientX - rect.left) /
              rect.width
            ) * 100;

          let y =
            (
              (event.clientY - rect.top) /
              rect.height
            ) * 100;

          x =
            Math.max(
              4,
              Math.min(96,x)
            );

          y =
            Math.max(
              4,
              Math.min(96,y)
            );

          player.style.left =
            x + "%";

          player.style.top =
            y + "%";

          state.roster[index].x =
            x;

          state.roster[index].y =
            y;

        }
      );

      player.addEventListener(
        "pointerup",
        async () => {

          if(
            !moving ||
            !dragging
          ) return;

          dragging = false;

          await saveMove(index);

        }
      );

      pitch.appendChild(player);

    }
  );

}

function selectSlot(index){

  selectedSlot =
    index;

  const slot =
    state.roster[index];

  document
    .getElementById(
      "selectedText"
    )
    .innerHTML =
      "<b>Selected:</b> " +
      escapeHtml(
        slot.name ||
        "Empty slot"
      ) +
      "<br><b>Position:</b> " +
      escapeHtml(
        slot.position
      );

  drawPitch();

}

function showPlayers(){

  const list =
    document.getElementById(
      "playerList"
    );

  list.classList.remove(
    "hidden"
  );

  list.innerHTML = "";

  if(!players.length){

    list.innerHTML =
      "<div class='info'>" +
      "No Discord members found." +
      "</div>";

    return;

  }

  players.forEach(
    player => {

      const item =
        document.createElement(
          "div"
        );

      item.className =
        "playerOption";

      item.innerHTML =

        '<img src="' +
        escapeHtml(
          player.avatar
        ) +
        '">' +

        '<span>' +
        escapeHtml(
          player.name
        ) +
        '</span>';

      item.onclick =
        async () => {

          if(
            selectedSlot === null
          ) return;

          await assignPlayer(
            selectedSlot,
            player.id
          );

          list.classList.add(
            "hidden"
          );

        };

      list.appendChild(item);

    }
  );

}

async function assignPlayer(
  slot,
  userId
){

  try{

    const response =
      await fetch(
        "/api/assign",
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              session:SESSION,
              slot:slot,
              userId:userId
            })

        }
      );

    const data =
      await response.json();

    if(data.error){

      alert(data.error);
      return;

    }

    state.roster[slot] =
      data.slot;

    drawPitch();

  }catch(error){

    console.error(error);

    alert(
      "Failed to assign player."
    );

  }

}

function setPosition(){

  if(
    selectedSlot === null
  ){

    alert(
      "Select a player first."
    );

    return;

  }

  const current =
    state.roster[
      selectedSlot
    ].position;

  const position =
    prompt(
      "Type the position for this player:",
      current
    );

  if(position === null)
    return;

  savePosition(
    selectedSlot,
    position
  );

}

async function savePosition(
  slot,
  position
){

  try{

    const response =
      await fetch(
        "/api/position",
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              session:SESSION,
              slot:slot,
              position:position
            })

        }
      );

    const data =
      await response.json();

    if(data.error){

      alert(data.error);
      return;

    }

    state.roster[slot] =
      data.slot;

    drawPitch();

  }catch(error){

    console.error(error);

    alert(
      "Failed to save position."
    );

  }

}

function toggleMove(){

  if(
    selectedSlot === null
  ){

    alert(
      "Select a player first."
    );

    return;

  }

  moving =
    !moving;

  const button =
    document.getElementById(
      "moveButton"
    );

  button.classList.toggle(
    "active",
    moving
  );

  button.textContent =
    moving
      ? "✓ Moving — double-click to stop"
      : "↔ Move Player";

}

async function saveMove(slot){

  const player =
    state.roster[slot];

  try{

    const response =
      await fetch(
        "/api/move",
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              session:SESSION,
              slot:slot,
              x:player.x,
              y:player.y
            })

        }
      );

    const data =
      await response.json();

    if(data.error){

      console.error(
        data.error
      );

    }

  }catch(error){

    console.error(
      "Move save failed:",
      error
    );

  }

}

async function finishLineup(){

  const empty =
    state.roster.filter(
      player =>
        !player.userId
    );

  if(empty.length){

    const yes =
      confirm(
        empty.length +
        " slot(s) are still empty. Finish anyway?"
      );

    if(!yes) return;

  }

  const button =
    document.querySelector(
      ".finish"
    );

  button.disabled =
    true;

  button.textContent =
    "Finishing...";

  try{

    const response =
      await fetch(
        "/api/finish",
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              session:SESSION
            })

        }
      );

    const data =
      await response.json();

    if(data.error){

      alert(data.error);

      button.disabled =
        false;

      button.textContent =
        "✓ FINISH LINEUP";

      return;

    }

    window.location.href =
      data.url ||
      (
        "/final?session=" +
        encodeURIComponent(
          SESSION
        )
      );

  }catch(error){

    console.error(error);

    alert(
      "Could not finish lineup."
    );

    button.disabled =
      false;

    button.textContent =
      "✓ FINISH LINEUP";

  }

}

function escapeHtml(value){

  return String(
    value || ""
  )
  .replaceAll(
    "&",
    "&amp;"
  )
  .replaceAll(
    "<",
    "&lt;"
  )
  .replaceAll(
    ">",
    "&gt;"
  )
  .replaceAll(
    '"',
    "&quot;"
  )
  .replaceAll(
    "'",
    "&#039;"
  );

}

loadData();

</script>

</body>

</html>
`;

}

/*
===========================================================
FINAL PAGE
===========================================================
*/

function finalPage(session){

  return `
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>Final Lineup</title>

<style>

body{
  margin:0;
  background:#0d1117;
  color:white;
  font-family:Arial,sans-serif;
}

.header{
  padding:22px;
  text-align:center;
}

.pitch{
  width:min(700px,94vw);
  aspect-ratio:68/105;
  margin:auto;
  position:relative;
  border-radius:18px;
  overflow:hidden;

  background:
    repeating-linear-gradient(
      0deg,
      #238b4d 0px,
      #238b4d 70px,
      #269653 70px,
      #269653 140px
    );
}

.outer{
  position:absolute;
  inset:3%;
  border:2px solid rgba(255,255,255,.8);
}

.half{
  position:absolute;
  left:3%;
  right:3%;
  top:50%;
  border-top:2px solid rgba(255,255,255,.8);
}

.circle{
  position:absolute;
  width:18%;
  aspect-ratio:1;
  left:41%;
  top:41%;
  border:2px solid rgba(255,255,255,.8);
  border-radius:50%;
}

.boxTop{
  position:absolute;
  width:45%;
  height:15%;
  left:27.5%;
  top:3%;
  border:2px solid rgba(255,255,255,.8);
}

.boxBottom{
  position:absolute;
  width:45%;
  height:15%;
  left:27.5%;
  bottom:3%;
  border:2px solid rgba(255,255,255,.8);
}

.player{
  position:absolute;
  transform:translate(-50%,-50%);
  width:70px;
  text-align:center;
}

.avatar{
  width:52px;
  height:52px;
  margin:auto;
  border-radius:50%;
  overflow:hidden;
  border:3px solid white;
  background:#777;
  display:flex;
  justify-content:center;
  align-items:center;
}

.avatar img{
  width:100%;
  height:100%;
  object-fit:cover;
}

.name{
  font-size:11px;
  font-weight:800;
  white-space:nowrap;
  text-shadow:0 2px 4px #000;
}

.pos{
  font-size:10px;
  font-weight:700;
  color:#d8f7e2;
  text-shadow:0 2px 4px #000;
}

</style>

</head>

<body>

<div class="header">

<h1>
⚽ FINAL LINEUP
</h1>

<p>
${session.size}v${session.size}
</p>

</div>

<div class="pitch">

<div class="outer"></div>

<div class="half"></div>

<div class="circle"></div>

<div class="boxTop"></div>

<div class="boxBottom"></div>

${session.roster.map(player => {

  const avatar =
    player.avatar
      ? `<img src="${escapeHtml(player.avatar)}">`
      : "";

  return `
  <div
    class="player"
    style="
      left:${Number(player.x)}%;
      top:${Number(player.y)}%;
    "
  >

    <div class="avatar">
      ${avatar}
    </div>

    <div class="pos">
      ${escapeHtml(player.position)}
    </div>

    <div class="name">
      ${escapeHtml(
        player.name ||
        "Unassigned"
      )}
    </div>

  </div>
  `;

}).join("")}

</div>

</body>

</html>
`;

}
