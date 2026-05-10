require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'reminders.json');

// SMTP configuration — defaults to Gmail port 465 (TLS)
const SMTP_HOST   = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT   = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_SECURE = process.env.SMTP_SECURE !== undefined
  ? process.env.SMTP_SECURE !== 'false'
  : SMTP_PORT === 465;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Log safe SMTP config on startup (no secrets)
console.log('[Email config]', JSON.stringify({
  smtpHost:    SMTP_HOST,
  smtpPort:    SMTP_PORT,
  smtpSecure:  SMTP_SECURE,
  hasUser:     !!process.env.GMAIL_USER,
  hasPassword: !!process.env.GMAIL_APP_PASSWORD,
  hasMailFrom: !!process.env.MAIL_FROM,
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

// ── Email helpers ─────────────────────────────────────────────

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

function checkEmailConfig() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return {
      message: 'Manjkajo email nastavitve v Render Environment Variables.',
      code:    'MISSING_CONFIG',
    };
  }
  return null;
}

function smtpErrorMessage(err) {
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
    return {
      message: 'Gmail prijava ni uspela. Preveri Gmail App Password.',
      code:    'AUTH_ERROR',
    };
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
    return {
      message: 'Povezava do Gmail SMTP ni uspela. Hosting lahko blokira SMTP povezavo.',
      code:    'CONNECTION_ERROR',
    };
  }

  return {
    message: 'Pošiljanje emaila ni uspelo. Preveri Render logs.',
    code:    'UNKNOWN_ERROR',
  };
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString('sl-SI', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function sendReminderEmail(reminder) {
  const transporter = createTransporter();
  const dateFormatted = formatDate(reminder.remindAt);

  await transporter.sendMail({
    from: `"Maruša Reminder" <${process.env.MAIL_FROM || process.env.GMAIL_USER}>`,
    to: reminder.email,
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
      `Čas:\n${dateFormatted}`,
      '',
      '— Maruša Reminder',
    ].join('\n'),
  });
}

// ── Reminder checker (runs every 60s) ─────────────────────────

async function checkAndSendReminders() {
  const reminders = loadReminders();
  const now = Date.now();
  const pending = reminders.filter(r => !r.sent);

  console.log(`[${new Date().toLocaleString('sl-SI')}] Strežniški čas. Preverjam ${pending.length} opomnikov.`);

  let changed = false;

  for (const r of reminders) {
    if (!r.sent && new Date(r.remindAt).getTime() <= now) {
      console.log(`  → Pošiljam: "${r.title}" (nastavljeno za ${new Date(r.remindAt).toLocaleString('sl-SI')})`);
      try {
        await sendReminderEmail(r);
        r.sent = true;
        r.sentAt = new Date().toISOString();
        changed = true;
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
    provider:               'gmail-smtp',
    hasGmailUser:           !!process.env.GMAIL_USER,
    hasAppPassword:         !!process.env.GMAIL_APP_PASSWORD,
    hasMailFrom:            !!process.env.MAIL_FROM,
    hasDefaultReminderEmail: !!process.env.DEFAULT_REMINDER_EMAIL,
    smtpHost:               SMTP_HOST,
    smtpPort:               SMTP_PORT,
    smtpSecure:             SMTP_SECURE,
  });
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
    id: crypto.randomUUID(),
    title,
    description: description || '',
    remindAt,
    email,
    sent: false,
    sentAt: null,
    createdAt: new Date().toISOString(),
  };

  const reminders = loadReminders();
  reminders.push(reminder);
  saveReminders(reminders);

  res.json(reminder);
});

app.delete('/api/reminders/:id', (req, res) => {
  const reminders = loadReminders();
  const filtered = reminders.filter(r => r.id !== req.params.id);

  if (filtered.length === reminders.length) {
    return res.status(404).json({ error: 'Opomnik ni bil najden.' });
  }

  saveReminders(filtered);
  res.json({ ok: true });
});

app.post('/api/reminders/:id/send-now', async (req, res) => {
  const reminders = loadReminders();
  const reminder = reminders.find(r => r.id === req.params.id);

  if (!reminder) {
    return res.status(404).json({ ok: false, message: 'Opomnik ni bil najden.', code: 'NOT_FOUND' });
  }

  const configErr = checkEmailConfig();
  if (configErr) {
    return res.status(400).json({ ok: false, ...configErr });
  }

  try {
    await sendReminderEmail(reminder);
    reminder.sent = true;
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
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"Maruša Reminder" <${process.env.MAIL_FROM || process.env.GMAIL_USER}>`,
      to,
      subject: 'Testni email — Maruša Reminder',
      text: 'Hej 👋\n\nGmail povezava deluje! Maruša Reminder je pripravljena.\n\n— Maruša Reminder',
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
});
