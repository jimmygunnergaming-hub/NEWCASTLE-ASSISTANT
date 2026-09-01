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

const makeId = () => crypto.randomBytes(18).toString("hex");

const esc = v =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const escSvg = v =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

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
  const roster = formations[size].map((p, i) => ({
    slot: i,
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

function baseUrl() {
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", chunk => {
      data += chunk;

      if (data.length > 1000000) {
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

function owner(body, session) {
  return String(body.uid || "") === String(session.creatorId);
}

/* =========================
   DISCORD
========================= */

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
    console.error("Failed to register /lineup:", error);
  }
});

client.on("interactionCreate", async interaction => {
  try {
    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "lineup"
    ) {
      const buttons = Array.from(
        { length: 11 },
        (_, i) =>
          new ButtonBuilder()
            .setCustomId(`lineup_size_${i + 1}`)
            .setLabel(`${i + 1}v${i + 1}`)
            .setStyle(
              i === 10
                ? ButtonStyle.Success
                : ButtonStyle.Secondary
            )
      );

      const rows = [];

      for (let i = 0; i < 11; i += 4) {
        rows.push(
          new ActionRowBuilder().addComponents(
            buttons.slice(i, i + 4)
          )
        );
      }

      return interaction.reply({
        content:
          "⚽ **CREATE LINEUP**\n\nChoose your lineup size:",
        components: rows,
        ephemeral: true
      });
    }

    if (
      interaction.isButton() &&
      interaction.customId.startsWith("lineup_size_")
    ) {
      const size = Number(
        interaction.customId.slice("lineup_size_".length)
      );

      if (!formations[size]) {
        return interaction.reply({
          content: "Invalid lineup size.",
          ephemeral: true
        });
      }

      const session = createSession(interaction, size);

      const button = new ButtonBuilder()
        .setLabel("⚽ OPEN LINEUP EDITOR")
        .setStyle(ButtonStyle.Link)
        .setURL(
          `${baseUrl()}/pitch/${session.id}?uid=${interaction.user.id}`
        );

      return interaction.update({
        content:
          `⚽ **${size}v${size} LINEUP CREATED**\n\n` +
          "Choose players, change positions, move players and use the bench.",
        components: [
          new ActionRowBuilder().addComponents(button)
        ]
      });
    }
  } catch (error) {
    console.error(error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Something went wrong.",
        ephemeral: true
      });
    }
  }
});

/* =========================
   GET MEMBERS
========================= */

async function getMembers(session) {
  const guild = client.guilds.cache.get(session.guildId);

  if (!guild) return [];

  try {
    const members = await guild.members.fetch();

    return members
      .filter(member => !member.user.bot)
      .map(member => ({
        id: member.user.id,
        name: member.displayName || member.user.username,
        username: member.user.username,
        avatar: member.user.displayAvatarURL({
          extension: "png",
          size: 256
        })
      }));
  } catch (error) {
    console.error("Member fetch error:", error);
    return [];
  }
}

