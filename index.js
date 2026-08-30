const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  EmbedBuilder
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const PORT = process.env.PORT || 3000;

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
  return crypto.randomBytes(16).toString("hex");
}

function getBaseUrl() {
  return process.env.RENDER_EXTERNAL_URL ||
    `http://localhost:${PORT}`;
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

/* =========================================================
   FORMATIONS
========================================================= */

const formationPositions = {
  1: [["GK", 50, 90]],

  2: [
    ["GK", 50, 90],
    ["ST", 50, 15]
  ],

  3: [
    ["GK", 50, 90],
    ["ST", 35, 18],
    ["ST", 65, 18]
  ],

  4: [
    ["GK", 50, 90],
    ["LB", 25, 58],
    ["RB", 75, 58],
    ["ST", 50, 18]
  ],

  5: [
    ["GK", 50, 90],
    ["LB", 18, 62],
    ["CB", 50, 62],
    ["RB", 82, 62],
    ["ST", 50, 18]
  ],

  6: [
    ["GK", 50, 90],
    ["LB", 15, 65],
    ["CB", 38, 67],
    ["CB", 62, 67],
    ["RB", 85, 65],
    ["ST", 50, 18]
  ],

  7: [
    ["GK", 50, 90],
    ["LB", 12, 65],
    ["CB", 35, 68],
    ["CB", 65, 68],
    ["RB", 88, 65],
    ["LW", 30, 35],
    ["ST", 65, 20]
  ],

  8: [
    ["GK", 50, 90],
    ["LB", 10, 66],
    ["CB", 30, 70],
    ["CB", 70, 70],
    ["RB", 90, 66],
    ["LM", 25, 42],
    ["RM", 75, 42],
    ["ST", 50, 18]
  ],

  9: [
    ["GK", 50, 90],
    ["LB", 10, 68],
    ["CB", 30, 70],
    ["CB", 50, 70],
    ["CB", 70, 70],
    ["RB", 90, 68],
    ["LW", 25, 38],
    ["RW", 75, 38],
    ["ST", 50, 16]
  ],

  10: [
    ["GK", 50, 90],
    ["LB", 9, 68],
    ["CB", 28, 71],
    ["CB", 50, 72],
    ["CB", 72, 71],
    ["RB", 91, 68],
    ["LM", 20, 43],
    ["RM", 80, 43],
    ["LW", 35, 20],
    ["ST", 65, 20]
  ],

  11: [
    ["GK", 50, 90],
    ["LB", 8, 68],
    ["CB", 28, 72],
    ["CB", 50, 74],
    ["CB", 72, 72],
    ["RB", 92, 68],
    ["LM", 18, 46],
    ["CM", 39, 48],
    ["CM", 61, 48],
    ["RM", 82, 46],
    ["ST", 50, 17]
  ]
};

/* =========================================================
   CREATE SESSION
========================================================= */

function createSession(interaction, size) {
  const positions = formationPositions[size];

  const roster = positions.map((pos, index) => ({
    index,
    role: pos[0],
    name: "",
    username: "",
    avatar: "",
    userId: null,
    pctX: pos[1],
    pctY: pos[2]
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

/* =========================================================
   DISCORD READY
========================================================= */

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🌐 Port: ${PORT}`);

  const command = {
    name: "lineup",
    description: "Create a football lineup"
  };

  try {
    await client.application.commands.set([command]);
    console.log("✅ /lineup registered.");
  } catch (error) {
    console.error("❌ Command registration error:", error);
  }
});

/* =========================================================
   DISCORD COMMAND
========================================================= */

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
          "Choose how many players you want:",
        components: rows,
        ephemeral: true
      });

      return;
    }

    /* =====================================================
       SIZE BUTTON
    ===================================================== */

    if (
      interaction.isButton() &&
      interaction.customId.startsWith("lineup_size_")
    ) {
      const size = Number(
        interaction.customId.replace("lineup_size_", "")
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
        createSession(interaction, size);

      const url =
        `${getBaseUrl()}/pitch/${session.id}?uid=${interaction.user.id}`;

      const button =
        new ButtonBuilder()
          .setLabel("⚽ Open Lineup")
          .setStyle(ButtonStyle.Link)
          .setURL(url);

      const row =
        new ActionRowBuilder()
          .addComponents(button);

      await interaction.update({
        content:
          `⚽ **${size}v${size} LINEUP CREATED**\n\n` +
          `Click below to open the pitch editor.\n\n` +
          `Only you can edit this lineup.`,
        components: [row]
      });

      return;
    }

  } catch (error) {
    console.error("❌ Discord interaction error:", error);

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

/* =========================================================
   WEB SERVER
========================================================= */

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(
      req.url,
      `http://${req.headers.host || "localhost"}`
    );

    /* =====================================================
       HEALTH
    ===================================================== */

    if (
      requestUrl.pathname === "/health"
    ) {
      return sendJson(res, 200, {
        online: true,
        discord: client.isReady(),
        bot: client.user?.tag || null,
        sessions: sessions.size
      });
    }

    /* =====================================================
       PITCH HTML
    ===================================================== */

    if (
      requestUrl.pathname.startsWith("/pitch/")
    ) {
      const sessionId =
        requestUrl.pathname
          .replace("/pitch/", "")
          .split("/")[0];

      const session =
        sessions.get(sessionId);

      if (!session) {
        return sendHtml(
          res,
          404,
          errorPage("This lineup does not exist or has expired.")
        );
      }

      const filePath =
        path.join(__dirname, "pitch.html");

      if (!fs.existsSync(filePath)) {
        return sendHtml(
          res,
          500,
          errorPage(
            "pitch.html is missing from your project."
          )
        );
      }

      const html =
        fs.readFileSync(filePath, "utf8");

      return sendHtml(res, 200, html);
    }

    /* =====================================================
       GET SESSION
       Matches your pitch.html
    ===================================================== */

    const sessionGetMatch =
      requestUrl.pathname.match(
        /^\/api\/session\/([^/]+)$/
      );

    if (
      sessionGetMatch &&
      req.method === "GET"
    ) {
      const sessionId =
        decodeURIComponent(
          sessionGetMatch[1]
        );

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
            "❌ Could not fetch members:",
            error
          );
        }
      }

      return sendJson(res, 200, {
        id: session.id,
        size: session.size,
        creatorId: session.creatorId,
        guildId: session.guildId,
        channelId: session.channelId,
        finished: session.finished,
        roster: session.roster,
        serverMembers
      });
    }

    /* =====================================================
       SAVE SESSION
       Matches your pitch.html
    ===================================================== */

    const sessionPostMatch =
      requestUrl.pathname.match(
        /^\/api\/session\/([^/]+)$/
      );

    if (
      sessionPostMatch &&
      req.method === "POST"
    ) {
      const sessionId =
        decodeURIComponent(
          sessionPostMatch[1]
        );

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
            "Only the person who created this lineup can edit it."
        });
      }

      if (session.finished) {
        return sendJson(res, 403, {
          error: "This lineup has already been finished."
        });
      }

      if (Array.isArray(body.roster)) {
        session.roster =
          body.roster.map(
            (player, index) => ({
              index,
              role:
                String(
                  player.role || "PLAYER"
                ).slice(0, 20),
              name:
                String(
                  player.name || ""
                ).slice(0, 80),
              username:
                String(
                  player.username || ""
                ).slice(0, 80),
              avatar:
                String(
                  player.avatar || ""
                ).slice(0, 1000),
              userId:
                player.userId || null,
              pctX:
                clamp(
                  Number(player.pctX),
                  4,
                  96
                ),
              pctY:
                clamp(
                  Number(player.pctY),
                  4,
                  96
                )
            })
          );
      }

      /* ===================================================
         FINISH
      =================================================== */

      if (body.action === "finish") {
        session.finished = true;

        const image =
          createLineupSvg(session);

        const attachment =
          new AttachmentBuilder(
            Buffer.from(image),
            {
              name:
                `lineup-${session.size}v${session.size}.svg`
            }
          );

        const guild =
          client.guilds.cache.get(
            session.guildId
          );

        if (!guild) {
          return sendJson(res, 500, {
            error:
              "Discord server could not be found."
          });
        }

        const channel =
          guild.channels.cache.get(
            session.channelId
          );

        if (
          !channel ||
          !channel.isTextBased()
        ) {
          return sendJson(res, 500, {
            error:
              "The original Discord channel could not be found."
          });
        }

        const positionText =
          session.roster
            .map(player => {
              const name =
                player.name ||
                "Unassigned";

              return `**${player.role}** — ${name}`;
            })
            .join("\n");

        const embed =
          new EmbedBuilder()
            .setTitle(
              `⚽ ${session.size}v${session.size} LINEUP`
            )
            .setDescription(
              positionText
            )
            .setImage(
              `attachment://lineup-${session.size}v${session.size}.svg`
            )
            .setFooter({
              text:
                "Lineup created with Newcastle Assistant"
            })
            .setTimestamp();

        try {
          await channel.send({
            content:
              `🏁 **LINEUP FINISHED**\n` +
              `<@${session.creatorId}> has finished the lineup.`,
            embeds: [embed],
            files: [attachment]
          });
        } catch (error) {
          console.error(
            "❌ Failed to send lineup to Discord:",
            error
          );

          return sendJson(res, 500, {
            error:
              "The lineup was finished, but I couldn't post it in Discord."
          });
        }

        return sendJson(res, 200, {
          success: true,
          message:
            "Lineup finished and posted to Discord."
        });
      }

      return sendJson(res, 200, {
        success: true,
        roster: session.roster
      });
    }

    /* =====================================================
       404
    ===================================================== */

    return sendHtml(
      res,
      404,
      errorPage("Page not found.")
    );

  } catch (error) {
    console.error("❌ HTTP error:", error);

    return sendJson(res, 500, {
      error: "Internal server error"
    });
  }
});

