# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Setup

```bash
npm install
cp .env.example .env
# Fill in .env with Gmail credentials
npm start
```

The app runs at **http://localhost:3001** (PORT set in `.env`).

### Required `.env` variables

```
GMAIL_USER=tvoj.email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
MAIL_FROM=tvoj.email@gmail.com
DEFAULT_REMINDER_EMAIL=tvoj.email@gmail.com
PORT=3001
NODE_ENV=production

# Optional SMTP overrides (defaults shown)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
# Alternate for Render if port 465 is blocked:
# SMTP_PORT=587
# SMTP_SECURE=false
```

Never touch or overwrite `.env` — user configures it manually.

## Architecture

Single-file Express backend (`server.js`) + vanilla JS frontend (`public/`). No database — reminders persist in `data/reminders.json` (auto-created, auto-backed-up on corruption).

**Data flow:**
- Frontend (`app.js`) ↔ REST API (`server.js`) ↔ `data/reminders.json`
- Background interval runs every 60s, sends due reminders via nodemailer → Gmail SMTP port 465

**Reminder lifecycle:** `sent: false` → server loop fires `sendReminderEmail()` → `sent: true, sentAt: ISO`

**Timezone handling:** Frontend sends UTC ISO via `new Date(localVal).toISOString()`. Server compares with `Date.now()`.

## Frontend modes

Two modes toggled by `.mode-switch` buttons, persisted in `localStorage('marusa_mode')`:

- **Pametni način** (`#smartSection`): Smart Paste parser fills the manual form after parsing
- **Ročni način** (`#manualSection`): Direct form entry, always visible

After a successful smart parse, `revealManualForm()` shows `#manualSection` with a fade animation and scrolls to it.

### Preview / confirmation flow

When Smart Paste succeeds (confidence `high` or `medium`), `enterPreviewMode(eventDate, remindAt)` is called:
- Adds `.preview-mode` class to `#manualSection` — CSS locks fields via `pointer-events: none`
- Shows `#previewBlock` with Opravilo / Dogodek / Opomnik rows
- Hides `#normalActions` and `#manualHint`
- `parseSmartReminderText` returns both `eventDate` (original event time) and `remindAt` (after offset) so both can be shown in the preview

`exitPreviewMode()` reverses the above. Both `#saveBtn` and `#previewSaveBtn` call `savePendingReminder()` which calls `exitPreviewMode()` internally on success or validation failure.

### Email remember

`localStorage('marusa_email')` — saved when user types if checkbox is checked, cleared when unchecked. Loaded on init.

## Smart Paste parser (`public/app.js`)

Rule-based only — no AI, no external APIs.

Key functions:
- `extractTime(text)` → `{ hour, minute }` or null
- `extractDate(text)` → `{ date, tier }` where tier = `'exact'|'relative'|'weekday'|'vague'`
- `extractRelativeMinutes(text)` → minutes from now (for "čez pol ure", "in 2 hours"), or null
- `detectBusinessContext(text)` → label string (račun, plačilo, ponudba...) or null
- `extractTitle(text, businessContext)` → clean title, max 80 chars
- `extractDescription(text)` → clean summary, max 140 chars
- `parseSmartReminderText(text, offset)` → `{ title, eventDate, remindAt, description, confidence, warning, businessContext }`

**Confidence tiers:**
- `high` = exact date + specific time → green, prefill form
- `medium` = exact date or relative/weekday → green, prefill form, note to verify
- `low` = vague (naslednji teden) → don't prefill date, show amber border on date field
- `none` = no date found → same as low

**Three-tier offset system:**
- `applyReminderOffset(date, presetString)` — handles '0','1h','1d','2d','3d','1w'
- `applyCustomReminderOffset(date, amount, unit)` — handles minut/ur/dni/tednov variants

## API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/reminders` | List all |
| POST | `/api/reminders` | Create (`{title, description?, remindAt, email}`) |
| DELETE | `/api/reminders/:id` | Delete |
| POST | `/api/reminders/:id/send-now` | Force-send — returns `{ok, message, code}` |
| POST | `/api/test-email` | Test Gmail (`{email?}`) — returns `{ok, message, code}` |
| GET | `/api/email-status` | Safe SMTP config check (no secrets) |

Email endpoints return `{ ok: true, message }` on success and `{ ok: false, message, code }` on error.
Error codes: `AUTH_ERROR`, `CONNECTION_ERROR`, `MISSING_CONFIG`, `UNKNOWN_ERROR`.

## PWA

`public/manifest.json` + `public/service-worker.js`. Registered in `app.js` init.

Icons are pre-generated PNGs in `public/icons/`. Source SVG: `public/icons/icon.svg`. To regenerate: `node generate-icons.js` (requires `sharp` devDependency, already installed).

## Language

UI, user-visible strings, and console messages are in Slovenian. Keep new strings in Slovenian.

## Key constraints

- No frameworks, no React/Vue, no database, no auth
- No AI APIs — parser is rule-based regex only
- `.env` is never committed (in `.gitignore`)
- `data/` is never committed (runtime data)
- Keep code beginner-friendly and minimal
