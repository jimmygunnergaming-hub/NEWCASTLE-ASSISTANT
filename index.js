const http = require("http");
const crypto = require("crypto");
const sharp = require("sharp");

const {
  Client,
  GatewayIntentBits,
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

/* =========================================================
   FORMATIONS
========================================================= */

const formationPositions = {
  1: [["GK", 50, 88]],

  2: [
    ["GK", 50, 88],
    ["ST", 50, 18]
  ],

  3: [
    ["GK", 50, 88],
    ["ST", 35, 20],
    ["ST", 65, 20]
  ],

  4: [
    ["GK", 50, 88],
    ["LB", 25, 58],
    ["RB", 75, 58],
    ["ST", 50, 18]
  ],

  5: [
    ["GK", 50, 88],
    ["LB", 18, 60],
    ["CB", 50, 60],
    ["RB", 82, 60],
    ["ST", 50, 18]
  ],

  6: [
    ["GK", 50, 88],
    ["LB", 18, 62],
    ["CB", 38, 62],
    ["CB", 62, 62],
    ["RB", 82, 62],
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
    ["CB", 35, 64],
    ["CB", 65, 64],
    ["RB", 88, 62],
    ["LM", 25, 35],
    ["RM", 75, 35],
    ["ST", 50, 16]
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
    ["ST", 50, 16]
  ],

  10: [
    ["GK", 50, 89],
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

/* =========================================================
   HELPERS
========================================================= */

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

function escapeXml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function getBaseUrl() {
  return process.env.RENDER_EXTERNAL_URL ||
    `http://localhost:${PORT}`;
}

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

      if (data.length > 2_000_000) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });

    req.on("error", reject);
  });
}

/* =========================================================
   CREATE SESSION
========================================================= */

function createSession(interaction, size) {
  const positions = formationPositions[size];

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
    imageSent: false,
    createdAt: Date.now()
  };

  sessions.set(session.id, session);

  return session;
}

/* =========================================================
   /LINEUP COMMAND
========================================================= */

client.once("ready", async () => {
  console.log(`✅ Logged into Discord as ${client.user.tag}`);

  try {
    await client.application.commands.set([
      {
        name: "lineup",
        description: "Create a football lineup"
      }
    ]);

    console.log("✅ /lineup registered.");
  } catch (error) {
    console.error("❌ Failed to register /lineup:", error);
  }
});

/* =========================================================
   DISCORD INTERACTIONS
========================================================= */

client.on("interactionCreate", async interaction => {
  try {

    /* ---------------- /lineup ---------------- */

    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "lineup"
    ) {
      const rows = [];

      let currentRow = [];

      for (let i = 1; i <= 11; i++) {
        currentRow.push(
          new ButtonBuilder()
            .setCustomId(`lineup_size_${i}`)
            .setLabel(`${i}v${i}`)
            .setStyle(ButtonStyle.Primary)
        );

        if (currentRow.length === 5 || i === 11) {
          rows.push(
            new ActionRowBuilder().addComponents(currentRow)
          );

          currentRow = [];
        }
      }

      await interaction.reply({
        content:
          "⚽ **LINEUP BUILDER**\n\n" +
          "Choose how many players are on each team:",
        components: rows,
        ephemeral: true
      });

      return;
    }

    /* ---------------- SIZE BUTTON ---------------- */

    if (
      interaction.isButton() &&
      interaction.customId.startsWith("lineup_size_")
    ) {
      const size = Number(
        interaction.customId.replace("lineup_size_", "")
      );

      if (!formationPositions[size]) {
        return interaction.reply({
          content: "❌ Invalid lineup size.",
          ephemeral: true
        });
      }

      const session = createSession(interaction, size);

      const editorUrl =
        `${getBaseUrl()}/pitch?session=${session.id}&uid=${interaction.user.id}`;

      const button = new ButtonBuilder()
        .setLabel("⚽ OPEN LINEUP EDITOR")
        .setStyle(ButtonStyle.Link)
        .setURL(editorUrl);

      const row =
        new ActionRowBuilder().addComponents(button);

      await interaction.update({
        content:
          `⚽ **${size}v${size} LINEUP CREATED**\n\n` +
          `Your ${size}v${size} lineup is ready.\n\n` +
          `Click the button below to open the pitch editor.`,
        components: [row]
      });

      return;
    }

  } catch (error) {
    console.error("❌ Discord interaction error:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Something went wrong.",
        ephemeral: true
      });
    }
  }
});

