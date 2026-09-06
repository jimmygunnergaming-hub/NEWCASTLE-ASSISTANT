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
  console.error("DISCORD_TOKEN is missing.");
  process.exit(1);
}

const POSITION_CHANNEL_ID = "1542615989382942756";

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

const formations = {
  1: [["GK",50,88]],

  2: [
    ["GK",50,88],
    ["ST",50,18]
  ],

  3: [
    ["GK",50,88],
    ["ST",32,20],
    ["ST",68,20]
  ],

  4: [
    ["GK",50,88],
    ["LB",25,60],
    ["RB",75,60],
    ["ST",50,18]
  ],

  5: [
    ["GK",50,88],
    ["LB",18,62],
    ["CB",50,62],
    ["RB",82,62],
    ["ST",50,18]
  ],

  6: [
    ["GK",50,88],
    ["LB",15,64],
    ["CB",38,64],
    ["CB",62,64],
    ["RB",85,64],
    ["ST",50,18]
  ],

  7: [
    ["GK",50,88],
    ["LB",12,64],
    ["CB",34,66],
    ["CB",66,66],
    ["RB",88,64],
    ["LW",30,35],
    ["ST",68,22]
  ],

  8: [
    ["GK",50,88],
    ["LB",10,65],
    ["CB",30,67],
    ["CB",70,67],
    ["RB",90,65],
    ["LM",25,38],
    ["RM",75,38],
    ["ST",50,18]
  ],

  9: [
    ["GK",50,88],
    ["LB",9,66],
    ["CB",29,69],
    ["CB",50,69],
    ["CB",71,69],
    ["RB",91,66],
    ["LW",23,37],
    ["RW",77,37],
    ["ST",50,17]
  ],

  10: [
    ["GK",50,88],
    ["LB",8,67],
    ["CB",27,70],
    ["CB",50,70],
    ["CB",73,70],
    ["RB",92,67],
    ["LM",22,43],
    ["RM",78,43],
    ["LW",34,23],
    ["ST",66,20]
  ],

  11: [
    ["GK",50,90],
    ["LB",8,69],
    ["CB",28,72],
    ["CB",50,72],
    ["CB",72,72],
    ["RB",92,69],
    ["LM",17,46],
    ["CM",38,47],
    ["CM",62,47],
    ["RM",83,46],
    ["ST",50,17]
  ]
};

/* =========================
   POSITION HELPERS
========================= */

const POSITION_GROUPS = {
  GK: ["GK"],
  CB: ["CB", "LB", "RB", "LWB", "RWB", "SW"],
  CM: ["CM", "CDM", "CAM", "LM", "RM", "DM", "AM"],
  LW: ["LW", "LM", "LWF"],
  RW: ["RW", "RM", "RWF"],
  ST: ["ST", "CF", "SS"],
  Other: []
};

function normalisePosition(text) {
  const value = String(text || "").trim().toUpperCase();

  if (!value) return "Other";

  if (value.includes("GOALKEEPER")) return "GK";
  if (value === "KEEPER") return "GK";

  if (value.includes("LEFT BACK")) return "LB";
  if (value.includes("RIGHT BACK")) return "RB";
  if (value.includes("LEFT WING")) return "LW";
  if (value.includes("RIGHT WING")) return "RW";
  if (value.includes("CENTRE BACK")) return "CB";
  if (value.includes("CENTER BACK")) return "CB";
  if (value.includes("STRIKER")) return "ST";

  for (const group of Object.values(POSITION_GROUPS)) {
    if (group.includes(value)) return value;
  }

  return value;
}

/*
  Looks through the specified Discord channel for the player.
  It accepts messages such as:

  @Player - GK
  Player - CB
  Player: ST
  Player | LW
  Player GK

  The newest matching message is used.
*/

