# Online Persistence Stress-Test

Verifies that Maruša Reminder reminders survive a Render redeploy when Supabase persistence is active.

Creates 100 test reminders via the live API, lets you redeploy, then verifies they are all still there.

---

## Requirements

- Node.js 18+ (uses built-in `fetch`)
- `APP_ACCESS_CODE` — the same code configured in your Render environment

---

## Commands

### PowerShell

```powershell
$env:APP_ACCESS_CODE="your-code"

# Step 1 — create 100 test reminders + immediate verify
node tools/online-stress-test/stress-test.js --create

# Step 2 — after Render redeploy, verify the reminders survived
node tools/online-stress-test/stress-test.js --verify-only

# Step 3 — delete all test reminders (leaves normal reminders untouched)
node tools/online-stress-test/stress-test.js --cleanup
```

### Bash (inline)

```bash
APP_ACCESS_CODE=your-code node tools/online-stress-test/stress-test.js --create
APP_ACCESS_CODE=your-code node tools/online-stress-test/stress-test.js --verify-only
APP_ACCESS_CODE=your-code node tools/online-stress-test/stress-test.js --cleanup
```

### Custom base URL (if not using the default Render URL)

```powershell
$env:APP_ACCESS_CODE="your-code"
$env:LIVE_BASE_URL="https://your-custom-url.onrender.com"
node tools/online-stress-test/stress-test.js --create
```

---

## Standard test flow

1. Run `--create` → confirm **PASS**
2. Go to Render → Manual Deploy → **Deploy latest commit**
3. Wait for the deploy to finish (~1–2 min)
4. Run `--verify-only` → confirm **PASS**
5. Run `--cleanup` → confirm **PASS**

---

## What the script does

| Mode | Action |
|------|--------|
| `--create` | Creates 100 reminders titled `[STRESS TEST] Persistence test #001` … `#100`, all scheduled +30 days in the future (no emails will fire). Then immediately verifies all 100 are present. |
| `--verify-only` | Fetches all reminders and checks that at least 100 with the `[STRESS TEST]` prefix exist. |
| `--cleanup` | Deletes every reminder whose title starts with `[STRESS TEST]`. Normal reminders are **never touched**. |

---

## Safety guarantees

- Test reminders are set **+30 days** in the future — the server's 60-second loop will never fire them.
- `--cleanup` filters by `[STRESS TEST]` prefix only — it cannot delete normal reminders.
- `APP_ACCESS_CODE` is **never printed** anywhere in the output.
- The script fails immediately with a clear message if `APP_ACCESS_CODE` is missing.
- No dependencies — uses only Node.js built-ins (`fetch`, `process`).

---

## Optional env vars

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ACCESS_CODE` | *(required)* | App access code (`X-App-Code` header) |
| `LIVE_BASE_URL` | `https://marusa-reminder.onrender.com` | Base URL of the live app |
| `STRESS_TEST_EMAIL` | `stress-test@example.com` | Email used in test reminders (never sent) |
