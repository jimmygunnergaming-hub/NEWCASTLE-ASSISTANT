const http = require("http");
const crypto = require("crypto");
const sharp = require("sharp");

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
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

function escapeSvg(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/* =========================
   FORMATIONS
========================= */

const formations = {
  1: [
    ["GK", 50, 88]
  ],

  2: [
    ["GK", 50, 88],
    ["ST", 50, 18]
  ],

  3: [
    ["GK", 50, 88],
    ["ST", 32, 20],
    ["ST", 68, 20]
  ],

  4: [
    ["GK", 50, 88],
    ["LB", 25, 60],
    ["RB", 75, 60],
    ["ST", 50, 18]
  ],

  5: [
    ["GK", 50, 88],
    ["LB", 18, 62],
    ["CB", 50, 62],
    ["RB", 82, 62],
    ["ST", 50, 18]
  ],

  6: [
    ["GK", 50, 88],
    ["LB", 15, 64],
    ["CB", 38, 64],
    ["CB", 62, 64],
    ["RB", 85, 64],
    ["ST", 50, 18]
  ],

  7: [
    ["GK", 50, 88],
    ["LB", 12, 64],
    ["CB", 34, 66],
    ["CB", 66, 66],
    ["RB", 88, 64],
    ["LW", 30, 35],
    ["ST", 68, 22]
  ],

  8: [
    ["GK", 50, 88],
    ["LB", 10, 65],
    ["CB", 30, 67],
    ["CB", 70, 67],
    ["RB", 90, 65],
    ["LM", 25, 38],
    ["RM", 75, 38],
    ["ST", 50, 18]
  ],

  9: [
    ["GK", 50, 88],
    ["LB", 9, 66],
    ["CB", 29, 69],
    ["CB", 50, 69],
    ["CB", 71, 69],
    ["RB", 91, 66],
    ["LW", 23, 37],
    ["RW", 77, 37],
    ["ST", 50, 17]
  ],

  10: [
    ["GK", 50, 88],
    ["LB", 8, 67],
    ["CB", 27, 70],
    ["CB", 50, 70],
    ["CB", 73, 70],
    ["RB", 92, 67],
    ["LM", 22, 43],
    ["RM", 78, 43],
    ["LW", 34, 23],
    ["ST", 66, 20]
  ],

  11: [
    ["GK", 50, 90],
    ["LB", 8, 69],
    ["CB", 28, 72],
    ["CB", 50, 72],
    ["CB", 72, 72],
    ["RB", 92, 69],
    ["LM", 17, 46],
    ["CM", 38, 47],
    ["CM", 62, 47],
    ["RM", 83, 46],
    ["ST", 50, 17]
  ]
};

/* =========================
   SESSION
========================= */

function createSession(interaction, size) {
  const positions = formations[size];

  const roster = positions.map((p, index) => ({
    slot: index,
    position: p[0],
    x: p[1],
    y: p[2],
    userId: null,
    name: "",
    avatar: ""
  }));

  const session = {
    id: makeId(),
    creatorId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    size,
    roster,
    finished: false,
    createdAt: Date.now()
  };

  sessions.set(session.id, session);

  return session;
}

function getBaseUrl() {
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, "");
  }

  return `http://localhost:${PORT}`;
}

/* =========================
   DISCORD
========================= */

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const command = new SlashCommandBuilder()
    .setName("lineup")
    .setDescription("Create a football lineup");

  try {
    await client.application.commands.set([command]);
    console.log("✅ /lineup registered.");
  } catch (error) {
    console.error("❌ Command registration error:", error);
  }
});

