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
const PORT = Number(process.env.PORT) || 10000;

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

function getBaseUrl() {
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, "");
  }

  return `http://localhost:${PORT}`;
}

/* =========================================================
   FORMATIONS
========================================================= */

const formations = {
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
    ["LB", 22, 58],
    ["RB", 78, 58],
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
    ["LB", 15, 62],
    ["CB", 38, 64],
    ["CB", 62, 64],
    ["RB", 85, 62],
    ["ST", 50, 18]
  ],

  7: [
    ["GK", 50, 88],
    ["LB", 15, 62],
    ["CB", 38, 64],
    ["CB", 62, 64],
    ["RB", 85, 62],
    ["LW", 30, 34],
    ["ST", 68, 20]
  ],

  8: [
    ["GK", 50, 88],
    ["LB", 12, 63],
    ["CB", 35, 65],
    ["CB", 65, 65],
    ["RB", 88, 63],
    ["LM", 25, 38],
    ["RM", 75, 38],
    ["ST", 50, 18]
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
    ["ST", 50, 17]
  ],

  10: [
    ["GK", 50, 88],
    ["LB", 10, 66],
    ["CB", 28, 69],
    ["CB", 50, 69],
    ["CB", 72, 69],
    ["RB", 90, 66],
    ["LM", 20, 40],
    ["RM", 80, 40],
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
   CREATE SESSION
========================================================= */

function createSession(interaction, size) {
  const id = makeId();

  const roster = formations[size].map((p, index) => ({
    slot: index,
    role: p[0],
    position: p[0],

    pctX: p[1],
    pctY: p[2],

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

/* =========================================================
   DISCORD READY
========================================================= */

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🌐 Port: ${PORT}`);

  const command = new SlashCommandBuilder()
    .setName("lineup")
    .setDescription("Create a football lineup");

  try {
    await client.application.commands.set([command]);

    console.log("✅ /lineup registered.");
  } catch (error) {
    console.error("❌ Command registration failed:", error);
  }
});

/* =========================================================
   /LINEUP + BUTTONS
========================================================= */

client.on("interactionCreate", async interaction => {
  try {

    /* -----------------------------------------------
       /lineup
    ------------------------------------------------ */

    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "lineup"
    ) {

      const rows = [];

      let currentRow =
        new ActionRowBuilder();

      for (let i = 1; i <= 11; i++) {

        const button =
          new ButtonBuilder()
            .setCustomId(`lineup_size_${i}`)
            .setLabel(`${i}v${i}`)
            .setStyle(
              i === 11
                ? ButtonStyle.Success
                : ButtonStyle.Primary
            );

        currentRow.addComponents(button);

        if (
          currentRow.components.length === 5 ||
          i === 11
        ) {
          rows.push(currentRow);
          currentRow =
            new ActionRowBuilder();
        }
      }

      await interaction.reply({
        content:
          "⚽ **Choose your lineup size**\n\n" +
          "Select from **1v1** all the way to **11v11**:",
        components: rows,
        ephemeral: true
      });

      return;
    }

    /* -----------------------------------------------
       SIZE BUTTON
    ------------------------------------------------ */

    if (
      interaction.isButton() &&
      interaction.customId.startsWith("lineup_size_")
    ) {

      const size =
        Number(
          interaction.customId.replace(
            "lineup_size_",
            ""
          )
        );

      if (
        !Number.isInteger(size) ||
        size < 1 ||
        size > 11
      ) {
        return interaction.reply({
          content: "❌ Invalid lineup size.",
          ephemeral: true
        });
      }

      const session =
        createSession(
          interaction,
          size
        );

      const editorUrl =
        `${getBaseUrl()}/pitch/${session.id}?uid=${interaction.user.id}`;

      const openButton =
        new ButtonBuilder()
          .setLabel("⚽ Open Lineup Editor")
          .setStyle(ButtonStyle.Link)
          .setURL(editorUrl);

      const row =
        new ActionRowBuilder()
          .addComponents(openButton);

      await interaction.update({
        content:
          `⚽ **${size}v${size} LINEUP CREATED**\n\n` +
          `Click below to open your pitch.\n\n` +
          `You can select Discord players, change their positions and freely move them around the pitch.`,
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
   HTTP SERVER
========================================================= */

const server = http.createServer(async (req, res) => {

  try {

    const url =
      new URL(
        req.url,
        `http://${req.headers.host || "localhost"}`
      );

    /* -----------------------------------------------
       HEALTH
    ------------------------------------------------ */

    if (url.pathname === "/health") {

      return sendJson(
        res,
        200,
        {
          online: true,
          discord: client.isReady(),
          bot: client.user
            ? client.user.tag
            : null,
          port: PORT
        }
      );
    }

    /* -----------------------------------------------
       PITCH
    ------------------------------------------------ */

    if (
      req.method === "GET" &&
      url.pathname.startsWith("/pitch/")
    ) {

      const sessionId =
        url.pathname
          .replace("/pitch/", "")
          .split("/")[0];

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

    /* -----------------------------------------------
       API GET SESSION
       Matches your pitch.html
    ------------------------------------------------ */

    const sessionMatch =
      url.pathname.match(
        /^\/api\/session\/([^/]+)$/
      );

    if (
      req.method === "GET" &&
      sessionMatch
    ) {

      const sessionId =
        decodeURIComponent(
          sessionMatch[1]
        );

      const session =
        sessions.get(sessionId);

      if (!session) {
        return sendJson(
          res,
          404,
          {
            error: "Session not found"
          }
        );
      }

      const guild =
        client.guilds.cache.get(
          session.guildId
        );

      let serverMembers = [];

      if (guild) {

        try {

          const members =
            await guild.members.fetch();

          serverMembers =
            members
              .filter(
                member =>
                  !member.user.bot
              )
              .map(member => ({
                id: member.user.id,

                name:
                  member.displayName,

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
            "❌ Could not fetch members:",
            error
          );
        }
      }

      return sendJson(
        res,
        200,
        {
          id: session.id,
          size: session.size,
          creatorId: session.creatorId,
          guildId: session.guildId,
          channelId: session.channelId,
          finished: session.finished,
          roster: session.roster,
          serverMembers
        }
      );
    }

    /* -----------------------------------------------
       API SAVE / FINISH
       Matches your pitch.html
    ------------------------------------------------ */

    if (
      req.method === "POST" &&
      sessionMatch
    ) {

      const sessionId =
        decodeURIComponent(
          sessionMatch[1]
        );

      const session =
        sessions.get(sessionId);

      if (!session) {
        return sendJson(
          res,
          404,
          {
            error: "Session not found"
          }
        );
      }

      const body =
        await readBody(req);

      /*
        Only the person who created
        the lineup can edit it.
      */

      if (
        body.uid &&
        body.uid !== session.creatorId
      ) {

        return sendJson(
          res,
          403,
          {
            error:
              "Only the lineup creator can edit this lineup."
          }
        );
      }

      if (session.finished) {

        return sendJson(
          res,
          403,
          {
            error:
              "This lineup has already been finished."
          }
        );
      }

      if (
        Array.isArray(body.roster)
      ) {

        /*
          Keep only the fields we actually want.
        */

        session.roster =
          session.roster.map(
            (oldPlayer, index) => {

              const incoming =
                body.roster[index] || {};

              return {
                ...oldPlayer,

                role:
                  String(
                    incoming.role ||
                    incoming.position ||
                    oldPlayer.role ||
                    ""
                  ).slice(0, 20),

                position:
                  String(
                    incoming.position ||
                    incoming.role ||
                    oldPlayer.position ||
                    ""
                  ).slice(0, 20),

                pctX:
                  clampNumber(
                    incoming.pctX,
                    oldPlayer.pctX
                  ),

                pctY:
                  clampNumber(
                    incoming.pctY,
                    oldPlayer.pctY
                  ),

                userId:
                  incoming.userId ||
                  oldPlayer.userId ||
                  null,

                name:
                  String(
                    incoming.name ||
                    oldPlayer.name ||
                    ""
                  ).slice(0, 50),

                avatar:
                  String(
                    incoming.avatar ||
                    oldPlayer.avatar ||
                    ""
                  ).slice(0, 500)
              };
            }
          );
      }

      /*
        FINISH
      */

      if (
        body.action === "finish"
      ) {

        session.finished = true;

        console.log(
          `🏁 Lineup ${session.id} finished.`
        );

        /*
          Send the pitch image into
          the SAME Discord channel.
        */

        try {

          await sendFinalLineupToDiscord(
            session
          );

        } catch (error) {

          console.error(
            "❌ Could not send final lineup:",
            error
          );

          /*
            If Discord image generation fails,
            don't crash the web server.
          */
        }

        return sendJson(
          res,
          200,
          {
            success: true,
            finished: true
          }
        );
      }

      return sendJson(
        res,
        200,
        {
          success: true,
          roster: session.roster
        }
      );
    }

    /* -----------------------------------------------
       404
    ------------------------------------------------ */

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

    return sendJson(
      res,
      500,
      {
        error:
          "Internal server error"
      }
    );
  }
});

/* =========================================================
   SERVER
========================================================= */

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `🌐 Web server listening on 0.0.0.0:${PORT}`
    );

  }
);

/* =========================================================
   DISCORD LOGIN
========================================================= */

client.login(TOKEN).catch(error => {

  console.error(
    "❌ Discord login failed:",
    error
  );

  process.exit(1);

});

/* =========================================================
   FINAL DISCORD IMAGE
========================================================= */

async function sendFinalLineupToDiscord(session) {

  const channel =
    await client.channels.fetch(
      session.channelId
    );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    throw new Error(
      "Discord channel is unavailable."
    );
  }

  const png =
    await createPitchImage(
      session
    );

  const attachment =
    new AttachmentBuilder(
      png,
      {
        name:
          `lineup-${session.size}v${session.size}.png`
      }
    );

  const playerLines =
    session.roster.map(
      player => {

        const name =
          player.name ||
          "Unassigned";

        const pos =
          player.position ||
          player.role ||
          "";

        return `${pos} — ${name}`;
      }
    );

  await channel.send({
    content:
      `🏁 **${session.size}v${session.size} FINAL LINEUP**\n\n` +
      playerLines.join("\n"),

    files: [attachment]
  });

  console.log(
    `📸 Final lineup sent to #${channel.name}`
  );
}

