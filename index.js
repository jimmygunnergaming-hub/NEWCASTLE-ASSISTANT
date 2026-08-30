const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// This is the route the uptime bot will hit
app.get('/ping', (req, res) => {
  res.send('Bot is alive!');
});

app.listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  ActionRowBuilder,
  UserSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require('discord.js');

const PORT = Number(process.env.PORT || 3000);
const TOKEN = process.env.DISCORD_TOKEN;
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');

const activeSessions = new Map();

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8'
  });

  res.end(JSON.stringify(data));
}

function html(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8'
  });

  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(
    req.url,
    `http://${req.headers.host || 'localhost'}`
  );

  if (req.method === 'GET' && url.pathname === '/') {
    return html(
      res,
      200,
      `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Newcastle Assistant</title>
</head>
<body style="
font-family:Arial;
background:#111;
color:#fff;
text-align:center;
padding:50px;
">
<h1>Newcastle Assistant</h1>
<p>Bot is online.</p>
</body>
</html>`
    );
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, {
      ok: true,
      bot: client.isReady()
    });
  }

  if (
    req.method === 'GET' &&
    url.pathname.startsWith('/pitch/')
  ) {
    const sessionId = decodeURIComponent(
      url.pathname.slice('/pitch/'.length)
    );

    const filePath = path.join(__dirname, 'pitch.html');

    if (!fs.existsSync(filePath)) {
      return html(res, 404, 'pitch.html not found');
    }

    const page = fs.readFileSync(filePath, 'utf8');

    return html(res, 200, page);
  }

  if (
    req.method === 'GET' &&
    url.pathname.startsWith('/api/session/')
  ) {
    const sessionId = decodeURIComponent(
      url.pathname.slice('/api/session/'.length)
    );

    const session = activeSessions.get(sessionId);

    if (!session) {
      return json(res, 404, {
        error: 'Session not found or expired.'
      });
    }

    return json(res, 200, {
      roster: session.roster,
      serverMembers: session.serverMembers,
      creatorId: session.creatorId
    });
  }

  if (
    req.method === 'POST' &&
    url.pathname.startsWith('/api/session/')
  ) {
    const sessionId = decodeURIComponent(
      url.pathname.slice('/api/session/'.length)
    );

    const session = activeSessions.get(sessionId);

    if (!session) {
      return json(res, 404, {
        error: 'Session not found or expired.'
      });
    }

    let body = '';

    req.on('data', chunk => {
      body += chunk;

      if (body.length > 1000000) {
        req.destroy();
      }
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');

        if (data.uid !== session.creatorId) {
          return json(res, 403, {
            error:
              'Only the coach who created the lineup can edit it.'
          });
        }

        if (Array.isArray(data.roster)) {
          data.roster.forEach((incoming, i) => {
            if (!session.roster[i]) {
              return;
            }

            if (typeof incoming.pctX === 'number') {
              session.roster[i].pctX = Math.max(
                5,
                Math.min(95, incoming.pctX)
              );
            }

            if (typeof incoming.pctY === 'number') {
              session.roster[i].pctY = Math.max(
                5,
                Math.min(95, incoming.pctY)
              );
            }

            if (typeof incoming.role === 'string') {
              session.roster[i].role =
                incoming.role.slice(0, 30);
            }

            if (typeof incoming.name === 'string') {
              session.roster[i].name =
                incoming.name.slice(0, 40);
            }

            if (typeof incoming.avatar === 'string') {
              session.roster[i].avatar =
                incoming.avatar.slice(0, 1000);
            }
          });
        }

        if (data.action === 'finish') {
          const result =
            await postFinishedLineup(sessionId);

          return json(
            res,
            result.ok ? 200 : 500,
            result
          );
        }

        return json(res, 200, {
          ok: true,
          roster: session.roster
        });

      } catch (err) {
        console.error(
          'Dashboard request error:',
          err
        );

        return json(res, 400, {
          error: 'Invalid request.'
        });
      }
    });

    return;
  }

  return html(res, 404, 'Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `Web server listening on 0.0.0.0:${PORT}`
  );
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

function getPublicPitchUrl(sessionId, interaction) {
  const base =
    PUBLIC_URL ||
    `https://${interaction.client.user.username
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')}.onrender.com`;

  return `${base}/pitch/${encodeURIComponent(
    sessionId
  )}?uid=${encodeURIComponent(interaction.user.id)}`;
}

client.once('ready', async () => {
  console.log(
    `Bot logged in as ${client.user.tag}`
  );

  const command = new SlashCommandBuilder()
    .setName('lineup')
    .setDescription(
      'Build a high-quality graphical football field lineup'
    )
    .addIntegerOption(opt =>
      opt
        .setName('size')
        .setDescription(
          'Number of players (1-11)'
        )
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(11)
    );

  try {
    await client.application.commands.set([
      command
    ]);

    console.log(
      'Slash command /lineup registered.'
    );
  } catch (err) {
    console.error(
      'Failed to register /lineup:',
      err
    );
  }
});

