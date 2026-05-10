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

### Help card

`#helpCard` — toggled by `#helpBtn` (`?` button). Contains:
- App usage explanation
- Test email button (`#testEmailBtn`) with `#testEmailMsg` for feedback
- Error code reference (ERR-001, ERR-002/003, ERR-010, ERR-012, ERR-014)

### Preview / confirmation flow

When Smart Paste succeeds (confidence `high` or `medium`), `enterPreviewMode(eventDate, remindAt)` is called:
- Adds `.preview-mode` class to `#manualSection` — CSS locks fields via `pointer-events: none`
- Shows `#previewBlock` with Opravilo / Dogodek / Opomnik rows
- Hides `#normalActions` and `#manualHint`
- `parseSmartReminderText` returns both `eventDate` (original event time) and `remindAt` (after offset) so both can be shown in the preview

`exitPreviewMode()` reverses the above. Both `#saveBtn` and `#previewSaveBtn` call `savePendingReminder()` which calls `exitPreviewMode()` internally on success or validation failure.

`#normalActions` contains only `#saveBtn` — the test email button is in `#helpCard`, not the form.

### Email remember

`localStorage('marusa_email')` — saved when user types if checkbox is checked, cleared when unchecked. Loaded on init. **The email field is never pre-filled from the backend** — `DEFAULT_REMINDER_EMAIL` is backend-only and is not sent to the frontend.

## Theme system

CSS variables `--bg`, `--surface`, `--border`, `--text`, `--muted`, `--accent`, `--accent-lt` control all colors. Three presets: `marusa`, `forest`, `night`. Custom mode applies user-chosen accent/bg/surface on top of the marusa base.

`THEMES` object in `app.js` holds preset values. `applyTheme(name, customColors)` writes vars to `documentElement.style` and sets `data-theme` attribute (used by CSS `[data-theme="night"]` overrides for hardcoded badge/preview colors). `loadSavedTheme()` restores from `localStorage('marusa_theme')` and `localStorage('marusa_theme_custom')`.

FOUC prevention: inline `<script>` in `<head>` reads localStorage and sets CSS vars before page renders.

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

All routes except `/api/health` and `/api/auth` require `X-App-Code` header when `APP_ACCESS_CODE` is set. Returns `ERR-001` + HTTP 401 if unauthorized.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/health` | No | App status + `protected` flag (no secrets exposed) |
| GET | `/api/auth` | Yes | Verify access code (used by frontend unlock) |
| GET | `/api/reminders` | Yes | List all |
| POST | `/api/reminders` | Yes | Create (`{title, description?, remindAt, email}`) |
| DELETE | `/api/reminders/:id` | Yes | Delete |
| POST | `/api/reminders/:id/send-now` | Yes | Force-send |
| POST | `/api/test-email` | Yes | Test email (`{email?}`) |
| GET | `/api/email-status` | Yes | Safe provider config (no secrets) |
| GET | `/api/smtp-test` | Yes | Live Gmail SMTP verify + DNS + `elapsedMs` |

All error responses: `{ ok: false, code: "ERR-XXX", message: "...", action: "..." }`.

Error code registry (ERR-001 through ERR-015) defined in `ERRORS` object in `server.js`. `makeError(code, override?)` builds the response. `smtpErrorMessage(err)` maps nodemailer/Resend errors to ERR codes.

## Access protection

`APP_ACCESS_CODE` env var enables simple access lock. Not full auth — single shared code.

- Frontend calls `/api/health` on init to check `protected` flag.
- If protected and no stored code → lock screen shown.
- All `apiFetch()` calls include `X-App-Code: <stored code>` header.
- 401 response → clear stored code + show lock screen again.
- Lock stored in `localStorage('marusa_code')`.
- "Zakleni aplikacijo" button clears stored code.

## Email provider architecture

All outgoing email goes through `sendEmail({ to, from, subject, text })` in `server.js`.

Two providers supported:
- **Resend** (recommended for Render): `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` → uses HTTPS, not SMTP
- **Gmail SMTP** (local fallback): `GMAIL_USER` + `GMAIL_APP_PASSWORD` via nodemailer

`checkEmailConfig()` validates the active provider's required env vars before each send attempt.

`smtpErrorMessage(err)` maps errors to ERR codes: `ERR-003` (Resend), `ERR-013` (SMTP blocked/auth), `ERR-015` (unknown).

Startup runs `runSmtpDiagnostics()` (async, non-blocking) — skipped when `EMAIL_PROVIDER=resend`.

`/api/smtp-test` runs Gmail SMTP verify on demand — only useful when not using Resend.

`/api/email-status` returns safe config info: `provider`, `hasResendApiKey`, `hasMailFrom`, `gmailSmtpAvailable`.

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