/* =========================================================
   CREATE PNG
========================================================= */

async function createPitchImage(session) {

  const width = 1200;
  const height = 850;

  const pitchX = 50;
  const pitchY = 50;
  const pitchW = 1100;
  const pitchH = 750;

  let playerSvg = "";

  for (
    const player of session.roster
  ) {

    const x =
      pitchX +
      (pitchW *
        Number(player.pctX || 50)) /
        100;

    const y =
      pitchY +
      (pitchH *
        Number(player.pctY || 50)) /
        100;

    const avatar =
      await getAvatarData(
        player.avatar
      );

    const radius = 32;

    if (avatar) {

      playerSvg += `
        <clipPath id="clip${player.slot}">
          <circle
            cx="${x}"
            cy="${y}"
            r="${radius}"
          />
        </clipPath>

        <image
          href="${avatar}"
          x="${x - radius}"
          y="${y - radius}"
          width="${radius * 2}"
          height="${radius * 2}"
          preserveAspectRatio="xMidYMid slice"
          clip-path="url(#clip${player.slot})"
        />

        <circle
          cx="${x}"
          cy="${y}"
          r="${radius}"
          fill="none"
          stroke="white"
          stroke-width="4"
        />
      `;

    } else {

      playerSvg += `
        <circle
          cx="${x}"
          cy="${y}"
          r="${radius}"
          fill="#111827"
          stroke="white"
          stroke-width="4"
        />

        <text
          x="${x}"
          y="${y + 10}"
          text-anchor="middle"
          font-size="28"
          font-weight="900"
          fill="white"
        >
          ${escapeXml(
            (player.name || "?")
              .charAt(0)
              .toUpperCase()
          )}
        </text>
      `;
    }

    const name =
      player.name ||
      "Unassigned";

    const position =
      player.position ||
      player.role ||
      "";

    playerSvg += `
      <rect
        x="${x - 70}"
        y="${y + 38}"
        width="140"
        height="24"
        rx="6"
        fill="rgba(0,0,0,0.78)"
      />

      <text
        x="${x}"
        y="${y + 55}"
        text-anchor="middle"
        font-family="Arial"
        font-size="14"
        font-weight="800"
        fill="white"
      >
        ${escapeXml(
          name.slice(0, 20)
        )}
      </text>

      <text
        x="${x}"
        y="${y + 78}"
        text-anchor="middle"
        font-family="Arial"
        font-size="12"
        font-weight="700"
        fill="white"
      >
        ${escapeXml(
          position.slice(0, 12)
        )}
      </text>
    `;
  }

  const svg = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${width}"
  height="${height}"
  viewBox="0 0 ${width} ${height}"
>

  <!-- Transparent background -->

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
        stop-color="#238b4d"
      />

      <stop
        offset="100%"
        stop-color="#176536"
      />
    </linearGradient>

    <filter id="shadow">

      <feDropShadow
        dx="0"
        dy="15"
        stdDeviation="15"
        flood-opacity="0.35"
      />

    </filter>

  </defs>

  <!-- Pitch -->

  <rect
    x="${pitchX}"
    y="${pitchY}"
    width="${pitchW}"
    height="${pitchH}"
    rx="18"
    fill="url(#grass)"
    filter="url(#shadow)"
  />

  <!-- stripes -->

  ${Array.from(
    { length: 10 },
    (_, i) => {

      if (i % 2 !== 0) return "";

      return `
        <rect
          x="${pitchX}"
          y="${pitchY + (pitchH / 10) * i}"
          width="${pitchW}"
          height="${pitchH / 10}"
          fill="rgba(0,0,0,0.05)"
        />
      `;

    }
  ).join("")}

  <!-- outside -->

  <rect
    x="${pitchX}"
    y="${pitchY}"
    width="${pitchW}"
    height="${pitchH}"
    rx="18"
    fill="none"
    stroke="white"
    stroke-width="5"
  />

  <!-- halfway -->

  <line
    x1="${pitchX}"
    y1="${pitchY + pitchH / 2}"
    x2="${pitchX + pitchW}"
    y2="${pitchY + pitchH / 2}"
    stroke="white"
    stroke-width="4"
  />

  <!-- centre circle -->

  <circle
    cx="${pitchX + pitchW / 2}"
    cy="${pitchY + pitchH / 2}"
    r="90"
    fill="none"
    stroke="white"
    stroke-width="4"
  />

  <circle
    cx="${pitchX + pitchW / 2}"
    cy="${pitchY + pitchH / 2}"
    r="6"
    fill="white"
  />

  <!-- top penalty -->

  <rect
    x="${pitchX + pitchW * 0.33}"
    y="${pitchY}"
    width="${pitchW * 0.34}"
    height="${pitchH * 0.17}"
    fill="none"
    stroke="white"
    stroke-width="4"
  />

  <!-- bottom penalty -->

  <rect
    x="${pitchX + pitchW * 0.33}"
    y="${pitchY + pitchH * 0.83}"
    width="${pitchW * 0.34}"
    height="${pitchH * 0.17}"
    fill="none"
    stroke="white"
    stroke-width="4"
  />

  <!-- top six yard -->

  <rect
    x="${pitchX + pitchW * 0.42}"
    y="${pitchY}"
    width="${pitchW * 0.16}"
    height="${pitchH * 0.07}"
    fill="none"
    stroke="white"
    stroke-width="4"
  />

  <!-- bottom six yard -->

  <rect
    x="${pitchX + pitchW * 0.42}"
    y="${pitchY + pitchH * 0.93}"
    width="${pitchW * 0.16}"
    height="${pitchH * 0.07}"
    fill="none"
    stroke="white"
    stroke-width="4"
  />

  <!-- Players -->

  ${playerSvg}

</svg>
`;

  return sharp(
    Buffer.from(svg)
  )
    .png()
    .toBuffer();
}

/* =========================================================
   AVATAR DOWNLOAD
========================================================= */

async function getAvatarData(url) {

  if (!url) {
    return null;
  }

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
        .resize(128, 128)
        .png()
        .toBuffer();

    return `data:image/png;base64,${png.toString("base64")}`;

  } catch {

    return null;
  }
}

/* =========================================================
   HTML PITCH
========================================================= */

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
  content="width=device-width,initial-scale=1"
>

<title>${session.size}v${session.size} Lineup</title>

<style>

*{
  box-sizing:border-box;
}

html,
body{
  margin:0;
  width:100%;
  height:100%;
  font-family:Arial,sans-serif;
  background:#07130c;
  color:white;
}

body{
  overflow:hidden;
}

.topbar{
  height:70px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:0 20px;
  background:#050f09;
  border-bottom:1px solid rgba(255,255,255,.12);
}

.title{
  font-size:22px;
  font-weight:900;
}

.subtitle{
  font-size:12px;
  color:#8f9a93;
  margin-top:3px;
}

.finish{
  border:0;
  border-radius:8px;
  padding:11px 18px;
  background:#15803d;
  color:white;
  font-weight:900;
  cursor:pointer;
}

.finish:hover{
  background:#16a34a;
}

.layout{
  width:100%;
  height:calc(100vh - 70px);
  display:flex;
  gap:16px;
  padding:16px;
}

.pitchWrap{
  flex:1;
  display:flex;
  justify-content:center;
  align-items:center;
  min-width:0;
}

.pitch{
  position:relative;
  width:min(100%,1000px);
  height:min(100%,760px);
  overflow:hidden;
  border-radius:14px;

  background:
    repeating-linear-gradient(
      to bottom,
      #20753d 0px,
      #20753d 70px,
      #1d6d39 70px,
      #1d6d39 140px
    );

  border:3px solid white;

  touch-action:none;
}

.line{
  position:absolute;
  pointer-events:none;
}

.halfway{
  left:0;
  top:50%;
  width:100%;
  border-top:3px solid white;
}

.center-circle{
  position:absolute;
  width:150px;
  height:150px;
  left:50%;
  top:50%;
  transform:translate(-50%,-50%);
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

.penalty-box{
  position:absolute;
  left:50%;
  width:34%;
  height:17%;
  transform:translateX(-50%);
  border-left:3px solid white;
  border-right:3px solid white;
}

.penalty-top{
  top:0;
  border-bottom:3px solid white;
}

.penalty-bottom{
  bottom:0;
  border-top:3px solid white;
}

.six-box{
  position:absolute;
  left:50%;
  width:16%;
  height:7%;
  transform:translateX(-50%);
  border-left:3px solid white;
  border-right:3px solid white;
}

.six-top{
  top:0;
  border-bottom:3px solid white;
}

.six-bottom{
  bottom:0;
  border-top:3px solid white;
}

.player{
  position:absolute;
  width:78px;
  height:86px;
  transform:translate(-50%,-50%);
  cursor:grab;
  user-select:none;
  touch-action:none;
  z-index:20;
  text-align:center;
}

.player:active{
  cursor:grabbing;
}

.avatar{
  width:52px;
  height:52px;
  margin:auto;
  border-radius:50%;
  object-fit:cover;
  background:#747b84;
  border:3px solid white;
}

.placeholder{
  width:52px;
  height:52px;
  margin:auto;
  border-radius:50%;
  background:#747b84;
  border:3px solid white;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:20px;
  font-weight:900;
}

.playerName{
  margin-top:3px;
  font-size:10px;
  font-weight:900;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  text-shadow:0 2px 4px #000;
}

.playerRole{
  font-size:9px;
  font-weight:800;
  text-shadow:0 2px 4px #000;
}

.side{
  width:260px;
  background:#07100a;
  border:1px solid rgba(255,255,255,.12);
  border-radius:12px;
  padding:14px;
  overflow-y:auto;
}

.side h2{
  margin:0 0 12px;
  font-size:16px;
}

.member{
  display:flex;
  align-items:center;
  gap:9px;
  padding:8px;
  margin-bottom:7px;
  border-radius:8px;
  background:rgba(255,255,255,.05);
  cursor:pointer;
}

.member:hover{
  background:rgba(255,255,255,.13);
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

.info{
  margin-top:12px;
  padding:10px;
  border-radius:8px;
  background:rgba(255,255,255,.05);
  color:#aab4ad;
  font-size:11px;
  line-height:1.5;
}

@media(max-width:800px){

  .layout{
    padding:8px;
  }

  .side{
    display:none;
  }

  .pitch{
    width:96vw;
    height:calc(100vh - 90px);
  }

  .topbar{
    height:60px;
  }

  .title{
    font-size:17px;
  }

  .finish{
    padding:9px 12px;
    font-size:11px;
  }

}

</style>

</head>

<body>

<div class="topbar">

  <div>

    <div class="title">
      ⚽ ${session.size}v${session.size} Football Lineup
    </div>

    <div class="subtitle">
      Select players • Change positions • Drag freely
    </div>

  </div>

  <button
    class="finish"
    id="finishButton"
  >
    ✓ DONE
  </button>

</div>

<div class="layout">

  <div class="pitchWrap">

    <div
      class="pitch"
      id="pitch"
    >

      <div class="halfway"></div>

      <div class="center-circle"></div>

      <div class="center-dot"></div>

      <div class="penalty-box penalty-top"></div>

      <div class="penalty-box penalty-bottom"></div>

      <div class="six-box six-top"></div>

      <div class="six-box six-bottom"></div>

      <div id="players"></div>

    </div>

  </div>

  <div class="side">

    <h2>
      Server Players
    </h2>

    <div id="memberList"></div>

    <div class="info">
      <b>How to use:</b><br><br>
      1. Click a player circle.<br>
      2. Select a Discord player.<br>
      3. Double-click their position to change it.<br>
      4. Drag players anywhere on the pitch.<br>
      5. Press DONE when finished.
    </div>

  </div>

</div>

<script>

"use strict";

const SESSION =
  "${safeId}";

const UID =
  new URLSearchParams(
    location.search
  ).get("uid") || "";

let session = null;

let selectedSlot = null;

let dragging = null;

const pitch =
  document.getElementById(
    "pitch"
  );

const playersContainer =
  document.getElementById(
    "players"
  );

const memberList =
  document.getElementById(
    "memberList"
  );

function escapeHTML(value){

  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function clamp(v,min,max){

  return Math.max(
    min,
    Math.min(max,v)
  );
}

async function load(){

  const response =
    await fetch(
      "/api/session/" +
      encodeURIComponent(SESSION)
    );

  const data =
    await response.json();

  if(data.error){

    alert(data.error);
    return;
  }

  session = data;

  render();

}

function render(){

  playersContainer.innerHTML = "";

  session.roster.forEach(
    (player,index)=>{

      const el =
        document.createElement(
          "div"
        );

      el.className =
        "player";

      el.style.left =
        player.pctX + "%";

      el.style.top =
        player.pctY + "%";

      el.dataset.index =
        index;

      const avatar =
        player.avatar
          ? `
            <img
              class="avatar"
              src="${escapeHTML(player.avatar)}"
              draggable="false"
            >
          `
          : `
            <div class="placeholder">
              ?
            </div>
          `;

      el.innerHTML = `

        ${avatar}

        <div class="playerRole">
          ${escapeHTML(
            player.position ||
            player.role ||
            ""
          )}
        </div>

        <div class="playerName">
          ${escapeHTML(
            player.name ||
            "Select Player"
          )}
        </div>

      `;

      el.addEventListener(
        "click",
        event => {

          event.stopPropagation();

          selectedSlot =
            index;

        }
      );

      el.addEventListener(
        "dblclick",
        event => {

          event.stopPropagation();

          if(
            selectedSlot !== index
          ){
            selectedSlot = index;
          }

          const current =
            session.roster[index]
              .position || "";

          const newPosition =
            prompt(
              "Type the position:",
              current
            );

          if(
            newPosition === null
          ){
            return;
          }

          session.roster[index]
            .position =
              newPosition
                .trim()
                .slice(0,20);

          save();

          render();

        }
      );

      el.addEventListener(
        "pointerdown",
        event => {

          event.preventDefault();

          selectedSlot =
            index;

          dragging = {
            index,
            element: el
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
            dragging.index !== index
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

          x =
            clamp(x,4,96);

          y =
            clamp(y,4,96);

          session.roster[index]
            .pctX = x;

          session.roster[index]
            .pctY = y;

          el.style.left =
            x + "%";

          el.style.top =
            y + "%";

        }
      );

      el.addEventListener(
        "pointerup",
        async event => {

          if(
            !dragging ||
            dragging.index !== index
          ){
            return;
          }

          dragging = null;

          try{
            el.releasePointerCapture(
              event.pointerId
            );
          }catch{}

          await save();

        }
      );

      el.addEventListener(
        "pointercancel",
        ()=>{
          dragging = null;
        }
      );

      playersContainer.appendChild(
        el
      );

    }
  );

  renderMembers();

}

function renderMembers(){

  memberList.innerHTML = "";

  if(
    !Array.isArray(
      session.serverMembers
    )
  ){
    return;
  }

  session.serverMembers.forEach(
    member => {

      const el =
        document.createElement(
          "div"
        );

      el.className =
        "member";

      el.innerHTML = `

        <img
          src="${escapeHTML(member.avatar)}"
        >

        <span>
          ${escapeHTML(
            member.name ||
            member.username
          )}
        </span>

      `;

      el.onclick =
        async () => {

          if(
            selectedSlot === null
          ){

            alert(
              "Click a player circle first."
            );

            return;
          }

          const slot =
            session.roster[
              selectedSlot
            ];

          slot.userId =
            member.id;

          slot.name =
            member.name ||
            member.username;

          slot.avatar =
            member.avatar;

          await save();

          render();

        };

      memberList.appendChild(
        el
      );

    }
  );

}

async function save(){

  const response =
    await fetch(
      "/api/session/" +
      encodeURIComponent(
        SESSION
      ),
      {
        method:"POST",

        headers:{
          "Content-Type":
            "application/json"
        },

        body:JSON.stringify({
          uid:UID,
          roster:
            session.roster
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

}

document
  .getElementById(
    "finishButton"
  )
  .addEventListener(
    "click",
    async () => {

      const yes =
        confirm(
          "Finish this lineup?"
        );

      if(!yes){
        return;
      }

      await save();

      const response =
        await fetch(
          "/api/session/" +
          encodeURIComponent(
            SESSION
          ),
          {
            method:"POST",

            headers:{
              "Content-Type":
                "application/json"
            },

            body:JSON.stringify({
              uid:UID,
              action:"finish",
              roster:
                session.roster
            })
          }
        );

      const data =
        await response.json();

      if(data.error){

        alert(data.error);
        return;

      }

      document
        .getElementById(
          "finishButton"
        )
        .textContent =
          "✓ SENT TO DISCORD";

      alert(
        "✅ The final lineup has been sent to the Discord channel!"
      );

    }
  );

load();

</script>

</body>

</html>
`;
}

