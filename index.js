require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("Missing DISCORD_TOKEN, CLIENT_ID or GUILD_ID in .env");
  process.exit(1);
}

const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { guilds: {} };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const data = loadData();

function guildData(guildId) {
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = {
      invites: {},
      users: {}
    };
  }
  return data.guilds[guildId];
}

function userData(guildId, userId) {
  const g = guildData(guildId);
  if (!g.users[userId]) {
    g.users[userId] = {
      regular: 0,
      left: 0,
      fake: 0,
      bonus: 0,
      inviter: null
    };
  }
  return g.users[userId];
}

function totalInvites(u) {
  return Math.max(0, (u.regular || 0) - (u.left || 0) - (u.fake || 0) + (u.bonus || 0));
}

async function snapshotInvites(guild) {
  const map = {};
  try {
    const invites = await guild.invites.fetch();
    invites.forEach(inv => {
      map[inv.code] = {
        uses: inv.uses || 0,
        inviterId: inv.inviter?.id || null
      };
    });
  } catch (err) {
    console.error("Could not fetch invites:", err.message);
  }
  return map;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites
  ],
  partials: [Partials.GuildMember]
});

const commands = [
  new SlashCommandBuilder()
    .setName("invites")
    .setDescription("Check your invite count")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to check")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("invitespanel")
    .setDescription("Post the Check My Invites button panel"),

  new SlashCommandBuilder()
    .setName("inviteleaderboard")
    .setDescription("Show the invite leaderboard")
].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
  console.log("Slash commands registered.");
}

function inviteEmbed(user, count) {
  return new EmbedBuilder()
    .setTitle("📨 Your Invites")
    .setDescription(`**${user.username}** has **${count}** valid invite${count === 1 ? "" : "s"}.`)
    .setThumbnail(user.displayAvatarURL({ size: 128 }))
    .setTimestamp();
}

function panel() {
  const embed = new EmbedBuilder()
    .setTitle("📨 Invite Checker")
    .setDescription(
      "Want to know how many people you've invited?\n\n" +
      "Click the button below to instantly check your invites."
    )
    .setFooter({ text: "Invite Tracker" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("check_my_invites")
      .setLabel("Check My Invites")
      .setEmoji("📨")
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

client.once(Events.ClientReady, async ready => {
  console.log(`Logged in as ${ready.user.tag}`);

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    guildData(guild.id).invites = await snapshotInvites(guild);
    saveData(data);
  } catch (e) {
    console.error("Initial invite snapshot failed:", e.message);
  }

  await registerCommands();
});

client.on(Events.InviteCreate, async invite => {
  const g = guildData(invite.guild.id);
  g.invites[invite.code] = {
    uses: invite.uses || 0,
    inviterId: invite.inviter?.id || null
  };
  saveData(data);
});

client.on(Events.GuildMemberAdd, async member => {
  const guild = member.guild;
  const g = guildData(guild.id);

  let current = await snapshotInvites(guild);
  let usedInvite = null;

  for (const [code, now] of Object.entries(current)) {
    const before = g.invites[code]?.uses || 0;
    if ((now.uses || 0) > before) {
      usedInvite = { code, ...now };
      break;
    }
  }

  if (usedInvite?.inviterId && usedInvite.inviterId !== member.id) {
    const inviter = userData(guild.id, usedInvite.inviterId);
    inviter.regular += 1;
    inviter.inviter = inviter.inviter || null;

    const joined = userData(guild.id, member.id);
    joined.inviter = usedInvite.inviterId;
  }

  g.invites = current;
  saveData(data);
});

client.on(Events.GuildMemberRemove, async member => {
  const g = guildData(member.guild.id);
  const joined = g.users[member.id];

  if (joined?.inviter) {
    const inviter = userData(member.guild.id, joined.inviter);
    inviter.left = (inviter.left || 0) + 1;
    saveData(data);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    const guild = interaction.guild;
    if (!guild) return;

    if (interaction.commandName === "invites") {
      const target = interaction.options.getUser("user") || interaction.user;
      const u = userData(guild.id, target.id);

      return interaction.reply({
        embeds: [inviteEmbed(target, totalInvites(u))],
        ephemeral: true
      });
    }

    if (interaction.commandName === "invitespanel") {
      if (!interaction.memberPermissions?.has("ManageGuild")) {
        return interaction.reply({
          content: "❌ You need **Manage Server** permission to use this command.",
          ephemeral: true
        });
      }

      return interaction.reply(panel());
    }

    if (interaction.commandName === "inviteleaderboard") {
      const g = guildData(guild.id);
      const rows = Object.entries(g.users)
        .map(([id, u]) => ({ id, count: totalInvites(u) }))
        .filter(x => x.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      if (!rows.length) {
        return interaction.reply("No tracked invites yet.");
      }

      const lines = [];
      for (let i = 0; i < rows.length; i++) {
        const user = await client.users.fetch(rows[i].id).catch(() => null);
        lines.push(`**${i + 1}.** ${user ? user.username : rows[i].id} — **${rows[i].count}**`);
      }

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🏆 Invite Leaderboard")
            .setDescription(lines.join("\n"))
            .setTimestamp()
        ]
      });
    }
  }

  if (interaction.isButton() && interaction.customId === "check_my_invites") {
    const g = guildData(interaction.guild.id);
    const u = userData(interaction.guild.id, interaction.user.id);
    const count = totalInvites(u);

    return interaction.reply({
      embeds: [inviteEmbed(interaction.user, count)],
      ephemeral: true
    });
  }
});

client.login(TOKEN);
