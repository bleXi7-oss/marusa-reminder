require('dotenv').config();
const express   = require('express');
const nodemailer = require('nodemailer');
const dns       = require('dns');
const fs        = require('fs');
const path      = require('path');
const crypto    = require('crypto');

const app       = express();
const PORT      = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'reminders.json');

// SMTP config — defaults to Gmail port 465 (TLS)
const SMTP_HOST   = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT   = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_SECURE = process.env.SMTP_SECURE !== undefined
  ? process.env.SMTP_SECURE !== 'false'
  : SMTP_PORT === 465;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Log safe config on startup (no secrets)
console.log('[Email config]', JSON.stringify({
  provider:     process.env.EMAIL_PROVIDER === 'resend' ? 'resend' : 'gmail-smtp',
  hasResendKey: !!process.env.RESEND_API_KEY,
  smtpHost:     SMTP_HOST,
  smtpPort:     SMTP_PORT,
  smtpSecure:   SMTP_SECURE,
  hasUser:      !!process.env.GMAIL_USER,
  hasPassword:  !!process.env.GMAIL_APP_PASSWORD,
  hasMailFrom:  !!process.env.MAIL_FROM,
  hasDefaultTo: !!process.env.DEFAULT_REMINDER_EMAIL,
}));

// ── Data helpers ──────────────────────────────────────────────

function loadReminders() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      const backup = DATA_FILE + '.backup.' + Date.now();
      try { fs.copyFileSync(DATA_FILE, backup); } catch (_) {}
      console.log('Podatki poškodovani, začenjam znova.');
    }
    saveReminders([]);
    return [];
  }
}

function saveReminders(reminders) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(reminders, null, 2));
}

// ── Email provider ────────────────────────────────────────────
//
// Two providers are supported:
//   1. Resend API  — set EMAIL_PROVIDER=resend + RESEND_API_KEY (recommended for Render)
//   2. Gmail SMTP  — default fallback for local use
//
// sendEmail() is the single call site for all outgoing email.

function createTransporter() {
  return nodemailer.createTransport({
    host:   SMTP_HOST,
    port:   SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
    connectionTimeout: 30000,
    greetingTimeout:   15000,
    socketTimeout:     30000,
  });
}

async function sendEmail({ to, from, subject, text }) {
  if (process.env.EMAIL_PROVIDER === 'resend' && process.env.RESEND_API_KEY) {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({ from, to, subject, text });
    if (error) {
      const err = new Error(error.message || 'Resend error');
      err.resendError = true;
      throw err;
    }
    return;
  }
  // Fallback: Gmail SMTP
  const transporter = createTransporter();
  await transporter.sendMail({ from, to, subject, text });
}

function checkEmailConfig() {
  if (process.env.EMAIL_PROVIDER === 'resend') {
    if (!process.env.RESEND_API_KEY) {
      return {
        message: 'Manjkajo Resend nastavitve v Render Environment Variables.',
        code:    'MISSING_RESEND_CONFIG',
      };
    }
    return null;
  }
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return {
      message: 'Manjkajo email nastavitve v Render Environment Variables.',
      code:    'MISSING_CONFIG',
    };
  }
  return null;
}

function smtpErrorMessage(err) {
  if (err.resendError) {
    return {
      message: 'Pošiljanje prek Resend ni uspelo. Preveri RESEND_API_KEY in MAIL_FROM.',
      code:    'RESEND_ERROR',
    };
  }

  const code = (err.code || '').toUpperCase();
  const msg  = (err.message || '').toLowerCase();

  if (
    code === 'EAUTH' ||
    msg.includes('invalid login') ||
    msg.includes('username and password not accepted') ||
    msg.includes('bad credentials') ||
    msg.includes('authentication failed') ||
    msg.includes('authentication')
  ) {
    return { message: 'Gmail prijava ni uspela. Preveri Gmail App Password.', code: 'AUTH_ERROR' };
  }

  if (code === 'ENOTFOUND' || code === 'EHOSTUNREACH') {
    return { message: 'SMTP strežnika ni mogoče najti. Preveri SMTP_HOST nastavitev.', code: 'DNS_ERROR' };
  }

  if (
    code === 'ECONNECTION' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ESOCKET' ||
    msg.includes('timeout') ||
    msg.includes('connect')
  ) {
    return { message: 'Render trenutno ne more vzpostaviti SMTP povezave do Gmaila.', code: 'CONNECTION_ERROR' };
  }

  return { message: 'Pošiljanje ni uspelo. Preveri Render logs.', code: 'UNKNOWN_ERROR' };
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString('sl-SI', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
    hour:    '2-digit',
    minute:  '2-digit',
  });
}