/* =========================
   WEB SERVER
========================= */

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(
      req.url,
      `http://${req.headers.host || "localhost"}`
    );

    const pathname = url.pathname;

    if (pathname === "/") {
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
          display:grid;
          place-items:center;
          min-height:100vh;
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

    if (pathname === "/health") {
      return sendJson(res, 200, {
        online: true,
        discord: client.isReady()
      });
    }

    /* PITCH PAGE */

    if (pathname.startsWith("/pitch/")) {
      const id = pathname
        .slice("/pitch/".length)
        .split("/")[0];

      const session = sessions.get(id);

      if (!session) {
        return sendHtml(
          res,
          404,
          errorPage("Lineup not found or expired.")
        );
      }

      return sendHtml(res, 200, pitchPage(session));
    }

    /* GET SESSION */

    if (
      pathname.startsWith("/api/session/") &&
      req.method === "GET"
    ) {
      const id = pathname
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
        finished: session.finished,
        roster: session.roster,
        serverMembers: await getMembers(session)
      });
    }

    /* SAVE SESSION */

    if (
      pathname.startsWith("/api/session/") &&
      req.method === "POST"
    ) {
      const id = pathname
        .slice("/api/session/".length)
        .split("/")[0];

      const session = sessions.get(id);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found."
        });
      }

      const body = await readBody(req);

      if (!owner(body, session)) {
        return sendJson(res, 403, {
          error: "You cannot edit this lineup."
        });
      }

      if (Array.isArray(body.roster)) {
        body.roster.forEach((player, i) => {
          const target = session.roster[i];

          if (!target) return;

          if (Number.isFinite(Number(player.x))) {
            target.x = Math.max(
              4,
              Math.min(96, Number(player.x))
            );
          }

          if (Number.isFinite(Number(player.y))) {
            target.y = Math.max(
              4,
              Math.min(96, Number(player.y))
            );
          }

          if (typeof player.bench === "boolean") {
            target.bench = player.bench;
          }

          if (typeof player.position === "string") {
            target.position = player.position
              .trim()
              .slice(0, 20);
          }

          if (typeof player.userId === "string") {
            target.userId = player.userId;
          }

          if (typeof player.name === "string") {
            target.name = player.name.slice(0, 60);
          }

          if (typeof player.avatar === "string") {
            target.avatar = player.avatar;
          }
        });
      }

      return sendJson(res, 200, {
        success: true,
        roster: session.roster
      });
    }

    /* ASSIGN PLAYER */

    if (
      pathname === "/api/assign" &&
      req.method === "POST"
    ) {
      const body = await readBody(req);
      const session = sessions.get(body.session);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found."
        });
      }

      if (!owner(body, session)) {
        return sendJson(res, 403, {
          error: "You cannot edit this lineup."
        });
      }

      const slot = session.roster[Number(body.slot)];

      if (!slot) {
        return sendJson(res, 400, {
          error: "Invalid player slot."
        });
      }

      const guild = client.guilds.cache.get(session.guildId);

      if (!guild) {
        return sendJson(res, 500, {
          error: "Discord server unavailable."
        });
      }

      let member;

      try {
        member = await guild.members.fetch(body.userId);
      } catch {
        return sendJson(res, 404, {
          error: "Player not found."
        });
      }

      if (!member || member.user.bot) {
        return sendJson(res, 404, {
          error: "Player not found."
        });
      }

      slot.userId = member.user.id;
      slot.name =
        member.displayName || member.user.username;

      slot.avatar = member.user.displayAvatarURL({
        extension: "png",
        size: 256
      });

      /*
        IMPORTANT:
        Assigning someone to an empty grey slot
        automatically removes the bench state.
      */
      slot.bench = false;

      return sendJson(res, 200, {
        success: true,
        slot
      });
    }

    /* CHANGE POSITION */

    if (
      pathname === "/api/position" &&
      req.method === "POST"
    ) {
      const body = await readBody(req);
      const session = sessions.get(body.session);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found."
        });
      }

      if (!owner(body, session)) {
        return sendJson(res, 403, {
          error: "You cannot edit this lineup."
        });
      }

      const slot = session.roster[Number(body.slot)];
      const position = String(body.position || "")
        .trim()
        .slice(0, 20);

      if (!slot || !position) {
        return sendJson(res, 400, {
          error: "Invalid position."
        });
      }

      slot.position = position;

      return sendJson(res, 200, {
        success: true,
        slot
      });
    }

    /* MOVE PLAYER */

    if (
      pathname === "/api/move" &&
      req.method === "POST"
    ) {
      const body = await readBody(req);
      const session = sessions.get(body.session);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found."
        });
      }

      if (!owner(body, session)) {
        return sendJson(res, 403, {
          error: "You cannot edit this lineup."
        });
      }

      const slot = session.roster[Number(body.slot)];
      const x = Number(body.x);
      const y = Number(body.y);

      if (
        !slot ||
        !Number.isFinite(x) ||
        !Number.isFinite(y)
      ) {
        return sendJson(res, 400, {
          error: "Invalid coordinates."
        });
      }

      slot.x = Math.max(4, Math.min(96, x));
      slot.y = Math.max(4, Math.min(95, y));

      return sendJson(res, 200, {
        success: true,
        slot
      });
    }

    /* BENCH */

    if (
      pathname === "/api/bench" &&
      req.method === "POST"
    ) {
      const body = await readBody(req);
      const session = sessions.get(body.session);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found."
        });
      }

      if (!owner(body, session)) {
        return sendJson(res, 403, {
          error: "You cannot edit this lineup."
        });
      }

      const slot = session.roster[Number(body.slot)];

      if (!slot) {
        return sendJson(res, 400, {
          error: "Invalid player."
        });
      }

      slot.bench = Boolean(body.bench);

      return sendJson(res, 200, {
        success: true,
        slot
      });
    }

    /* FINISH */

    if (
      pathname.startsWith("/api/finish/") &&
      req.method === "POST"
    ) {
      const id = pathname
        .slice("/api/finish/".length)
        .split("/")[0];

      const session = sessions.get(id);

      if (!session) {
        return sendJson(res, 404, {
          error: "Session not found."
        });
      }

      const body = await readBody(req);

      if (!owner(body, session)) {
        return sendJson(res, 403, {
          error: "You cannot finish this lineup."
        });
      }

      session.finished = true;

      const image = await createPitchImage(session);

      const attachment = new AttachmentBuilder(image, {
        name: "newcastle-lineup.png"
      });

      const playing = session.roster.filter(
        p => p.userId && !p.bench
      );

      const bench = session.roster.filter(
        p => p.userId && p.bench
      );

      let text = "**NEWCASTLE LINEUP TODAY ENJOY**\n\n";

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

      const channel = await client.channels.fetch(
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
      error:
        error.message ||
        "Internal server error."
    });
  }
});

