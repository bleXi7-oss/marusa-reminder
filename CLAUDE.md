# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Setup

```bash
npm install
cp .env.example .env
# Fill in .env with Gmail credentials (see below)
npm start
```

The app runs at **http://localhost:3000**.

### Required `.env` variables

```
GMAIL_USER=tvoj.email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   # Gmail App Password, NOT your real password
MAIL_FROM=tvoj.email@gmail.com
DEFAULT_REMINDER_EMAIL=tvoj.email@gmail.com
PORT=3000
```

Gmail App Password: Google Account → Security → 2-Step Verification → App passwords.

## Architecture

Single-file Express backend (`server.js`) + vanilla JS frontend (`public/`). No database — reminders persist in `data/reminders.json` (auto-created on first run, auto-backed-up on corruption).

**Data flow:**
- Frontend (`app.js`) ↔ REST API (`server.js`) ↔ `data/reminders.json`
- Background interval in `server.js` runs every 60 s, sends due reminders via nodemailer → Gmail SMTP

**Reminder lifecycle:** `sent: false` (waiting) → time passes → server loop fires `sendReminderEmail()` → `sent: true, sentAt: <ISO>`. The frontend also polls every 60 s to refresh status badges.

## API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/reminders` | List all reminders |
| POST | `/api/reminders` | Create reminder (`{title, description?, remindAt, email}`) |
| DELETE | `/api/reminders/:id` | Delete reminder |
| POST | `/api/reminders/:id/send-now` | Force-send immediately |
| POST | `/api/test-email` | Send a test email (`{email?}`) |

## PWA

The app is installable as a PWA. `public/manifest.json` and `public/service-worker.js` handle this. The service worker is registered in `app.js` at startup.

## Language note

The UI, comments, and console messages are in Slovenian. Keep new user-visible strings in Slovenian.