async function sendReminderEmail(reminder) {
  await sendEmail({
    from:    `"Maruša Reminder" <${process.env.MAIL_FROM || process.env.GMAIL_USER}>`,
    to:      reminder.email,
    subject: `Opomnik: ${reminder.title}`,
    text: [
      'Hej 👋',
      '',
      'To je tvoj opomnik:',
      '',
      reminder.title,
      '',
      reminder.description ? `Opis:\n${reminder.description}` : '',
      '',
      `Čas:\n${formatDate(reminder.remindAt)}`,
      '',
      '— Maruša Reminder',
    ].join('\n'),
  });
}

// ── Startup SMTP diagnostics ──────────────────────────────────
// Runs async after server start — does not block HTTP serving.

async function runSmtpDiagnostics() {
  if (process.env.EMAIL_PROVIDER === 'resend') {
    console.log('[SMTP diagnostics] Preskočeno — EMAIL_PROVIDER=resend.');
    return;
  }

  // Step 1: DNS resolution
  try {
    const addresses = await new Promise((resolve, reject) =>
      dns.resolve4(SMTP_HOST, (err, addrs) => err ? reject(err) : resolve(addrs))
    );
    console.log('[SMTP DNS]', JSON.stringify({ host: SMTP_HOST, resolved: addresses }));
  } catch (err) {
    console.error('[SMTP DNS] Napaka:', JSON.stringify({
      host:    SMTP_HOST,
      errCode: err.code,
      errMsg:  err.message,
    }));
  }

  // Step 2: Connection verify (skipped if env vars missing)
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.log('[SMTP verify] Preskočeno — manjkajo GMAIL_USER ali GMAIL_APP_PASSWORD.');
    return;
  }

  const t     = createTransporter();
  const start = Date.now();
  try {
    await t.verify();
    console.log('[SMTP verify] OK', JSON.stringify({
      smtpHost:  SMTP_HOST,
      smtpPort:  SMTP_PORT,
      secure:    SMTP_SECURE,
      elapsedMs: Date.now() - start,
    }));
  } catch (err) {
    console.error('[SMTP verify] Napaka:', JSON.stringify({
      smtpHost:  SMTP_HOST,
      smtpPort:  SMTP_PORT,
      secure:    SMTP_SECURE,
      errCode:   err.code,
      errMsg:    err.message,
      elapsedMs: Date.now() - start,
    }));
  }
}

// ── Reminder checker (runs every 60s) ─────────────────────────

async function checkAndSendReminders() {
  const reminders = loadReminders();
  const now       = Date.now();
  const pending   = reminders.filter(r => !r.sent);

  console.log(`[${new Date().toLocaleString('sl-SI')}] Strežniški čas. Preverjam ${pending.length} opomnikov.`);

  let changed = false;

  for (const r of reminders) {
    if (!r.sent && new Date(r.remindAt).getTime() <= now) {
      console.log(`  → Pošiljam: "${r.title}" (nastavljeno za ${new Date(r.remindAt).toLocaleString('sl-SI')})`);
      try {
        await sendReminderEmail(r);
        r.sent   = true;
        r.sentAt = new Date().toISOString();
        changed  = true;
        console.log(`  ✓ Poslano: "${r.title}"`);
      } catch (err) {
        console.error(`  ✗ Napaka pri pošiljanju "${r.title}":`, JSON.stringify({
          errCode: err.code,
          errMsg:  err.message,
        }));
      }
    }
  }

  if (changed) saveReminders(reminders);
}

// Run on startup, then every 60 seconds
checkAndSendReminders();
setInterval(checkAndSendReminders, 60 * 1000);

// ── API Routes ────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/email-status', (req, res) => {
  res.json({
    provider:                process.env.EMAIL_PROVIDER === 'resend' ? 'resend' : 'gmail-smtp',
    hasResendApiKey:         !!process.env.RESEND_API_KEY,
    hasMailFrom:             !!process.env.MAIL_FROM,
    hasDefaultReminderEmail: !!process.env.DEFAULT_REMINDER_EMAIL,
    gmailSmtpAvailable:      !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
    smtpHost:                SMTP_HOST,
    smtpPort:                SMTP_PORT,
    smtpSecure:              SMTP_SECURE,
  });
});

