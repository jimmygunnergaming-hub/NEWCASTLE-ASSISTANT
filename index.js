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

const POSITION_CHANNEL_ID = "1542615989382942756";

if (!TOKEN) {
  console.error("DISCORD_TOKEN is missing.");
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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeSvg(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const formations = {
  1: [["GK", 50, 88]],

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

function createSession(interaction, size) {
  const roster = formations[size].map((p, index) => ({
    slot: index,
    position: p[0],
    x: p[1],
    y: p[2],
    userId: null,
    name: "",
    avatar: "",
    bench: false
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
   POSITION READING
========================= */

async function getServerMembers(guild) {
  if (!guild) return [];

  try {
    const fetched = await guild.members.fetch();

    return fetched
      .filter(member => !member.user.bot)
      .map(member => ({
        id: member.user.id,
        name: member.displayName,
        username: member.user.username,
        avatar: member.user.displayAvatarURL({
          extension: "png",
          size: 128
        })
      }));
  } catch (error) {
    console.error("Could not fetch server members:", error);
    return [];
  }
}

async function getPositionMap(guild) {
  const map = {};

  if (!guild) return map;

  try {
    const channel = await guild.channels.fetch(POSITION_CHANNEL_ID);

    if (!channel || !channel.isTextBased()) {
      return map;
    }

    const messages = await channel.messages.fetch({
      limit: 100
    });

    const positionNames = [
      "GK",
      "CB",
      "CM",
      "LW",
      "RW",
      "ST",
      "LB",
      "RB",
      "LM",
      "RM"
    ];

    for (const message of messages.values()) {
      const content = String(message.content || "").toUpperCase();

      let foundPosition = null;

      for (const position of positionNames) {
        const regex = new RegExp(
          `\\b${position}\\b`,
          "i"
        );

        if (regex.test(content)) {
          foundPosition = position;
          break;
        }
      }

      if (!foundPosition) continue;

      for (const user of message.mentions.users.values()) {
        if (!user.bot) {
          map[user.id] = foundPosition;
        }
      }
    }
  } catch (error) {
    console.error("Position channel error:", error.message);
  }

  return map;
}

/* =========================
   DISCORD
========================= */

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    const command = new SlashCommandBuilder()
      .setName("lineup")
      .setDescription("Create a football lineup");

    await client.application.commands.set([command]);

    console.log("/lineup registered");
  } catch (error) {
    console.error("Slash command registration failed:", error);
  }
});

client.on("interactionCreate", async interaction => {
  try {
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

      for (let i = 0; i < buttons.length; i += 4) {
        rows.push(
          new ActionRowBuilder().addComponents(
            buttons.slice(i, i + 4)
          )
        );
      }

      await interaction.reply({
        content:
          "⚽ **CREATE LINEUP**\n\nChoose your lineup size:",
        components: rows,
        ephemeral: true
      });

      return;
    }

    if (
      interaction.isButton() &&
      interaction.customId.startsWith("lineup_size_")
    ) {
      const size = Number(
        interaction.customId.replace("lineup_size_", "")
      );

      if (size < 1 || size > 11) {
        await interaction.reply({
          content: "Invalid lineup size.",
          ephemeral: true
        });

        return;
      }

      const session = createSession(
        interaction,
        size
      );

      const url =
        `${getBaseUrl()}/pitch/${session.id}?uid=${interaction.user.id}`;

      const button = new ButtonBuilder()
        .setLabel("⚽ OPEN LINEUP EDITOR")
        .setStyle(ButtonStyle.Link)
        .setURL(url);

      await interaction.update({
        content:
          `⚽ **${size}v${size} LINEUP CREATED**\n\n` +
          "Choose players, change positions, move players and use the bench.",
        components: [
          new ActionRowBuilder().addComponents(button)
        ]
      });

      return;
    }
  } catch (error) {
    console.error("Discord interaction error:", error);

    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "Something went wrong.",
          ephemeral: true
        });
      }
    } catch {}
  }
});