client.on(
  'interactionCreate',
  async interaction => {
    try {
      if (
        interaction.isChatInputCommand() &&
        interaction.commandName === 'lineup'
      ) {
        const size =
          interaction.options.getInteger(
            'size',
            true
          );

        const msg =
          await interaction.reply({
            content:
              '🏟️ Initializing high-quality pitch layout...',
            fetchReply: true
          });

        const roster = Array.from(
          { length: size },
          (_, i) => ({
            index: i,
            name: 'Unassigned',
            role:
              i === 0
                ? 'GK'
                : `POS #${i + 1}`,
            avatar: '',
            pctX: 50,
            pctY:
              size === 1
                ? 50
                : i === 0
                  ? 90
                  : 90 -
                    Math.floor(
                      (i - 1) /
                        Math.max(
                          1,
                          Math.ceil(
                            (size - 1) / 3
                          )
                        )
                    ) *
                      22
          })
        );

        const outfield =
          Math.max(0, size - 1);

        if (outfield > 0) {
          const rows =
            outfield > 7
              ? 3
              : outfield > 3
                ? 2
                : 1;

          let index = 1;

          for (
            let r = 0;
            r < rows;
            r++
          ) {
            const count = Math.min(
              Math.ceil(
                outfield / rows
              ),
              outfield - (index - 1)
            );

            for (
              let p = 0;
              p < count;
              p++
            ) {
              roster[index].pctX =
                ((p + 1) /
                  (count + 1)) *
                100;

              roster[index].pctY =
                78 - r * 22;

              index++;
            }
          }
        }

        const serverMembers = [];

        try {
          const members =
            await interaction.guild.members.fetch();

          members.forEach(member => {
            if (!member.user.bot) {
              serverMembers.push({
                id: member.id,
                name:
                  member.displayName ||
                  member.user.username,
                username:
                  member.user.username,
                avatar:
                  member.user.displayAvatarURL({
                    extension: 'png',
                    size: 128
                  })
              });
            }
          });
        } catch (err) {
          console.warn(
            'Could not fetch guild members:',
            err.message
          );
        }

        activeSessions.set(msg.id, {
          creatorId:
            interaction.user.id,
          guildId:
            interaction.guildId,
          channelId:
            interaction.channelId,
          messageId: msg.id,
          total: size,
          currentIndex: 0,
          roster,
          serverMembers
        });

        return generatePitch(
          interaction,
          msg.id,
          false
        );
      }

      if (interaction.isButton()) {
        const parts =
          interaction.customId.split('_');

        const action = parts[0];

        const msgId =
          parts.slice(1).join('_');

        const session =
          activeSessions.get(msgId);

        if (!session) {
          return interaction.reply({
            content:
              '❌ This lineup session has expired.',
            ephemeral: true
          });
        }

        if (
          interaction.user.id !==
          session.creatorId
        ) {
          return interaction.reply({
            content:
              '❌ Only the lineup creator can use these controls.',
            ephemeral: true
          });
        }

        if (action === 'open') {
          return interaction.reply({
            content:
              `🏟️ **Open the lineup editor:**\n${getPublicPitchUrl(
                msgId,
                interaction
              )}`,
            ephemeral: true
          });
        }

        if (action === 'finish') {
          const result =
            await postFinishedLineup(
              msgId
            );

          return interaction.reply({
            content: result.ok
              ? '✅ Lineup posted successfully.'
              : `❌ ${result.error}`,
            ephemeral: true
          });
        }
      }

      if (
        interaction.isUserSelectMenu() &&
        interaction.customId.startsWith(
          'player_'
        )
      ) {
        const parts =
          interaction.customId.split('_');

        const msgId =
          parts.slice(1).join('_');

        const session =
          activeSessions.get(msgId);

        if (!session) {
          return interaction.reply({
            content:
              '❌ This lineup session has expired.',
            ephemeral: true
          });
        }

        const selectedId =
          interaction.values[0];

        const player =
          session.serverMembers.find(
            member =>
              member.id === selectedId
          );

        if (!player) {
          return interaction.reply({
            content:
              '❌ Player not found.',
            ephemeral: true
          });
        }

        const index =
          session.currentIndex;

        if (!session.roster[index]) {
          return interaction.reply({
            content:
              '❌ Invalid player position.',
            ephemeral: true
          });
        }

        session.roster[index].name =
          player.name;

        session.roster[index].avatar =
          player.avatar;

        session.currentIndex =
          Math.min(
            session.currentIndex + 1,
            session.total - 1
          );

        return interaction.reply({
          content:
            `✅ **${player.name}** added to the lineup.`,
          ephemeral: true
        });
      }

    } catch (err) {
      console.error(
        'Interaction error:',
        err
      );

      if (!interaction.replied) {
        await interaction.reply({
          content:
            '❌ Something went wrong.',
          ephemeral: true
        }).catch(() => {});
      }
    }
    if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing from Render Environment Variables.");
  process.exit(1);
}

client.login(TOKEN)
  .then(() => {
    console.log("✅ Discord login started successfully.");
  })
  .catch((error) => {
    console.error("❌ Discord login failed:");
    console.error(error);
    process.exit(1);
  });
  }
);