async function getPlayerPosition(guild, userId, displayName) {
  try {
    const channel = await guild.channels.fetch(POSITION_CHANNEL_ID);

    if (!channel || !channel.isTextBased()) {
      return "Other";
    }

    let messages;

    try {
      messages = await channel.messages.fetch({ limit: 100 });
    } catch {
      return "Other";
    }

    const possibleNames = [
      String(displayName || "").toLowerCase(),
      String(userId || "").toLowerCase()
    ];

    for (const message of messages.values()) {
      const content = String(message.content || "");

      const mentioned =
        message.mentions?.users?.has(userId);

      const lower = content.toLowerCase();

      const nameMatch =
        possibleNames.some(
          name =>
            name &&
            lower.includes(name)
        );

      if (!mentioned && !nameMatch) continue;

      const upper = content.toUpperCase();

      const positions = [
        "GOALKEEPER",
        "GK",
        "LB",
        "RB",
        "CB",
        "LWB",
        "RWB",
        "LW",
        "RW",
        "LM",
        "RM",
        "CDM",
        "CM",
        "CAM",
        "DM",
        "AM",
        "ST",
        "CF",
        "SS"
      ];

      for (const position of positions) {
        if (
          new RegExp(
            `(^|[^A-Z])${position}([^A-Z]|$)`
          ).test(upper)
        ) {
          return normalisePosition(position);
        }
      }
    }
  } catch (error) {
    console.error("Position lookup error:", error);
  }

  return "Other";
}

/* =========================
   SESSION
========================= */