/* =========================================================
   GET SERVER MEMBERS
========================================================= */

async function getServerPlayers(session) {
  const guild = client.guilds.cache.get(session.guildId);

  if (!guild) {
    return [];
  }

  try {
    const members = await guild.members.fetch();

    return members
      .filter(member => !member.user.bot)
      .map(member => ({
        id: member.user.id,
        name: member.displayName,
        username: member.user.username,
        avatar: member.user.displayAvatarURL({
          extension: "png",
          size: 256
        })
      }));
  } catch (error) {
    console.error("❌ Could not fetch members:", error);
    return [];
  }
}

/* =========================================================
   HTTP SERVER
========================================================= */

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(
      req.url,
      `http://${req.headers.host || "localhost"}`
    );

    /* ---------------- HEALTH ---------------- */

    if (url.pathname === "/health") {
      return sendJson(res, 200, {
        online: true,
        discord: client.isReady(),
        bot: client.user?.tag || null
      });
    }

    /* ---------------- PITCH ---------------- */

    if (url.pathname === "/pitch") {
      const sessionId =
        url.searchParams.get("session");

      const session =
        sessions.get(sessionId);

      if (!session) {
        return sendHtml(
          res,
          404,
          errorPage("This lineup does not exist or has expired.")
        );
      }

      return sendHtml(
        res,
        200,
        pitchPage(session)
      );
    }

    /* ---------------- SESSION ---------------- */

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
          error: "Session not found."
        });
      }

      const players =
        await getServerPlayers(session);

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

    /* ---------------- ASSIGN ---------------- */

    if (
      url.pathname === "/api/assign" &&
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

      if (session.finished) {
        return sendJson(res, 403, {
          error: "This lineup is already finished."
        });
      }

      if (String(body.uid) !== session.creatorId) {
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

      slot.userId = member.user.id;
      slot.name = member.displayName;
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

    /* ---------------- POSITION ---------------- */

    if (
      url.pathname === "/api/position" &&
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

      if (String(body.uid) !== session.creatorId) {
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

    /* ---------------- MOVE ---------------- */

    if (
      url.pathname === "/api/move" &&
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

      if (String(body.uid) !== session.creatorId) {
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

      const x = Number(body.x);
      const y = Number(body.y);

      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y)
      ) {
        return sendJson(res, 400, {
          error: "Invalid coordinates."
        });
      }

      slot.x =
        Math.max(4, Math.min(96, x));

      slot.y =
        Math.max(4, Math.min(96, y));

      return sendJson(res, 200, {
        success: true,
        slot
      });
    }

    /* ---------------- FINISH ---------------- */

    if (
      url.pathname === "/api/finish" &&
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

      if (String(body.uid) !== session.creatorId) {
        return sendJson(res, 403, {
          error: "Only the person who created the lineup can finish it."
        });
      }

      if (session.finished) {
        return sendJson(res, 400, {
          error: "This lineup has already been finished."
        });
      }

      session.finished = true;

      const image =
        await createPitchImage(session);

      const channel =
        await client.channels.fetch(
          session.channelId
        ).catch(() => null);

      if (!channel || !channel.isTextBased()) {
        return sendJson(res, 500, {
          error: "Could not find the Discord channel."
        });
      }

      const attachment =
        new AttachmentBuilder(image, {
          name: `lineup-${session.size}v${session.size}.png`
        });

      const filled =
        session.roster.filter(
          player => player.userId
        ).length;

      await channel.send({
        content:
          `⚽ **${session.size}v${session.size} LINEUP**\n` +
          `Created lineup with **${filled}/${session.roster.length} players assigned**.`,
        files: [attachment]
      });

      session.imageSent = true;

      return sendJson(res, 200, {
        success: true,
        message: "Lineup sent to Discord."
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
      `🌐 Web server running on 0.0.0.0:${PORT}`
    );
  }
);

/* =========================================================
   PITCH IMAGE
========================================================= */

async function downloadAvatar(url) {
  try {
    const response =
      await fetch(url);

    if (!response.ok) {
      return null;
    }

    const buffer =
      Buffer.from(
        await response.arrayBuffer()
      );

    const png =
      await sharp(buffer)
        .resize(120, 120, {
          fit: "cover"
        })
        .png()
        .toBuffer();

    return `data:image/png;base64,${png.toString("base64")}`;

  } catch {
    return null;
  }
}

async function createPitchImage(session) {
  const WIDTH = 900;
  const HEIGHT = 1389;

  let svgPlayers = "";

  for (const player of session.roster) {
    const x =
      WIDTH * (player.x / 100);

    const y =
      HEIGHT * (player.y / 100);

    const avatar =
      player.avatar
        ? await downloadAvatar(player.avatar)
        : null;

    const initials =
      (player.name || "?")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(x => x[0])
        .join("")
        .toUpperCase();

    const safeName =
      escapeXml(
        player.name || "Unassigned"
      );

    const safePosition =
      escapeXml(
        player.position || ""
      );

    svgPlayers += `
      <g>
        <circle
          cx="${x}"
          cy="${y}"
          r="42"
          fill="#737b84"
          stroke="white"
          stroke-width="5"
        />

        ${
          avatar
            ? `
              <clipPath id="clip${player.slot}">
                <circle
                  cx="${x}"
                  cy="${y}"
                  r="39"
                />
              </clipPath>

              <image
                href="${avatar}"
                x="${x - 39}"
                y="${y - 39}"
                width="78"
                height="78"
                preserveAspectRatio="xMidYMid slice"
                clip-path="url(#clip${player.slot})"
              />
            `
            : `
              <text
                x="${x}"
                y="${y + 10}"
                text-anchor="middle"
                font-family="Arial"
                font-size="28"
                font-weight="bold"
                fill="white"
              >
                ${escapeXml(initials || "?")}
              </text>
            `
        }

        <rect
          x="${x - 75}"
          y="${y + 48}"
          width="150"
          height="25"
          rx="7"
          fill="rgba(0,0,0,0.78)"
        />

        <text
          x="${x}"
          y="${y + 66}"
          text-anchor="middle"
          font-family="Arial"
          font-size="15"
          font-weight="bold"
          fill="white"
        >
          ${safeName}
        </text>

        <text
          x="${x}"
          y="${y + 92}"
          text-anchor="middle"
          font-family="Arial"
          font-size="14"
          font-weight="bold"
          fill="white"
        >
          ${safePosition}
        </text>
      </g>
    `;
  }

  const svg = `
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="${WIDTH}"
    height="${HEIGHT}"
    viewBox="0 0 ${WIDTH} ${HEIGHT}"
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
          offset="0"
          stop-color="#238b4d"
        />

        <stop
          offset="1"
          stop-color="#1c713d"
        />
      </linearGradient>

      <pattern
        id="stripes"
        width="${WIDTH}"
        height="180"
        patternUnits="userSpaceOnUse"
      >
        <rect
          width="${WIDTH}"
          height="90"
          fill="#238b4d"
        />

        <rect
          y="90"
          width="${WIDTH}"
          height="90"
          fill="#1f8047"
        />
      </pattern>

    </defs>

    <rect
      width="${WIDTH}"
      height="${HEIGHT}"
      fill="url(#stripes)"
    />

    <!-- Outer pitch -->

    <rect
      x="28"
      y="28"
      width="${WIDTH - 56}"
      height="${HEIGHT - 56}"
      fill="none"
      stroke="white"
      stroke-width="5"
    />

    <!-- Halfway line -->

    <line
      x1="28"
      y1="${HEIGHT / 2}"
      x2="${WIDTH - 28}"
      y2="${HEIGHT / 2}"
      stroke="white"
      stroke-width="5"
    />

    <!-- Centre circle -->

    <circle
      cx="${WIDTH / 2}"
      cy="${HEIGHT / 2}"
      r="105"
      fill="none"
      stroke="white"
      stroke-width="5"
    />

    <circle
      cx="${WIDTH / 2}"
      cy="${HEIGHT / 2}"
      r="7"
      fill="white"
    />

    <!-- Top penalty box -->

    <rect
      x="${WIDTH * 0.27}"
      y="28"
      width="${WIDTH * 0.46}"
      height="${HEIGHT * 0.15}"
      fill="none"
      stroke="white"
      stroke-width="5"
    />

    <!-- Bottom penalty box -->

    <rect
      x="${WIDTH * 0.27}"
      y="${HEIGHT - HEIGHT * 0.15 - 28}"
      width="${WIDTH * 0.46}"
      height="${HEIGHT * 0.15}"
      fill="none"
      stroke="white"
      stroke-width="5"
    />

    <!-- Top six-yard box -->

    <rect
      x="${WIDTH * 0.42}"
      y="28"
      width="${WIDTH * 0.16}"
      height="${HEIGHT * 0.065}"
      fill="none"
      stroke="white"
      stroke-width="5"
    />

    <!-- Bottom six-yard box -->

    <rect
      x="${WIDTH * 0.42}"
      y="${HEIGHT - HEIGHT * 0.065 - 28}"
      width="${WIDTH * 0.16}"
      height="${HEIGHT * 0.065}"
      fill="none"
      stroke="white"
      stroke-width="5"
    />

    ${svgPlayers}

  </svg>
  `;

  return sharp(
    Buffer.from(svg)
  )
    .png()
    .toBuffer();
}

/* =========================================================
   PITCH WEB PAGE
========================================================= */

function pitchPage(session) {
  const sessionId =
    escapeHtml(session.id);

  const creatorId =
    escapeHtml(session.creatorId);

  return `
<!DOCTYPE html>
<html>
<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1,maximum-scale=1"
>

<title>${session.size}v${session.size} Lineup</title>

<style>

*{
  box-sizing:border-box;
}

body{
  margin:0;
  background:#0c1110;
  color:white;
  font-family:Arial,Helvetica,sans-serif;
}

.top{
  position:sticky;
  top:0;
  z-index:50;

  display:flex;
  align-items:center;
  justify-content:space-between;

  padding:14px 18px;

  background:#101713;
  border-bottom:1px solid #29332d;
}

.title{
  font-size:20px;
  font-weight:900;
}

.sub{
  color:#94a39a;
  font-size:12px;
  margin-top:3px;
}

.done{
  border:0;
  padding:11px 18px;
  border-radius:9px;
  background:#16a34a;
  color:white;
  font-weight:900;
  cursor:pointer;
}

.done:hover{
  background:#22c55e;
}

.layout{
  width:min(1400px,100%);
  margin:auto;
  padding:18px;

  display:flex;
  gap:18px;
}

.pitch-wrap{
  flex:1;

  display:flex;
  justify-content:center;
  align-items:center;
}

.pitch{
  position:relative;

  width:min(720px,94vw);
  aspect-ratio:900/1389;

  overflow:hidden;

  border-radius:15px;

  background:
    repeating-linear-gradient(
      to bottom,
      #238b4d 0px,
      #238b4d 90px,
      #1f8047 90px,
      #1f8047 180px
    );

  border:3px solid rgba(255,255,255,.85);

  box-shadow:
    0 20px 70px rgba(0,0,0,.45);
}

.line{
  position:absolute;
  pointer-events:none;
}

.outer{
  inset:3%;
  border:3px solid white;
}

.half{
  left:3%;
  right:3%;
  top:50%;
  border-top:3px solid white;
}

.center-circle{
  position:absolute;
  width:20%;
  aspect-ratio:1;

  left:40%;
  top:40%;

  border:3px solid white;
  border-radius:50%;
}

.center-dot{
  position:absolute;

  width:8px;
  height:8px;

  left:50%;
  top:50%;

  transform:translate(-50%,-50%);

  background:white;
  border-radius:50%;
}

.box{
  position:absolute;

  left:27%;
  width:46%;
  height:15%;

  border:3px solid white;
}

.box.topbox{
  top:3%;
}

.box.bottom{
  bottom:3%;
}

.six{
  position:absolute;

  left:42%;
  width:16%;
  height:6.5%;

  border:3px solid white;
}

.six.top-six{
  top:3%;
}

.six.bottom-six{
  bottom:3%;
}

.player{
  position:absolute;

  width:82px;
  min-height:105px;

  transform:translate(-50%,-50%);

  text-align:center;

  cursor:pointer;

  user-select:none;
  touch-action:none;

  z-index:10;
}

.avatar{
  width:55px;
  height:55px;

  margin:auto;

  border-radius:50%;

  background:#747b84;

  border:3px solid white;

  overflow:hidden;

  display:flex;
  align-items:center;
  justify-content:center;

  font-size:22px;
  font-weight:900;
}

.avatar img{
  width:100%;
  height:100%;
  object-fit:cover;
}

.name{
  margin-top:3px;

  max-width:100px;

  margin-left:auto;
  margin-right:auto;

  padding:3px 6px;

  border-radius:5px;

  background:rgba(0,0,0,.78);

  font-size:10px;
  font-weight:900;

  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}

.pos{
  margin-top:2px;

  font-size:10px;
  font-weight:900;

  text-shadow:0 2px 4px black;
}

.panel{
  width:310px;

  padding:16px;

  background:#131a16;

  border:1px solid #29332d;

  border-radius:14px;

  height:max-content;
}

.panel h2{
  margin:0 0 10px;
  font-size:17px;
}

.help{
  padding:11px;

  border-radius:9px;

  background:#1c2520;

  color:#aebbb3;

  font-size:12px;

  line-height:1.5;

  margin-bottom:12px;
}

.tool{
  width:100%;

  padding:11px;

  margin-top:7px;

  border:0;

  border-radius:8px;

  background:#27322c;

  color:white;

  font-weight:800;

  cursor:pointer;
}

.tool.active{
  background:#2563eb;
}

.selected{
  outline:3px solid #facc15;
  border-radius:12px;
}

.members{
  margin-top:12px;

  max-height:450px;

  overflow:auto;
}

.member{
  display:flex;
  align-items:center;

  gap:9px;

  padding:8px;

  margin-bottom:6px;

  border-radius:8px;

  background:#1c2520;

  cursor:pointer;
}

.member:hover{
  background:#29352e;
}

.member img{
  width:34px;
  height:34px;
  border-radius:50%;
}

.member span{
  font-size:12px;
  font-weight:800;

  overflow:hidden;
  white-space:nowrap;
  text-overflow:ellipsis;
}

.status{
  margin-top:10px;

  padding:9px;

  border-radius:8px;

  background:#1c2520;

  color:#aebbb3;

  font-size:12px;
}

@media(max-width:900px){

  .layout{
    flex-direction:column;
  }

  .panel{
    width:100%;
  }

}

@media(max-width:650px){

  .top{
    padding:10px;
  }

  .title{
    font-size:16px;
  }

  .done{
    padding:9px 12px;
    font-size:11px;
  }

  .layout{
    padding:8px;
  }

  .panel{
    padding:10px;
  }

  .player{
    width:62px;
    min-height:80px;
  }

  .avatar{
    width:40px;
    height:40px;
    border-width:2px;
    font-size:16px;
  }

  .name{
    font-size:8px;
  }

  .pos{
    font-size:8px;
  }

}

</style>

</head>

<body>

<div class="top">

  <div>
    <div class="title">
      ⚽ ${session.size}v${session.size} Lineup
    </div>

    <div class="sub">
      Build your lineup
    </div>
  </div>

  <button
    class="done"
    id="doneButton"
  >
    ✓ DONE
  </button>

</div>

<div class="layout">

  <div class="pitch-wrap">

    <div
      class="pitch"
      id="pitch"
    >

      <div class="line outer"></div>

      <div class="line half"></div>

      <div class="center-circle"></div>

      <div class="center-dot"></div>

      <div class="box topbox"></div>

      <div class="box bottom"></div>

      <div class="six top-six"></div>

      <div class="six bottom-six"></div>

    </div>

  </div>

  <div class="panel">

    <h2>Lineup Controls</h2>

    <div class="help">
      Click a grey circle to select it.<br>
      Choose a server player.<br>
      Use <b>Position</b> to change their position.<br>
      Use <b>Move</b> to move them anywhere on the pitch.<br>
      Double-click a player to stop moving.
    </div>

    <button
      class="tool"
      id="moveButton"
    >
      ↔ MOVE PLAYER
    </button>

    <button
      class="tool"
      id="positionButton"
    >
      ⚽ POSITION
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
    >
      Loading players...
    </div>

  </div>

</div>

<script>

const SESSION = "${sessionId}";
const UID = "${creatorId}";

let data = null;
let selectedSlot = null;
let moving = false;
let dragging = null;

const pitch =
  document.getElementById("pitch");

const members =
  document.getElementById("members");

const statusBox =
  document.getElementById("status");

const moveButton =
  document.getElementById("moveButton");

const positionButton =
  document.getElementById("positionButton");

function esc(value){

  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");

}

async function load(){

  try{

    const response =
      await fetch(
        "/api/session?session=" +
        encodeURIComponent(SESSION)
      );

    const result =
      await response.json();

    if(result.error){
      throw new Error(result.error);
    }

    data = result;

    draw();

    drawMembers();

  }catch(error){

    document.body.innerHTML =
      "<h2 style='padding:30px'>" +
      esc(error.message) +
      "</h2>";

  }

}

function draw(){

  pitch
    .querySelectorAll(".player")
    .forEach(el => el.remove());

  data.session.roster.forEach(
    (player,index)=>{

      const el =
        document.createElement("div");

      el.className = "player";

      el.dataset.slot = index;

      el.style.left =
        player.x + "%";

      el.style.top =
        player.y + "%";

      if(index === selectedSlot){
        el.classList.add("selected");
      }

      let avatar;

      if(player.avatar){

        avatar =
          "<img src='" +
          esc(player.avatar) +
          "'>";

      }else{

        avatar =
          "<span>?</span>";

      }

      el.innerHTML =

        "<div class='avatar'>" +
        avatar +
        "</div>" +

        "<div class='name'>" +
        esc(
          player.name ||
          "Select Player"
        ) +
        "</div>" +

        "<div class='pos'>" +
        esc(player.position) +
        "</div>";

      el.addEventListener(
        "click",
        event => {

          event.stopPropagation();

          selectedSlot = index;

          updateStatus();

          draw();

        }
      );

      el.addEventListener(
        "dblclick",
        event => {

          event.stopPropagation();

          moving = false;

          moveButton.classList.remove(
            "active"
          );

          moveButton.textContent =
            "↔ MOVE PLAYER";

        }
      );

      el.addEventListener(
        "pointerdown",
        event => {

          if(!moving) return;

          event.preventDefault();

          selectedSlot = index;

          dragging = {
            element:el,
            slot:index
          };

          el.setPointerCapture(
            event.pointerId
          );

        }
      );

      el.addEventListener(
        "pointermove",
        event => {

          if(
            !dragging ||
            dragging.element !== el
          ){
            return;
          }

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

          el.style.left = x + "%";
          el.style.top = y + "%";

          data.session.roster[index].x = x;
          data.session.roster[index].y = y;

        }
      );

      el.addEventListener(
        "pointerup",
        async event => {

          if(!dragging) return;

          dragging = null;

          try{
            el.releasePointerCapture(
              event.pointerId
            );
          }catch{}

          await saveMove(index);

        }
      );

      pitch.appendChild(el);

    }
  );

}

function updateStatus(){

  if(selectedSlot === null){

    statusBox.innerHTML =
      "No player selected.";

    return;

  }

  const player =
    data.session.roster[
      selectedSlot
    ];

  statusBox.innerHTML =
    "<b>Selected:</b> " +
    esc(
      player.name ||
      "Empty slot"
    ) +
    "<br><b>Position:</b> " +
    esc(player.position);

}

function drawMembers(){

  members.innerHTML = "";

  if(!data.players.length){

    members.innerHTML =
      "No server players found.";

    return;

  }

  data.players.forEach(player=>{

    const el =
      document.createElement("div");

    el.className = "member";

    el.innerHTML =

      "<img src='" +
      esc(player.avatar) +
      "'>" +

      "<span>" +
      esc(player.name) +
      "</span>";

    el.addEventListener(
      "click",
      ()=>assignPlayer(player)
    );

    members.appendChild(el);

  });

}

async function assignPlayer(player){

  if(selectedSlot === null){

    alert(
      "Click a grey player circle first."
    );

    return;

  }

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

          uid:UID,

          slot:selectedSlot,

          userId:player.id

        })
      }
    );

  const result =
    await response.json();

  if(result.error){

    alert(result.error);

    return;

  }

  data.session.roster[
    selectedSlot
  ] = result.slot;

  draw();

  updateStatus();

}

positionButton.addEventListener(
  "click",
  async ()=>{

    if(selectedSlot === null){

      alert(
        "Select a player first."
      );

      return;

    }

    const player =
      data.session.roster[
        selectedSlot
      ];

    const position =
      prompt(
        "Type the player's position:",
        player.position
      );

    if(position === null) return;

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

            uid:UID,

            slot:selectedSlot,

            position:position

          })
        }
      );

    const result =
      await response.json();

    if(result.error){

      alert(result.error);

      return;

    }

    data.session.roster[
      selectedSlot
    ] = result.slot;

    draw();

    updateStatus();

  }
);

moveButton.addEventListener(
  "click",
  ()=>{

    if(selectedSlot === null){

      alert(
        "Select a player first."
      );

      return;

    }

    moving = !moving;

    moveButton.classList.toggle(
      "active",
      moving
    );

    moveButton.textContent =
      moving
        ? "✓ MOVING — DOUBLE CLICK TO STOP"
        : "↔ MOVE PLAYER";

  }
);

async function saveMove(slot){

  const player =
    data.session.roster[slot];

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

          uid:UID,

          slot:slot,

          x:player.x,

          y:player.y

        })
      }
    );

  const result =
    await response.json();

  if(result.error){
    console.error(result.error);
  }

}

document
  .getElementById("doneButton")
  .addEventListener(
    "click",
    async ()=>{

      const confirmed =
        confirm(
          "Finish this lineup and send the pitch image into the Discord channel?"
        );

      if(!confirmed) return;

      const button =
        document.getElementById(
          "doneButton"
        );

      button.disabled = true;

      button.textContent =
        "SENDING...";

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

              body:JSON.stringify({

                session:SESSION,
                uid:UID

              })
            }
          );

        const result =
          await response.json();

        if(result.error){

          alert(result.error);

          button.disabled = false;

          button.textContent =
            "✓ DONE";

          return;

        }

        document.body.innerHTML = `

          <div style="
            min-height:100vh;
            display:flex;
            align-items:center;
            justify-content:center;
            background:#0c1110;
            color:white;
            font-family:Arial;
            text-align:center;
            padding:20px;
          ">

            <div>

              <div style="
                font-size:55px;
                margin-bottom:15px;
              ">
                ✅
              </div>

              <h1>
                Lineup Sent!
              </h1>

              <p style="
                color:#9ca3af;
              ">
                The finished pitch has been
                posted in the Discord channel.
              </p>

            </div>

          </div>

        `;

      }catch(error){

        console.error(error);

        alert(
          "Could not send the lineup."
        );

        button.disabled = false;

        button.textContent =
          "✓ DONE";

      }

    }
  );

load();

</script>

</body>
</html>
`;
}

/* =========================================================
   ERROR PAGE
========================================================= */

function errorPage(message) {
  return `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lineup</title>
</head>

<body style="
  margin:0;
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  background:#0c1110;
  color:white;
  font-family:Arial;
">

<div style="
  text-align:center;
  padding:30px;
">

<h1>⚽ Lineup</h1>

<p>${escapeHtml(message)}</p>

</div>

</body>
</html>
`;
}

/* =========================================================
   LOGIN
========================================================= */

client.login(TOKEN)
  .then(() => {
    console.log("🔌 Discord login successful.");
  })
  .catch(error => {
    console.error("❌ Discord login failed:", error);
    process.exit(1);
  });