/* =========================================================
   UTILITIES
========================================================= */

function clampNumber(value, fallback) {

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(
    2,
    Math.min(98, number)
  );
}

function escapeXml(value = "") {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function sendHtml(
  res,
  status,
  html
) {

  res.writeHead(
    status,
    {
      "Content-Type":
        "text/html; charset=utf-8"
    }
  );

  res.end(html);
}

function sendJson(
  res,
  status,
  data
) {

  res.writeHead(
    status,
    {
      "Content-Type":
        "application/json; charset=utf-8"
    }
  );

  res.end(
    JSON.stringify(data)
  );
}

function readBody(req) {

  return new Promise(
    (resolve,reject)=>{

      let data = "";

      req.on(
        "data",
        chunk => {

          data += chunk;

          if(
            data.length > 2000000
          ){

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
        ()=>{

          try{

            resolve(
              data
                ? JSON.parse(data)
                : {}
            );

          }catch{

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

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>Lineup</title>

<style>

body{
  margin:0;
  background:#07130c;
  color:white;
  font-family:Arial;
  display:flex;
  align-items:center;
  justify-content:center;
  min-height:100vh;
}

.box{
  background:#101813;
  padding:30px;
  border-radius:15px;
  text-align:center;
}

</style>

</head>

<body>

<div class="box">

<h1>⚽ Lineup</h1>

<p>
${escapeHtml(message)}
</p>

</div>

</body>

</html>
`;
}