/* =========================
   HTTP SERVER
========================= */

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(
      req.url,
      `http://${req.headers.host || "localhost"}`
    );

    /* HEALTH */

    if (url.pathname === "/health") {
      return sendJson(res, 200, {
        online: true,
        discord: client.isReady()
      });
    }

    /* PITCH */

    if (url.pathname.startsWith("/pitch/")) {
      const id = url.pathname.split("/")[2];

      const session = sessions.get(id);

      if (!session) {
        return sendHtml(
          res,
          404,
          errorPage("Lineup not found or expired.")
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
      url.pathname.startsWith("/api/session/") &&
      req.method === "GET"
    ) {
      const id = url.pathname.split("/")[3];

      const session = sessions.get(id);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found"
        });
      }

      const guild =
        client.guilds.cache.get(session.guildId);

      const serverMembers =
        await getServerMembers(guild);

      const positionMap =
        await getPositionMap(guild);

      const memberIds =
        new Set(
          serverMembers.map(member => member.id)
        );

      /* Remove players who have left the Discord server */

      for (const player of session.roster) {
        if (
          player.userId &&
          !memberIds.has(player.userId)
        ) {
          player.userId = null;
          player.name = "";
          player.avatar = "";
          player.bench = false;
        }
      }

      /* Give server players their saved channel position */

      for (const member of serverMembers) {
        if (positionMap[member.id]) {
          member.position =
            positionMap[member.id];
        } else {
          member.position = "Other";
        }
      }

      return sendJson(res, 200, {
        id: session.id,
        size: session.size,
        creatorId: session.creatorId,
        finished: session.finished,
        roster: session.roster,
        serverMembers,
        positionMap
      });
    }

    /* SESSION SAVE */

    if (
      url.pathname.startsWith("/api/session/") &&
      req.method === "POST"
    ) {
      const id = url.pathname.split("/")[3];

      const session = sessions.get(id);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found"
        });
      }

      const body = await readBody(req);

      if (body.uid !== session.creatorId) {
        return sendJson(res, 403, {
          error: "You cannot edit this lineup."
        });
      }

      if (Array.isArray(body.roster)) {
        body.roster.forEach((p, index) => {
          const target =
            session.roster[index];

          if (!target) return;

          if (Number.isFinite(Number(p.x))) {
            target.x = Math.max(
              4,
              Math.min(96, Number(p.x))
            );
          }

          if (Number.isFinite(Number(p.y))) {
            target.y = Math.max(
              4,
              Math.min(96, Number(p.y))
            );
          }

          if (typeof p.bench === "boolean") {
            target.bench = p.bench;
          }

          if (typeof p.position === "string") {
            target.position =
              p.position
                .trim()
                .slice(0, 20);
          }
        });
      }

      return sendJson(res, 200, {
        success: true,
        roster: session.roster
      });
    }

    /* ASSIGN */

    if (
      url.pathname === "/api/assign" &&
      req.method === "POST"
    ) {
      const body = await readBody(req);

      const session =
        sessions.get(body.session);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found"
        });
      }

      if (body.uid !== session.creatorId) {
        return sendJson(res, 403, {
          error: "You cannot edit this lineup."
        });
      }

      const slot =
        session.roster[Number(body.slot)];

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
          error: "Discord server unavailable."
        });
      }

      let member;

      try {
        member =
          await guild.members.fetch(
            body.userId
          );
      } catch {
        member = null;
      }

      if (!member || member.user.bot) {
        return sendJson(res, 404, {
          error: "Player is no longer in the server."
        });
      }

      /*
       * Assigning someone to a slot automatically
       * takes that slot off the bench.
       */

      slot.userId =
        member.user.id;

      slot.name =
        member.displayName;

      slot.avatar =
        member.user.displayAvatarURL({
          extension: "png",
          size: 256
        });

      slot.bench = false;

      return sendJson(res, 200, {
        success: true,
        slot
      });
    }

    /* POSITION */

    if (
      url.pathname === "/api/position" &&
      req.method === "POST"
    ) {
      const body = await readBody(req);

      const session =
        sessions.get(body.session);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found"
        });
      }

      if (body.uid !== session.creatorId) {
        return sendJson(res, 403, {
          error: "You cannot edit this lineup."
        });
      }

      const slot =
        session.roster[Number(body.slot)];

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
          error: "Position cannot be empty."
        });
      }

      slot.position = position;

      return sendJson(res, 200, {
        success: true,
        slot
      });
    }

    /* MOVE */

    if (
      url.pathname === "/api/move" &&
      req.method === "POST"
    ) {
      const body = await readBody(req);

      const session =
        sessions.get(body.session);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found"
        });
      }

      if (body.uid !== session.creatorId) {
        return sendJson(res, 403, {
          error: "You cannot edit this lineup."
        });
      }

      const slot =
        session.roster[Number(body.slot)];

      if (!slot) {
        return sendJson(res, 400, {
          error: "Invalid slot."
        });
      }

      let x = Number(body.x);
      let y = Number(body.y);

      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y)
      ) {
        return sendJson(res, 400, {
          error: "Invalid coordinates."
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

    /* BENCH */

    if (
      url.pathname === "/api/bench" &&
      req.method === "POST"
    ) {
      const body = await readBody(req);

      const session =
        sessions.get(body.session);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found"
        });
      }

      if (body.uid !== session.creatorId) {
        return sendJson(res, 403, {
          error: "You cannot edit this lineup."
        });
      }

      const slot =
        session.roster[Number(body.slot)];

      if (!slot) {
        return sendJson(res, 400, {
          error: "Invalid player."
        });
      }

      if (!slot.userId) {
        return sendJson(res, 400, {
          error: "There is no player in this slot."
        });
      }

      slot.bench =
        Boolean(body.bench);

      return sendJson(res, 200, {
        success: true,
        slot
      });
    }

    /* FINISH */

    if (
      url.pathname.startsWith("/api/finish/") &&
      req.method === "POST"
    ) {
      const id =
        url.pathname.split("/")[3];

      const session =
        sessions.get(id);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found"
        });
      }

      const body =
        await readBody(req);

      if (body.uid !== session.creatorId) {
        return sendJson(res, 403, {
          error: "You cannot finish this lineup."
        });
      }

      if (session.finished) {
        return sendJson(res, 400, {
          error: "This lineup has already been posted."
        });
      }

      session.finished = true;

      const image =
        await createPitchImage(session);

      const attachment =
        new AttachmentBuilder(image, {
          name: "newcastle-lineup.png"
        });

      const playing =
        session.roster.filter(
          p =>
            p.userId &&
            !p.bench
        );

      const bench =
        session.roster.filter(
          p =>
            p.userId &&
            p.bench
        );

      let text =
        "**NEWCASTLE LINEUP TODAY ENJOY**\n\n";

      if (playing.length) {
        text += playing
          .map(
            p =>
              `**${p.position}** — ${p.name}`
          )
          .join("\n");
      } else {
        text += "No players selected.";
      }

      if (bench.length) {
        text +=
          "\n\n**BENCH**\n" +
          bench
            .map(
              p =>
                `• ${p.name} — ${p.position}`
            )
            .join("\n");
      }

      const channel =
        await client.channels.fetch(
          session.channelId
        );

      await channel.send({
        content: text,
        files: [attachment]
      });

      return sendJson(res, 200, {
        success: true
      });
    }

    return sendHtml(
      res,
      404,
      errorPage("Page not found.")
    );

  } catch (error) {
    console.error("HTTP error:", error);

    return sendJson(res, 500, {
      error: "Internal server error."
    });
  }
});

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Web server listening on ${PORT}`
    );
  }
);

client.login(TOKEN);

/* =========================
   HELPERS
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
<meta name="viewport" content="width=device-width,initial-scale=1">
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
font-family:Arial;
}
.box{
padding:30px;
background:#101b14;
border-radius:16px;
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
   FINAL IMAGE
========================= */

async function createPitchImage(session) {
  const width = 1200;
  const height = 950;
  const pitchHeight = 760;

  const playing =
    session.roster.filter(
      p =>
        p.userId &&
        !p.bench
    );

  const bench =
    session.roster.filter(
      p =>
        p.userId &&
        p.bench
    );

  const players =
    playing
      .map(player => {
        const x =
          (player.x / 100) *
          width;

        const y =
          (player.y / 100) *
          pitchHeight;

        let picture = "";

        if (player.avatar) {
          picture = `
