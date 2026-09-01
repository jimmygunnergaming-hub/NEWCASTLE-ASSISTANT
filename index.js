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

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escSvg(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

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
    ["ST", 30, 20],
    ["ST", 70, 20]
  ],

  4: [
    ["GK", 50, 88],
    ["LB", 25, 60],
    ["RB", 75, 60],
    ["ST", 50, 18]
  ],

  5: [
    ["GK", 50, 88],
    ["LB", 18, 63],
    ["CB", 50, 63],
    ["RB", 82, 63],
    ["ST", 50, 18]
  ],

  6: [
    ["GK", 50, 88],
    ["LB", 14, 65],
    ["CB", 38, 65],
    ["CB", 62, 65],
    ["RB", 86, 65],
    ["ST", 50, 18]
  ],

  7: [
    ["GK", 50, 88],
    ["LB", 12, 66],
    ["CB", 35, 68],
    ["CB", 65, 68],
    ["RB", 88, 66],
    ["LW", 30, 37],
    ["ST", 70, 20]
  ],

  8: [
    ["GK", 50, 88],
    ["LB", 10, 66],
    ["CB", 30, 68],
    ["CB", 70, 68],
    ["RB", 90, 66],
    ["LM", 25, 40],
    ["RM", 75, 40],
    ["ST", 50, 18]
  ],

  9: [
    ["GK", 50, 88],
    ["LB", 9, 67],
    ["CB", 29, 69],
    ["CB", 50, 69],
    ["CB", 71, 69],
    ["RB", 91, 67],
    ["LW", 23, 38],
    ["RW", 77, 38],
    ["ST", 50, 17]
  ],

  10: [
    ["GK", 50, 88],
    ["LB", 8, 68],
    ["CB", 27, 70],
    ["CB", 50, 70],
    ["CB", 73, 70],
    ["RB", 92, 68],
    ["LM", 20, 43],
    ["RM", 80, 43],
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
    ["LM", 17, 47],
    ["CM", 38, 49],
    ["CM", 62, 49],
    ["RM", 83, 47],
    ["ST", 50, 17]
  ]
};

function createSession(interaction, size) {
  const roster = formations[size].map((item, index) => ({
    slot: index,
    position: item[0],
    x: item[1],
    y: item[2],

    userId: null,
    name: "",
    avatar: "",

    /*
      IMPORTANT:
      bench=true means the real player is on the bench,
      BUT THE PITCH SLOT MUST STILL BE DRAWN AS GREY.
    */
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
  return (
    process.env.RENDER_EXTERNAL_URL ||
    `http://localhost:${PORT}`
  ).replace(/\/$/, "");
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

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;

      if (body.length > 2000000) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });

    req.on("error", reject);
  });
}

/* =========================================================
   DISCORD
========================================================= */

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    await client.application.commands.set([
      new SlashCommandBuilder()
        .setName("lineup")
        .setDescription("Create a football lineup")
    ]);

    console.log("/lineup registered");
  } catch (error) {
    console.error("Slash command error:", error);
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
            .setCustomId(`lineup_${i}`)
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
          "⚽ **NEWCASTLE LINEUP**\n\nChoose your lineup size:",
        components: rows,
        ephemeral: true
      });

      return;
    }

    if (
      interaction.isButton() &&
      interaction.customId.startsWith("lineup_")
    ) {
      const size = Number(
        interaction.customId.replace("lineup_", "")
      );

      if (!formations[size]) {
        return interaction.reply({
          content: "Invalid lineup size.",
          ephemeral: true
        });
      }

      const session = createSession(
        interaction,
        size
      );

      const link = new ButtonBuilder()
        .setLabel("⚽ OPEN LINEUP EDITOR")
        .setStyle(ButtonStyle.Link)
        .setURL(
          `${getBaseUrl()}/pitch/${session.id}?uid=${interaction.user.id}`
        );

      await interaction.update({
        content:
          `⚽ **${size}v${size} LINEUP**\n\n` +
          "Open the editor below.",
        components: [
          new ActionRowBuilder().addComponents(link)
        ]
      });
    }
  } catch (error) {
    console.error("Interaction error:", error);
  }
});

/* =========================================================
   MEMBERS
========================================================= */