client.on("interactionCreate", async interaction => {
  try {

    /* =========================
       /LINEUP
    ========================= */

    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "lineup"
    ) {

      const buttons = [];

      for (let i = 1; i <= 11; i++) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`lineup_size_${i}`)
            .setLabel(`${i}v${i}`)
            .setStyle(
              i === 11
                ? ButtonStyle.Success
                : ButtonStyle.Secondary
            )
        );
      }

      const rows = [];

      for (let i = 0; i < buttons.length; i += 5) {
        rows.push(
          new ActionRowBuilder().addComponents(
            buttons.slice(i, i + 5)
          )
        );
      }

      await interaction.reply({
        content:
          "⚽ **CREATE LINEUP**\n\n" +
          "Choose your lineup size:",
        components: rows,
        ephemeral: true
      });

      return;
    }

    /* =========================
       SIZE BUTTON
    ========================= */

    if (
      interaction.isButton() &&
      interaction.customId.startsWith("lineup_size_")
    ) {

      const size = Number(
        interaction.customId.replace(
          "lineup_size_",
          ""
        )
      );

      if (size < 1 || size > 11) {
        return interaction.reply({
          content: "❌ Invalid lineup size.",
          ephemeral: true
        });
      }

      const session =
        createSession(interaction, size);

      const url =
        `${getBaseUrl()}/pitch/${session.id}?uid=${interaction.user.id}`;

      const button =
        new ButtonBuilder()
          .setLabel("⚽ OPEN LINEUP EDITOR")
          .setStyle(ButtonStyle.Link)
          .setURL(url);

      await interaction.update({
        content:
          `⚽ **${size}v${size} LINEUP CREATED**\n\n` +
          "Open the editor below to choose players and position them.",
        components: [
          new ActionRowBuilder()
            .addComponents(button)
        ]
      });

      return;
    }

  } catch (error) {
    console.error("❌ Interaction error:", error);

    if (
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction.reply({
        content: "❌ Something went wrong.",
        ephemeral: true
      });
    }
  }
});

/* =========================
   HTTP SERVER
========================= */