// Diagnostic endpoint — runs transporter.verify() and reports result.
// Use this to confirm whether Render can reach Gmail SMTP at all.
app.get('/api/smtp-test', async (req, res) => {
  const configErr = checkEmailConfig();
  if (configErr) {
    return res.json({ ok: false, ...configErr, elapsedMs: 0 });
  }

  // DNS probe
  let dnsResult = null;
  try {
    dnsResult = await new Promise((resolve, reject) =>
      dns.resolve4(SMTP_HOST, (err, addrs) => err ? reject(err) : resolve(addrs))
    );
  } catch (err) {
    dnsResult = { error: err.code };
  }

  const t     = createTransporter();
  const start = Date.now();
  try {
    await t.verify();
    const elapsedMs = Date.now() - start;
    console.log('[smtp-test endpoint] OK', JSON.stringify({ smtpHost: SMTP_HOST, smtpPort: SMTP_PORT, secure: SMTP_SECURE, elapsedMs }));
    res.json({
      ok:         true,
      message:    'SMTP povezava uspešna.',
      smtpHost:   SMTP_HOST,
      smtpPort:   SMTP_PORT,
      smtpSecure: SMTP_SECURE,
      dns:        dnsResult,
      elapsedMs,
    });
  } catch (err) {
    const elapsedMs = Date.now() - start;
    console.error('[smtp-test endpoint] Napaka:', JSON.stringify({
      smtpHost:  SMTP_HOST,
      smtpPort:  SMTP_PORT,
      secure:    SMTP_SECURE,
      errCode:   err.code,
      errMsg:    err.message,
      elapsedMs,
    }));
    const errRes = smtpErrorMessage(err);
    res.json({
      ok:         false,
      ...errRes,
      smtpHost:   SMTP_HOST,
      smtpPort:   SMTP_PORT,
      smtpSecure: SMTP_SECURE,
      dns:        dnsResult,
      elapsedMs,
    });
  }
});

app.get('/api/reminders', (req, res) => {
  res.json(loadReminders());
});

app.post('/api/reminders', (req, res) => {
  const { title, description, remindAt, email } = req.body;

  if (!title || !remindAt || !email) {
    return res.status(400).json({ error: 'Naslov, čas in email so obvezni.' });
  }

  const reminder = {
    id:          crypto.randomUUID(),
    title,
    description: description || '',
    remindAt,
    email,
    sent:        false,
    sentAt:      null,
    createdAt:   new Date().toISOString(),
  };

  const reminders = loadReminders();
  reminders.push(reminder);
  saveReminders(reminders);

  res.json(reminder);
});

app.delete('/api/reminders/:id', (req, res) => {
  const reminders = loadReminders();
  const filtered  = reminders.filter(r => r.id !== req.params.id);

  if (filtered.length === reminders.length) {
    return res.status(404).json({ error: 'Opomnik ni bil najden.' });
  }

  saveReminders(filtered);
  res.json({ ok: true });
});

app.post('/api/reminders/:id/send-now', async (req, res) => {
  const reminders = loadReminders();
  const reminder  = reminders.find(r => r.id === req.params.id);

  if (!reminder) {
    return res.status(404).json({ ok: false, message: 'Opomnik ni bil najden.', code: 'NOT_FOUND' });
  }

  const configErr = checkEmailConfig();
  if (configErr) {
    return res.status(400).json({ ok: false, ...configErr });
  }

  try {
    await sendReminderEmail(reminder);
    reminder.sent   = true;
    reminder.sentAt = new Date().toISOString();
    saveReminders(reminders);
    res.json({ ok: true, message: 'Email poslan.' });
  } catch (err) {
    console.error('Napaka pošiljanja:', JSON.stringify({
      smtpHost:  SMTP_HOST,
      smtpPort:  SMTP_PORT,
      secure:    SMTP_SECURE,
      hasUser:   !!process.env.GMAIL_USER,
      hasPass:   !!process.env.GMAIL_APP_PASSWORD,
      recipient: reminder.email,
      errCode:   err.code,
      errMsg:    err.message,
    }));
    res.status(500).json({ ok: false, ...smtpErrorMessage(err) });
  }
});

app.post('/api/test-email', async (req, res) => {
  const to = req.body.email || process.env.DEFAULT_REMINDER_EMAIL;

  if (!to) {
    return res.status(400).json({ ok: false, message: 'Manjka email naslov.', code: 'MISSING_EMAIL' });
  }

  const configErr = checkEmailConfig();
  if (configErr) {
    return res.status(400).json({ ok: false, ...configErr });
  }

  try {
    await sendEmail({
      from:    `"Maruša Reminder" <${process.env.MAIL_FROM || process.env.GMAIL_USER}>`,
      to,
      subject: 'Testni email — Maruša Reminder',
      text:    'Hej 👋\n\nGmail povezava deluje! Maruša Reminder je pripravljena.\n\n— Maruša Reminder',
    });
    res.json({ ok: true, message: 'Email poslan.' });
  } catch (err) {
    console.error('Test email napaka:', JSON.stringify({
      smtpHost:  SMTP_HOST,
      smtpPort:  SMTP_PORT,
      secure:    SMTP_SECURE,
      hasUser:   !!process.env.GMAIL_USER,
      hasPass:   !!process.env.GMAIL_APP_PASSWORD,
      recipient: to,
      errCode:   err.code,
      errMsg:    err.message,
    }));
    res.status(500).json({ ok: false, ...smtpErrorMessage(err) });
  }
});

// ── Start ─────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🌸 Maruša Reminder teče na http://localhost:${PORT}\n`);
  // Run SMTP diagnostics after server is up — non-blocking
  runSmtpDiagnostics().catch(() => {});
});