function createSession(interaction, size) {
  const roster = formations[size].map((p, index) => ({
    slot: index,
    position: p[0],
    x: p[1],
    y: p[2],

    /*
      Pitch players live in roster.
      Bench players are stored separately.
      This prevents assigning a new player to a grey
      circle from deleting a benched player.
    */

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
    bench: [],
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
  console.log(`Logged in as ${client.user.tag}`);

  const command = new SlashCommandBuilder()
    .setName("lineup")
    .setDescription("Create a football lineup");

  await client.application.commands.set([command]);

  console.log("/lineup registered");
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
        return interaction.reply({
          content: "Invalid lineup size.",
          ephemeral: true
        });
      }

      const session = createSession(interaction, size);

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
          "Choose players, change positions, move players and use the bench.",
        components: [
          new ActionRowBuilder().addComponents(button)
        ]
      });
    }
  } catch (error) {
    console.error("Discord interaction error:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Something went wrong.",
        ephemeral: true
      });
    }
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

      let serverMembers = [];

      if (guild) {
        try {
          const fetched =
            await guild.members.fetch();

          serverMembers =
            fetched
              .filter(m => !m.user.bot)
              .map(m => ({
                id: m.user.id,
                name: m.displayName,
                username: m.user.username,
                avatar:
                  m.user.displayAvatarURL({
                    extension: "png",
                    size: 128
                  })
              });
        } catch (error) {
          console.error(
            "Member fetch error:",
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
        bench: session.bench || [],
        serverMembers
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
          if (!session.roster[index]) return;

          const target = session.roster[index];

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

          if (typeof p.position === "string") {
            target.position =
              p.position.trim().slice(0, 20);
          }

          /*
            IMPORTANT:
            Do NOT allow the save operation to overwrite
            the actual player/bench relationship.
          */
        });
      }

      return sendJson(res, 200, {
        success: true,
        roster: session.roster,
        bench: session.bench
      });
    }

    /* ASSIGN */

    if (
      url.pathname === "/api/assign" &&
      req.method === "POST"
    ) {
      const body = await readBody(req);
      const session = sessions.get(body.session);

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
        client.guilds.cache.get(session.guildId);

      if (!guild) {
        return sendJson(res, 500, {
          error: "Discord server unavailable."
        });
      }

      const member =
        await guild.members.fetch(body.userId)
          .catch(() => null);

      if (!member || member.user.bot) {
        return sendJson(res, 404, {
          error: "Player not found."
        });
      }

      /*
        If this player is currently on the bench,
        REMOVE THEM FROM THE BENCH FIRST.
        This means putting a benched player back
        onto the pitch works correctly.
      */

      session.bench =
        (session.bench || []).filter(
          p => p.userId !== member.user.id
        );

      const detectedPosition =
        await getPlayerPosition(
          guild,
          member.user.id,
          member.displayName
        );

      slot.userId = member.user.id;
      slot.name = member.displayName;

      slot.avatar =
        member.user.displayAvatarURL({
          extension: "png",
          size: 256
        });

      slot.position =
        detectedPosition || "Other";

      slot.bench = false;

      return sendJson(res, 200, {
        success: true,
        slot,
        position: slot.position,
        bench: session.bench
      });
    }

    /* POSITION */

    if (
      url.pathname === "/api/position" &&
      req.method === "POST"
    ) {
      const body = await readBody(req);
      const session = sessions.get(body.session);

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
      const session = sessions.get(body.session);

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

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return sendJson(res, 400, {
          error: "Invalid coordinates."
        });
      }

      slot.x = Math.max(
        4,
        Math.min(96, x)
      );

      slot.y = Math.max(
        5,
        Math.min(95, y)
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
      const session = sessions.get(body.session);

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

      /*
        BENCHING:
        Copy the player into session.bench,
        then CLEAR the pitch slot.

        The grey circle remains because the slot
        itself is still there.
      */

      if (body.bench === true) {
        if (slot.userId) {
          const alreadyOnBench =
            (session.bench || []).some(
              p => p.userId === slot.userId
            );

          if (!alreadyOnBench) {
            session.bench.push({
              userId: slot.userId,
              name: slot.name,
              avatar: slot.avatar,
              position: slot.position
            });
          }
        }

        slot.userId = null;
        slot.name = "";
        slot.avatar = "";
        slot.bench = false;
      }

      /*
        REMOVE FROM BENCH:
        Put that player back into this pitch slot.
      */

      if (body.bench === false) {
        const benchPlayer =
          (session.bench || []).find(
            p =>
              p.userId === body.userId
          );

        if (benchPlayer) {
          slot.userId = benchPlayer.userId;
          slot.name = benchPlayer.name;
          slot.avatar = benchPlayer.avatar;
          slot.position = benchPlayer.position;
          slot.bench = false;

          session.bench =
            session.bench.filter(
              p =>
                p.userId !== benchPlayer.userId
            );
        }
      }

      return sendJson(res, 200, {
        success: true,
        slot,
        bench: session.bench
      });
    }

    /* FINISH */

    if (
      url.pathname.startsWith("/api/finish/") &&
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
          error: "You cannot finish this lineup."
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
          p => p.userId
        );

      const bench =
        session.bench || [];

      let text =
        "**NEWCASTLE LINEUP TODAY ENJOY**\n\n";

      if (playing.length) {
        text += playing
          .map(
            p =>
              `**${p.position}** — ${p.name}`
          )
          .join("\n");
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

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Web server listening on ${PORT}`
  );
});

client.login(TOKEN);

/* =========================
   HELPERS
========================= */

function sendHtml(res, status, html) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8"
  });

  res.end(html);
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8"
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
</html>`;
}

/* =========================
   FINAL IMAGE
========================= */

