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

  const bench = [];

  for (let i = 0; i < 5; i++) {
    bench.push({
      slot: i,
      userId: null,
      name: "",
      avatar: ""
    });
  }

  const session = {
    id: makeId(),
    creatorId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    size,
    roster,
    bench,
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
       /lineup
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

      for (let i = 0; i < buttons.length; i += 4) {
        rows.push(
          new ActionRowBuilder().addComponents(
            buttons.slice(i, i + 4)
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
       SIZE
    ========================= */

    if (
      interaction.isButton() &&
      interaction.customId.startsWith("lineup_size_")
    ) {
      const size = Number(
        interaction.customId.replace("lineup_size_", "")
      );

      if (size < 1 || size > 11) {
        return interaction.reply({
          content: "❌ Invalid lineup size.",
          ephemeral: true
        });
      }

      const session = createSession(interaction, size);

      const url =
        `${getBaseUrl()}/pitch/${session.id}?uid=${interaction.user.id}`;

      const button = new ButtonBuilder()
        .setLabel("⚽ OPEN LINEUP EDITOR")
        .setStyle(ButtonStyle.Link)
        .setURL(url);

      const row =
        new ActionRowBuilder().addComponents(button);

      await interaction.update({
        content:
          `⚽ **${size}v${size} LINEUP CREATED**\n\n` +
          "Open the editor below.",
        components: [row]
      });

      return;
    }

    /* =========================
       OLD FINISH BUTTON
    ========================= */

    if (
      interaction.isButton() &&
      interaction.customId.startsWith("finish_")
    ) {
      const sessionId =
        interaction.customId.replace("finish_", "");

      const session = sessions.get(sessionId);

      if (!session) {
        return interaction.reply({
          content: "❌ This lineup has expired.",
          ephemeral: true
        });
      }

      if (interaction.user.id !== session.creatorId) {
        return interaction.reply({
          content: "❌ Only the creator can finish this lineup.",
          ephemeral: true
        });
      }

      await postFinalLineup(session, interaction);

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

/* =========================
   POST FINAL LINEUP
========================= */

async function postFinalLineup(session, interaction) {
  if (session.finished) {
    return interaction.reply({
      content: "❌ This lineup has already been posted.",
      ephemeral: true
    });
  }

  session.finished = true;

  const image = await createPitchImage(session);

  const attachment = new AttachmentBuilder(image, {
    name: "newcastle-lineup.png"
  });

  const starters =
    session.roster.filter(player => player.userId);

  const bench =
    session.bench.filter(player => player.userId);

  let text =
    `**NEWCASTLE LINEUP TODAY ENJOY**\n\n` +
    `⚽ **${session.size}v${session.size} LINEUP**\n\n`;

  if (starters.length) {
    text +=
      starters
        .map(
          player =>
            `**${player.position}** — ${player.name}`
        )
        .join("\n");
  }

  if (bench.length) {
    text +=
      `\n\n🪑 **BENCH**\n` +
      bench
        .map(
          (player, index) =>
            `**SUB ${index + 1}** — ${player.name}`
        )
        .join("\n");
  }

  const channel =
    await client.channels.fetch(session.channelId);

  await channel.send({
    content: text,
    files: [attachment]
  });

  if (interaction && !interaction.replied) {
    await interaction.reply({
      content:
        "✅ **NEWCASTLE LINEUP TODAY ENJOY**\n\n" +
        "The lineup has been posted in this channel!",
      ephemeral: true
    });
  }
}

/* =========================
   HTTP SERVER
========================= */

const server = http.createServer(async (req, res) => {
  try {

    const requestUrl = new URL(
      req.url,
      `http://${req.headers.host || "localhost"}`
    );

    /* HEALTH */

    if (requestUrl.pathname === "/health") {
      return sendJson(res, 200, {
        online: true,
        discord: client.isReady(),
        bot: client.user?.tag || null
      });
    }

    /* PITCH */

    if (requestUrl.pathname.startsWith("/pitch/")) {
      const sessionId =
        requestUrl.pathname.split("/")[2];

      const session = sessions.get(sessionId);

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

    /* GET SESSION */

    if (
      requestUrl.pathname.startsWith("/api/session/") &&
      req.method === "GET"
    ) {
      const sessionId =
        requestUrl.pathname.split("/")[3];

      const session = sessions.get(sessionId);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found"
        });
      }

      const guild =
        client.guilds.cache.get(session.guildId);

      let serverMembers = [];

      if (guild) {
        try {
          const fetched =
            await guild.members.fetch();

          serverMembers =
            fetched
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
              });
        } catch (error) {
          console.error(
            "❌ Could not fetch members:",
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
        bench: session.bench,
        serverMembers
      });
    }

    /* POST SESSION */

    if (
      requestUrl.pathname.startsWith("/api/session/") &&
      req.method === "POST"
    ) {
      const sessionId =
        requestUrl.pathname.split("/")[3];

      const session = sessions.get(sessionId);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found"
        });
      }

      const body = await readBody(req);

      if (
        body.uid &&
        body.uid !== session.creatorId
      ) {
        return sendJson(res, 403, {
          error: "You cannot edit this lineup."
        });
      }

      if (Array.isArray(body.roster)) {
        body.roster.forEach((player, index) => {
          if (!session.roster[index]) return;

          if (Number.isFinite(Number(player.x))) {
            session.roster[index].x =
              Math.max(
                4,
                Math.min(96, Number(player.x))
              );
          }

          if (Number.isFinite(Number(player.y))) {
            session.roster[index].y =
              Math.max(
                4,
                Math.min(96, Number(player.y))
              );
          }

          if (typeof player.position === "string") {
            session.roster[index].position =
              player.position
                .trim()
                .slice(0, 20);
          }
        });
      }

      if (Array.isArray(body.bench)) {
        body.bench.forEach((player, index) => {
          if (!session.bench[index]) return;

          session.bench[index].userId =
            player.userId || null;

          session.bench[index].name =
            player.name || "";

          session.bench[index].avatar =
            player.avatar || "";
        });
      }

      return sendJson(res, 200, {
        success: true,
        roster: session.roster,
        bench: session.bench
      });
    }

    /* FINISH */

    if (
      requestUrl.pathname.startsWith("/api/finish/") &&
      req.method === "POST"
    ) {
      const sessionId =
        requestUrl.pathname.split("/")[3];

      const session = sessions.get(sessionId);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found."
        });
      }

      const body = await readBody(req);

      if (body.uid !== session.creatorId) {
        return sendJson(res, 403, {
          error: "Only the creator can finish this lineup."
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

      const starters =
        session.roster.filter(p => p.userId);

      const bench =
        session.bench.filter(p => p.userId);

      let message =
        `**NEWCASTLE LINEUP TODAY ENJOY**\n\n` +
        `⚽ **${session.size}v${session.size} LINEUP**`;

      if (starters.length) {
        message +=
          "\n\n" +
          starters
            .map(
              p =>
                `**${p.position}** — ${p.name}`
            )
            .join("\n");
      }

      if (bench.length) {
        message +=
          "\n\n🪑 **BENCH**\n" +
          bench
            .map(
              (p, i) =>
                `**SUB ${i + 1}** — ${p.name}`
            )
            .join("\n");
      }

      const channel =
        await client.channels.fetch(
          session.channelId
        );

      await channel.send({
        content: message,
        files: [attachment]
      });

      return sendJson(res, 200, {
        success: true
      });
    }

    /* ASSIGN STARTER */

    if (
      requestUrl.pathname === "/api/assign" &&
      req.method === "POST"
    ) {
      const body = await readBody(req);

      const session =
        sessions.get(body.session);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found."
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

      const member =
        await guild.members.fetch(
          body.userId
        );

      if (!member || member.user.bot) {
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

    /* ASSIGN BENCH */

    if (
      requestUrl.pathname === "/api/bench" &&
      req.method === "POST"
    ) {
      const body = await readBody(req);

      const session =
        sessions.get(body.session);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found."
        });
      }

      if (body.uid !== session.creatorId) {
        return sendJson(res, 403, {
          error: "You cannot edit this lineup."
        });
      }

      const slot =
        session.bench[Number(body.slot)];

      if (!slot) {
        return sendJson(res, 400, {
          error: "Invalid bench slot."
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

      const member =
        await guild.members.fetch(
          body.userId
        );

      if (!member || member.user.bot) {
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

    /* POSITION */

    if (
      requestUrl.pathname === "/api/position" &&
      req.method === "POST"
    ) {
      const body = await readBody(req);

      const session =
        sessions.get(body.session);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found."
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

      slot.position =
        position;

      return sendJson(res, 200, {
        success: true,
        slot
      });
    }

    /* MOVE */

    if (
      requestUrl.pathname === "/api/move" &&
      req.method === "POST"
    ) {
      const body = await readBody(req);

      const session =
        sessions.get(body.session);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found."
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

      /* GRID SNAP */

      const grid = 2;

      x = Math.round(x / grid) * grid;
      y = Math.round(y / grid) * grid;

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

    return sendHtml(
      res,
      404,
      errorPage("Page not found.")
    );

  } catch (error) {
    console.error("❌ HTTP error:", error);

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
      `🌐 Web server listening on ${PORT}`
    );
  }
);

client.login(TOKEN).catch(error => {
  console.error(
    "❌ Discord login failed:",
    error
  );

  process.exit(1);
});

/* =========================
   HELPERS
========================= */

function sendHtml(res, status, html) {
  res.writeHead(status, {
    "Content-Type":
      "text/html; charset=utf-8"
  });

  res.end(html);
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type":
      "application/json; charset=utf-8"
  });

  res.end(JSON.stringify(data));
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
      try {
        resolve(
          data
            ? JSON.parse(data)
            : {}
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
   FINAL IMAGE
========================= */

async function createPitchImage(session) {

  const width = 1400;
  const pitchX = 35;
  const pitchY = 35;
  const pitchWidth = 1330;
  const pitchHeight = 700;

  const benchY = 755;
  const height = 980;

  const players =
    session.roster
      .filter(p => p.userId)
      .map(p => {

        const x =
          pitchX +
          (p.x / 100) *
          pitchWidth;

        const y =
          pitchY +
          (p.y / 100) *
          pitchHeight;

        const first =
          p.name
            ? p.name
                .charAt(0)
                .toUpperCase()
            : "?";

        return `
<g>

<circle
cx="${x}"
cy="${y}"
r="31"
fill="#202a24"
stroke="white"
stroke-width="4"
/>

<text
x="${x}"
y="${y + 8}"
text-anchor="middle"
fill="white"
font-family="Arial"
font-size="27"
font-weight="bold"
>
${escapeSvg(first)}
</text>

<rect
x="${x - 75}"
y="${y + 38}"
width="150"
height="28"
rx="7"
fill="#06140b"
/>

<text
x="${x}"
y="${y + 58}"
text-anchor="middle"
fill="white"
font-family="Arial"
font-size="15"
font-weight="bold"
>
${escapeSvg(p.name || "Player")}
</text>

<text
x="${x}"
y="${y + 84}"
text-anchor="middle"
fill="white"
font-family="Arial"
font-size="14"
font-weight="bold"
>
${escapeSvg(p.position)}
</text>

</g>
`;
      })
      .join("");

  const benchPlayers =
    session.bench
      .map((p, index) => {

        const boxWidth = 240;
        const gap = 18;

        const x =
          45 +
          index *
          (boxWidth + gap);

        if (!p.userId) {
          return `
<g>
<rect
x="${x}"
y="${benchY}"
width="${boxWidth}"
height="150"
rx="14"
fill="#101b14"
stroke="#2d3b31"
stroke-width="2"
/>

<text
x="${x + boxWidth / 2}"
y="${benchY + 55}"
text-anchor="middle"
fill="#758278"
font-family="Arial"
font-size="22"
font-weight="bold"
>
SUB ${index + 1}
</text>

<text
x="${x + boxWidth / 2}"
y="${benchY + 90}"
text-anchor="middle"
fill="#4d594f"
font-family="Arial"
font-size="15"
>
Empty
</text>
</g>
`;
        }

        const first =
          p.name
            ? p.name
                .charAt(0)
                .toUpperCase()
            : "?";

        return `
<g>

<rect
x="${x}"
y="${benchY}"
width="${boxWidth}"
height="150"
rx="14"
fill="#101b14"
stroke="#ffffff"
stroke-width="2"
/>

<circle
cx="${x + 48}"
cy="${benchY + 75}"
r="31"
fill="#202a24"
stroke="white"
stroke-width="3"
/>

<text
x="${x + 48}"
y="${benchY + 83}"
text-anchor="middle"
fill="white"
font-family="Arial"
font-size="25"
font-weight="bold"
>
${escapeSvg(first)}
</text>

<text
x="${x + 105}"
y="${benchY + 68}"
fill="white"
font-family="Arial"
font-size="17"
font-weight="bold"
>
${escapeSvg(p.name)}
</text>

<text
x="${x + 105}"
y="${benchY + 94}"
fill="#8fa095"
font-family="Arial"
font-size="13"
>
SUB ${index + 1}
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
stop-color="#277d45"
/>

<stop
offset="50%"
stop-color="#23753f"
/>

<stop
offset="100%"
stop-color="#277d45"
/>
</linearGradient>

<pattern
id="stripes"
width="140"
height="140"
patternUnits="userSpaceOnUse"
>
<rect
width="140"
height="70"
fill="#277d45"
/>

<rect
y="70"
width="140"
height="70"
fill="#23753f"
/>
</pattern>

</defs>

<!-- PITCH -->

<rect
x="${pitchX}"
y="${pitchY}"
width="${pitchWidth}"
height="${pitchHeight}"
rx="18"
fill="url(#stripes)"
stroke="#ffffff"
stroke-width="5"
/>

<!-- HALF WAY -->

<line
x1="${pitchX}"
y1="${pitchY + pitchHeight / 2}"
x2="${pitchX + pitchWidth}"
y2="${pitchY + pitchHeight / 2}"
stroke="white"
stroke-width="4"
/>

<!-- CENTRE CIRCLE -->

<circle
cx="${pitchX + pitchWidth / 2}"
cy="${pitchY + pitchHeight / 2}"
r="92"
fill="none"
stroke="white"
stroke-width="4"
/>

<circle
cx="${pitchX + pitchWidth / 2}"
cy="${pitchY + pitchHeight / 2}"
r="6"
fill="white"
/>

<!-- TOP BOX -->

<rect
x="${pitchX + pitchWidth * .26}"
y="${pitchY}"
width="${pitchWidth * .48}"
height="${pitchHeight * .19}"
fill="none"
stroke="white"
stroke-width="4"
/>

<!-- TOP SIX -->

<rect
x="${pitchX + pitchWidth * .39}"
y="${pitchY}"
width="${pitchWidth * .22}"
height="${pitchHeight * .085}"
fill="none"
stroke="white"
stroke-width="4"
/>

<!-- BOTTOM BOX -->

<rect
x="${pitchX + pitchWidth * .26}"
y="${pitchY + pitchHeight * .81}"
width="${pitchWidth * .48}"
height="${pitchHeight * .19}"
fill="none"
stroke="white"
stroke-width="4"
/>

<!-- BOTTOM SIX -->

<rect
x="${pitchX + pitchWidth * .39}"
y="${pitchY + pitchHeight * .915}"
width="${pitchWidth * .22}"
height="${pitchHeight * .085}"
fill="none"
stroke="white"
stroke-width="4"
/>

${players}

<!-- BENCH TITLE -->

<text
x="${width / 2}"
y="${benchY - 18}"
text-anchor="middle"
fill="white"
font-family="Arial"
font-size="22"
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
   PITCH EDITOR
========================= */

function pitchPage(session) {

  const original =
    session.roster.map(p => ({
      x: p.x,
      y: p.y
    }));

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
position:sticky;
top:0;
z-index:1000;
min-height:70px;
display:flex;
align-items:center;
justify-content:space-between;
gap:12px;
padding:10px 18px;
background:#08110c;
border-bottom:1px solid rgba(255,255,255,.12);
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
padding:11px 16px;
border-radius:9px;
color:white;
background:#252d28;
font-weight:900;
}

.finish{
background:#15803d;
}

.finish:disabled{
opacity:.6;
}

.main{
width:100%;
max-width:1450px;
margin:auto;
display:flex;
align-items:flex-start;
justify-content:center;
gap:18px;
padding:18px;
}

.pitch-wrap{
width:min(1000px,calc(100vw - 310px));
}

.pitch{
width:100%;
aspect-ratio:1.9 / 1;
position:relative;
overflow:hidden;
border-radius:15px;
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

touch-action:none;
}

.halfway{
position:absolute;
left:0;
right:0;
top:50%;
border-top:3px solid rgba(255,255,255,.9);
pointer-events:none;
}

.center-circle{
position:absolute;
left:50%;
top:50%;
width:17%;
aspect-ratio:1;
transform:translate(-50%,-50%);
border:3px solid white;
border-radius:50%;
pointer-events:none;
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
pointer-events:none;
}

.box{
position:absolute;
left:50%;
transform:translateX(-50%);
width:36%;
height:19%;
border-left:3px solid white;
border-right:3px solid white;
pointer-events:none;
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
pointer-events:none;
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
width:90px;
min-height:92px;
transform:translate(-50%,-50%);
text-align:center;
z-index:10;
touch-action:none;
user-select:none;
-webkit-user-select:none;
cursor:grab;
}

.player.dragging{
cursor:grabbing;
z-index:100;
}

.avatar{
width:55px;
height:55px;
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
}

.name{
margin-top:3px;
padding:3px 6px;
background:rgba(0,0,0,.78);
border-radius:5px;
font-size:10px;
font-weight:900;
white-space:nowrap;
max-width:130px;
overflow:hidden;
text-overflow:ellipsis;
}

.position{
margin-top:2px;
font-size:9px;
font-weight:900;
}

.panel{
width:270px;
max-height:calc(100vh - 105px);
overflow:auto;
padding:15px;
border-radius:13px;
background:#0d1811;
border:1px solid rgba(255,255,255,.12);
position:sticky;
top:88px;
}

.panel h2{
margin:0 0 8px;
font-size:17px;
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
font-weight:900;
}

.control.active{
background:#15803d;
}

.selected{
outline:3px solid #facc15;
outline-offset:3px;
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
border-radius:8px;
background:#17221b;
cursor:pointer;
min-height:48px;
}

.member:hover{
background:#27352b;
}

.member img{
width:34px;
height:34px;
border-radius:50%;
flex-shrink:0;
}

.member-name{
font-size:11px;
font-weight:800;
overflow:hidden;
text-overflow:ellipsis;
white-space:nowrap;
}

.status{
margin-top:10px;
padding:9px;
background:#18231c;
border-radius:7px;
font-size:11px;
}

.bench-editor{
margin-top:14px;
padding-top:12px;
border-top:1px solid rgba(255,255,255,.1);
}

.bench-title{
font-size:15px;
font-weight:900;
margin-bottom:8px;
}

.bench-slots{
display:grid;
grid-template-columns:1fr;
gap:6px;
}

.bench-slot{
display:flex;
align-items:center;
gap:8px;
padding:9px;
border-radius:8px;
background:#17221b;
border:2px solid transparent;
cursor:pointer;
}

.bench-slot.selected{
border-color:#facc15;
outline:none;
}

.bench-slot img{
width:34px;
height:34px;
border-radius:50%;
}

.bench-empty{
color:#7d897f;
font-size:11px;
font-weight:800;
}

.modal{
position:fixed;
inset:0;
z-index:5000;
display:none;
align-items:center;
justify-content:center;
padding:20px;
background:rgba(0,0,0,.7);
}

.modal.show{
display:flex;
}

.modal-box{
width:min(420px,100%);
background:#101b14;
border:1px solid rgba(255,255,255,.15);
border-radius:15px;
padding:20px;
box-shadow:0 20px 60px rgba(0,0,0,.6);
}

.modal-box h2{
margin:0 0 12px;
}

.position-input{
width:100%;
padding:13px;
border:0;
outline:0;
border-radius:8px;
background:#202a24;
color:white;
font-size:16px;
font-weight:800;
}

.modal-buttons{
display:flex;
gap:8px;
margin-top:12px;
}

.modal-buttons button{
flex:1;
padding:12px;
border-radius:8px;
font-weight:900;
color:white;
background:#27352b;
}

.modal-buttons .save{
background:#15803d;
}

@media(max-width:850px){

.topbar{
min-height:62px;
padding:8px;
}

.title{
font-size:16px;
}

.subtitle{
display:none;
}

.top-button{
padding:10px 11px;
font-size:11px;
}

.main{
display:block;
padding:8px;
}

.pitch-wrap{
width:100%;
}

.pitch{
width:100%;
aspect-ratio:1.55 / 1;
border-radius:11px;
}

.player{
width:70px;
min-height:75px;
}

.avatar{
width:43px;
height:43px;
border-width:2px;
font-size:16px;
}

.name{
font-size:8px;
max-width:92px;
padding:2px 4px;
}

.position{
font-size:8px;
}

.panel{
position:relative;
top:auto;
width:100%;
max-height:none;
margin-top:10px;
padding:12px;
}

.control{
padding:14px;
font-size:14px;
}

.members{
display:grid;
grid-template-columns:1fr 1fr;
gap:6px;
}

.member{
min-height:52px;
}

.bench-slots{
grid-template-columns:1fr 1fr;
}

}

@media(max-width:450px){

.members{
grid-template-columns:1fr;
}

.bench-slots{
grid-template-columns:1fr 1fr;
}

.topbar{
position:sticky;
}

}

</style>
</head>

<body>

<div class="topbar">

<div>
<div class="title">⚽ Football Lineup</div>
<div class="subtitle">
${session.size}v${session.size} • Select players, change positions and move them
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

<div class="pitch" id="pitch">

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

<h2>Lineup Controls</h2>

<div class="info">
Tap a player circle to select them.
Then tap a server player to assign them.
Use Move Player and drag with your finger.
Players snap to a small grid.
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

<div class="bench-editor">

<div class="bench-title">
🪑 Bench
</div>

<div
class="info"
>
Select a bench slot, then select a server player.
</div>

<div
class="bench-slots"
id="benchSlots"
></div>

</div>

<div
class="members"
id="members"
></div>

</div>

</div>

<!-- POSITION MODAL -->

<div
class="modal"
id="positionModal"
>

<div class="modal-box">

<h2>⚽ Change Position</h2>

<input
class="position-input"
id="positionInput"
placeholder="Example: LW"
/>

<div class="modal-buttons">

<button
onclick="closePositionModal()"
>
Cancel
</button>

<button
class="save"
onclick="savePosition()"
>
Save Position
</button>

</div>

</div>

</div>

<script>

"use strict";

const SESSION =
"${escapeHtml(session.id)}";

const CREATOR =
"${escapeHtml(session.creatorId)}";

const ORIGINAL =
${JSON.stringify(original)};

let state = null;

let selected = null;

let selectedBench = null;

let moving = false;

let dragging = null;

const pitch =
document.getElementById("pitch");

const players =
document.getElementById("players");

const members =
document.getElementById("members");

const benchSlots =
document.getElementById("benchSlots");

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

if(!state.bench){

state.bench =
Array.from(
{length:5},
(_,i)=>({
slot:i,
userId:null,
name:"",
avatar:""
})
);

}

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

/* TAP */

el.addEventListener(
"click",
event=>{

event.stopPropagation();

if(dragging){
return;
}

selected =
index;

selectedBench =
null;

renderPlayers();

renderBench();

updateStatus();

});

}

/* TOUCH / MOUSE DRAG */

el.addEventListener(
"pointerdown",
event=>{

if(!moving){
return;
}

event.preventDefault();

selected =
index;

selectedBench =
null;

dragging = {
element:el,
index:index,
pointerId:event.pointerId
};

el.classList.add("dragging");

try{
el.setPointerCapture(
event.pointerId
);
}catch{}

});

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
(event.clientX - rect.left) /
rect.width
) * 100;

let y =
(
(event.clientY - rect.top) /
rect.height
) * 100;

/* GRID */

const grid = 2;

x =
Math.round(x / grid) * grid;

y =
Math.round(y / grid) * grid;

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

});

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

});

players.appendChild(el);

});

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
"'>" +

"<div class='member-name'>" +
escapeHTML(member.name) +
"</div>";

el.onclick =
()=>assignPlayer(member);

members.appendChild(el);

});

}

/* =========================
   BENCH
========================= */

function renderBench(){

benchSlots.innerHTML = "";

state.bench.forEach(
(slot,index)=>{

const el =
document.createElement("div");

el.className =
"bench-slot" +
(selectedBench === index
? " selected"
: "");

if(slot.userId){

el.innerHTML =
"<img src='" +
escapeHTML(slot.avatar) +
"'>" +

"<div>" +
"<b>" +
escapeHTML(slot.name) +
"</b>" +
"<br>" +
"<span style='font-size:10px;color:#7d897f'>SUB " +
(index + 1) +
"</span>" +
"</div>";

}else{

el.innerHTML =
"<div class='bench-empty'>" +
"SUB " +
(index + 1) +
" — Empty" +
"</div>";

}

el.onclick =
()=>{

selectedBench =
index;

selected =
null;

renderBench();

renderPlayers();

updateStatus();

};

benchSlots.appendChild(el);

});

}

/* =========================
   STATUS
========================= */

function updateStatus(){

if(selectedBench !== null){

const sub =
state.bench[selectedBench];

statusBox.innerHTML =
"<b>Bench slot:</b> SUB " +
(selectedBench + 1) +
"<br>" +
"<b>Player:</b> " +
escapeHTML(
sub.name ||
"Empty"
);

return;

}

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

/* BENCH */

if(selectedBench !== null){

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
body:JSON.stringify({
session:SESSION,
uid:CREATOR,
slot:selectedBench,
userId:member.id
})
}
);

const data =
await response.json();

if(!response.ok){

throw new Error(
data.error ||
"Could not assign bench player."
);

}

state.bench[selectedBench] =
data.slot;

render();

}catch(error){

alert(error.message);

}

return;

}

/* STARTER */

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
   POSITION MODAL
========================= */

function changePosition(){

if(selected === null){

alert(
"Select a player first."
);

return;

}

const player =
state.roster[selected];

document.getElementById(
"positionInput"
).value =
player.position || "";

document.getElementById(
"positionModal"
).classList.add("show");

setTimeout(
()=>{
document.getElementById(
"positionInput"
).focus();
},
50
);

}

function closePositionModal(){

document.getElementById(
"positionModal"
).classList.remove(
"show"
);

}

async function savePosition(){

if(selected === null){

closePositionModal();

return;

}

const input =
document.getElementById(
"positionInput"
);

const position =
input.value.trim();

if(!position){

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
position:position
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

closePositionModal();

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

moving =
!moving;

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
   RESET
========================= */

async function resetLineup(){

if(
!confirm(
"Reset the entire lineup and bench?"
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

});

state.bench.forEach(
bench=>{

bench.userId = null;
bench.name = "";
bench.avatar = "";

});

selected = null;
selectedBench = null;
moving = false;

const moveButton =
document.getElementById(
"moveButton"
);

moveButton.classList.remove(
"active"
);

moveButton.textContent =
"↔ Move Player";

render();

await saveAll();

}

/* =========================
   SAVE ALL
========================= */

async function saveAll(){

try{

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
roster:state.roster,
bench:state.bench
})
}
);

}catch(error){

console.error(
"Save error:",
error
);

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

const button =
document.querySelector(
".finish"
);

button.disabled = true;

button.textContent =
"Posting...";

try{

await saveAll();

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
"Could not finish lineup."
);

}

button.textContent =
"✓ Posted!";

}catch(error){

button.disabled = false;

button.textContent =
"✓ Done";

alert(error.message);

}

}

/* =========================
   CLOSE MODAL
========================= */

document
.getElementById("positionModal")
.addEventListener(
"click",
event=>{

if(
event.target.id ===
"positionModal"
){

closePositionModal();

}

}
);

load();

</script>

</body>
</html>`;
}