server.listen(
  PORT,
  "0.0.0.0",
  () => console.log(`Web server listening on ${PORT}`)
);

client.login(TOKEN);

/* =========================
   ERROR PAGE
========================= */

function errorPage(message) {
  return `
  <!doctype html>
  <html>
  <head>
    <meta name="viewport"
      content="width=device-width,initial-scale=1">
    <style>
      body {
        margin:0;
        background:#07130c;
        color:white;
        font-family:Arial;
        display:grid;
        place-items:center;
        min-height:100vh;
      }

      .box {
        padding:30px;
        background:#101b14;
        border-radius:16px;
      }
    </style>
  </head>

  <body>
    <div class="box">
      <h1>⚽ Newcastle Assistant</h1>
      <p>${esc(message)}</p>
    </div>
  </body>
  </html>
  `;
}

/* =========================
   AVATAR FOR FINAL IMAGE
========================= */

async function fetchAvatarData(url) {
  if (!url) return null;

  try {
    const response = await fetch(url);

    if (!response.ok) return null;

    const buffer = Buffer.from(
      await response.arrayBuffer()
    );

    const png = await sharp(buffer)
      .png()
      .toBuffer();

    return (
      "data:image/png;base64," +
      png.toString("base64")
    );
  } catch (error) {
    console.error(
      "Avatar image fetch failed:",
      error.message
    );

    return null;
  }
}

/* =========================
   FINAL PNG
========================= */

