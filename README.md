# Invite Checker Bot

A Discord.js v14 invite tracker with:

- 📨 Check My Invites button
- `/invites`
- `/invitespanel`
- `/inviteleaderboard`
- Invite create/use tracking
- Member leave tracking
- JSON persistence

## Requirements

Node.js 18+ (Node.js 20+ recommended).

## Setup

1. Create an application/bot at the Discord Developer Portal.
2. Enable the **Server Members Intent** and **Guild Invites Intent** under Bot settings.
3. Invite the bot with the `bot` and `applications.commands` scopes.
4. Give it permission to view channels, send messages, embed links, and manage/create invites as needed.
5. Copy `.env.example` to `.env`.
6. Fill in:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `GUILD_ID`
7. Run:

```bash
npm install
npm start
```

8. In your server, run `/invitespanel`.

The bot will post the **📨 Check My Invites** button.

## Important invite-tracking limitation

Discord does not provide a simple "who invited this member" field in `GuildMemberAdd`.
This bot compares invite usage snapshots. For best results, the bot needs access to the server's invites and appropriate permissions/intents.

For production-scale servers, use a database instead of `data.json`.