const server = http.createServer(
  async (req, res) => {

    try {

      const requestUrl =
        new URL(
          req.url,
          `http://${req.headers.host || "localhost"}`
        );

      /* HEALTH */

      if (
        requestUrl.pathname === "/health"
      ) {
        return sendJson(res, 200, {
          online: true,
          discord: client.isReady(),
          bot: client.user?.tag || null
        });
      }

      /* PITCH */

      if (
        requestUrl.pathname.startsWith("/pitch/")
      ) {

        const sessionId =
          requestUrl.pathname
            .split("/")[2];

        const session =
          sessions.get(sessionId);

        if (!session) {
          return sendHtml(
            res,
            404,
            errorPage(
              "Lineup not found or expired."
            )
          );
        }

        return sendHtml(
          res,
          200,
          pitchPage(session)
        );
      }

      /* SESSION GET */

      if (
        requestUrl.pathname.startsWith(
          "/api/session/"
        ) &&
        req.method === "GET"
      ) {

        const sessionId =
          requestUrl.pathname
            .split("/")[3];

        const session =
          sessions.get(sessionId);

        if (!session) {
          return sendJson(res, 404, {
            error: "Session not found"
          });
        }

        const guild =
          client.guilds.cache.get(
            session.guildId
          );

        let serverMembers = [];

        if (guild) {
          try {

            const fetched =
              await guild.members.fetch();

            serverMembers =
              fetched
                .filter(
                  member =>
                    !member.user.bot
                )
                .map(member => ({
                  id: member.user.id,
                  name: member.displayName,
                  username:
                    member.user.username,
                  avatar:
                    member.user.displayAvatarURL({
                      extension: "png",
                      size: 128
                    })
                }));

          } catch (error) {
            console.error(
              "❌ Member fetch error:",
              error
            );
          }
        }

        return sendJson(res, 200, {
          id: session.id,
          size: session.size,
          creatorId: session.creatorId,
          finished: session.finished,
          roster: session.roster,
          serverMembers
        });
      }

      /* SESSION SAVE */

      if (
        requestUrl.pathname.startsWith(
          "/api/session/"
        ) &&
        req.method === "POST"
      ) {

        const sessionId =
          requestUrl.pathname
            .split("/")[3];

        const session =
          sessions.get(sessionId);

        if (!session) {
          return sendJson(res, 404, {
            error: "Session not found"
          });
        }

        const body =
          await readBody(req);

        if (
          body.uid !== session.creatorId
        ) {
          return sendJson(res, 403, {
            error:
              "You cannot edit this lineup."
          });
        }

        if (Array.isArray(body.roster)) {

          body.roster.forEach(
            (player, index) => {

              if (!session.roster[index]) {
                return;
              }

              const old =
                session.roster[index];

              if (
                Number.isFinite(
                  Number(player.x)
                )
              ) {
                old.x =
                  Math.max(
                    4,
                    Math.min(
                      96,
                      Number(player.x)
                    )
                  );
              }

              if (
                Number.isFinite(
                  Number(player.y)
                )
              ) {
                old.y =
                  Math.max(
                    5,
                    Math.min(
                      95,
                      Number(player.y)
                    )
                  );
              }

              if (
                typeof player.position ===
                "string"
              ) {
                old.position =
                  player.position
                    .trim()
                    .slice(0, 20);
              }
            }
          );
        }

        return sendJson(res, 200, {
          success: true,
          roster: session.roster
        });
      }

      /* =========================
         ASSIGN PLAYER
      ========================= */

      if (
        requestUrl.pathname ===
          "/api/assign" &&
        req.method === "POST"
      ) {

        const body =
          await readBody(req);

        const session =
          sessions.get(body.session);

        if (!session) {
          return sendJson(res, 404, {
            error: "Session not found."
          });
        }

        if (
          body.uid !==
          session.creatorId
        ) {
          return sendJson(res, 403, {
            error:
              "You cannot edit this lineup."
          });
        }

        const slot =
          session.roster[
            Number(body.slot)
          ];

        if (!slot) {
          return sendJson(res, 400, {
            error: "Invalid player slot."
          });
        }

        const guild =
          client.guilds.cache.get(
            session.guildId
          );

        if (!guild) {
          return sendJson(res, 500, {
            error:
              "Discord server unavailable."
          });
        }

        const member =
          await guild.members.fetch(
            body.userId
          );

        if (
          !member ||
          member.user.bot
        ) {
          return sendJson(res, 404, {
            error: "Player not found."
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

      /* =========================
         CHANGE POSITION
      ========================= */

      if (
        requestUrl.pathname ===
          "/api/position" &&
        req.method === "POST"
      ) {

        const body =
          await readBody(req);

        const session =
          sessions.get(body.session);

        if (!session) {
          return sendJson(res, 404, {
            error: "Session not found."
          });
        }

        if (
          body.uid !==
          session.creatorId
        ) {
          return sendJson(res, 403, {
            error:
              "You cannot edit this lineup."
          });
        }

        const slot =
          session.roster[
            Number(body.slot)
          ];

        if (!slot) {
          return sendJson(res, 400, {
            error: "Invalid slot."
          });
        }

        const position =
          String(body.position || "")
            .trim()
            .slice(0, 20);

        if (!position) {
          return sendJson(res, 400, {
            error:
              "Position cannot be empty."
          });
        }

        slot.position =
          position;

        return sendJson(res, 200, {
          success: true,
          slot
        });
      }

      /* =========================
         MOVE
      ========================= */

      if (
        requestUrl.pathname ===
          "/api/move" &&
        req.method === "POST"
      ) {

        const body =
          await readBody(req);

        const session =
          sessions.get(body.session);

        if (!session) {
          return sendJson(res, 404, {
            error: "Session not found."
          });
        }

        if (
          body.uid !==
          session.creatorId
        ) {
          return sendJson(res, 403, {
            error:
              "You cannot edit this lineup."
          });
        }

        const slot =
          session.roster[
            Number(body.slot)
          ];

        if (!slot) {
          return sendJson(res, 400, {
            error: "Invalid slot."
          });
        }

        const x = Number(body.x);
        const y = Number(body.y);

        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y)
        ) {
          return sendJson(res, 400, {
            error:
              "Invalid coordinates."
          });
        }

        slot.x =
          Math.max(
            4,
            Math.min(96, x)
          );

        slot.y =
          Math.max(
            5,
            Math.min(95, y)
          );

        return sendJson(res, 200, {
          success: true,
          slot
        });
      }

      /* =========================
         FINISH
      ========================= */

      if (
        requestUrl.pathname.startsWith(
          "/api/finish/"
        ) &&
        req.method === "POST"
      ) {

        const sessionId =
          requestUrl.pathname
            .split("/")[3];

        const session =
          sessions.get(sessionId);

        if (!session) {
          return sendJson(res, 404, {
            error:
              "Lineup not found or expired."
          });
        }

        const body =
          await readBody(req);

        if (
          body.uid !==
          session.creatorId
        ) {
          return sendJson(res, 403, {
            error:
              "Only the creator can finish this lineup."
          });
        }

        if (session.finished) {
          return sendJson(res, 400, {
            error:
              "This lineup has already been posted."
          });
        }

        try {

          const image =
            await createPitchImage(
              session
            );

          const attachment =
            new AttachmentBuilder(
              image,
              {
                name: "lineup.png"
              }
            );

          const filled =
            session.roster.filter(
              player =>
                player.userId
            );

          const positionsText =
            filled.length
              ? filled
                  .map(
                    player =>
                      `**${player.position}** — ${player.name}`
                  )
                  .join("\n")
              : "No players assigned.";

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

          await channel.send({
            content:
              `⚽ **${session.size}v${session.size} FINAL LINEUP**\n\n` +
              positionsText,
            files: [attachment]
          });

          session.finished = true;

          return sendJson(res, 200, {
            success: true
          });

        } catch (error) {

          console.error(
            "❌ Finish error:",
            error
          );

          return sendJson(res, 500, {
            error:
              "I could not post the lineup to Discord. Check the bot permissions."
          });
        }
      }

      return sendHtml(
        res,
        404,
        errorPage("Page not found.")
      );

    } catch (error) {

      console.error(
        "❌ HTTP error:",
        error
      );

      return sendJson(res, 500, {
        error:
          "Internal server error."
      });
    }
  }
);

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `🌐 Web server listening on ${PORT}`
    );
  }
);