async function createPitchImage(session) {
  const W = 1200;
  const H = 900;
  const pitchHeight = 740;

  const playing = session.roster.filter(
    p => p.userId && !p.bench
  );

  const bench = session.roster.filter(
    p => p.userId && p.bench
  );

  const avatarMap = new Map();

  await Promise.all(
    playing.map(async player => {
      if (!player.avatar) return;

      const data = await fetchAvatarData(
        player.avatar
      );

      avatarMap.set(player.slot, data);
    })
  );

  const playerSvg = playing
    .map(player => {
      const x = (player.x / 100) * W;
      const y =
        (player.y / 100) * pitchHeight;

      const avatar = avatarMap.get(
        player.slot
      );

      const clipId =
        "avatarClip" + player.slot;

      const avatarPart = avatar
        ? `
          <defs>
            <clipPath id="${clipId}">
              <circle
                cx="${x}"
                cy="${y}"
                r="34"
              />
            </clipPath>
          </defs>

          <image
            href="${avatar}"
            x="${x - 34}"
            y="${y - 34}"
            width="68"
            height="68"
            preserveAspectRatio="xMidYMid slice"
            clip-path="url(#${clipId})"
          />

          <circle
            cx="${x}"
            cy="${y}"
            r="34"
            fill="none"
            stroke="white"
            stroke-width="4"
          />
        `
        : `
          <circle
            cx="${x}"
            cy="${y}"
            r="34"
            fill="#777f7a"
            stroke="white"
            stroke-width="4"
          />

          <text
            x="${x}"
            y="${y + 8}"
            text-anchor="middle"
            fill="white"
            font-family="Arial"
            font-size="23"
            font-weight="bold"
          >
            ${escSvg(
              player.name
                ? player.name[0].toUpperCase()
                : "?"
            )}
          </text>
        `;

      return `
        <g>
          ${avatarPart}

          <rect
            x="${x - 70}"
            y="${y + 39}"
            width="140"
            height="28"
            rx="7"
            fill="#07130c"
            opacity=".95"
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
            ${escSvg(player.name || "Player")}
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
            ${escSvg(player.position)}
          </text>
        </g>
      `;
    })
    .join("");

  const benchAvatarMap = new Map();

  await Promise.all(
    bench.map(async player => {
      if (!player.avatar) return;

      const data = await fetchAvatarData(
        player.avatar
      );

      benchAvatarMap.set(player.slot, data);
    })
  );

  const benchSvg = bench
    .map((player, i) => {
      const x = 90 + i * 180;
      const avatar = benchAvatarMap.get(
        player.slot
      );

      const clipId =
        "benchClip" + player.slot;

      return `
        <g>
          ${
            avatar
              ? `
                <defs>
                  <clipPath id="${clipId}">
                    <circle
                      cx="${x}"
                      cy="830"
                      r="25"
                    />
                  </clipPath>
                </defs>

                <image
                  href="${avatar}"
                  x="${x - 25}"
                  y="805"
                  width="50"
                  height="50"
                  preserveAspectRatio="xMidYMid slice"
                  clip-path="url(#${clipId})"
                />

                <circle
                  cx="${x}"
                  cy="830"
                  r="25"
                  fill="none"
                  stroke="white"
                  stroke-width="3"
                />
              `
              : `
                <circle
                  cx="${x}"
                  cy="830"
                  r="25"
                  fill="#777f7a"
                  stroke="white"
                  stroke-width="3"
                />

                <text
                  x="${x}"
                  y="836"
                  text-anchor="middle"
                  fill="white"
                  font-family="Arial"
                  font-size="17"
                  font-weight="bold"
                >
                  ${escSvg(
                    player.name
                      ? player.name[0].toUpperCase()
                      : "?"
                  )}
                </text>
              `
          }

          <text
            x="${x}"
            y="870"
            text-anchor="middle"
            fill="white"
            font-family="Arial"
            font-size="13"
            font-weight="bold"
          >
            ${escSvg(player.name || "Player")}
          </text>

          <text
            x="${x}"
            y="888"
            text-anchor="middle"
            fill="#d9e0db"
            font-family="Arial"
            font-size="11"
          >
            ${escSvg(player.position)}
          </text>
        </g>
      `;
    })
    .join("");

  /*
    The important bit:
    EMPTY/BENCHED SLOTS ARE ALSO DRAWN HERE.

    They remain at their original pitch position
    as grey circles so another player can be assigned.
  */

  const emptySlotsSvg = session.roster
    .filter(player => player.bench && !player.userId)
    .map(player => {
      const x = (player.x / 100) * W;
      const y =
        (player.y / 100) * pitchHeight;

      return `
        <g>
          <circle
            cx="${x}"
            cy="${y}"
            r="34"
            fill="#777f7a"
            stroke="#d7ddd9"
            stroke-width="4"
          />

          <text
            x="${x}"
            y="${y + 8}"
            text-anchor="middle"
            fill="white"
            font-family="Arial"
            font-size="22"
            font-weight="bold"
          >
            +
          </text>

          <rect
            x="${x - 55}"
            y="${y + 39}"
            width="110"
            height="26"
            rx="6"
            fill="#07130c"
          />

          <text
            x="${x}"
            y="${y + 57}"
            text-anchor="middle"
            fill="white"
            font-family="Arial"
            font-size="12"
            font-weight="bold"
          >
            Empty Slot
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
      width="${W}"
      height="${H}"
      rx="20"
      fill="url(#grass)"
    />

    <!-- PITCH -->

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

    <!-- EMPTY GREY SLOTS FIRST -->

    ${emptySlotsSvg}

    <!-- PLAYERS ON TOP -->

    ${playerSvg}

    <!-- BENCH -->

    <rect
      x="18"
      y="770"
      width="1164"
      height="112"
      rx="12"
      fill="#07130c"
      opacity=".95"
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
   LINEUP EDITOR
========================= */

function pitchPage(session) {
  const original = JSON.stringify(
    session.roster.map(player => ({
      x: player.x,
      y: player.y
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
  background:#07130c;
  color:white;
  font-family:Arial,Helvetica,sans-serif;
}

body {
  min-height:100vh;
}

.topbar {
  min-height:68px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding:10px 18px;
  background:#08110c;
  border-bottom:1px solid #ffffff20;
  position:sticky;
  top:0;
  z-index:1000;
}

.title {
  font-size:21px;
  font-weight:900;
}

.subtitle {
  font-size:12px;
  color:#8d9a91;
  margin-top:3px;
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

.top-button {
  padding:12px 16px;
  border-radius:9px;
  background:#252d28;
  color:white;
  font-weight:800;
}

.finish {
  background:#15803d;
}

.top-button:disabled {
  opacity:.6;
}

.main {
  display:flex;
  justify-content:center;
  gap:18px;
  padding:18px;
}

.pitch-area {
  width:min(1000px,calc(100vw - 310px));
}

.pitch-wrap {
  width:100%;
  aspect-ratio:1200/900;
}

.pitch {
  width:100%;
  height:100%;
  position:relative;
  overflow:hidden;
  border-radius:14px;
  border:3px solid white;
  background:
    repeating-linear-gradient(
      to bottom,
      #247b42 0,
      #247b42 70px,
      #1f713c 70px,
      #1f713c 140px
    );
  box-shadow:0 20px 60px #0008;
  z-index:1;
}

.halfway {
  position:absolute;
  left:0;
  right:0;
  top:50%;
  border-top:3px solid #ffffffdc;
  z-index:2;
}

.center-circle {
  position:absolute;
  left:50%;
  top:50%;
  width:150px;
  height:150px;
  transform:translate(-50%,-50%);
  border:3px solid white;
  border-radius:50%;
  z-index:2;
}

.center-dot {
  position:absolute;
  left:50%;
  top:50%;
  width:8px;
  height:8px;
  transform:translate(-50%,-50%);
  background:white;
  border-radius:50%;
  z-index:2;
}

.box {
  position:absolute;
  left:50%;
  transform:translateX(-50%);
  width:36%;
  height:18%;
  border-left:3px solid white;
  border-right:3px solid white;
  z-index:2;
}

.box.top {
  top:0;
  border-bottom:3px solid white;
}

.box.bottom {
  bottom:0;
  border-top:3px solid white;
}

.six {
  position:absolute;
  left:50%;
  transform:translateX(-50%);
  width:17%;
  height:8%;
  border-left:3px solid white;
  border-right:3px solid white;
  z-index:2;
}

.six.top {
  top:0;
  border-bottom:3px solid white;
}

.six.bottom {
  bottom:0;
  border-top:3px solid white;
}

/* GRID */

.pitch.grid-on::after {
  content:"";
  position:absolute;
  inset:0;

  background-image:
    linear-gradient(
      #ffffff19 1px,
      transparent 1px
    ),
    linear-gradient(
      90deg,
      #ffffff19 1px,
      transparent 1px
    );

  background-size:5% 5%;

  pointer-events:none;

  z-index:3;
}

/* PLAYER LAYER */

#players {
  position:absolute;
  inset:0;
  z-index:20;
  pointer-events:none;
}

.player {
  position:absolute;

  width:88px;
  min-height:90px;

  transform:translate(-50%,-50%);

  text-align:center;

  z-index:30 !important;

  touch-action:none;
  user-select:none;

  cursor:pointer;

  pointer-events:auto;
}

.player.dragging {
  cursor:grabbing;
  z-index:100 !important;
}

.avatar {
  width:54px;
  height:54px;

  margin:auto;

  border-radius:50%;

  border:3px solid white;

  background:#777f7a;

  display:flex;
  align-items:center;
  justify-content:center;

  overflow:hidden;

  font-size:20px;
  font-weight:900;

  box-shadow:0 5px 15px #0006;

  position:relative;

  z-index:40;
}

.avatar img {
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;
}

.name {
  margin-top:3px;

  padding:3px 6px;

  background:#000c;

  border-radius:5px;

  font-size:10px;
  font-weight:900;

  white-space:nowrap;

  max-width:125px;

  overflow:hidden;
  text-overflow:ellipsis;

  position:relative;
  z-index:41;
}

.position {
  margin-top:2px;

  font-size:9px;
  font-weight:900;

  position:relative;
  z-index:41;
}

/* GREY EMPTY SLOT */

.empty-slot {
  z-index:50 !important;
}

.empty-slot .avatar {
  background:#777f7a !important;

  border:4px solid #bfc5c1 !important;

  box-shadow:
    0 0 0 2px #4c554f,
    0 5px 15px #0008;

  color:white;
}

.empty-slot .name {
  background:#07130c;
  color:white;
}

.empty-slot .position {
  color:#e5e9e6;
}

/* SELECTED */

.selected .avatar {
  border:4px solid #facc15 !important;

  box-shadow:
    0 0 0 3px #0008,
    0 0 15px #facc15;
}

/* PANEL */

.panel {
  width:255px;

  padding:15px;

  border-radius:13px;

  background:#0d1811;

  border:1px solid #ffffff1f;

  height:max-content;
}

.panel h2 {
  margin:0 0 8px;
  font-size:16px;
}

.info {
  color:#94a198;

  font-size:11px;

  line-height:1.5;

  margin-bottom:10px;
}

.control {
  width:100%;

  padding:12px;

  margin-bottom:7px;

  border-radius:8px;

  background:#202a24;

  color:white;

  font-weight:800;
}

.control.active {
  background:#15803d;
}

.control.bench-active {
  background:#a16207;
}

.status {
  margin-top:10px;

  padding:9px;

  background:#18231c;

  border-radius:7px;

  font-size:11px;
}

.members {
  margin-top:10px;

  display:flex;

  flex-direction:column;

  gap:6px;
}

.member {
  display:flex;

  align-items:center;

  gap:8px;

  padding:8px;

  border-radius:7px;

  background:#17221b;

  cursor:pointer;
}

.member:hover {
  background:#243329;
}

.member img {
  width:34px;
  height:34px;

  border-radius:50%;

  object-fit:cover;
}

.member-name {
  font-size:11px;

  font-weight:800;

  overflow:hidden;

  text-overflow:ellipsis;

  white-space:nowrap;
}

/* BENCH */

.bench-box {
  margin-top:15px;

  padding:12px;

  border-radius:12px;

  background:#0d1811;

  border:1px solid #ffffff1f;
}

.bench-title {
  font-size:15px;
  font-weight:900;
  margin-bottom:8px;
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

  background:#17221b;

  border-radius:8px;

  cursor:pointer;
}

.bench-player:hover {
  background:#243329;
}

.bench-player img {
  width:34px;
  height:34px;

  border-radius:50%;

  object-fit:cover;
}

.bench-player-name {
  font-size:11px;
  font-weight:900;
}

.bench-empty {
  font-size:11px;
  color:#87948b;
}

/* MOBILE */

@media(max-width:850px) {

  .topbar {
    padding:9px;
    min-height:64px;
  }

  .title {
    font-size:16px;
  }

  .subtitle {
    display:none;
  }

  .top-button {
    padding:11px 12px;
    font-size:11px;
  }

  .main {
    display:block;
    padding:9px;
  }

  .pitch-area {
    width:100%;
  }

  .panel {
    width:100%;
    margin-top:10px;
  }

  .control {
    padding:14px;
    font-size:13px;
  }

  .members {
    max-height:300px;
    overflow:auto;
  }

  .player {
    width:75px;
  }

  .avatar {
    width:48px;
    height:48px;
  }

  .name {
    font-size:9px;
    max-width:105px;
  }

  .position {
    font-size:8px;
  }

  .bench-list {
    max-height:180px;
    overflow:auto;
  }
}

@media(max-width:450px) {

  .title {
    font-size:14px;
  }

  .top-button {
    padding:10px 9px;
    font-size:10px;
  }

  .player {
    width:65px;
  }

  .avatar {
    width:44px;
    height:44px;
  }

  .name {
    font-size:8px;
    max-width:90px;
  }

  .position {
    font-size:7px;
  }

  .center-circle {
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
      ${session.size}v${session.size}
      • Select players, move them and use the bench
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

        <!-- PLAYER CIRCLES ARE ALWAYS HERE -->

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
      Choose a server player.
      Use Move Player to drag.
      Players snap to the grid.
      Click Bench Player, then click a player
      to send them to the bench.
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

const SESSION = "${esc(session.id)}";
const CREATOR = "${esc(session.creatorId)}";
const ORIGINAL = ${original};

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

const eh = value =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

/* =========================
   LOAD
========================= */

async function load() {

  try {

    const response = await fetch(
      "/api/session/" +
      encodeURIComponent(SESSION)
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
          ❌ Lineup could not be loaded
        </h2>

        <p>
          ${eh(error.message)}
        </p>
      </div>
    `;
  }
}

/* =========================
   RENDER EVERYTHING
========================= */

function render() {

  renderPlayers();

  renderMembers();

  renderBench();

  updateStatus();
}

/* =========================
   PLAYER CIRCLES
========================= */

function renderPlayers() {

  players.innerHTML = "";

  /*
    IMPORTANT:
    NEVER remove a roster slot.

    Even if the player is on the bench,
    we still draw a grey empty circle
    at that exact pitch position.
  */

  state.roster.forEach((player, index) => {

    const element =
      document.createElement("div");

    element.className =
      "player" +
      (selected === index
        ? " selected"
        : "");

    element.style.left =
      player.x + "%";

    element.style.top =
      player.y + "%";

    /*
      BENCH PLAYER:

      Keep the pitch slot visible
      as a grey circle.
    */

    if (player.bench) {

      element.classList.add(
        "empty-slot"
      );

      element.innerHTML = `
        <div class="avatar">
          +
        </div>

        <div class="name">
          Empty Slot
        </div>

        <div class="position">
          ${eh(player.position)}
        </div>
      `;

    } else {

      const avatar =
        player.userId && player.avatar

          ? `
            <div class="avatar">
              <img
                src="${eh(player.avatar)}"
                draggable="false"
              >
            </div>
          `

          : `
            <div class="avatar">
              ?
            </div>
          `;

      element.innerHTML = `
        ${avatar}

        <div class="name">
          ${
            eh(
              player.userId
                ? player.name
                : "Select Player"
            )
          }
        </div>

        <div class="position">
          ${eh(player.position)}
        </div>
      `;
    }

    /*
      CLICK PLAYER
    */

    element.onclick = event => {

      event.stopPropagation();

      /*
        BENCH MODE:
        clicking a filled player
        sends them to bench.
      */

      if (
        benchMode &&
        !player.bench &&
        player.userId
      ) {

        sendToBench(index);

        return;
      }

      selected = index;

      renderPlayers();

      updateStatus();

      showMembers();
    };

    /*
      DOUBLE CLICK = STOP MOVING
    */

    element.addEventListener(
      "dblclick",
      event => {

        event.stopPropagation();

        moving = false;

        updateMoveButton();
      }
    );

    /*
      DRAG START
    */

    element.addEventListener(
      "pointerdown",
      event => {

        if (
          !moving ||
          player.bench
        ) {
          return;
        }

        event.preventDefault();

        selected = index;

        dragging = {
          element,
          index,
          pointerId:
            event.pointerId
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

    /*
      DRAGGING
    */

    element.addEventListener(
      "pointermove",
      event => {

        if (
          !dragging ||
          dragging.element !== element
        ) {
          return;
        }

        event.preventDefault();

        const rect =
          pitch.getBoundingClientRect();

        let x =
          ((event.clientX - rect.left) /
            rect.width) *
          100;

        let y =
          ((event.clientY - rect.top) /
            rect.height) *
          100;

        /*
          GRID SNAP
          Every 5%.
        */

        x =
          Math.round(x / 5) * 5;

        y =
          Math.round(y / 5) * 5;

        x =
          Math.max(
            4,
            Math.min(96, x)
          );

        y =
          Math.max(
            5,
            Math.min(95, y)
          );

        element.style.left =
          x + "%";

        element.style.top =
          y + "%";

        state.roster[index].x = x;
        state.roster[index].y = y;
      }
    );

    /*
      DRAG END
    */

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

        const indexToSave =
          dragging.index;

        dragging = null;

        await saveMove(
          indexToSave
        );
      }
    );

    /*
      ADD EVERY SLOT.
      INCLUDING GREY BENCH REPLACEMENT.
    */

    players.appendChild(element);
  });
}

/* =========================
   SERVER MEMBERS
========================= */

function renderMembers() {

  members.innerHTML = "";

  (state.serverMembers || [])
    .forEach(member => {

      const element =
        document.createElement("div");

      element.className =
        "member";

      element.innerHTML = `
        <img
          src="${eh(member.avatar)}"
          draggable="false"
        >

        <div class="member-name">
          ${eh(member.name)}
        </div>
      `;

      element.onclick = () =>
        assignPlayer(member);

      members.appendChild(element);
    });
}

/* =========================
   BENCH
========================= */

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

  bench.forEach(player => {

    const element =
      document.createElement("div");

    element.className =
      "bench-player";

    element.innerHTML = `
      <img
        src="${eh(player.avatar)}"
        draggable="false"
      >

      <div>
        <div class="bench-player-name">
          ${eh(player.name)}
        </div>

        <div style="
          font-size:9px;
          color:#9ca89f;
        ">
          ${eh(player.position)}
        </div>
      </div>
    `;

    /*
      Clicking a bench player
      restores them to their original slot.
    */

    element.onclick = () =>
      removeFromBench(player.slot);

    benchList.appendChild(element);
  });
}

/* =========================
   MEMBERS
========================= */

function showMembers() {

  members.scrollIntoView({
    behavior:"smooth",
    block:"nearest"
  });
}

/* =========================
   STATUS
========================= */

function updateStatus() {

  if (selected === null) {

    statusBox.textContent =
      "No player selected.";

    return;
  }

  const player =
    state.roster[selected];

  statusBox.innerHTML = `
    <b>Selected:</b>
    ${
      eh(
        player.userId
          ? player.name
          : "Empty slot"
      )
    }

    <br>

    <b>Position:</b>
    ${eh(player.position)}

    ${
      player.bench
        ? "<br><b>Status:</b> On Bench"
        : ""
    }
  `;
}

/* =========================
   ASSIGN
========================= */

async function assignPlayer(member) {

  if (selected === null) {

    alert(
      "Click a grey circle first."
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

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Could not assign player."
      );
    }

    /*
      This automatically changes
      bench=true to bench=false
      on the backend.
    */

    state.roster[selected] =
      data.slot;

    render();

  } catch(error) {

    alert(error.message);
  }
}