async function createPitchImage(session) {
  const width = 1200;
  const height = 900;
  const pitchHeight = 760;

  const playing =
    session.roster.filter(
      p => p.userId
    );

  const bench =
    session.bench || [];

  const playerSvg = [];

  for (const p of playing) {
    const x =
      (p.x / 100) * width;

    const y =
      (p.y / 100) * pitchHeight;

    let avatarImage = "";

    if (p.avatar) {
      try {
        const response =
          await fetch(p.avatar);

        if (response.ok) {
          const buffer =
            Buffer.from(
              await response.arrayBuffer()
            );

          const png =
            await sharp(buffer)
              .resize(100, 100, {
                fit: "cover"
              })
              .png()
              .toBuffer();

          avatarImage =
            `data:image/png;base64,${png.toString("base64")}`;
        }
      } catch (error) {
        console.error(
          "Avatar download error:",
          error
        );
      }
    }

    playerSvg.push(`
<g>
<circle
cx="${x}"
cy="${y}"
r="36"
fill="#202a24"
stroke="white"
stroke-width="4"
/>

${
  avatarImage
    ? `
<clipPath id="clip${p.slot}">
<circle cx="${x}" cy="${y}" r="32"/>
</clipPath>

<image
href="${avatarImage}"
x="${x - 32}"
y="${y - 32}"
width="64"
height="64"
preserveAspectRatio="xMidYMid slice"
clip-path="url(#clip${p.slot})"
/>
`
    : `
<text
x="${x}"
y="${y + 8}"
text-anchor="middle"
fill="white"
font-family="Arial"
font-size="23"
font-weight="bold"
>
${escapeSvg(
  p.name
    ? p.name.charAt(0).toUpperCase()
    : "?"
)}
</text>
`
}

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
  p.name || "Player"
)}
</text>

<text
x="${x}"
y="${y + 83}"
text-anchor="middle"
fill="white"
font-family="Arial"
font-size="13"
font-weight="bold"
>
${escapeSvg(p.position)}
</text>
</g>
`);
  }

  const benchSvg = bench.map(
    (p, i) => {
      const x =
        80 + (i % 6) * 200;

      const y =
        825 + Math.floor(i / 6) * 55;

      return `
<g>
<circle
cx="${x}"
cy="${y}"
r="25"
fill="#202a24"
stroke="white"
stroke-width="3"
/>

<text
x="${x}"
y="${y + 6}"
text-anchor="middle"
fill="white"
font-family="Arial"
font-size="16"
font-weight="bold"
>
${escapeSvg(
  p.name
    ? p.name.charAt(0).toUpperCase()
    : "?"
)}
</text>

<text
x="${x}"
y="${y + 40}"
text-anchor="middle"
fill="white"
font-family="Arial"
font-size="12"
font-weight="bold"
>
${escapeSvg(p.name || "Player")}
</text>

<text
x="${x}"
y="${y + 56}"
text-anchor="middle"
fill="#d9e0db"
font-family="Arial"
font-size="10"
>
${escapeSvg(p.position)}
</text>
</g>`;
    }
  ).join("");

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

${playerSvg.join("")}

<rect
x="18"
y="770"
width="1164"
height="112"
rx="12"
fill="#07130c"
opacity=".9"
/>

<text
x="600"
y="800"
text-anchor="middle"
fill="white"
font-family="Arial"
font-size="22"
font-weight="bold"
>
BENCH
</text>

${benchSvg}

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
      session.roster.map(p => ({
        x: p.x,
        y: p.y
      }))
    );

  return `<!DOCTYPE html>
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

background-size:
5% 5%;

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

/* PLAYER */

.player{
position:absolute;
width:88px;
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

/* SEARCH */

.search{
width:100%;
padding:12px;
margin-bottom:8px;
border:0;
outline:0;
border-radius:8px;
background:#18231c;
color:white;
font-size:13px;
}

.search::placeholder{
color:#819087;
}

/* SECTIONS */

.position-section{
margin-bottom:7px;
}

.section-title{
padding:8px 10px;
border-radius:7px;
background:#17221b;
font-size:11px;
font-weight:900;
cursor:pointer;
}

.section-members{
display:flex;
flex-direction:column;
gap:5px;
margin-top:5px;
}

.member{
display:flex;
align-items:center;
gap:8px;
padding:7px;
border-radius:7px;
background:#17221b;
cursor:pointer;
}

.member:hover{
background:#202d25;
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

.bench-player img{
width:34px;
height:34px;
border-radius:50%;
}

.bench-player-name{
font-size:11px;
font-weight:900;
}

.bench-empty{
font-size:11px;
color:#87948b;
}

/* PHONE */

@media(max-width:850px){

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
max-height:400px;
overflow:auto;
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
<div class="title">
⚽ Newcastle Lineup
</div>

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

<h2>
Lineup Controls
</h2>

<div class="info">
Click a grey circle to select it.
Choose a player below.
Use Move Player to drag.
Players snap to the 5% grid.
Use Bench to move the selected player to the bench.
Click a bench player to return them to the selected/empty pitch slot.
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

<input
class="search"
id="search"
placeholder="🔎 Search players..."
oninput="renderMembers()"
>

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

const searchBox =
document.getElementById("search");

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

if(!Array.isArray(state.bench)){
state.bench = [];
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
   PITCH PLAYERS
========================= */

function renderPlayers(){

players.innerHTML = "";

state.roster.forEach(
(player,index)=>{

/*
  ALWAYS render every slot.
  If a player was benched, their slot is
  empty again and therefore shows grey circle.
*/

const el =
document.createElement("div");

el.className =
"player" +
(selected === index
? " selected"
: "");

el.style.left =
player.x + "%";

el.style.top =
player.y + "%";

let avatar;

if(player.userId && player.avatar){

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
escapeHTML(player.position || "Other") +
"</div>";

/* CLICK */

el.addEventListener(
"click",
event=>{

event.stopPropagation();

if(moving){
return;
}

if(benchMode){

if(player.userId){
sendToBench(index);
}

return;

}

selected = index;

renderPlayers();
updateStatus();

renderMembers();

});

players.appendChild(el);

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
((event.clientX - rect.left) /
rect.width) * 100;

let y =
((event.clientY - rect.top) /
rect.height) * 100;

/* 5% GRID */

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

state.roster[index].x = x;
state.roster[index].y = y;

});

el.addEventListener(
"pointerup",
async event=>{

if(!dragging){
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

render();

});

});

}

/* =========================
   PLAYER LIST
========================= */

function getPositionGroup(position){

const p =
String(position || "")
.toUpperCase();

if(p === "GK"){
return "GK";
}

if(
[
"CB",
"LB",
"RB",
"LWB",
"RWB",
"SW"
].includes(p)
){
return "CB";
}

if(
[
"CM",
"CDM",
"CAM",
"LM",
"RM",
"DM",
"AM"
].includes(p)
){
return "CM";
}

if(
[
"LW",
"LWF"
].includes(p)
){
return "LW";
}

if(
[
"RW",
"RWF"
].includes(p)
){
return "RW";
}

if(
[
"ST",
"CF",
"SS"
].includes(p)
){
return "ST";
}

return "Other";

}

function renderMembers(){

members.innerHTML = "";

if(!state.serverMembers){
return;
}

const query =
String(
searchBox.value || ""
)
.toLowerCase()
.trim();

const groups = {
GK:[],
CB:[],
CM:[],
LW:[],
RW:[],
ST:[],
Other:[]
};

state.serverMembers.forEach(
member=>{

const text =
(
member.name +
" " +
member.username
)
.toLowerCase();

if(
query &&
!text.includes(query)
){
return;
}

/*
  Find position from current roster first.
  If they aren't assigned yet, use Other until
  their position is retrieved when selected.
*/

let position = "Other";

const current =
state.roster.find(
p => p.userId === member.id
);

if(current){
position =
normaliseClientPosition(
current.position
);
}

groups[position] =
groups[position] || [];

groups[position].push(member);

});

const order =
[
"GK",
"CB",
"CM",
"LW",
"RW",
"ST",
"Other"
];

order.forEach(
groupName=>{

const section =
document.createElement("div");

section.className =
"position-section";

const title =
document.createElement("div");

title.className =
"section-title";

title.textContent =
groupName;

section.appendChild(title);

const list =
document.createElement("div");

list.className =
"section-members";

groups[groupName].forEach(
member=>{

const el =
document.createElement("div");

el.className =
"member";

el.innerHTML =
"<img src='" +
escapeHTML(member.avatar) +
"'>" +
"<div>" +
"<div class='member-name'>" +
escapeHTML(member.name) +
"</div>" +
"<div style='font-size:9px;color:#8d9a91'>" +
escapeHTML(
groupName
) +
"</div>" +
"</div>";

el.onclick =
()=>assignPlayer(member);

list.appendChild(el);

});

section.appendChild(list);

members.appendChild(section);

});

}

/* =========================
   POSITION CLIENT
========================= */

function normaliseClientPosition(
position
){

const p =
String(position || "")
.toUpperCase();

if(p === "GK"){
return "GK";
}

if(
[
"CB",
"LB",
"RB",
"LWB",
"RWB",
"SW"
].includes(p)
){
return "CB";
}

if(
[
"CM",
"CDM",
"CAM",
"LM",
"RM",
"DM",
"AM"
].includes(p)
){
return "CM";
}

if(
[
"LW",
"LWF"
].includes(p)
){
return "LW";
}

if(
[
"RW",
"RWF"
].includes(p)
){
return "RW";
}

if(
[
"ST",
"CF",
"SS"
].includes(p)
){
return "ST";
}

return "Other";

}

/* =========================
   BENCH
========================= */

function renderBench(){

benchList.innerHTML = "";

const bench =
state.bench || [];

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
escapeHTML(player.avatar) +
"'>" +
"<div>" +
"<div class='bench-player-name'>" +
escapeHTML(player.name) +
"</div>" +
"<div style='font-size:9px;color:#9ca89f'>" +
escapeHTML(player.position) +
"</div>" +
"</div>";

el.onclick =
()=>removeFromBench(
player.userId
);

benchList.appendChild(el);

});

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
player.position ||
"Other"
);

}

/* =========================
   ASSIGN
========================= */

async function assignPlayer(member){

if(selected === null){

alert(
"Click a grey circle first."
);

return;

}

const slotIndex =
selected;

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
slot:slotIndex,
userId:member.id
})
});

const data =
await response.json();

if(!response.ok){

throw new Error(
data.error ||
"Could not assign player."
);

}

state.roster[slotIndex] =
data.slot;

state.bench =
data.bench || [];

benchMode = false;

updateBenchButton();

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
player.position || "Other"
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
});

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

if(moving){

benchMode = false;

updateBenchButton();

pitch.classList.add(
"grid-on"
);

}else{

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

if(!player.userId){

alert(
"Select a player that is on the pitch."
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

const player =
state.roster[index];

if(!player.userId){
return;
}

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
slot:index,
bench:true
})
});

const data =
await response.json();

if(!response.ok){

throw new Error(
data.error ||
"Could not move player to bench."
);

}

state.roster[index] =
data.slot;

state.bench =
data.bench || [];

selected = null;

benchMode = false;

updateBenchButton();

render();

}catch(error){

alert(error.message);

}

}

/* =========================
   REMOVE FROM BENCH
========================= */

async function removeFromBench(
userId
){

/*
  Find an EMPTY pitch slot.
  We never overwrite another player.
*/

const emptyIndex =
state.roster.findIndex(
p => !p.userId
);

if(emptyIndex === -1){

alert(
"There is no empty pitch slot."
);

return;

}

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
slot:emptyIndex,
bench:false,
userId:userId
})
});

const data =
await response.json();

if(!response.ok){

throw new Error(
data.error ||
"Could not remove player from bench."
);

}

state.roster[emptyIndex] =
data.slot;

state.bench =
data.bench || [];

selected = emptyIndex;

render();

}catch(error){

alert(error.message);

}

}

/* =========================
   MOVE SAVE
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
body:JSON.stringify({
session:SESSION,
uid:CREATOR,
slot:index,
x:player.x,
y:player.y
})
});

if(!response.ok){
console.error(
"Move save failed"
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

});

state.bench = [];

selected = null;

moving = false;
benchMode = false;

updateMoveButton();
updateBenchButton();

render();

await saveAll();

}

/* =========================
   SAVE
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
});

if(!response.ok){
console.error(
"Save failed"
);
}

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

await saveAll();

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
body:JSON.stringify({
uid:CREATOR
})
});

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

load();

</script>

</body>
</html>`;
}