/* =========================================================
   START WEB SERVER
========================================================= */

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `🌐 Web server listening on ${PORT}`
    );
  }
);

/* =========================================================
   LOGIN
========================================================= */

client.login(TOKEN).catch(error => {
  console.error(
    "❌ Discord login failed:",
    error
  );

  process.exit(1);
});

/* =========================================================
   HELPERS
========================================================= */

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(
    min,
    Math.min(max, value)
  );
}

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

  res.end(
    JSON.stringify(data)
  );
}

function readBody(req) {
  return new Promise(
    (resolve, reject) => {
      let data = "";

      req.on("data", chunk => {
        data += chunk;

        if (data.length > 2000000) {
          reject(
            new Error(
              "Request too large"
            )
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
          resolve(JSON.parse(data));
        } catch {
          resolve({});
        }
      });

      req.on("error", reject);
    }
  );
}

/* =========================================================
   SVG LINEUP IMAGE
========================================================= */

function createLineupSvg(session) {
  const width = 1000;
  const height = 700;

  let players = "";

  for (const player of session.roster) {
    const x =
      (clamp(player.pctX, 4, 96) / 100) *
      width;

    const y =
      (clamp(player.pctY, 4, 96) / 100) *
      height;

    const initials =
      getInitials(
        player.name || "?"
      );

    const name =
      escapeXml(
        player.name ||
        "Unassigned"
      );

    const role =
      escapeXml(
        player.role ||
        ""
      );

    players += `
      <g>
        <circle
          cx="${x}"
          cy="${y}"
          r="31"
          fill="#111827"
          stroke="white"
          stroke-width="4"
        />

        <text
          x="${x}"
          y="${y + 8}"
          text-anchor="middle"
          font-family="Arial"
          font-size="20"
          font-weight="bold"
          fill="white"
        >
          ${escapeXml(initials)}
        </text>

        <text
          x="${x}"
          y="${y + 52}"
          text-anchor="middle"
          font-family="Arial"
          font-size="16"
          font-weight="bold"
          fill="white"
        >
          ${name}
        </text>

        <text
          x="${x}"
          y="${y + 70}"
          text-anchor="middle"
          font-family="Arial"
          font-size="13"
          font-weight="bold"
          fill="#d1fae5"
        >
          ${role}
        </text>
      </g>
    `;
  }

  return `
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${width}"
  height="${height}"
  viewBox="0 0 ${width} ${height}"
>
  <rect
    x="0"
    y="0"
    width="${width}"
    height="${height}"
    rx="18"
    fill="#20753d"
  />

  <rect
    x="3"
    y="3"
    width="${width - 6}"
    height="${height - 6}"
    rx="15"
    fill="none"
    stroke="white"
    stroke-width="5"
  />

  <line
    x1="0"
    y1="${height / 2}"
    x2="${width}"
    y2="${height / 2}"
    stroke="white"
    stroke-width="4"
  />

  <circle
    cx="${width / 2}"
    cy="${height / 2}"
    r="90"
    fill="none"
    stroke="white"
    stroke-width="4"
  />

  <circle
    cx="${width / 2}"
    cy="${height / 2}"
    r="5"
    fill="white"
  />

  <rect
    x="${width * 0.33}"
    y="0"
    width="${width * 0.34}"
    height="${height * 0.20}"
    fill="none"
    stroke="white"
    stroke-width="4"
  />

  <rect
    x="${width * 0.33}"
    y="${height * 0.80}"
    width="${width * 0.34}"
    height="${height * 0.20}"
    fill="none"
    stroke="white"
    stroke-width="4"
  />

  <rect
    x="${width * 0.42}"
    y="0"
    width="${width * 0.16}"
    height="${height * 0.08}"
    fill="none"
    stroke="white"
    stroke-width="4"
  />

  <rect
    x="${width * 0.42}"
    y="${height * 0.92}"
    width="${width * 0.16}"
    height="${height * 0.08}"
    fill="none"
    stroke="white"
    stroke-width="4"
  />

  ${players}
</svg>
`;
}

function getInitials(name) {
  const words =
    String(name)
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if (!words.length) {
    return "?";
  }

  if (words.length === 1) {
    return words[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    words[0][0] +
    words[1][0]
  ).toUpperCase();
}

/* =========================================================
   ERROR PAGE
========================================================= */

function errorPage(message) {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>
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
  width:min(500px,90vw);
  padding:30px;
  text-align:center;
  background:#101813;
  border:1px solid rgba(255,255,255,.12);
  border-radius:16px;
}

h1{
  margin-top:0;
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
