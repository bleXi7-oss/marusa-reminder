require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'reminders.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Data helpers ──────────────────────────────────────────────

function loadReminders() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    // If file is missing or broken, start fresh
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

// ── Email helper ──────────────────────────────────────────────

function createTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
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
        console.error(`  ✗ Napaka pri pošiljanju "${r.title}":`, err.message);
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
    return res.status(404).json({ error: 'Opomnik ni bil najden.' });
  }

  try {
    await sendReminderEmail(reminder);
    reminder.sent = true;
    reminder.sentAt = new Date().toISOString();
    saveReminders(reminders);
    res.json({ ok: true });
  } catch (err) {
    console.error('Napaka pošiljanja:', err.message);
    res.status(500).json({ error: 'Gmail pošiljanje ni uspelo. Preveri App Password v .env.' });
  }
});

app.post('/api/test-email', async (req, res) => {
  const to = req.body.email || process.env.DEFAULT_REMINDER_EMAIL;

  if (!to) {
    return res.status(400).json({ error: 'Manjka email naslov.' });
  }

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"Maruša Reminder" <${process.env.MAIL_FROM || process.env.GMAIL_USER}>`,
      to,
      subject: 'Testni email — Maruša Reminder',
      text: 'Hej 👋\n\nGmail povezava deluje! Maruša Reminder je pripravljena.\n\n— Maruša Reminder',
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Test email napaka:', err.message);
    res.status(500).json({ error: 'Gmail povezava ni uspela. Preveri App Password v .env.' });
  }
});

// ── Start ─────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🌸 Maruša Reminder teče na http://localhost:${PORT}\n`);
});
