'use strict';

// Online persistence stress-test for Maruša Reminder.
// Tests that reminders survive a Render redeploy (Supabase persistence check).
//
// Modes:
//   --create       Create 100 test reminders, then verify they exist
//   --verify-only  Fetch reminders and confirm the 100 test reminders are present
//   --cleanup      Delete only reminders with "[STRESS TEST]" prefix
//
// Required env:
//   APP_ACCESS_CODE   Access code (same as the app's X-App-Code header)
//
// Optional env:
//   LIVE_BASE_URL     Base URL (default: https://marusa-reminder.onrender.com)
//   STRESS_TEST_EMAIL Email used for test reminders (default: stress-test@example.com)

if (typeof fetch === 'undefined') {
  console.error('ERROR: Built-in fetch is not available.');
  console.error('       Requires Node.js 18 or newer. Run: node --version');
  process.exit(1);
}

const BASE_URL     = process.env.LIVE_BASE_URL || 'https://marusa-reminder.onrender.com';
const CODE         = process.env.APP_ACCESS_CODE;
const TEST_EMAIL   = process.env.STRESS_TEST_EMAIL || 'stress-test@example.com';
const COUNT        = 100;
const PREFIX       = '[STRESS TEST]';

if (!CODE) {
  console.error('ERROR: APP_ACCESS_CODE environment variable is required.');
  console.error('');
  console.error('  PowerShell:');
  console.error('    $env:APP_ACCESS_CODE="your-code"');
  console.error('    node tools/online-stress-test/stress-test.js --create');
  console.error('');
  console.error('  Bash (inline):');
  console.error('    APP_ACCESS_CODE=your-code node tools/online-stress-test/stress-test.js --create');
  process.exit(1);
}

const mode = process.argv[2];

if (!['--create', '--verify-only', '--cleanup'].includes(mode)) {
  console.error('Usage: node tools/online-stress-test/stress-test.js --create | --verify-only | --cleanup');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-App-Code': CODE,
  };
}

async function fetchReminders() {
  const res = await fetch(`${BASE_URL}/api/reminders`, { headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET /api/reminders failed HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function createReminder(n) {
  const num      = String(n).padStart(3, '0');
  const remindAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const body = {
    title:       `${PREFIX} Persistence test #${num}`,
    description: 'Created by stress-test.js — safe to delete via --cleanup',
    remindAt,
    email: TEST_EMAIL,
  };
  const res = await fetch(`${BASE_URL}/api/reminders`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST failed HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function deleteReminder(id) {
  const res = await fetch(`${BASE_URL}/api/reminders/${id}`, {
    method:  'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DELETE ${id} failed HTTP ${res.status}: ${text}`);
  }
}

function printSummary({ created, found, total }) {
  const missing = Math.max(0, total - found);
  const pass    = found >= total;

  console.log('');
  console.log('─'.repeat(40));
  if (created !== null) console.log(`Created:  ${created}`);
  console.log(`Expected: ${total}`);
  console.log(`Found:    ${found}`);
  console.log(`Missing:  ${missing}`);
  console.log('─'.repeat(40));
  console.log(`Result:   ${pass ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log('');
  return pass;
}

// ── Modes ─────────────────────────────────────────────────────────────────────

async function runCreate() {
  console.log(`\nTarget: ${BASE_URL}`);
  console.log(`Creating ${COUNT} stress test reminders (remindAt = +30 days, no emails will fire)...\n`);

  let created = 0;
  let failed  = 0;

  for (let i = 1; i <= COUNT; i++) {
    try {
      await createReminder(i);
      created++;
      if (i % 10 === 0) process.stdout.write(`  Created ${String(i).padStart(3)} / ${COUNT}\n`);
    } catch (err) {
      failed++;
      console.error(`  FAILED #${String(i).padStart(3, '0')}: ${err.message}`);
    }
  }

  if (failed > 0) {
    console.error(`\nCreation had ${failed} failure(s) — cannot guarantee full set. Aborting verify.`);
    process.exit(1);
  }

  console.log('\nCreation complete. Verifying...');
  const all         = await fetchReminders();
  const stressItems = all.filter(r => r.title && r.title.startsWith(PREFIX));

  const pass = printSummary({ created, found: stressItems.length, total: COUNT });
  if (!pass) process.exit(1);
}

async function runVerifyOnly() {
  console.log(`\nTarget: ${BASE_URL}`);
  console.log(`Verifying that ${COUNT} stress test reminders exist...\n`);

  const all         = await fetchReminders();
  const stressItems = all.filter(r => r.title && r.title.startsWith(PREFIX));

  const pass = printSummary({ created: null, found: stressItems.length, total: COUNT });
  if (!pass) process.exit(1);
}

async function runCleanup() {
  console.log(`\nTarget: ${BASE_URL}`);
  console.log(`Fetching reminders to find "${PREFIX}" entries...\n`);

  const all       = await fetchReminders();
  const toDelete  = all.filter(r => r.title && r.title.startsWith(PREFIX));
  const preserved = all.length - toDelete.length;

  if (toDelete.length === 0) {
    console.log('No stress test reminders found. Nothing to clean up.');
    console.log(`Normal reminders preserved: ${preserved}`);
    return;
  }

  console.log(`Found ${toDelete.length} stress test reminder(s) to delete.`);
  console.log(`Normal reminders preserved: ${preserved} (untouched)\n`);

  let deleted = 0;
  let failed  = 0;

  for (const r of toDelete) {
    try {
      await deleteReminder(r.id);
      deleted++;
      if (deleted % 10 === 0) process.stdout.write(`  Deleted ${String(deleted).padStart(3)} / ${toDelete.length}\n`);
    } catch (err) {
      failed++;
      console.error(`  FAILED to delete "${r.title}" (${r.id}): ${err.message}`);
    }
  }

  console.log('');
  console.log('─'.repeat(40));
  console.log(`Deleted:   ${deleted}`);
  console.log(`Failed:    ${failed}`);
  console.log(`Preserved: ${preserved} normal reminders`);
  console.log('─'.repeat(40));
  if (failed > 0) {
    console.error('Result:    FAIL ✗ — some deletions failed');
    process.exit(1);
  }
  console.log('Result:    PASS ✓ — cleanup complete');
  console.log('');
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  try {
    if (mode === '--create')      await runCreate();
    else if (mode === '--verify-only') await runVerifyOnly();
    else if (mode === '--cleanup')     await runCleanup();
  } catch (err) {
    console.error('\nFATAL ERROR:', err.message);
    process.exit(1);
  }
})();