<image
href="${escapeSvg(player.avatar)}"
x="${x - 34}"
y="${y - 34}"
width="68"
height="68"
preserveAspectRatio="xMidYMid slice"
/>`;
        }

        return `
<g>
<circle
cx="${x}"
cy="${y}"
r="35"
fill="#202a24"
stroke="white"
stroke-width="4"
/>

${picture}

<text
x="${x}"
y="${y + 7}"
text-anchor="middle"
fill="white"
font-family="Arial"
font-size="22"
font-weight="bold"
>
${escapeSvg(
  player.name
    ? player.name
        .charAt(0)
        .toUpperCase()
    : "?"
)}
</text>

<rect
x="${x - 75}"
y="${y + 40}"
width="150"
height="28"
rx="7"
fill="#07130c"
/>

<text
x="${x}"
y="${y + 59}"
text-anchor="middle"
fill="white"
font-family="Arial"
font-size="15"
font-weight="bold"
>
${escapeSvg(
  player.name ||
  "Player"
)}
</text>

<text
x="${x}"
y="${y + 84}"
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

  const benchPlayers =
    bench
      .map(
        (player, i) => {
          const x =
            90 + i * 180;

          let picture = "";

          if (player.avatar) {
            picture = `
<image
href="${escapeSvg(player.avatar)}"
x="${x - 27}"
y="820"
width="54"
height="54"
preserveAspectRatio="xMidYMid slice"
/>`;
          }

          return `
<g>
<circle
cx="${x}"
cy="847"
r="28"
fill="#202a24"
stroke="white"
stroke-width="3"
/>

${picture}

<text
x="${x}"
y="885"
text-anchor="middle"
fill="white"
font-family="Arial"
font-size="13"
font-weight="bold"
>
${escapeSvg(
  player.name ||
  "Player"
)}
</text>

<text
x="${x}"
y="903"
text-anchor="middle"
fill="#d9e0db"
font-family="Arial"
font-size="11"
>
${escapeSvg(
  player.position
)}
</text>
</g>
`;
        }
      )
      .join("");

  const svg = `
<svg
xmlns="http://www.w3.org/2000/svg"
xmlns:xlink="http://www.w3.org/1999/xlink"
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
opacity=".9"
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

<rect
x="18"
y="770"
width="1164"
height="155"
rx="12"
fill="#07130c"
opacity=".95"
/>

<text
x="600"
y="805"
text-anchor="middle"
fill="white"
font-family="Arial"
font-size="23"
font-weight="bold"
>
BENCH
</text>

${benchPlayers}

</svg>
`;

  return sharp(
    Buffer.from(svg)
  )
    .png()
    .toBuffer();
}

