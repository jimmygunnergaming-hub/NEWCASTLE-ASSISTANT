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
    avatar: ""
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
       SIZE BUTTON
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
          "Choose players, change positions and drag them around the pitch.\n" +
          "You can also add players to the bench.",
        components: [
          new ActionRowBuilder().addComponents(button)
        ]
      });

      return;
    }

  } catch (error) {
    console.error("❌ Interaction error:", error);

    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "❌ Something went wrong.",
          ephemeral: true
        });
      } catch {}
    }
  }
});

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

    if (
      requestUrl.pathname.startsWith("/pitch/")
    ) {

      const sessionId =
        requestUrl.pathname.split("/")[2];

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

    /* GET SESSION */

    if (
      requestUrl.pathname.startsWith("/api/session/") &&
      req.method === "GET"
    ) {

      const sessionId =
        requestUrl.pathname.split("/")[3];

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
        bench: session.bench || [],
        serverMembers
      });
    }

    /* SAVE SESSION */

    if (
      requestUrl.pathname.startsWith("/api/session/") &&
      req.method === "POST"
    ) {

      const sessionId =
        requestUrl.pathname.split("/")[3];

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

            if (!session.roster[index])
              return;

            if (
              Number.isFinite(
                Number(player.x)
              )
            ) {
              session.roster[index].x =
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
              session.roster[index].y =
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
              session.roster[index].position =
                player.position
                  .trim()
                  .slice(0, 20);
            }

          }
        );
      }

      if (Array.isArray(body.bench)) {
        session.bench =
          body.bench.slice(0, 15);
      }

      return sendJson(res, 200, {
        success: true,
        roster: session.roster,
        bench: session.bench
      });
    }

    /* ASSIGN PLAYER */

    if (
      requestUrl.pathname === "/api/assign" &&
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

      if (
        body.uid !== session.creatorId
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
          error:
            "Invalid player slot."
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
        ).catch(() => null);

      if (
        !member ||
        member.user.bot
      ) {
        return sendJson(res, 404, {
          error:
            "Player not found."
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

      session.bench =
        (session.bench || [])
          .filter(
            p =>
              p.userId !==
              member.user.id
          );

      return sendJson(res, 200, {
        success: true,
        slot,
        bench: session.bench
      });
    }

    /* ADD BENCH */

    if (
      requestUrl.pathname === "/api/bench" &&
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

      if (
        body.uid !== session.creatorId
      ) {
        return sendJson(res, 403, {
          error:
            "You cannot edit this lineup."
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
        ).catch(() => null);

      if (
        !member ||
        member.user.bot
      ) {
        return sendJson(res, 404, {
          error:
            "Player not found."
        });
      }

      session.bench =
        session.bench || [];

      if (
        !session.bench.some(
          p =>
            p.userId ===
            member.user.id
        )
      ) {

        session.bench.push({
          userId:
            member.user.id,

          name:
            member.displayName,

          avatar:
            member.user.displayAvatarURL({
              extension: "png",
              size: 256
            })
        });

      }

      return sendJson(res, 200, {
        success: true,
        bench:
          session.bench
      });
    }

    /* POSITION */

    if (
      requestUrl.pathname === "/api/position" &&
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

      if (
        body.uid !== session.creatorId
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
          error:
            "Invalid slot."
        });
      }

      const position =
        String(
          body.position || ""
        )
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

    /* MOVE */

    if (
      requestUrl.pathname === "/api/move" &&
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

      if (
        body.uid !== session.creatorId
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
          error:
            "Invalid slot."
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
       FINISH + POST TO DISCORD
    ========================= */

    if (
      requestUrl.pathname.startsWith("/api/finish/") &&
      req.method === "POST"
    ) {

      const sessionId =
        requestUrl.pathname.split("/")[3];

      const session =
        sessions.get(sessionId);

      if (!session) {
        return sendJson(res, 404, {
          error:
            "Session not found."
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
            "You cannot finish this lineup."
        });
      }

      if (session.finished) {
        return sendJson(res, 409, {
          error:
            "This lineup has already been posted."
        });
      }

      session.finished = true;

      const image =
        await createPitchImage(
          session
        );

      const attachment =
        new AttachmentBuilder(
          image,
          {
            name:
              "newcastle-lineup.png"
          }
        );

      const filled =
        session.roster.filter(
          p => p.userId
        );

      const bench =
        session.bench || [];

      const positionsText =
        filled.length
          ? filled
              .map(
                p =>
                  `**${p.position}** — ${p.name}`
              )
              .join("\n")
          : "No players assigned.";

      const benchText =
        bench.length
          ? `\n\n**BENCH**\n${bench
              .map(
                p =>
                  `• ${p.name}`
              )
              .join("\n")}`
          : "";

      const channel =
        await client.channels.fetch(
          session.channelId
        );

      if (
        !channel ||
        !channel.isTextBased()
      ) {
        throw new Error(
          "Could not access the lineup channel."
        );
      }

      await channel.send({
        content:
          `**NEWCASTLE LINEUP TODAY ENJOY**\n\n` +
          `${positionsText}` +
          `${benchText}`,

        files: [
          attachment
        ]
      });

      return sendJson(res, 200, {
        success: true
      });
    }

    return sendHtml(
      res,
      404,
      errorPage(
        "Page not found."
      )
    );

  } catch (error) {

    console.error(
      "❌ HTTP error:",
      error
    );

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
   HELPERS
========================= */

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

function errorPage(
  message
) {

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
font-family:Arial;
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

<p>
${escapeHtml(message)}
</p>

</div>

</body>
</html>
`;
}

/* =========================
   GET DISCORD AVATAR
========================= */

async function fetchImageData(
  url
) {

  if (!url)
    return null;

  try {

    const response =
      await fetch(url);

    if (!response.ok)
      return null;

    const buffer =
      Buffer.from(
        await response.arrayBuffer()
      );

    const type =
      response.headers.get(
        "content-type"
      ) || "image/png";

    return (
      `data:${type};base64,` +
      buffer.toString("base64")
    );

  } catch {

    return null;

  }
}

/* =========================
   CREATE FINAL IMAGE
========================= */

async function createPitchImage(
  session
) {

  const width = 1200;
  const pitchHeight = 760;
  const benchHeight = 180;
  const height =
    pitchHeight +
    benchHeight;

  const players =
    await Promise.all(
      session.roster
        .filter(p => p.userId)
        .map(
          async p => ({
            ...p,
            image:
              await fetchImageData(
                p.avatar
              )
          })
        )
    );

  const bench =
    await Promise.all(
      (session.bench || [])
        .map(
          async p => ({
            ...p,
            image:
              await fetchImageData(
                p.avatar
              )
          })
        )
    );

  const playerSvg =
    players
      .map(p => {

        const x =
          (p.x / 100) *
          width;

        const y =
          (p.y / 100) *
          pitchHeight;

        const avatar =
          p.image

            ? `
<clipPath id="clip${p.slot}">
<circle
cx="${x}"
cy="${y}"
r="30"
/>
</clipPath>

<image
href="${p.image}"
x="${x - 30}"
y="${y - 30}"
width="60"
height="60"
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
font-size="25"
font-weight="bold"
>?</text>
`;

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

${avatar}

<rect
x="${x - 72}"
y="${y + 40}"
width="144"
height="29"
rx="7"
fill="#06110a"
opacity=".92"
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
y="${y + 84}"
text-anchor="middle"
fill="white"
font-family="Arial"
font-size="13"
font-weight="bold"
>
${escapeSvg(
  p.position
)}
</text>

</g>
`;

      })
      .join("");

  const benchSvg =
    bench
      .slice(0, 8)
      .map(
        (p, i) => {

          const x =
            120 +
            i * 135;

          const y =
            pitchHeight +
            92;

          const avatar =
            p.image

              ? `
<clipPath id="bclip${i}">
<circle
cx="${x}"
cy="${y}"
r="28"
/>
</clipPath>

<image
href="${p.image}"
x="${x - 28}"
y="${y - 28}"
width="56"
height="56"
preserveAspectRatio="xMidYMid slice"
clip-path="url(#bclip${i})"
/>
`

              : `
<text
x="${x}"
y="${y + 7}"
text-anchor="middle"
fill="white"
font-size="22"
font-weight="bold"
>?</text>
`;

          return `
<g>

<circle
cx="${x}"
cy="${y}"
r="31"
fill="#202a24"
stroke="white"
stroke-width="3"
/>

${avatar}

<text
x="${x}"
y="${y + 52}"
text-anchor="middle"
fill="white"
font-family="Arial"
font-size="13"
font-weight="bold"
>
${escapeSvg(p.name)}
</text>

</g>
`;

        }
      )
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

<!-- PITCH -->

<rect
x="0"
y="0"
width="1200"
height="760"
rx="18"
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

${playerSvg}

<!-- BENCH -->

<g>

<rect
x="0"
y="760"
width="1200"
height="180"
rx="18"
fill="#07130c"
/>

<text
x="45"
y="805"
fill="white"
font-family="Arial"
font-size="25"
font-weight="900"
>
BENCH
</text>

${benchSvg}

</g>

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

function pitchPage(
  session
) {

  const original =
    session.roster.map(
      p => ({
        x: p.x,
        y: p.y
      })
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

<title>
Football Lineup
</title>

<style>

*{
box-sizing:border-box;
}

html,
body{

margin:0;
width:100%;
min-height:100%;

font-family:
Arial,
Helvetica,
sans-serif;

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

border-bottom:
1px solid
rgba(255,255,255,.12);

position:sticky;
top:0;

z-index:50;

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

}

.top-button{

padding:
11px 15px;

border-radius:8px;

color:white;

background:#252d28;

font-weight:800;

touch-action:manipulation;

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

.pitch-wrap{

width:
min(
1000px,
calc(100vw - 300px)
);

aspect-ratio:
1000 / 760;

}

.pitch{

width:100%;
height:100%;

position:relative;

overflow:hidden;

border-radius:14px;

border:
3px solid white;

background:

repeating-linear-gradient(

to bottom,

#247b42 0px,
#247b42 70px,

#1f713c 70px,
#1f713c 140px

);

box-shadow:
0 20px 60px
rgba(0,0,0,.5);

touch-action:none;

}

.halfway{

position:absolute;

left:0;
right:0;

top:50%;

border-top:
3px solid
rgba(255,255,255,.85);

}

.center-circle{

position:absolute;

left:50%;
top:50%;

width:150px;
height:150px;

transform:
translate(-50%,-50%);

border:
3px solid white;

border-radius:50%;

}

.center-dot{

position:absolute;

left:50%;
top:50%;

width:8px;
height:8px;

transform:
translate(-50%,-50%);

background:white;

border-radius:50%;

}

.box{

position:absolute;

left:50%;

transform:
translateX(-50%);

width:36%;
height:18%;

border-left:
3px solid white;

border-right:
3px solid white;

}

.box.top{

top:0;

border-bottom:
3px solid white;

}

.box.bottom{

bottom:0;

border-top:
3px solid white;

}

.six{

position:absolute;

left:50%;

transform:
translateX(-50%);

width:17%;
height:8%;

border-left:
3px solid white;

border-right:
3px solid white;

}

.six.top{

top:0;

border-bottom:
3px solid white;

}

.six.bottom{

bottom:0;

border-top:
3px solid white;

}

.player{

position:absolute;

width:88px;

min-height:90px;

transform:
translate(-50%,-50%);

text-align:center;

z-index:10;

touch-action:none;

user-select:none;

cursor:grab;

}

.player.dragging{

cursor:grabbing;

z-index:100;

}

.avatar{

width:54px;
height:54px;

margin:auto;

border-radius:50%;

border:
3px solid white;

background:#6f7772;

display:flex;

align-items:center;
justify-content:center;

overflow:hidden;

font-size:20px;

font-weight:900;

box-shadow:
0 5px 15px
rgba(0,0,0,.4);

}

.avatar img{

width:100%;
height:100%;

object-fit:cover;

}

.name{

margin-top:3px;

padding:
3px 6px;

background:
rgba(0,0,0,.78);

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

max-height:
calc(100vh - 105px);

overflow:auto;

padding:15px;

border-radius:13px;

background:#0d1811;

border:
1px solid
rgba(255,255,255,.12);

position:sticky;

top:88px;

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

touch-action:manipulation;

}

.control.active{

background:#15803d;

}

.selected{

outline:
3px solid #facc15;

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

padding:7px;

border-radius:7px;

background:#17221b;

cursor:pointer;

touch-action:manipulation;

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

.status{

margin-top:10px;

padding:9px;

background:#18231c;

border-radius:7px;

font-size:11px;

}

.bench-title{

margin-top:12px;

font-size:13px;

font-weight:900;

}

.bench-list{

display:flex;

flex-wrap:wrap;

gap:5px;

margin-top:6px;

}

.bench-chip{

padding:
6px 8px;

border-radius:6px;

background:#202a24;

font-size:10px;

}

@media(max-width:850px){

.topbar{

min-height:62px;

padding:
8px 10px;

}

.title{

font-size:16px;

}

.subtitle{

display:none;

}

.top-button{

padding:
10px 12px;

font-size:11px;

}

.main{

flex-direction:column;

padding:10px;

align-items:center;

}

.pitch-wrap{

width:96vw;

aspect-ratio:
1 / .76;

}

.pitch{

border-width:2px;

}

.panel{

width:96vw;

max-height:none;

position:static;

}

.members{

display:grid;

grid-template-columns:
1fr 1fr;

}

.member{

min-height:52px;

}

.control{

font-size:13px;

padding:13px;

}

.player{

width:74px;

min-height:78px;

}

.avatar{

width:46px;
height:46px;

}

.name{

font-size:9px;

max-width:105px;

}

.position{

font-size:8px;

}

.center-circle{

width:105px;
height:105px;

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

${session.size}v${session.size}
•
Select, position and move players

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
id="finishBtn"
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

Tap a circle to select it.
Pick a server player below.
Use Change Position or Move Player.
On phone, drag with your finger.

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

<button
class="control"
onclick="addBenchSelected()"
>
🪑 Add Selected Player To Bench
</button>

<div
class="status"
id="status"
>
No player selected.
</div>

<div class="bench-title">
Bench
</div>

<div
class="bench-list"
id="benchList"
>
</div>

<div
class="members"
id="members"
>
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
let moving = false;
let dragging = null;

const pitch =
document.getElementById(
"pitch"
);

const players =
document.getElementById(
"players"
);

const members =
document.getElementById(
"members"
);

const statusBox =
document.getElementById(
"status"
);

function escapeHTML(value){

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
"/api/session/" +
encodeURIComponent(
SESSION
)
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

document.body.innerHTML =
"<div style='padding:30px;color:white;font-family:Arial'>" +

"<h2>❌ Lineup could not be loaded</h2>" +

"<p>" +

escapeHTML(
error.message
) +

"</p></div>";

}

}

function render(){

renderPlayers();

renderMembers();

renderBench();

updateStatus();

}

function renderPlayers(){

players.innerHTML = "";

state.roster.forEach(
(player,index)=>{

const el =
document.createElement(
"div"
);

el.className =
"player" +
(
selected === index
? " selected"
: ""
);

el.style.left =
player.x + "%";

el.style.top =
player.y + "%";

if(player.avatar){

el.innerHTML =
"<div class='avatar'>" +

"<img src='" +

escapeHTML(
player.avatar
) +

"' draggable='false'>" +

"</div>";

}else{

el.innerHTML =
"<div class='avatar'>?</div>";

}

el.innerHTML +=

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

/* TAP PLAYER */

el.addEventListener(
"click",
event=>{

event.stopPropagation();

if(dragging)
return;

selected = index;

renderPlayers();

updateStatus();

showMembers();

}
);

/* TOUCH / MOUSE MOVE */

el.addEventListener(
"pointerdown",
event=>{

if(!moving)
return;

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
)
return;

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

if(
!dragging ||
dragging.element !== el
)
return;

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

await saveMove(
index
);

}
);

el.addEventListener(
"pointercancel",
()=>{

if(
dragging &&
dragging.element === el
){

dragging = null;

el.classList.remove(
"dragging"
);

}

}
);

players.appendChild(el);

}
);

}

function renderMembers(){

members.innerHTML = "";

(
state.serverMembers ||
[]
).forEach(
member=>{

const el =
document.createElement(
"div"
);

el.className =
"member";

el.innerHTML =

"<img src='" +

escapeHTML(
member.avatar
) +

"'>" +

"<div class='member-name'>" +

escapeHTML(
member.name
) +

"</div>";

el.onclick =
()=>assignPlayer(
member
);

members.appendChild(
el
);

}
);

}

function renderBench(){

const box =
document.getElementById(
"benchList"
);

box.innerHTML = "";

(
state.bench ||
[]
).forEach(
player=>{

const chip =
document.createElement(
"div"
);

chip.className =
"bench-chip";

chip.textContent =
player.name;

box.appendChild(
chip
);

}
);

}

function showMembers(){

document
.querySelector(".members")
.scrollIntoView({
behavior:"smooth",
block:"nearest"
});

}

function updateStatus(){

if(selected === null){

statusBox.textContent =
"No player selected.";

return;

}

const player =
state.roster[
selected
];

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
) +

(
moving
? "<br><b>Move:</b> ON — drag with finger/mouse"
: ""
);

}

async function assignPlayer(
member
){

if(selected === null){

alert(
"Tap a grey player circle first."
);

return;

}

try{

const data =
await post(
"/api/assign",
{
session:SESSION,
uid:CREATOR,
slot:selected,
userId:member.id
}
);

state.roster[
selected
] = data.slot;

state.bench =
data.bench ||
state.bench ||
[];

render();

}catch(error){

alert(
error.message
);

}

}

async function addBenchSelected(){

if(selected === null){

alert(
"Select a player first."
);

return;

}

const player =
state.roster[
selected
];

if(!player.userId){

alert(
"Select a server player for this slot first."
);

return;

}

try{

const data =
await post(
"/api/bench",
{
session:SESSION,
uid:CREATOR,
userId:player.userId
}
);

state.bench =
data.bench;

renderBench();

}catch(error){

alert(
error.message
);

}

}

async function changePosition(){

if(selected === null){

alert(
"Select a player first."
);

return;

}

const player =
state.roster[
selected
];

const value =
prompt(
"Type the position:",
player.position
);

if(value === null)
return;

const position =
value.trim();

if(!position)
return;

try{

const data =
await post(
"/api/position",
{
session:SESSION,
uid:CREATOR,
slot:selected,
position:position
}
);

state.roster[
selected
] = data.slot;

render();

}catch(error){

alert(
error.message
);

}

}

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

button.classList.toggle(
"active",
moving
);

button.textContent =
moving
? "✓ Moving — tap again to stop"
: "↔ Move Player";

updateStatus();

}

async function saveMove(
index
){

const player =
state.roster[
index
];

try{

await post(
"/api/move",
{
session:SESSION,
uid:CREATOR,
slot:index,
x:player.x,
y:player.y
}
);

}catch(error){

console.error(error);

}

}

async function saveAll(){

await post(
"/api/session/" +
encodeURIComponent(
SESSION
),
{
uid:CREATOR,
roster:state.roster,
bench:state.bench || []
}
);

}

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

state.bench = [];

selected = null;

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

async function finishLineup(){

if(
!confirm(
"Finish this lineup and post it to the Discord channel?"
)
){

return;

}

const button =
document.getElementById(
"finishBtn"
);

button.disabled = true;

button.textContent =
"Posting...";

try{

await saveAll();

const data =
await post(
"/api/finish/" +
encodeURIComponent(
SESSION
),
{
uid:CREATOR
}
);

if(!data.success){

throw new Error(
"Could not post lineup."
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

async function post(
url,
body
){

const response =
await fetch(
url,
{
method:"POST",

headers:{
"Content-Type":
"application/json"
},

body:
JSON.stringify(body)
}
);

const data =
await response.json()
.catch(
()=>({})
);

if(!response.ok){

throw new Error(
data.error ||
"Request failed."
);

}

return data;

}

load();

</script>

</body>

</html>
`;
}