client.login(TOKEN).catch(
  error => {
    console.error(
      "❌ Discord login failed:",
      error
    );

    process.exit(1);
  }
);

/* =========================
   HTTP HELPERS
========================= */

function sendHtml(
  res,
  status,
  html
) {
  res.writeHead(status, {
    "Content-Type":
      "text/html; charset=utf-8"
  });

  res.end(html);
}

function sendJson(
  res,
  status,
  data
) {
  res.writeHead(status, {
    "Content-Type":
      "application/json; charset=utf-8"
  });

  res.end(
    JSON.stringify(data)
  );
}

function readBody(req) {

  return new Promise(
    (resolve, reject) => {

      let data = "";

      req.on(
        "data",
        chunk => {

          data += chunk;

          if (
            data.length >
            1000000
          ) {
            reject(
              new Error(
                "Request too large"
              )
            );

            req.destroy();
          }
        }
      );

      req.on(
        "end",
        () => {

          try {
            resolve(
              data
                ? JSON.parse(data)
                : {}
            );
          } catch {
            resolve({});
          }
        }
      );

      req.on(
        "error",
        reject
      );
    }
  );
}

function errorPage(message) {

  return `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport"
content="width=device-width,initial-scale=1">
<title>Newcastle Assistant</title>
<style>
body{
margin:0;
min-height:100vh;
display:flex;
align-items:center;
justify-content:center;
background:#07130c;
color:white;
font-family:Arial,sans-serif;
}
.box{
background:#101b14;
border:1px solid #26352b;
border-radius:16px;
padding:30px;
text-align:center;
}
</style>
</head>
<body>
<div class="box">
<h1>⚽ Newcastle Assistant</h1>
<p>${escapeHtml(message)}</p>
</div>
</body>
</html>
`;
}

/* =========================
   CREATE PITCH IMAGE
========================= */

async function createPitchImage(
  session
) {

  const width = 1200;
  const height = 760;

  const players =
    session.roster
      .filter(
        player =>
          player.userId
      )
      .map(player => {

        const x =
          (player.x / 100) *
          width;

        const y =
          (player.y / 100) *
          height;

        const initial =
          player.name
            ? player.name
                .charAt(0)
                .toUpperCase()
            : "?";

        return `
<g>

<circle
cx="${x}"
cy="${y}"
r="34"
fill="#202a24"
stroke="white"
stroke-width="4"
/>

<text
x="${x}"
y="${y + 7}"
text-anchor="middle"
fill="white"
font-family="Arial"
font-size="24"
font-weight="bold"
>
${escapeSvg(initial)}
</text>

<rect
x="${x - 75}"
y="${y + 40}"
width="150"
height="30"
rx="7"
fill="#000000"
fill-opacity=".75"
/>

<text
x="${x}"
y="${y + 61}"
text-anchor="middle"
fill="white"
font-family="Arial"
font-size="15"
font-weight="bold"
>
${escapeSvg(
  player.name || "Player"
)}
</text>

<text
x="${x}"
y="${y + 88}"
text-anchor="middle"
fill="white"
font-family="Arial"
font-size="13"
font-weight="bold"
>
${escapeSvg(
  player.position
)}
</text>

</g>
`;
      })
      .join("");

  const svg = `
<svg
xmlns="http://www.w3.org/2000/svg"
width="${width}"
height="${height}"
viewBox="0 0 ${width} ${height}"
>

<defs>

<linearGradient
id="grass"
x1="0"
y1="0"
x2="0"
y2="1"
>

<stop
offset="0%"
stop-color="#247b42"
/>

<stop
offset="50%"
stop-color="#1f713c"
/>

<stop
offset="100%"
stop-color="#247b42"
/>

</linearGradient>

</defs>

<rect
width="${width}"
height="${height}"
rx="20"
fill="url(#grass)"
/>

<g
fill="none"
stroke="white"
stroke-width="4"
opacity=".92"
>

<rect
x="18"
y="18"
width="1164"
height="724"
rx="6"
/>

<line
x1="18"
y1="380"
x2="1182"
y2="380"
/>

<circle
cx="600"
cy="380"
r="100"
/>

<circle
cx="600"
cy="380"
r="5"
fill="white"
/>

<rect
x="360"
y="18"
width="480"
height="135"
/>

<rect
x="360"
y="607"
width="480"
height="135"
/>

<rect
x="500"
y="18"
width="200"
height="60"
/>

<rect
x="500"
y="682"
width="200"
height="60"
/>

</g>

${players}

</svg>
`;

  return sharp(
    Buffer.from(svg)
  )
    .png()
    .toBuffer();
}