/* =========================
   PITCH PAGE
========================= */

function pitchPage(session) {
  const original =
    JSON.stringify(
      session.roster.map(
        p => ({
          x: p.x,
          y: p.y
        })
      )
    );

  return `
<!DOCTYPE html>
<html>
<head>

<meta charset="UTF-8">

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
min-height:70px;
display:flex;
align-items:center;
justify-content:space-between;
gap:10px;
padding:10px 20px;
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
margin-top:3px;
font-size:12px;
color:#8d9a91;
}

.top-buttons{
display:flex;
gap:8px;
}

button{
font-family:inherit;
cursor:pointer;
border:0;
touch-action:manipulation;
}

.top-button{
padding:12px 17px;
border-radius:9px;
color:white;
background:#252d28;
font-weight:800;
}

.finish{
background:#15803d;
}

.main{
display:flex;
align-items:flex-start;
justify-content:center;
gap:18px;
padding:18px;
}

.pitch-area{
width:min(1000px,calc(100vw - 310px));
}

.pitch-wrap{
width:100%;
aspect-ratio:1200 / 900;
}

.pitch{
width:100%;
height:100%;
position:relative;
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

box-shadow:0 20px 60px rgba(0,0,0,.5);
}

.pitch.grid-on::after{
content:"";
position:absolute;
inset:0;

background-image:
linear-gradient(
rgba(255,255,255,.10) 1px,
transparent 1px
),
linear-gradient(
90deg,
rgba(255,255,255,.10) 1px,
transparent 1px
);

background-size:5% 5%;

pointer-events:none;
z-index:2;
}

.halfway{
position:absolute;
left:0;
right:0;
top:50%;
border-top:3px solid rgba(255,255,255,.85);
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

/* PLAYER CIRCLES */

.player{
position:absolute;
width:90px;
min-height:90px;
transform:translate(-50%,-50%);
text-align:center;
z-index:10;
touch-action:none;
user-select:none;
cursor:pointer;
}

.player.dragging{
cursor:grabbing;
z-index:50;
}

.avatar{
width:54px;
height:54px;
margin:auto;
border-radius:50%;
border:3px solid white;
background:#6f7772;
display:flex;
align-items:center;
justify-content:center;
overflow:hidden;
font-size:20px;
font-weight:900;
box-shadow:0 5px 15px rgba(0,0,0,.4);
}

.avatar img{
width:100%;
height:100%;
object-fit:cover;
display:block;
}

.empty-slot .avatar{
background:#6f7772;
}

.name{
margin-top:3px;
padding:3px 6px;
background:rgba(0,0,0,.78);
border-radius:5px;
font-size:10px;
font-weight:900;
white-space:nowrap;
max-width:125px;
margin-left:auto;
margin-right:auto;
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
outline-offset:3px;
border-radius:50%;
}

/* PANEL */

.panel{
width:270px;
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
padding:12px;
margin-bottom:7px;
border-radius:8px;
background:#202a24;
color:white;
font-weight:800;
}

.control.active{
background:#15803d;
}

.control.bench-active{
background:#a16207;
}

.status{
margin-top:10px;
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

.position-section{
margin-top:12px;
}

.position-title{
font-size:12px;
font-weight:900;
padding:7px 8px;
background:#202a24;
border-radius:7px;
margin-bottom:5px;
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

.member:hover{
background:#243229;
}

.member img{
width:34px;
height:34px;
border-radius:50%;
object-fit:cover;
}

.member-name{
font-size:11px;
font-weight:800;
overflow:hidden;
text-overflow:ellipsis;
white-space:nowrap;
}

.no-members{
font-size:10px;
color:#87948b;
padding:6px;
}

/* BENCH */

.bench-box{
margin-top:15px;
padding:12px;
border-radius:12px;
background:#0d1811;
border:1px solid rgba(255,255,255,.12);
}

.bench-title{
font-size:15px;
font-weight:900;
margin-bottom:8px;
}

.bench-list{
display:flex;
flex-wrap:wrap;
gap:8px;
}

.bench-player{
display:flex;
align-items:center;
gap:7px;
padding:7px 9px;
background:#17221b;
border-radius:8px;
cursor:pointer;
}

.bench-player:hover{
background:#2b3b30;
}

.bench-player img{
width:34px;
height:34px;
border-radius:50%;
object-fit:cover;
}

.bench-player-name{
font-size:11px;
font-weight:900;
}

.bench-remove{
font-size:9px;
color:#facc15;
margin-top:2px;
}

.bench-empty{
font-size:11px;
color:#87948b;
}

/* PHONE */

@media(max-width:850px){

body{
overflow:auto;
}

.topbar{
min-height:64px;
padding:9px;
}

.title{
font-size:16px;
}

.subtitle{
display:none;
}

.top-buttons{
gap:5px;
}

.top-button{
padding:11px 12px;
font-size:11px;
}

.main{
display:block;
padding:9px;
}

.pitch-area{
width:100%;
}

.pitch-wrap{
width:100%;
}

.panel{
width:100%;
margin-top:10px;
}

.control{
padding:14px;
font-size:13px;
}

.members{
max-height:none;
}

.player{
width:75px;
}

.avatar{
width:48px;
height:48px;
}

.name{
font-size:9px;
max-width:105px;
}

.position{
font-size:8px;
}

.bench-box{
margin-top:10px;
}

.bench-list{
max-height:180px;
overflow:auto;
}

}

@media(max-width:450px){

.title{
font-size:14px;
}

.top-button{
padding:10px 9px;
font-size:10px;
}

.player{
width:65px;
}

.avatar{
width:44px;
height:44px;
}

.name{
font-size:8px;
max-width:90px;
}

.position{
font-size:7px;
}

.center-circle{
width:100px;
height:100px;
}

}

</style>
</head>

<body>

<div class="topbar">

<div>
<div class="title">⚽ Newcastle Lineup</div>

<div class="subtitle">
${session.size}v${session.size} • Select players, move them and use the bench
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

<div class="pitch-area">

<div class="pitch-wrap">

<div
class="pitch grid-on"
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

<div class="bench-box">

<div class="bench-title">
🪑 BENCH
</div>

<div
class="bench-list"
id="benchList"
>
<div class="bench-empty">
No players on the bench.
</div>
</div>

</div>

</div>

<div class="panel">

<h2>Lineup Controls</h2>

<div class="info">
Click a grey circle to select a slot.
<br>
Choose a player from the position sections.
<br>
Move Player enables grid movement.
<br>
Bench Player sends the selected player to the bench.
<br>
The old pitch slot becomes a grey circle.
<br>
Click a bench player to remove them from the bench.
</div>

<button
class="control"
id="positionButton"
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

<button
class="control"
id="benchButton"
onclick="toggleBenchMode()"
>
🪑 Bench Player
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
${original};

let state = null;
let selected = null;
let moving = false;
let benchMode = false;
let dragging = null;

const pitch =
document.getElementById("pitch");

const players =
document.getElementById("players");

const members =
document.getElementById("members");

const benchList =
document.getElementById("benchList");

const statusBox =
document.getElementById("status");

function escapeHTML(value){
  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

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

function render(){
  renderPlayers();
  renderMembers();
  renderBench();
  updateStatus();
}

/* =========================
   PLAYERS
========================= */

function renderPlayers(){

  players.innerHTML = "";

  state.roster.forEach(
    (player,index)=>{

      /*
       * IMPORTANT:
       * Never hide a bench slot.
       * If the player is benched, the same slot
       * becomes an EMPTY GREY CIRCLE.
       */

      const el =
        document.createElement("div");

      el.className =
        "player" +
        (selected === index
          ? " selected"
          : "") +
        (
          !player.userId ||
          player.bench
            ? " empty-slot"
            : ""
        );

      el.style.left =
        player.x + "%";

      el.style.top =
        player.y + "%";

      if(
        player.userId &&
        !player.bench
      ){

        if(player.avatar){

          el.innerHTML =
            "<div class='avatar'>" +
            "<img src='" +
            escapeHTML(player.avatar) +
            "' draggable='false'>" +
            "</div>" +
            "<div class='name'>" +
            escapeHTML(player.name) +
            "</div>" +
            "<div class='position'>" +
            escapeHTML(player.position) +
            "</div>";

        }else{

          el.innerHTML =
            "<div class='avatar'>" +
            escapeHTML(
              player.name
                ? player.name
                    .charAt(0)
                    .toUpperCase()
                : "?"
            ) +
            "</div>" +
            "<div class='name'>" +
            escapeHTML(player.name) +
            "</div>" +
            "<div class='position'>" +
            escapeHTML(player.position) +
            "</div>";

        }

      }else{

        /*
         * Empty grey slot.
         */

        el.innerHTML =
          "<div class='avatar'>+</div>" +
          "<div class='name'>Select Player</div>" +
          "<div class='position'>" +
          escapeHTML(player.position) +
          "</div>";

      }

      /* CLICK */

      el.addEventListener(
        "click",
        event=>{

          event.stopPropagation();

          /*
           * Bench mode:
           * click a player on the pitch
           * and send them to bench.
           */

          if(
            benchMode &&
            player.userId &&
            !player.bench
          ){

            sendToBench(index);

            return;
          }

          selected = index;

          renderPlayers();

          updateStatus();

          showMembers();

        }
      );

      /* DRAG */

      el.addEventListener(
        "pointerdown",
        event=>{

          if(!moving) return;

          event.preventDefault();

          selected = index;

          dragging = {
            element:el,
            index:index,
            pointerId:event.pointerId
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

      el.addEventListener(
        "pointermove",
        event=>{

          if(
            !dragging ||
            dragging.element !== el
          ){
            return;
          }

          event.preventDefault();

          const rect =
            pitch.getBoundingClientRect();

          let x =
            (
              (event.clientX -
              rect.left) /
              rect.width
            ) * 100;

          let y =
            (
              (event.clientY -
              rect.top) /
              rect.height
            ) * 100;

          /*
           * 5% GRID
           */

          x =
            Math.round(x / 5) * 5;

          y =
            Math.round(y / 5) * 5;

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

      el.addEventListener(
        "pointerup",
        async event=>{

          if(!dragging) return;

          try{
            el.releasePointerCapture(
              event.pointerId
            );
          }catch{}

          el.classList.remove(
            "dragging"
          );

          const dragIndex =
            dragging.index;

          dragging = null;

          await saveMove(
            dragIndex
          );

        }
      );

      players.appendChild(el);

    }
  );
}

/* =========================
   SERVER MEMBERS
========================= */

function renderMembers(){

  members.innerHTML = "";

  if(
    !state.serverMembers ||
    !state.serverMembers.length
  ){

    members.innerHTML =
      "<div class='no-members'>" +
      "No server members found." +
      "</div>";

    return;
  }

  const sections = [
    "GK",
    "CB",
    "CM",
    "LW",
    "RW",
    "ST",
    "Other"
  ];

  const grouped = {};

  sections.forEach(
    section=>{
      grouped[section] = [];
    }
  );

  state.serverMembers.forEach(
    member=>{

      let position =
        String(
          member.position ||
          "Other"
        ).toUpperCase();

      if(
        !grouped[position]
      ){
        position = "Other";
      }

      grouped[position].push(
        member
      );

    }
  );

  sections.forEach(
    section=>{

      const sectionDiv =
        document.createElement("div");

      sectionDiv.className =
        "position-section";

      const title =
        document.createElement("div");

      title.className =
        "position-title";

      title.textContent =
        section;

      sectionDiv.appendChild(
        title
      );

      if(
        !grouped[section].length
      ){

        const empty =
          document.createElement("div");

        empty.className =
          "no-members";

        empty.textContent =
          "No players";

        sectionDiv.appendChild(
          empty
        );

      }else{

        grouped[section].forEach(
          member=>{

            const el =
              document.createElement("div");

            el.className =
              "member";

            el.innerHTML =
              "<img src='" +
              escapeHTML(
                member.avatar
              ) +
              "'>" +
              "<div>" +
              "<div class='member-name'>" +
              escapeHTML(
                member.name
              ) +
              "</div>" +
              "<div style='font-size:9px;color:#9ca89f'>" +
              escapeHTML(
                member.position ||
                section
              ) +
              "</div>" +
              "</div>";

            el.onclick =
              () =>
                assignPlayer(member);

            sectionDiv.appendChild(
              el
            );

          }
        );

      }

      members.appendChild(
        sectionDiv
      );

    }
  );

}

/* =========================
   BENCH
========================= */

function renderBench(){

  benchList.innerHTML = "";

  const bench =
    state.roster.filter(
      player =>
        player.bench &&
        player.userId
    );

  if(!bench.length){

    benchList.innerHTML =
      "<div class='bench-empty'>" +
      "No players on the bench." +
      "</div>";

    return;
  }

  bench.forEach(
    player=>{

      const el =
        document.createElement("div");

      el.className =
        "bench-player";

      el.innerHTML =
        "<img src='" +
        escapeHTML(
          player.avatar
        ) +
        "'>" +
        "<div>" +
        "<div class='bench-player-name'>" +
        escapeHTML(
          player.name
        ) +
        "</div>" +
        "<div class='bench-remove'>" +
        "Click to remove from bench" +
        "</div>" +
        "</div>";

      el.onclick =
        () =>
          removeFromBench(
            player.slot
          );

      benchList.appendChild(
        el
      );

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
      player.userId
        ? player.name
        : "Empty slot"
    ) +
    "<br>" +
    "<b>Position:</b> " +
    escapeHTML(
      player.position
    ) +
    (
      player.bench
        ? "<br><b>Status:</b> On Bench"
        : ""
    );

}

/* =========================
   SHOW MEMBERS
========================= */

function showMembers(){

  setTimeout(
    ()=>{
      members.scrollIntoView({
        behavior:"smooth",
        block:"nearest"
      });
    },
    50
  );

}

/* =========================
   ASSIGN PLAYER
========================= */

async function assignPlayer(member){

  if(selected === null){

    alert(
      "Click a grey player circle first."
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
          body:
            JSON.stringify({
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

    moving = false;
    benchMode = false;

    updateMoveButton();
    updateBenchButton();

    render();

  }catch(error){

    alert(
      error.message
    );

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

  if(position === null) return;

  const clean =
    position.trim();

  if(!clean) return;

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

    alert(
      error.message
    );

  }

}

/* =========================
   MOVE
========================= */

function toggleMove(){

  if(selected === null){

    alert(
      "Select a player or grey slot first."
    );

    return;
  }

  moving = !moving;

  if(moving){

    benchMode = false;

    updateBenchButton();

    pitch.classList.add(
      "grid-on"
    );

  }

  updateMoveButton();

}

function updateMoveButton(){

  const button =
    document.getElementById(
      "moveButton"
    );

  if(moving){

    button.classList.add(
      "active"
    );

    button.textContent =
      "✓ Moving — Grid Snap ON";

  }else{

    button.classList.remove(
      "active"
    );

    button.textContent =
      "↔ Move Player";

  }

}

/* =========================
   BENCH MODE
========================= */

function toggleBenchMode(){

  if(selected === null){

    alert(
      "Select a player first, then click Bench."
    );

    return;
  }

  const player =
    state.roster[selected];

  if(
    !player.userId ||
    player.bench
  ){

    alert(
      "Select a player who is currently on the pitch."
    );

    return;
  }

  benchMode = !benchMode;

  if(benchMode){

    moving = false;

    updateMoveButton();

  }

  updateBenchButton();

}

function updateBenchButton(){

  const button =
    document.getElementById(
      "benchButton"
    );

  if(benchMode){

    button.classList.add(
      "bench-active"
    );

    button.textContent =
      "🪑 Bench Mode — click player";

  }else{

    button.classList.remove(
      "bench-active"
    );

    button.textContent =
      "🪑 Bench Player";

  }

}

/* =========================
   SEND TO BENCH
========================= */

async function sendToBench(index){

  try{

    const response =
      await fetch(
        "/api/bench",
        {
          method:"POST",
          headers:{
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify({
              session:SESSION,
              uid:CREATOR,
              slot:index,
              bench:true
            })
        }
      );

    const data =
      await response.json();

    if(!response.ok){

      throw new Error(
        data.error ||
        "Could not move player to bench."
      );

    }

    /*
     * Player stays stored in this slot
     * but bench=true.
     *
     * renderPlayers() will therefore
     * show a NEW GREY CIRCLE here.
     */

    state.roster[index] =
      data.slot;

    selected = null;
    benchMode = false;
    moving = false;

    updateMoveButton();
    updateBenchButton();

    render();

  }catch(error){

    alert(
      error.message
    );

  }

}

/* =========================
   REMOVE FROM BENCH
========================= */

async function removeFromBench(index){

  try{

    const response =
      await fetch(
        "/api/bench",
        {
          method:"POST",
          headers:{
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify({
              session:SESSION,
              uid:CREATOR,
              slot:index,
              bench:false
            })
        }
      );

    const data =
      await response.json();

    if(!response.ok){

      throw new Error(
        data.error ||
        "Could not remove player from bench."
      );

    }

    /*
     * They return to the exact same
     * grey-circle position.
     */

    state.roster[index] =
      data.slot;

    selected = index;

    render();

  }catch(error){

    alert(
      error.message
    );

  }

}

/* =========================
   SAVE MOVE
========================= */

async function saveMove(index){

  const player =
    state.roster[index];

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
              uid:CREATOR,
              slot:index,
              x:player.x,
              y:player.y
            })
        }
      );

    if(!response.ok){
      console.error(
        "Move save failed."
      );
    }

  }catch(error){

    console.error(
      "Move save error:",
      error
    );

  }

}

/* =========================
   RESET
========================= */

async function resetLineup(){

  if(
    !confirm(
      "Reset all players?"
    )
  ){
    return;
  }

  state.roster.forEach(
    (player,index)=>{

      player.userId = null;
      player.name = "";
      player.avatar = "";
      player.bench = false;

      player.x =
        ORIGINAL[index].x;

      player.y =
        ORIGINAL[index].y;

    }
  );

  selected = null;
  moving = false;
  benchMode = false;

  updateMoveButton();
  updateBenchButton();

  render();

  await saveAll();

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
          body:
            JSON.stringify({
              uid:CREATOR,
              roster:state.roster
            })
        }
      );

    if(!response.ok){

      const data =
        await response.json();

      console.error(
        "Save failed:",
        data
      );

      return false;
    }

    return true;

  }catch(error){

    console.error(
      "Save error:",
      error
    );

    return false;

  }

}

/* =========================
   FINISH
========================= */

async function finishLineup(){

  if(
    !confirm(
      "Finish this lineup and post it to the Discord channel?"
    )
  ){
    return;
  }

  const saved =
    await saveAll();

  if(!saved){

    alert(
      "Could not save the lineup. Try again."
    );

    return;
  }

  const button =
    document.querySelector(
      ".finish"
    );

  button.disabled = true;

  button.textContent =
    "Posting...";

  try{

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
          body:
            JSON.stringify({
              uid:CREATOR
            })
        }
      );

    const data =
      await response.json();

    if(!response.ok){

      throw new Error(
        data.error ||
        "Could not finish lineup."
      );

    }

    button.textContent =
      "✓ Posted!";

  }catch(error){

    button.disabled = false;

    button.textContent =
      "✓ Done";

    alert(
      error.message
    );

  }

}

load();

</script>

</body>
</html>
`;
}