async function getGuildMembers(session) {
  const guild = client.guilds.cache.get(
    session.guildId
  );

  if (!guild) return [];

  try {
    const members = await guild.members.fetch();

    return members
      .filter(member => !member.user.bot)
      .map(member => ({
        id: member.user.id,
        name:
          member.displayName ||
          member.user.username,
        username: member.user.username,
        avatar: member.user.displayAvatarURL({
          extension: "png",
          size: 256
        })
      }));
  } catch (error) {
    console.error("Could not fetch members:", error);
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

    const path = url.pathname;

    if (path === "/") {
      return sendHtml(
        res,
        200,
        `
        <!doctype html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <title>Newcastle Assistant</title>
        </head>
        <body style="
          margin:0;
          background:#07130c;
          color:white;
          font-family:Arial;
          min-height:100vh;
          display:grid;
          place-items:center;
        ">
          <div>
            <h1>⚽ Newcastle Assistant</h1>
            <p>Bot is online.</p>
          </div>
        </body>
        </html>
        `
      );
    }

    if (path === "/health") {
      return sendJson(res, 200, {
        online: true,
        discord: client.isReady()
      });
    }

    /* =====================================================
       PITCH
    ===================================================== */

    if (path.startsWith("/pitch/")) {
      const id = path
        .slice("/pitch/".length)
        .split("/")[0];

      const session = sessions.get(id);

      if (!session) {
        return sendHtml(
          res,
          404,
          errorPage(
            "This lineup does not exist or has expired."
          )
        );
      }

      return sendHtml(
        res,
        200,
        pitchPage(session)
      );
    }

    /* =====================================================
       GET SESSION
    ===================================================== */

    if (
      path.startsWith("/api/session/") &&
      req.method === "GET"
    ) {
      const id = path
        .slice("/api/session/".length)
        .split("/")[0];

      const session = sessions.get(id);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found."
        });
      }

      return sendJson(res, 200, {
        id: session.id,
        size: session.size,
        creatorId: session.creatorId,
        roster: session.roster,
        finished: session.finished,
        serverMembers:
          await getGuildMembers(session)
      });
    }

    /* =====================================================
       SAVE
    ===================================================== */

    if (
      path.startsWith("/api/session/") &&
      req.method === "POST"
    ) {
      const id = path
        .slice("/api/session/".length)
        .split("/")[0];

      const session = sessions.get(id);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found."
        });
      }

      const body = await readBody(req);

      if (
        String(body.uid) !==
        String(session.creatorId)
      ) {
        return sendJson(res, 403, {
          error: "You cannot edit this lineup."
        });
      }

      if (Array.isArray(body.roster)) {
        body.roster.forEach((incoming, index) => {
          const slot = session.roster[index];

          if (!slot) return;

          if (Number.isFinite(Number(incoming.x))) {
            slot.x = Math.max(
              3,
              Math.min(
                97,
                Number(incoming.x)
              )
            );
          }

          if (Number.isFinite(Number(incoming.y))) {
            slot.y = Math.max(
              3,
              Math.min(
                97,
                Number(incoming.y)
              )
            );
          }

          if (
            typeof incoming.position ===
            "string"
          ) {
            slot.position =
              incoming.position
                .trim()
                .slice(0, 25);
          }

          if (
            typeof incoming.bench ===
            "boolean"
          ) {
            slot.bench =
              incoming.bench;
          }

          if (
            typeof incoming.userId ===
            "string"
          ) {
            slot.userId =
              incoming.userId;
          }

          if (
            typeof incoming.name ===
            "string"
          ) {
            slot.name =
              incoming.name.slice(0, 80);
          }

          if (
            typeof incoming.avatar ===
            "string"
          ) {
            slot.avatar =
              incoming.avatar;
          }
        });
      }

      return sendJson(res, 200, {
        success: true,
        roster: session.roster
      });
    }

    /* =====================================================
       ASSIGN
    ===================================================== */

    if (
      path === "/api/assign" &&
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

      if (
        String(body.uid) !==
        String(session.creatorId)
      ) {
        return sendJson(res, 403, {
          error: "You cannot edit this lineup."
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

      const guild =
        client.guilds.cache.get(
          session.guildId
        );

      if (!guild) {
        return sendJson(res, 500, {
          error: "Discord server not found."
        });
      }

      let member;

      try {
        member =
          await guild.members.fetch(
            body.userId
          );
      } catch {
        return sendJson(res, 404, {
          error: "That Discord member could not be found."
        });
      }

      if (!member || member.user.bot) {
        return sendJson(res, 404, {
          error: "Invalid player."
        });
      }

      slot.userId =
        member.user.id;

      slot.name =
        member.displayName ||
        member.user.username;

      slot.avatar =
        member.user.displayAvatarURL({
          extension: "png",
          size: 256
        });

      /*
        THIS IS IMPORTANT.

        If the slot was grey because the old
        player was benched, assigning someone
        here makes the slot a normal player again.
      */

      slot.bench = false;

      return sendJson(res, 200, {
        success: true,
        slot
      });
    }

    /* =====================================================
       POSITION
    ===================================================== */

    if (
      path === "/api/position" &&
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

      if (
        String(body.uid) !==
        String(session.creatorId)
      ) {
        return sendJson(res, 403, {
          error: "Not allowed."
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
          .slice(0, 25);

      if (!position) {
        return sendJson(res, 400, {
          error: "Position is empty."
        });
      }

      slot.position = position;

      return sendJson(res, 200, {
        success: true,
        slot
      });
    }

    /* =====================================================
       MOVE
    ===================================================== */

    if (
      path === "/api/move" &&
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

      if (
        String(body.uid) !==
        String(session.creatorId)
      ) {
        return sendJson(res, 403, {
          error: "Not allowed."
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
          error: "Invalid position."
        });
      }

      slot.x = Math.max(
        3,
        Math.min(97, x)
      );

      slot.y = Math.max(
        3,
        Math.min(97, y)
      );

      return sendJson(res, 200, {
        success: true,
        slot
      });
    }

    /* =====================================================
       BENCH
    ===================================================== */

    if (
      path === "/api/bench" &&
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

      if (
        String(body.uid) !==
        String(session.creatorId)
      ) {
        return sendJson(res, 403, {
          error: "Not allowed."
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

      /*
        DO NOT DELETE THE PLAYER.

        Keep userId/name/avatar.

        The editor will use bench=true to
        draw a grey circle at the exact same
        x/y position.
      */

      slot.bench =
        Boolean(body.bench);

      return sendJson(res, 200, {
        success: true,
        slot
      });
    }

    /* =====================================================
       FINISH
    ===================================================== */

    if (
      path.startsWith("/api/finish/") &&
      req.method === "POST"
    ) {
      const id = path
        .slice("/api/finish/".length)
        .split("/")[0];

      const session =
        sessions.get(id);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found."
        });
      }

      const body =
        await readBody(req);

      if (
        String(body.uid) !==
        String(session.creatorId)
      ) {
        return sendJson(res, 403, {
          error: "Not allowed."
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

      let message =
        "**NEWCASTLE LINEUP TODAY ENJOY**\n\n";

      if (playing.length) {
        message += playing
          .map(
            p =>
              `**${p.position}** — ${p.name}`
          )
          .join("\n");
      }

      if (bench.length) {
        message +=
          "\n\n**BENCH**\n";

        message += bench
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
        content: message,
        files: [attachment]
      });

      return sendJson(res, 200, {
        success: true
      });
    }

    return sendJson(res, 404, {
      error: "Not found."
    });
  } catch (error) {
    console.error("Server error:", error);

    return sendJson(res, 500, {
      error:
        error.message ||
        "Internal server error."
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

/* =========================================================
   ERROR PAGE
========================================================= */

function errorPage(message) {
  return `
<!doctype html>

<html>

<head>
<meta name="viewport"
content="width=device-width,initial-scale=1">
</head>

<body style="
margin:0;
background:#07130c;
color:white;
font-family:Arial;
display:grid;
place-items:center;
min-height:100vh;
">

<div style="
background:#101b14;
padding:30px;
border-radius:15px;
">

<h2>⚽ Newcastle Assistant</h2>

<p>${esc(message)}</p>

</div>

</body>

</html>
`;
}

/* =========================================================
   AVATAR DOWNLOAD
========================================================= */

async function fetchAvatarData(url) {
  if (!url) return null;

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
        .png()
        .toBuffer();

    return (
      "data:image/png;base64," +
      png.toString("base64")
    );
  } catch (error) {
    console.error(
      "Avatar error:",
      error.message
    );

    return null;
  }
}

/* =========================================================
   CREATE FINAL IMAGE
========================================================= */

async function createPitchImage(session) {
  const W = 1200;
  const H = 900;
  const pitchH = 735;

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

  /*
    Download profile pictures.
  */

  const avatars =
    new Map();

  await Promise.all(
    session.roster
      .filter(p => p.userId)
      .map(async p => {
        const data =
          await fetchAvatarData(
            p.avatar
          );

        if (data) {
          avatars.set(
            p.slot,
            data
          );
        }
      })
  );

  /*
    NORMAL PLAYERS
  */

  const playersSvg =
    playing
      .map(player => {

        const x =
          (player.x / 100) * W;

        const y =
          (player.y / 100) *
          pitchH;

        const avatar =
          avatars.get(
            player.slot
          );

        const clipId =
          `clip_${session.id}_${player.slot}`;

        let avatarSvg;

        if (avatar) {
          avatarSvg = `
            <defs>
              <clipPath id="${clipId}">
                <circle
                  cx="${x}"
                  cy="${y}"
                  r="33"
                />
              </clipPath>
            </defs>

            <image
              href="${avatar}"
              x="${x - 33}"
              y="${y - 33}"
              width="66"
              height="66"
              preserveAspectRatio="xMidYMid slice"
              clip-path="url(#${clipId})"
            />

            <circle
              cx="${x}"
              cy="${y}"
              r="33"
              fill="none"
              stroke="white"
              stroke-width="4"
            />
          `;
        } else {
          avatarSvg = `
            <circle
              cx="${x}"
              cy="${y}"
              r="33"
              fill="#777f7a"
              stroke="white"
              stroke-width="4"
            />

            <text
              x="${x}"
              y="${y + 8}"
              text-anchor="middle"
              font-family="Arial"
              font-size="24"
              font-weight="bold"
              fill="white"
            >
              ${escSvg(
                player.name
                  ? player.name
                      .charAt(0)
                      .toUpperCase()
                  : "?"
              )}
            </text>
          `;
        }

        return `
          <g>

            ${avatarSvg}

            <rect
              x="${x - 70}"
              y="${y + 39}"
              width="140"
              height="27"
              rx="6"
              fill="#06100a"
              opacity=".96"
            />

            <text
              x="${x}"
              y="${y + 57}"
              text-anchor="middle"
              font-family="Arial"
              font-size="14"
              font-weight="bold"
              fill="white"
            >
              ${escSvg(
                player.name
              )}
            </text>

            <text
              x="${x}"
              y="${y + 82}"
              text-anchor="middle"
              font-family="Arial"
              font-size="13"
              font-weight="bold"
              fill="white"
            >
              ${escSvg(
                player.position
              )}
            </text>

          </g>
        `;
      })
      .join("");

  /*
    BENCH PLAYERS
  */

  const benchSvg =
    bench
      .map((player, index) => {

        const x =
          100 +
          index * 175;

        const y = 827;

        const avatar =
          avatars.get(
            player.slot
          );

        const clipId =
          `bench_${session.id}_${player.slot}`;

        let avatarSvg;

        if (avatar) {
          avatarSvg = `
            <defs>
              <clipPath id="${clipId}">
                <circle
                  cx="${x}"
                  cy="${y}"
                  r="26"
                />
              </clipPath>
            </defs>

            <image
              href="${avatar}"
              x="${x - 26}"
              y="${y - 26}"
              width="52"
              height="52"
              preserveAspectRatio="xMidYMid slice"
              clip-path="url(#${clipId})"
            />

            <circle
              cx="${x}"
              cy="${y}"
              r="26"
              fill="none"
              stroke="white"
              stroke-width="3"
            />
          `;
        } else {
          avatarSvg = `
            <circle
              cx="${x}"
              cy="${y}"
              r="26"
              fill="#777f7a"
              stroke="white"
              stroke-width="3"
            />

            <text
              x="${x}"
              y="${y + 7}"
              text-anchor="middle"
              font-family="Arial"
              font-size="18"
              font-weight="bold"
              fill="white"
            >
              ${escSvg(
                player.name
                  ? player.name
                      .charAt(0)
                      .toUpperCase()
                  : "?"
              )}
            </text>
          `;
        }

        return `
          <g>

            ${avatarSvg}

            <text
              x="${x}"
              y="${y + 48}"
              text-anchor="middle"
              font-family="Arial"
              font-size="12"
              font-weight="bold"
              fill="white"
            >
              ${escSvg(
                player.name
              )}
            </text>

            <text
              x="${x}"
              y="${y + 65}"
              text-anchor="middle"
              font-family="Arial"
              font-size="10"
              fill="#cbd5ce"
            >
              ${escSvg(
                player.position
              )}
            </text>

          </g>
        `;
      })
      .join("");

  /*
    THIS IS THE KEY PART.

    Every BENCHED player gets a grey circle
    at their ORIGINAL CURRENT PITCH POSITION.

    The player remains stored in the roster,
    so the slot never disappears.
  */

  const greySlotsSvg =
    session.roster
      .filter(
        player =>
          player.bench
      )
      .map(player => {

        const x =
          (player.x / 100) * W;

        const y =
          (player.y / 100) *
          pitchH;

        return `
          <g>

            <circle
              cx="${x}"
              cy="${y}"
              r="34"
              fill="#777f7a"
              stroke="#d4d9d6"
              stroke-width="4"
            />

            <text
              x="${x}"
              y="${y + 8}"
              text-anchor="middle"
              font-family="Arial"
              font-size="25"
              font-weight="bold"
              fill="white"
            >
              +
            </text>

            <rect
              x="${x - 55}"
              y="${y + 40}"
              width="110"
              height="25"
              rx="6"
              fill="#06100a"
              opacity=".95"
            />

            <text
              x="${x}"
              y="${y + 57}"
              text-anchor="middle"
              font-family="Arial"
              font-size="12"
              font-weight="bold"
              fill="white"
            >
              EMPTY SLOT
            </text>

          </g>
        `;
      })
      .join("");

  const svg = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${W}"
  height="${H}"
  viewBox="0 0 ${W} ${H}"
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
      stop-color="#277d44"
    />

    <stop
      offset="50%"
      stop-color="#1f713d"
    />

    <stop
      offset="100%"
      stop-color="#277d44"
    />
  </linearGradient>

</defs>

<!-- BACKGROUND -->

<rect
  x="0"
  y="0"
  width="${W}"
  height="${H}"
  fill="#07130c"
/>

<!-- PITCH -->

<rect
  x="15"
  y="15"
  width="${W - 30}"
  height="${pitchH - 15}"
  rx="7"
  fill="url(#grass)"
  stroke="white"
  stroke-width="4"
/>

<!-- PITCH LINES -->

<g
  fill="none"
  stroke="white"
  stroke-width="4"
>

  <line
    x1="15"
    y1="${pitchH / 2}"
    x2="${W - 15}"
    y2="${pitchH / 2}"
  />

  <circle
    cx="${W / 2}"
    cy="${pitchH / 2}"
    r="98"
  />

  <circle
    cx="${W / 2}"
    cy="${pitchH / 2}"
    r="5"
    fill="white"
  />

  <rect
    x="${W * .30}"
    y="15"
    width="${W * .40}"
    height="135"
  />

  <rect
    x="${W * .30}"
    y="${pitchH - 150}"
    width="${W * .40}"
    height="135"
  />

  <rect
    x="${W * .415}"
    y="15"
    width="${W * .17}"
    height="65"
  />

  <rect
    x="${W * .415}"
    y="${pitchH - 80}"
    width="${W * .17}"
    height="65"
  />

</g>

<!-- GREY REPLACEMENT SLOTS -->

${greySlotsSvg}

<!-- NORMAL PLAYERS -->

${playersSvg}

<!-- BENCH AREA -->

<rect
  x="15"
  y="${pitchH + 15}"
  width="${W - 30}"
  height="${H - pitchH - 30}"
  rx="12"
  fill="#101b14"
  stroke="#ffffff30"
  stroke-width="2"
/>

<text
  x="${W / 2}"
  y="${pitchH + 47}"
  text-anchor="middle"
  font-family="Arial"
  font-size="21"
  font-weight="bold"
  fill="white"
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

/* =========================================================
   PITCH PAGE
========================================================= */

function pitchPage(session) {
  const original =
    JSON.stringify(
      session.roster.map(p => ({
        x: p.x,
        y: p.y
      }))
    );

  return `
<!doctype html>

<html>

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"
>

<title>Newcastle Lineup</title>

<style>

* {
  box-sizing:border-box;
}

html,
body {
  margin:0;
  padding:0;

  background:#07130c;

  color:white;

  font-family:
    Arial,
    Helvetica,
    sans-serif;
}

body {
  min-height:100vh;
}

/* =====================================================
   TOP BAR
===================================================== */

.topbar {
  position:sticky;
  top:0;

  z-index:1000;

  min-height:66px;

  display:flex;

  align-items:center;

  justify-content:space-between;

  gap:10px;

  padding:10px 15px;

  background:#08110c;

  border-bottom:
    1px solid #ffffff20;
}

.title {
  font-size:20px;
  font-weight:900;
}

.subtitle {
  margin-top:3px;

  color:#89958d;

  font-size:11px;
}

.top-buttons {
  display:flex;
  gap:8px;
}

button {
  font:inherit;

  border:0;

  cursor:pointer;

  touch-action:manipulation;
}

.top-btn {
  padding:11px 15px;

  border-radius:8px;

  background:#242d27;

  color:white;

  font-weight:900;
}

.done-btn {
  background:#16803d;
}

.top-btn:disabled {
  opacity:.6;
}

/* =====================================================
   MAIN
===================================================== */

.main {
  display:flex;

  justify-content:center;

  align-items:flex-start;

  gap:18px;

  padding:18px;
}

.pitch-area {
  width:min(
    950px,
    calc(100vw - 310px)
  );
}

.pitch-wrap {
  width:100%;

  aspect-ratio:
    1200 / 900;
}

/* =====================================================
   PITCH
===================================================== */

.pitch {
  position:relative;

  width:100%;
  height:100%;

  overflow:hidden;

  border:
    3px solid white;

  border-radius:14px;

  background:
    repeating-linear-gradient(
      to bottom,
      #277d44 0,
      #277d44 8%,
      #22763f 8%,
      #22763f 16%
    );

  box-shadow:
    0 20px 50px #0009;

  z-index:1;
}

/* grid */

.pitch.grid-on {
  background:
    repeating-linear-gradient(
      to bottom,
      #277d44 0,
      #277d44 8%,
      #22763f 8%,
      #22763f 16%
    );
}

.pitch.grid-on::after {
  content:"";

  position:absolute;

  inset:0;

  background-image:
    linear-gradient(
      #ffffff18 1px,
      transparent 1px
    ),
    linear-gradient(
      90deg,
      #ffffff18 1px,
      transparent 1px
    );

  background-size:
    5% 5%;

  pointer-events:none;

  z-index:5;
}

/* pitch markings */

.halfway {
  position:absolute;

  left:0;
  right:0;

  top:50%;

  border-top:
    3px solid #ffffffdc;

  z-index:2;
}

.center-circle {
  position:absolute;

  left:50%;
  top:50%;

  width:16%;
  aspect-ratio:1;

  transform:
    translate(-50%,-50%);

  border:
    3px solid white;

  border-radius:50%;

  z-index:2;
}

.center-dot {
  position:absolute;

  left:50%;
  top:50%;

  width:8px;
  height:8px;

  transform:
    translate(-50%,-50%);

  border-radius:50%;

  background:white;

  z-index:2;
}

.box {
  position:absolute;

  left:50%;

  transform:
    translateX(-50%);

  width:40%;
  height:18%;

  border-left:
    3px solid white;

  border-right:
    3px solid white;

  z-index:2;
}

.box.top {
  top:0;

  border-bottom:
    3px solid white;
}

.box.bottom {
  bottom:0;

  border-top:
    3px solid white;
}

.six {
  position:absolute;

  left:50%;

  transform:
    translateX(-50%);

  width:18%;
  height:9%;

  border-left:
    3px solid white;

  border-right:
    3px solid white;

  z-index:2;
}

.six.top {
  top:0;

  border-bottom:
    3px solid white;
}

.six.bottom {
  bottom:0;

  border-top:
    3px solid white;
}

/* =====================================================
   PLAYER LAYER
===================================================== */

#players {
  position:absolute;

  inset:0;

  z-index:50;

  pointer-events:none;
}

.player {
  position:absolute;

  width:82px;

  min-height:92px;

  transform:
    translate(-50%,-50%);

  text-align:center;

  pointer-events:auto;

  touch-action:none;

  user-select:none;

  cursor:pointer;

  z-index:60 !important;
}

.player.dragging {
  z-index:200 !important;

  cursor:grabbing;
}

.player .avatar {
  width:55px;
  height:55px;

  margin:auto;

  border-radius:50%;

  background:#777f7a;

  border:
    3px solid white;

  overflow:hidden;

  display:flex;

  align-items:center;
  justify-content:center;

  color:white;

  font-size:21px;

  font-weight:900;

  position:relative;

  z-index:70;

  box-shadow:
    0 4px 13px #0008;
}

.player .avatar img {
  display:block;

  width:100%;
  height:100%;

  object-fit:cover;
}

.player .name {
  margin-top:3px;

  padding:
    3px 5px;

  border-radius:5px;

  background:#06100ae8;

  color:white;

  font-size:10px;

  font-weight:900;

  max-width:120px;

  overflow:hidden;

  text-overflow:ellipsis;

  white-space:nowrap;

  position:relative;

  z-index:71;
}

.player .position {
  margin-top:2px;

  color:white;

  font-size:9px;

  font-weight:900;

  text-shadow:
    0 2px 3px #000;

  position:relative;

  z-index:71;
}

/* =====================================================
   GREY EMPTY SLOT
===================================================== */

.player.empty-slot {
  z-index:150 !important;
}

.player.empty-slot .avatar {
  background:#777f7a !important;

  border:
    4px solid #c5cbc7 !important;

  color:white;

  box-shadow:
    0 0 0 2px #465048,
    0 5px 15px #0009;
}

.player.empty-slot .name {
  background:#07130c;

  color:white;
}

.player.empty-slot .position {
  color:#e0e5e1;
}

/* =====================================================
   SELECTED
===================================================== */

.player.selected {
  z-index:180 !important;
}

.player.selected .avatar {
  border:
    4px solid #ffd400 !important;

  box-shadow:
    0 0 0 2px #0008,
    0 0 16px #ffd400;
}

/* =====================================================
   PANEL
===================================================== */

.panel {
  width:260px;

  padding:15px;

  border-radius:13px;

  background:#0d1811;

  border:
    1px solid #ffffff20;
}

.panel h2 {
  margin:
    0 0 8px;

  font-size:17px;
}

.info {
  margin-bottom:12px;

  color:#8f9d94;

  font-size:11px;

  line-height:1.5;
}

.control {
  width:100%;

  padding:12px;

  margin-bottom:7px;

  border-radius:8px;

  background:#202a24;

  color:white;

  font-weight:900;
}

.control.active {
  background:#15803d;
}

.control.bench-active {
  background:#a16207;
}

.status {
  margin-top:8px;

  padding:10px;

  border-radius:8px;

  background:#17231b;

  color:white;

  font-size:11px;

  line-height:1.5;
}

/* =====================================================
   MEMBERS
===================================================== */

.members {
  display:flex;

  flex-direction:column;

  gap:6px;

  margin-top:10px;

  max-height:400px;

  overflow-y:auto;
}

.member {
  display:flex;

  align-items:center;

  gap:8px;

  padding:8px;

  border-radius:8px;

  background:#17221b;

  cursor:pointer;
}

.member:hover {
  background:#26362a;
}

.member img {
  width:34px;
  height:34px;

  border-radius:50%;

  object-fit:cover;

  flex:none;
}

.member-name {
  overflow:hidden;

  text-overflow:ellipsis;

  white-space:nowrap;

  font-size:11px;

  font-weight:900;
}

/* =====================================================
   BENCH
===================================================== */

.bench-box {
  margin-top:14px;

  padding:12px;

  border-radius:12px;

  background:#0d1811;

  border:
    1px solid #ffffff20;
}

.bench-title {
  margin-bottom:8px;

  font-size:15px;

  font-weight:900;
}

.bench-list {
  display:flex;

  flex-wrap:wrap;

  gap:8px;
}

.bench-player {
  display:flex;

  align-items:center;

  gap:7px;

  padding:7px 9px;

  border-radius:8px;

  background:#17221b;

  cursor:pointer;
}

.bench-player img {
  width:35px;
  height:35px;

  border-radius:50%;

  object-fit:cover;
}

.bench-player-name {
  font-size:11px;

  font-weight:900;
}

.bench-empty {
  color:#8b968f;

  font-size:11px;
}

/* =====================================================
   MOBILE
===================================================== */

@media(max-width:850px) {

  .topbar {
    padding:8px;
  }

  .title {
    font-size:16px;
  }

  .subtitle {
    display:none;
  }

  .top-btn {
    padding:10px 11px;

    font-size:10px;
  }

  .main {
    display:block;

    padding:8px;
  }

  .pitch-area {
    width:100%;
  }

  .panel {
    width:100%;

    margin-top:10px;
  }

  .members {
    max-height:260px;
  }

  .control {
    padding:14px;
  }

  .player {
    width:70px;
  }

  .player .avatar {
    width:47px;
    height:47px;
  }

  .player .name {
    max-width:100px;

    font-size:8px;
  }

  .player .position {
    font-size:8px;
  }
}

@media(max-width:450px) {

  .title {
    font-size:14px;
  }

  .top-btn {
    padding:9px;

    font-size:9px;
  }

  .player {
    width:61px;
  }

  .player .avatar {
    width:43px;
    height:43px;
  }

  .player .name {
    max-width:88px;

    font-size:7px;
  }

  .player .position {
    font-size:7px;
  }
}

</style>

</head>

<body>

<!-- =====================================================
     TOP
===================================================== -->

<div class="topbar">

  <div>

    <div class="title">
      ⚽ Newcastle Lineup
    </div>

    <div class="subtitle">
      ${session.size}v${session.size}
    </div>

  </div>

  <div class="top-buttons">

    <button
      class="top-btn"
      onclick="resetLineup()"
    >
      Reset
    </button>

    <button
      class="top-btn done-btn"
      id="doneButton"
      onclick="finishLineup()"
    >
      ✓ Done
    </button>

  </div>

</div>

<!-- =====================================================
     MAIN
===================================================== -->

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

        <!--
          ALL PLAYER CIRCLES GO HERE.

          They are NEVER removed just because
          a player goes onto the bench.
        -->

        <div id="players"></div>

      </div>

    </div>

    <!-- =================================================
         BENCH
    ================================================== -->

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

  <!-- ===================================================
       CONTROLS
  ================================================== -->

  <div class="panel">

    <h2>
      Lineup Controls
    </h2>

    <div class="info">
      Click a circle to select it.
      Pick a Discord member to put them there.
      Move Player lets you drag and grid-snap.
      Bench Player lets you click someone and send
      them to the bench.
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

const SESSION =
  "${esc(session.id)}";

const CREATOR =
  "${esc(session.creatorId)}";

const ORIGINAL =
  ${original};

let state = null;

let selected = null;

let moveMode = false;

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

/* =====================================================
   ESCAPE
===================================================== */

function htmlEscape(value) {

  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* =====================================================
   LOAD
===================================================== */

async function load() {

  try {

    const response =
      await fetch(
        "/api/session/" +
        encodeURIComponent(
          SESSION
        )
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Could not load lineup."
      );
    }

    state = data;

    render();

  } catch(error) {

    document.body.innerHTML = `
      <div style="
        padding:30px;
        color:white;
        font-family:Arial;
      ">

        <h2>
          ❌ Could not load lineup
        </h2>

        <p>
          ${htmlEscape(
            error.message
          )}
        </p>

      </div>
    `;
  }
}

/* =====================================================
   RENDER
===================================================== */

function render() {

  renderPlayers();

  renderMembers();

  renderBench();

  updateStatus();
}

/* =====================================================
   RENDER PLAYERS
===================================================== */

function renderPlayers() {

  players.innerHTML = "";

  /*
    VERY IMPORTANT:

    We loop through EVERY roster slot.

    We NEVER do:

      if(player.bench) return;

    because that would make the circle disappear.

    Instead, a benched player gets a grey
    EMPTY SLOT in exactly the same place.
  */

  state.roster.forEach(
    (player,index) => {

      const element =
        document.createElement(
          "div"
        );

      element.className =
        "player";

      if (
        selected === index
      ) {
        element.classList.add(
          "selected"
        );
      }

      if (
        player.bench
      ) {
        element.classList.add(
          "empty-slot"
        );
      }

      /*
        POSITION
      */

      element.style.left =
        player.x + "%";

      element.style.top =
        player.y + "%";

      /*
        BENCHED PLAYER

        Grey circle stays on pitch.
      */

      if (
        player.bench
      ) {

        element.innerHTML = `
          <div class="avatar">
            +
          </div>

          <div class="name">
            Empty Slot
          </div>

          <div class="position">
            ${htmlEscape(
              player.position
            )}
          </div>
        `;

      } else {

        /*
          NORMAL PLAYER
        */

        let avatar;

        if (
          player.userId &&
          player.avatar
        ) {

          avatar = `
            <div class="avatar">
              <img
                src="${htmlEscape(
                  player.avatar
                )}"
                draggable="false"
              >
            </div>
          `;

        } else {

          avatar = `
            <div class="avatar">
              ?
            </div>
          `;
        }

        element.innerHTML = `
          ${avatar}

          <div class="name">
            ${
              htmlEscape(
                player.userId
                  ? player.name
                  : "Select Player"
              )
            }
          </div>

          <div class="position">
            ${htmlEscape(
              player.position
            )}
          </div>
        `;
      }

      /* =================================================
         CLICK
      ================================================= */

      element.addEventListener(
        "click",
        event => {

          event.stopPropagation();

          /*
            BENCH MODE:

            Click Bench Player first.

            Then click a normal player.

            They go to bench.
          */

          if (
            benchMode &&
            !player.bench &&
            player.userId
          ) {

            sendToBench(
              index
            );

            return;
          }

          /*
            Clicking a grey circle selects
            that slot so another Discord
            player can be assigned.
          */

          selected = index;

          updateStatus();

          renderPlayers();
        }
      );

      /* =================================================
         DOUBLE CLICK = STOP MOVEMENT
      ================================================= */

      element.addEventListener(
        "dblclick",
        event => {

          event.stopPropagation();

          moveMode = false;

          updateMoveButton();
        }
      );

      /* =================================================
         DRAG START
      ================================================= */

      element.addEventListener(
        "pointerdown",
        event => {

          if (
            !moveMode ||
            player.bench
          ) {
            return;
          }

          event.preventDefault();

          selected = index;

          dragging = {
            index:index,
            element:element,
            pointerId:event.pointerId
          };

          element.classList.add(
            "dragging"
          );

          try {
            element.setPointerCapture(
              event.pointerId
            );
          } catch {}
        }
      );

      /* =================================================
         DRAG
      ================================================= */

      element.addEventListener(
        "pointermove",
        event => {

          if (
            !dragging ||
            dragging.element !==
              element
          ) {
            return;
          }

          event.preventDefault();

          const rect =
            pitch.getBoundingClientRect();

          let x =
            (
              (
                event.clientX -
                rect.left
              ) /
              rect.width
            ) * 100;

          let y =
            (
              (
                event.clientY -
                rect.top
              ) /
              rect.height
            ) * 100;

          /*
            GRID SNAP = 5%
          */

          x =
            Math.round(x / 5) * 5;

          y =
            Math.round(y / 5) * 5;

          x =
            Math.max(
              3,
              Math.min(
                97,
                x
              )
            );

          y =
            Math.max(
              3,
              Math.min(
                97,
                y
              )
            );

          element.style.left =
            x + "%";

          element.style.top =
            y + "%";

          state.roster[
            index
          ].x = x;

          state.roster[
            index
          ].y = y;
        }
      );

      /* =================================================
         DRAG END
      ================================================= */

      element.addEventListener(
        "pointerup",
        async event => {

          if (!dragging) {
            return;
          }

          try {
            element.releasePointerCapture(
              event.pointerId
            );
          } catch {}

          element.classList.remove(
            "dragging"
          );

          const index =
            dragging.index;

          dragging = null;

          await saveMove(
            index
          );
        }
      );

      /*
        DO NOT SKIP THIS.

        Even grey bench slots get appended.
      */

      players.appendChild(
        element
      );
    }
  );
}

/* =====================================================
   MEMBERS
===================================================== */

function renderMembers() {

  members.innerHTML = "";

  (
    state.serverMembers ||
    []
  ).forEach(member => {

    const element =
      document.createElement(
        "div"
      );

    element.className =
      "member";

    element.innerHTML = `
      <img
        src="${htmlEscape(
          member.avatar
        )}"
        draggable="false"
      >

      <div class="member-name">
        ${htmlEscape(
          member.name
        )}
      </div>
    `;

    element.onclick =
      () => assignPlayer(
        member
      );

    members.appendChild(
      element
    );
  });
}

/* =====================================================
   BENCH LIST
===================================================== */

function renderBench() {

  benchList.innerHTML = "";

  const bench =
    state.roster.filter(
      player =>
        player.bench &&
        player.userId
    );

  if (!bench.length) {

    benchList.innerHTML = `
      <div class="bench-empty">
        No players on the bench.
      </div>
    `;

    return;
  }

  bench.forEach(
    player => {

      const element =
        document.createElement(
          "div"
        );

      element.className =
        "bench-player";

      element.innerHTML = `
        <img
          src="${htmlEscape(
            player.avatar
          )}"
          draggable="false"
        >

        <div>

          <div class="bench-player-name">
            ${htmlEscape(
              player.name
            )}
          </div>

          <div style="
            font-size:9px;
            color:#9ca89f;
          ">
            ${htmlEscape(
              player.position
            )}
          </div>

        </div>
      `;

      /*
        CLICKING A BENCH PLAYER
        restores them to their exact
        old pitch slot.
      */

      element.onclick =
        () => removeFromBench(
          player.slot
        );

      benchList.appendChild(
        element
      );
    }
  );
}

/* =====================================================
   STATUS
===================================================== */

function updateStatus() {

  if (
    selected === null
  ) {

    statusBox.textContent =
      "No player selected.";

    return;
  }

  const player =
    state.roster[
      selected
    ];

  statusBox.innerHTML = `
    <b>Selected:</b>
    ${
      htmlEscape(
        player.userId
          ? player.name
          : "Empty slot"
      )
    }

    <br>

    <b>Position:</b>
    ${htmlEscape(
      player.position
    )}

    ${
      player.bench
        ? `
          <br>
          <b>Status:</b>
          On Bench
        `
        : ""
    }
  `;
}

/* =====================================================
   ASSIGN
===================================================== */

async function assignPlayer(
  member
) {

  if (
    selected === null
  ) {

    alert(
      "Click a pitch circle first."
    );

    return;
  }

  try {

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

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Could not assign player."
      );
    }

    /*
      Backend sets bench=false.

      This is what turns the grey
      circle back into the player's
      profile picture.
    */

    state.roster[
      selected
    ] = data.slot;

    render();

  } catch(error) {

    alert(
      error.message
    );
  }
}

/* =====================================================
   POSITION
===================================================== */

async function changePosition() {

  if (
    selected === null
  ) {

    alert(
      "Select a player first."
    );

    return;
  }

  const position =
    prompt(
      "Type the position:",
      state.roster[
        selected
      ].position
    );

  if (
    position === null ||
    !position.trim()
  ) {
    return;
  }

  try {

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
              position:
                position.trim()
            })
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error
      );
    }

    state.roster[
      selected
    ] = data.slot;

    render();

  } catch(error) {

    alert(
      error.message
    );
  }
}

/* =====================================================
   MOVE MODE
===================================================== */

function toggleMove() {

  if (
    selected === null
  ) {

    alert(
      "Select a player first."
    );

    return;
  }

  moveMode =
    !moveMode;

  if (moveMode) {

    benchMode = false;

    updateBenchButton();

    pitch.classList.add(
      "grid-on"
    );
  }

  updateMoveButton();
}

function updateMoveButton() {

  const button =
    document.getElementById(
      "moveButton"
    );

  button.classList.toggle(
    "active",
    moveMode
  );

  button.textContent =
    moveMode
      ? "✓ Move Mode ON"
      : "↔ Move Player";
}

/* =====================================================
   BENCH MODE
===================================================== */

function toggleBenchMode() {

  /*
    You can click:

      Bench Player

    FIRST.

    Then click whoever you want
    to send to the bench.
  */

  benchMode =
    !benchMode;

  if (benchMode) {

    moveMode = false;

    updateMoveButton();
  }

  updateBenchButton();
}

function updateBenchButton() {

  const button =
    document.getElementById(
      "benchButton"
    );

  button.classList.toggle(
    "bench-active",
    benchMode
  );

  button.textContent =
    benchMode
      ? "🪑 Bench Mode ON"
      : "🪑 Bench Player";
}

/* =====================================================
   SEND PLAYER TO BENCH
===================================================== */

async function sendToBench(
  index
) {

  try {

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

    if (!response.ok) {
      throw new Error(
        data.error
      );
    }

    /*
      KEEP THE PLAYER.

      Only change bench=true.

      The pitch renderer sees bench=true
      and draws a grey replacement circle
      at the SAME x/y.
    */

    state.roster[
      index
    ] = data.slot;

    selected = null;

    benchMode = false;

    updateBenchButton();

    render();

  } catch(error) {

    alert(
      error.message
    );
  }
}

/* =====================================================
   REMOVE PLAYER FROM BENCH
===================================================== */

async function removeFromBench(
  index
) {

  try {

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

    if (!response.ok) {
      throw new Error(
        data.error
      );
    }

    /*
      bench=false.

      The player immediately returns
      to their original x/y position.
    */

    state.roster[
      index
    ] = data.slot;

    selected = index;

    render();

  } catch(error) {

    alert(
      error.message
    );
  }
}

/* =====================================================
   SAVE MOVE
===================================================== */

async function saveMove(
  index
) {

  const player =
    state.roster[
      index
    ];

  try {

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

  } catch(error) {

    console.error(
      error
    );
  }
}

/* =====================================================
   SAVE ALL
===================================================== */

async function saveAll() {

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

        body:
          JSON.stringify({
            uid:CREATOR,
            roster:
              state.roster
          })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {

    throw new Error(
      data.error ||
      "Could not save lineup."
    );
  }

  return data;
}

/* =====================================================
   RESET
===================================================== */

async function resetLineup() {

  if (
    !confirm(
      "Reset the whole lineup?"
    )
  ) {
    return;
  }

  state.roster.forEach(
    (player,index) => {

      player.userId =
        null;

      player.name =
        "";

      player.avatar =
        "";

      player.bench =
        false;

      player.x =
        ORIGINAL[index].x;

      player.y =
        ORIGINAL[index].y;
    }
  );

  selected = null;

  moveMode = false;

  benchMode = false;

  updateMoveButton();

  updateBenchButton();

  try {

    await saveAll();

    render();

  } catch(error) {

    alert(
      error.message
    );
  }
}

/* =====================================================
   FINISH
===================================================== */

async function finishLineup() {

  if (
    !confirm(
      "Post this lineup to Discord?"
    )
  ) {
    return;
  }

  const button =
    document.getElementById(
      "doneButton"
    );

  button.disabled =
    true;

  button.textContent =
    "Posting...";

  try {

    /*
      Save everything first.
    */

    await saveAll();

    /*
      Create Discord image.
    */

    const response =
      await fetch(
        "/api/finish/" +
        encodeURIComponent(
          SESSION
        ),
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

    if (!response.ok) {

      throw new Error(
        data.error ||
        "Could not post lineup."
      );
    }

    button.textContent =
      "✓ Posted!";

  } catch(error) {

    button.disabled =
      false;

    button.textContent =
      "✓ Done";

    alert(
      error.message
    );
  }
}

/* =====================================================
   START
===================================================== */

load();

</script>

</body>

</html>
`;
}