/* =========================
   CHANGE POSITION
========================= */

async function changePosition() {

  if (selected === null) {

    alert(
      "Select a player first."
    );

    return;
  }

  const position =
    prompt(
      "Type the position:",
      state.roster[selected].position
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

          body:JSON.stringify({
            session:SESSION,
            uid:CREATOR,
            slot:selected,
            position:position.trim()
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

    state.roster[selected] =
      data.slot;

    render();

  } catch(error) {

    alert(error.message);
  }
}

/* =========================
   MOVE
========================= */

function toggleMove() {

  if (selected === null) {

    alert(
      "Select a player first."
    );

    return;
  }

  moving = !moving;

  if (moving) {

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
    moving
  );

  button.textContent =
    moving
      ? "✓ Moving — Grid Snap ON"
      : "↔ Move Player";
}

/* =========================
   BENCH MODE
========================= */

function toggleBenchMode() {

  /*
    You no longer have to select
    someone first.

    Click Bench Player,
    then click the player
    you want on the bench.
  */

  benchMode = !benchMode;

  if (benchMode) {

    moving = false;

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
      ? "🪑 Bench Mode — click player"
      : "🪑 Bench Player";
}

/* =========================
   SEND TO BENCH
========================= */

async function sendToBench(index) {

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

          body:JSON.stringify({
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
      KEEP THE PLAYER DATA.

      Only mark the slot as bench.

      This means the pitch immediately
      gets a grey replacement circle,
      while the actual player appears
      in the bench box.
    */

    state.roster[index] =
      data.slot;

    selected = null;

    benchMode = false;

    updateBenchButton();

    render();

  } catch(error) {

    alert(error.message);
  }
}

/* =========================
   REMOVE FROM BENCH
========================= */

async function removeFromBench(index) {

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

          body:JSON.stringify({
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
      Same player data remains.
      bench=false makes them appear
      back in their exact old position.
    */

    state.roster[index] =
      data.slot;

    selected = index;

    render();

  } catch(error) {

    alert(error.message);
  }
}

/* =========================
   SAVE MOVE
========================= */

async function saveMove(index) {

  const player =
    state.roster[index];

  try {

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

  } catch(error) {

    console.error(error);
  }
}

/* =========================
   SAVE EVERYTHING
========================= */

async function saveAll() {

  try {

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

    if (!response.ok) {

      const data =
        await response.json();

      throw new Error(
        data.error ||
        "Save failed."
      );
    }

  } catch(error) {

    console.error(error);

    alert(
      "Could not save lineup: " +
      error.message
    );

    throw error;
  }
}

/* =========================
   RESET
========================= */

async function resetLineup() {

  if (
    !confirm(
      "Reset all players?"
    )
  ) {
    return;
  }

  state.roster.forEach(
    (player, index) => {

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

  benchMode = false;
  moving = false;

  updateBenchButton();
  updateMoveButton();

  await saveAll();

  render();
}

/* =========================
   FINISH
========================= */

async function finishLineup() {

  if (
    !confirm(
      "Finish this lineup and post it to the Discord channel?"
    )
  ) {
    return;
  }

  const button =
    document.querySelector(
      ".finish"
    );

  button.disabled = true;

  button.textContent =
    "Posting...";

  try {

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

    if (!response.ok) {

      throw new Error(
        data.error ||
        "Could not finish lineup."
      );
    }

    button.textContent =
      "✓ Posted!";

  } catch(error) {

    button.disabled = false;

    button.textContent =
      "✓ Done";

    alert(error.message);
  }
}

/* START */

load();

</script>

</body>

</html>
`;
}