/* =========================
   PITCH WEBPAGE
========================= */

function pitchPage(session) {

  const originalPositions =
    session.roster.map(
      player => ({
        x: player.x,
        y: player.y
      })
    );

  return `<!DOCTYPE html>
<html>

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"
>

<title>Football Lineup</title>

<style>

*{
box-sizing:border-box;
-webkit-tap-highlight-color:transparent;
}

html,
body{
margin:0;
width:100%;
min-height:100%;
font-family:Arial,Helvetica,sans-serif;
background:#07130c;
color:white;
}

body{
overflow:auto;
}

.topbar{
height:68px;
display:flex;
align-items:center;
justify-content:space-between;
padding:0 18px;
background:#08110c;
border-bottom:1px solid rgba(255,255,255,.12);
position:sticky;
top:0;
z-index:100;
}

.title{
font-size:21px;
font-weight:900;
}

.subtitle{
font-size:11px;
color:#8d9a91;
margin-top:3px;
}

.top-buttons{
display:flex;
gap:8px;
}

button{
font-family:inherit;
border:0;
cursor:pointer;
touch-action:manipulation;
}

.top-button{
padding:11px 16px;
border-radius:8px;
color:white;
background:#252d28;
font-weight:800;
}

.finish{
background:#15803d;
}

.finish:disabled{
opacity:.6;
}

.main{
min-height:calc(100vh - 68px);
display:flex;
align-items:center;
justify-content:center;
gap:18px;
padding:16px;
}

.pitch-wrap{
width:min(1000px,calc(100vw - 300px));
height:min(760px,calc(100vh - 100px));
}

.pitch{
position:relative;
width:100%;
height:100%;
overflow:hidden;
border-radius:14px;
border:3px solid white;

background:
repeating-linear-gradient(
to bottom,
#247b42 0px,
#247b42 70px,
#1f713c 70px,
#1f713c 140px
);

box-shadow:
0 20px 60px rgba(0,0,0,.5);
}

.halfway{
position:absolute;
left:0;
right:0;
top:50%;
border-top:3px solid white;
}

.center-circle{
position:absolute;
left:50%;
top:50%;
width:150px;
height:150px;
transform:translate(-50%,-50%);
border:3px solid white;
border-radius:50%;
}

.center-dot{
position:absolute;
left:50%;
top:50%;
width:8px;
height:8px;
transform:translate(-50%,-50%);
background:white;
border-radius:50%;
}

.box{
position:absolute;
left:50%;
transform:translateX(-50%);
width:36%;
height:18%;
border-left:3px solid white;
border-right:3px solid white;
}

.box.top{
top:0;
border-bottom:3px solid white;
}

.box.bottom{
bottom:0;
border-top:3px solid white;
}

.six{
position:absolute;
left:50%;
transform:translateX(-50%);
width:17%;
height:8%;
border-left:3px solid white;
border-right:3px solid white;
}

.six.top{
top:0;
border-bottom:3px solid white;
}

.six.bottom{
bottom:0;
border-top:3px solid white;
}

.player{
position:absolute;
width:86px;
min-height:90px;
transform:translate(-50%,-50%);
text-align:center;
z-index:10;
touch-action:none;
user-select:none;
-webkit-user-select:none;
cursor:pointer;
}

.player.dragging{
z-index:100;
}

.avatar{
width:52px;
height:52px;
margin:auto;
border-radius:50%;
border:3px solid white;
background:#707872;
display:flex;
align-items:center;
justify-content:center;
overflow:hidden;
font-size:20px;
font-weight:900;
}

.avatar img{
width:100%;
height:100%;
object-fit:cover;
}

.name{
margin-top:3px;
padding:3px 6px;
background:rgba(0,0,0,.8);
border-radius:5px;
font-size:10px;
font-weight:900;
white-space:nowrap;
max-width:120px;
overflow:hidden;
text-overflow:ellipsis;
}

.position{
margin-top:2px;
font-size:9px;
font-weight:900;
}

.selected{
outline:3px solid #facc15;
outline-offset:4px;
border-radius:50%;
}

.panel{
width:255px;
max-height:calc(100vh - 100px);
overflow:auto;
padding:15px;
border-radius:13px;
background:#0d1811;
border:1px solid rgba(255,255,255,.12);
}

.panel h2{
margin:0 0 8px;
font-size:16px;
}

.info{
color:#94a198;
font-size:11px;
line-height:1.5;
margin-bottom:10px;
}

.control{
width:100%;
padding:11px;
margin-bottom:7px;
border-radius:8px;
background:#202a24;
color:white;
font-weight:800;
}

.control.active{
background:#15803d;
}

.status{
margin-top:8px;
padding:9px;
background:#18231c;
border-radius:7px;
font-size:11px;
}

.members{
margin-top:10px;
display:flex;
flex-direction:column;
gap:6px;
}

.member{
display:flex;
align-items:center;
gap:8px;
padding:8px;
border-radius:7px;
background:#17221b;
cursor:pointer;
}

.member:active{
background:#27352b;
}

.member img{
width:34px;
height:34px;
border-radius:50%;
}

.member-name{
font-size:11px;
font-weight:800;
overflow:hidden;
text-overflow:ellipsis;
white-space:nowrap;
}

@media(max-width:850px){

body{
overflow:auto;
}

.topbar{
height:60px;
padding:0 9px;
}

.title{
font-size:16px;
}

.subtitle{
display:none;
}

.top-button{
padding:9px 10px;
font-size:10px;
}

.main{
min-height:calc(100vh - 60px);
flex-direction:column;
padding:9px;
align-items:center;
}

.pitch-wrap{
width:96vw;
height:65vh;
min-height:400px;
}

.panel{
width:96vw;
max-height:none;
}

}

@media(max-width:500px){

.pitch-wrap{
width:98vw;
height:62vh;
min-height:390px;
}

.player{
width:68px;
min-height:72px;
}

.avatar{
width:42px;
height:42px;
border-width:2px;
}

.name{
font-size:8px;
max-width:90px;
padding:2px 4px;
}

.position{
font-size:8px;
}

.center-circle{
width:95px;
height:95px;
}

.panel{
padding:10px;
}

}

</style>

</head>

<body>

<div class="topbar">

<div>

<div class="title">
⚽ Football Lineup
</div>

<div class="subtitle">
${session.size}v${session.size} • Select players and move them
</div>

</div>

<div class="top-buttons">

<button
class="top-button"
onclick="resetLineup()"
>
Reset
</button>

<button
class="top-button finish"
onclick="finishLineup()"
>
✓ Done
</button>

</div>

</div>

<div class="main">

<div class="pitch-wrap">

<div
class="pitch"
id="pitch"
>

<div class="halfway"></div>

<div class="center-circle"></div>

<div class="center-dot"></div>

<div class="box top"></div>

<div class="box bottom"></div>

<div class="six top"></div>

<div class="six bottom"></div>

<div id="players"></div>

</div>

</div>

<div class="panel">

<h2>
Lineup Controls
</h2>

<div class="info">
Tap a grey circle to select it.
Choose a server player below.
Press Move Player, then drag the player.
On phone, you can drag with your finger.
</div>

<button
class="control"
onclick="changePosition()"
>
⚽ Change Position
</button>

<button
class="control"
id="moveButton"
onclick="toggleMove()"
>
↔ Move Player
</button>

<div
class="status"
id="status"
>
No player selected.
</div>

<div
class="members"
id="members"
></div>

</div>

</div>

<script>

"use strict";

const SESSION =
"${escapeHtml(session.id)}";

const CREATOR =
"${escapeHtml(session.creatorId)}";

const ORIGINAL =
${JSON.stringify(originalPositions)};

let state = null;

let selected = null;

let moving = false;

let dragging = null;

const pitch =
document.getElementById("pitch");

const players =
document.getElementById("players");

const members =
document.getElementById("members");

const statusBox =
document.getElementById("status");

function escapeHTML(value){

return String(value ?? "")
.replaceAll("&","&amp;")
.replaceAll("<","&lt;")
.replaceAll(">","&gt;")
.replaceAll('"',"&quot;")
.replaceAll("'","&#039;");

}

/* =========================
   LOAD
========================= */

async function load(){

try{

const response =
await fetch(
"/api/session/" +
encodeURIComponent(SESSION)
);

const data =
await response.json();

if(!response.ok){

throw new Error(
data.error ||
"Could not load lineup."
);

}

state = data;

render();

}catch(error){

console.error(error);

document.body.innerHTML =
"<div style='padding:30px;color:white;font-family:Arial'>" +
"<h2>❌ Lineup could not be loaded</h2>" +
"<p>" +
escapeHTML(error.message) +
"</p></div>";

}

}

/* =========================
   RENDER
========================= */

function render(){

renderPlayers();

renderMembers();

updateStatus();

}

/* =========================
   PLAYERS
========================= */

function renderPlayers(){

players.innerHTML = "";

state.roster.forEach(
(player,index)=>{

const el =
document.createElement("div");

el.className =
"player" +
(selected === index
? " selected"
: "");

el.dataset.index =
index;

el.style.left =
player.x + "%";

el.style.top =
player.y + "%";

let avatar;

if(player.avatar){

avatar =
"<div class='avatar'>" +
"<img src='" +
escapeHTML(player.avatar) +
"' draggable='false'>" +
"</div>";

}else{

avatar =
"<div class='avatar'>?</div>";

}

el.innerHTML =
avatar +
"<div class='name'>" +
escapeHTML(
player.name ||
"Select Player"
) +
"</div>" +
"<div class='position'>" +
escapeHTML(
player.position
) +
"</div>";

/* SELECT */

el.addEventListener(
"click",
event=>{

if(dragging){
return;
}

event.stopPropagation();

selected = index;

renderPlayers();

updateStatus();

}
);

/* POINTER DOWN */

el.addEventListener(
"pointerdown",
event=>{

event.preventDefault();

selected = index;

if(!moving){

renderPlayers();

updateStatus();

return;

}

dragging = {
element:el,
index:index
};

el.classList.add(
"dragging"
);

try{

el.setPointerCapture(
event.pointerId
);

}catch{}

}
);

/* POINTER MOVE */

el.addEventListener(
"pointermove",
event=>{

if(
!dragging ||
dragging.element !== el
){

return;

}

const rect =
pitch.getBoundingClientRect();

let x =
((event.clientX -
rect.left) /
rect.width) *
100;

let y =
((event.clientY -
rect.top) /
rect.height) *
100;

/* GRID */

const grid = 2;

x =
Math.round(x / grid) *
grid;

y =
Math.round(y / grid) *
grid;

x =
Math.max(
4,
Math.min(96,x)
);

y =
Math.max(
5,
Math.min(95,y)
);

el.style.left =
x + "%";

el.style.top =
y + "%";

state.roster[index].x =
x;

state.roster[index].y =
y;

}
);

/* POINTER UP */

el.addEventListener(
"pointerup",
async event=>{

if(
!dragging ||
dragging.element !== el
){

return;

}

try{

el.releasePointerCapture(
event.pointerId
);

}catch{}

el.classList.remove(
"dragging"
);

const index =
dragging.index;

dragging = null;

await saveMove(index);

}
);

/* POINTER CANCEL */

el.addEventListener(
"pointercancel",
()=>{

if(
dragging &&
dragging.element === el
){

el.classList.remove(
"dragging"
);

dragging = null;

}

}
);

players.appendChild(el);

}
);

}

/* =========================
   MEMBERS
========================= */

function renderMembers(){

members.innerHTML = "";

if(!state.serverMembers){
return;
}

state.serverMembers.forEach(
member=>{

const el =
document.createElement("div");

el.className =
"member";

el.innerHTML =
"<img src='" +
escapeHTML(member.avatar) +
"' draggable='false'>" +
"<div class='member-name'>" +
escapeHTML(
member.name
) +
"</div>";

el.addEventListener(
"click",
()=>assignPlayer(member)
);

members.appendChild(el);

}
);

}

/* =========================
   STATUS
========================= */

function updateStatus(){

if(selected === null){

statusBox.textContent =
"No player selected.";

return;

}

const player =
state.roster[selected];

statusBox.innerHTML =
"<b>Selected:</b> " +
escapeHTML(
player.name ||
"Empty slot"
) +
"<br>" +
"<b>Position:</b> " +
escapeHTML(
player.position
);

}

/* =========================
   ASSIGN
========================= */

async function assignPlayer(member){

if(selected === null){

alert(
"Tap a grey player circle first."
);

return;

}

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
body:JSON.stringify({
session:SESSION,
uid:CREATOR,
slot:selected,
userId:member.id
})
}
);

const data =
await response.json();

if(!response.ok){

throw new Error(
data.error ||
"Could not assign player."
);

}

state.roster[selected] =
data.slot;

render();

}catch(error){

alert(error.message);

}

}

/* =========================
   POSITION
========================= */

async function changePosition(){

if(selected === null){

alert(
"Select a player first."
);

return;

}

const player =
state.roster[selected];

const position =
prompt(
"Type the position:",
player.position
);

if(position === null){
return;
}

const clean =
position.trim();

if(!clean){
return;
}

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
body:JSON.stringify({
session:SESSION,
uid:CREATOR,
slot:selected,
position:clean
})
}
);

const data =
await response.json();

if(!response.ok){

throw new Error(
data.error ||
"Could not change position."
);

}

state.roster[selected] =
data.slot;

render();

}catch(error){

alert(error.message);

}

}

/* =========================
   MOVE
========================= */

function toggleMove(){

if(selected === null){

alert(
"Select a player first."
);

return;

}

moving = !moving;

const button =
document.getElementById(
"moveButton"
);

if(moving){

button.classList.add(
"active"
);

button.textContent =
"✓ Moving — drag player";

}else{

button.classList.remove(
"active"
);

button.textContent =
"↔ Move Player";

}

}

/* =========================
   SAVE MOVE
========================= */

async function saveMove(index){

const player =
state.roster[index];

try{

await fetch(
"/api/move",
{
method:"POST",
headers:{
"Content-Type":
"application/json"
},
body:JSON.stringify({
session:SESSION,
uid:CREATOR,
slot:index,
x:player.x,
y:player.y
})
}
);

}catch(error){

console.error(
"Move save error:",
error
);

}

}

/* =========================
   SAVE ALL
========================= */

async function saveAll(){

try{

const response =
await fetch(
"/api/session/" +
encodeURIComponent(SESSION),
{
method:"POST",
headers:{
"Content-Type":
"application/json"
},
body:JSON.stringify({
uid:CREATOR,
roster:state.roster
})
}
);

if(!response.ok){

throw new Error(
"Save failed."
);

}

}catch(error){

console.error(error);

throw error;

}

}

/* =========================
   RESET
========================= */

async function resetLineup(){

if(
!confirm(
"Reset all players and positions?"
)
){

return;

}

state.roster.forEach(
(player,index)=>{

player.userId = null;

player.name = "";

player.avatar = "";

player.x =
ORIGINAL[index].x;

player.y =
ORIGINAL[index].y;

}
);

selected = null;

moving = false;

document
.getElementById("moveButton")
.classList.remove("active");

document
.getElementById("moveButton")
.textContent =
"↔ Move Player";

render();

await saveAll();

}

/* =========================
   FINISH
========================= */

async function finishLineup(){

if(
!confirm(
"Finish this lineup and post the pitch to the Discord channel?"
)
){

return;

}

const button =
document.querySelector(
".finish"
);

button.disabled = true;

button.textContent =
"Saving...";

try{

await saveAll();

button.textContent =
"Posting...";

const response =
await fetch(
"/api/finish/" +
encodeURIComponent(SESSION),
{
method:"POST",
headers:{
"Content-Type":
"application/json"
},
body:JSON.stringify({
uid:CREATOR
})
}
);

const data =
await response.json();

if(!response.ok){

throw new Error(
data.error ||
"Could not post lineup."
);

}

button.textContent =
"✓ Posted!";

alert(
"✅ Lineup posted in the Discord channel!"
);

}catch(error){

console.error(error);

button.disabled = false;

button.textContent =
"✓ Done";

alert(
"❌ " +
error.message
);

}

}

load();

</script>

</body>

</html>`;
}
