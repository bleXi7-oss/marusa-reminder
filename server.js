require('dotenv').config();
const express    = require('express');
const rateLimit  = require('express-rate-limit');
const nodemailer = require('nodemailer');
const dns        = require('dns');
const fs         = require('fs');
const path       = require('path');
const crypto     = require('crypto');

// Persistence layer — driver selected by PERSISTENCE_DRIVER env var ("json" | "supabase")
const { loadReminders, saveReminders } = require('./src/persistence/remindersStore');

const app  = express();
const PORT = process.env.PORT || 3000;

const SMTP_HOST   = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT   = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_SECURE = process.env.SMTP_SECURE !== undefined
  ? process.env.SMTP_SECURE !== 'false'
  : SMTP_PORT === 465;

app.set('trust proxy', 1); // required for correct req.ip behind Render's proxy

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

console.log('[Startup config]', JSON.stringify({
  provider:      process.env.EMAIL_PROVIDER === 'resend' ? 'resend' : 'gmail-smtp',
  hasResendKey:  !!process.env.RESEND_API_KEY,
  hasMailFrom:   !!process.env.MAIL_FROM,
  hasDefaultTo:  !!process.env.DEFAULT_REMINDER_EMAIL,
  hasAccessCode: !!process.env.APP_ACCESS_CODE,
  smtpHost:      SMTP_HOST,
  smtpPort:      SMTP_PORT,
  smtpSecure:    SMTP_SECURE,
  hasUser:       !!process.env.GMAIL_USER,
  hasPassword:   !!process.env.GMAIL_APP_PASSWORD,
}));

// ── Error registry ────────────────────────────────────────────

const ERRORS = {
  'ERR-001': { message: 'Dostop zavrnjen.',                      action: 'Preveri APP_ACCESS_CODE v Render Environment Variables.' },
  'ERR-002': { message: 'Resend API key manjka.',                action: 'Render → Environment → dodaj RESEND_API_KEY.' },
  'ERR-003': { message: 'Pošiljanje prek Resend ni uspelo.',     action: 'Preveri RESEND_API_KEY, MAIL_FROM in Render logs.' },
  'ERR-004': { message: 'MAIL_FROM ni nastavljen.',              action: 'Render → Environment → nastavi MAIL_FROM.' },
  'ERR-005': { message: 'DEFAULT_REMINDER_EMAIL ni nastavljen.', action: 'Render → Environment → nastavi DEFAULT_REMINDER_EMAIL.' },
  'ERR-006': { message: 'Opomnik ni bil najden.',                action: 'Osveži aplikacijo.' },
  'ERR-007': { message: 'Opomnik ni bil shranjen.',              action: 'Preveri Render logs in shranjevanje podatkov.' },
  'ERR-008': { message: 'Email manjka ali ni veljaven.',         action: 'Vpiši email preden shraniš ali pošlješ opomnik.' },
  'ERR-009': { message: 'Datum manjka ali je neveljaven.',       action: 'Izberi pravilen datum in uro.' },
  'ERR-010': { message: 'Render/redeploy problem.',              action: 'Render → Manual Deploy → Deploy latest commit.' },
  'ERR-011': { message: 'GitHub ni posodobljen.',                action: 'Zaženi git status in git push.' },
  'ERR-012': { message: 'App spi na Render Free.',               action: 'Počakaj 30–60 sekund in osveži.' },
  'ERR-013': { message: 'Gmail SMTP blokiran.',                  action: 'Uporabi Resend ponudnika, ne Gmail SMTP.' },
  'ERR-014': { message: 'Parser ni našel datuma.',               action: 'Izberi datum ročno.' },
  'ERR-015': { message: 'Nepričakovana napaka.',                 action: 'Preveri Render logs.' },
  'ERR-016': { message: 'Preveč zahtevkov.',                    action: 'Počakaj 15 minut in poskusi znova.' },
};

function makeError(code, override = {}) {
  const e = ERRORS[code] || ERRORS['ERR-015'];
  return { ok: false, code, message: e.message, action: e.action, ...override };
}

// ── Rate limiting ─────────────────────────────────────────────

function rateLimitHandler(req, res) {
  res.status(429).json(makeError('ERR-016'));
}

const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         rateLimitHandler,
});

const testEmailLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             5,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         rateLimitHandler,
});

// ── Access control ────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (!process.env.APP_ACCESS_CODE) return next();
  if (req.headers['x-app-code'] === process.env.APP_ACCESS_CODE) return next();
  return res.status(401).json(makeError('ERR-001'));
}

// ── Email validation ──────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    if (!process.env.RESEND_API_KEY) return makeError('ERR-002');
    return null;
  }
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return makeError('ERR-015', {
      message: 'Manjkajo Gmail SMTP nastavitve.',
      action:  'Nastavi GMAIL_USER in GMAIL_APP_PASSWORD v .env.',
    });
  }
  return null;
}

function smtpErrorMessage(err) {
  if (err.resendError) return makeError('ERR-003');

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
    return makeError('ERR-015', {
      message: 'Gmail prijava ni uspela.',
      action:  'Preveri Gmail App Password v .env.',
    });
  }

  if (code === 'ENOTFOUND' || code === 'EHOSTUNREACH') {
    return makeError('ERR-013', {
      message: 'SMTP strežnika ni mogoče najti.',
      action:  'Preveri SMTP_HOST nastavitev.',
    });
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
    return makeError('ERR-013');
  }

  return makeError('ERR-015');
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

async function runSmtpDiagnostics() {
  if (process.env.EMAIL_PROVIDER === 'resend') {
    console.log('[SMTP diagnostics] Preskočeno — EMAIL_PROVIDER=resend.');
    return;
  }

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
  let reminders;
  try {
    reminders = await loadReminders();
  } catch (err) {
    console.error('[checkReminders] Napaka nalaganja:', err.message);
    return;
  }

  const now     = Date.now();
  const pending = reminders.filter(r => !r.sent);

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

    if (r.followUp && r.followUp.enabled && !r.followUp.sentAt) {
      const followUpTime = new Date(r.remindAt).getTime() + r.followUp.delayMinutes * 60000;
      if (followUpTime <= now) {
        console.log(`  → Pošiljam nadaljnji opomnik: "${r.title}"`);
        try {
          await sendEmail({
            from:    `"Maruša Reminder" <${process.env.MAIL_FROM || process.env.GMAIL_USER}>`,
            to:      r.email,
            subject: `Nadaljnji opomnik: ${r.title}`,
            text: [
              'Hej 👋',
              '',
              'To je tvoj nadaljnji opomnik:',
              '',
              r.title,
              '',
              r.description ? `Opis:\n${r.description}` : null,
              '',
              `Prvotni čas:\n${formatDate(r.remindAt)}`,
              '',
              '— Maruša Reminder',
            ].filter(l => l !== null).join('\n'),
          });
          r.followUp.sentAt = new Date().toISOString();
          changed = true;
          console.log(`  ✓ Nadaljnji opomnik poslan: "${r.title}"`);
        } catch (err) {
          console.error(`  ✗ Napaka pri nadaljnjem opomniku "${r.title}":`, JSON.stringify({
            errCode: err.code,
            errMsg:  err.message,
          }));
        }
      }
    }
  }

  if (changed) {
    try {
      await saveReminders(reminders);
    } catch (err) {
      console.error('[checkReminders] Napaka shranjevanja:', err.message);
    }
  }
}

checkAndSendReminders().catch(err => console.error('[checkReminders] Napaka:', err.message));
setInterval(
  () => checkAndSendReminders().catch(err => console.error('[checkReminders] Napaka:', err.message)),
  60 * 1000
);

// ── API Routes ────────────────────────────────────────────────

// Unprotected: returns app status for frontend init (no secrets)
app.get('/api/health', (req, res) => {
  res.json({
    ok:        true,
    protected: !!process.env.APP_ACCESS_CODE,
  });
});

// Protected: verifies access code (used by frontend unlock flow)
app.get('/api/auth', authLimiter, requireAuth, (req, res) => {
  res.json({ ok: true });
});

// Protected: safe SMTP/provider config check
app.get('/api/email-status', requireAuth, (req, res) => {
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

// Protected: live SMTP diagnostic (only useful when using Gmail fallback)
app.get('/api/smtp-test', requireAuth, async (req, res) => {
  const configErr = checkEmailConfig();
  if (configErr) return res.json({ ok: false, ...configErr, elapsedMs: 0 });

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
    console.log('[smtp-test] OK', JSON.stringify({ smtpHost: SMTP_HOST, smtpPort: SMTP_PORT, secure: SMTP_SECURE, elapsedMs }));
    res.json({ ok: true, message: 'SMTP povezava uspešna.', smtpHost: SMTP_HOST, smtpPort: SMTP_PORT, smtpSecure: SMTP_SECURE, dns: dnsResult, elapsedMs });
  } catch (err) {
    const elapsedMs = Date.now() - start;
    console.error('[smtp-test] Napaka:', JSON.stringify({ smtpHost: SMTP_HOST, smtpPort: SMTP_PORT, secure: SMTP_SECURE, errCode: err.code, errMsg: err.message, elapsedMs }));
    res.json({ ok: false, ...smtpErrorMessage(err), smtpHost: SMTP_HOST, smtpPort: SMTP_PORT, smtpSecure: SMTP_SECURE, dns: dnsResult, elapsedMs });
  }
});

app.get('/api/reminders', requireAuth, async (req, res) => {
  try {
    res.json(await loadReminders());
  } catch (err) {
    console.error('Napaka nalaganja:', err.message);
    res.status(500).json(makeError('ERR-015'));
  }
});

app.post('/api/reminders', requireAuth, async (req, res) => {
  const { title, description, remindAt, email, followUp } = req.body;

  if (!title)    return res.status(400).json(makeError('ERR-007', { message: 'Naslov opomnika je obvezen.' }));
  if (!remindAt) return res.status(400).json(makeError('ERR-009'));
  if (!email)    return res.status(400).json(makeError('ERR-008', { message: 'Email za opomnik manjka.', action: 'Vpiši email preden shraniš opomnik.' }));
  if (!EMAIL_RE.test(email)) return res.status(400).json(makeError('ERR-008', { message: 'Email ni veljaven.', action: 'Vpiši pravilen email naslov.' }));

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

  if (followUp && followUp.enabled && typeof followUp.delayMinutes === 'number' && followUp.delayMinutes > 0) {
    reminder.followUp = { enabled: true, delayMinutes: followUp.delayMinutes, sentAt: null };
  }

  try {
    const reminders = await loadReminders();
    reminders.push(reminder);
    await saveReminders(reminders);
    res.json(reminder);
  } catch (err) {
    console.error('Napaka shranjevanja:', err.message);
    res.status(500).json(makeError('ERR-007'));
  }
});

app.delete('/api/reminders/:id', requireAuth, async (req, res) => {
  try {
    const reminders = await loadReminders();
    const filtered  = reminders.filter(r => r.id !== req.params.id);

    if (filtered.length === reminders.length) {
      return res.status(404).json(makeError('ERR-006'));
    }

    await saveReminders(filtered);
    res.json({ ok: true });
  } catch (err) {
    console.error('Napaka brisanja:', err.message);
    res.status(500).json(makeError('ERR-015'));
  }
});

app.patch('/api/reminders/:id', requireAuth, async (req, res) => {
  const { title, description, remindAt, email, followUp } = req.body;

  try {
    const reminders = await loadReminders();
    const idx = reminders.findIndex(r => r.id === req.params.id);

    if (idx === -1) return res.status(404).json(makeError('ERR-006'));

    const reminder = reminders[idx];

    if (title !== undefined)       reminder.title       = title;
    if (description !== undefined) reminder.description = description;
    if (email !== undefined) {
      if (!EMAIL_RE.test(email)) return res.status(400).json(makeError('ERR-008', { message: 'Email ni veljaven.' }));
      reminder.email = email;
    }
    if (remindAt !== undefined) {
      if (isNaN(new Date(remindAt).getTime())) return res.status(400).json(makeError('ERR-009'));
      reminder.remindAt = remindAt;
      if (new Date(remindAt).getTime() > Date.now()) {
        reminder.sent   = false;
        reminder.sentAt = null;
        if (reminder.followUp) reminder.followUp.sentAt = null;
      }
    }

    if (followUp !== undefined) {
      if (!followUp || !followUp.enabled || !followUp.delayMinutes) {
        reminder.followUp = null;
      } else {
        reminder.followUp = {
          enabled:      true,
          delayMinutes: followUp.delayMinutes,
          sentAt:       reminder.followUp ? reminder.followUp.sentAt : null,
        };
      }
    }

    await saveReminders(reminders);
    res.json(reminder);
  } catch (err) {
    console.error('Napaka shranjevanja:', err.message);
    res.status(500).json(makeError('ERR-007'));
  }
});

app.post('/api/reminders/:id/send-now', requireAuth, async (req, res) => {
  let reminders;
  try {
    reminders = await loadReminders();
  } catch (err) {
    console.error('Napaka nalaganja:', err.message);
    return res.status(500).json(makeError('ERR-015'));
  }

  const reminder = reminders.find(r => r.id === req.params.id);
  if (!reminder) return res.status(404).json(makeError('ERR-006'));

  const configErr = checkEmailConfig();
  if (configErr) return res.status(400).json(configErr);

  try {
    await sendReminderEmail(reminder);
    reminder.sent   = true;
    reminder.sentAt = new Date().toISOString();
    await saveReminders(reminders);
    res.json({ ok: true, message: 'Email poslan.' });
  } catch (err) {
    console.error('Napaka pošiljanja:', JSON.stringify({
      provider:  process.env.EMAIL_PROVIDER || 'gmail-smtp',
      recipient: reminder.email,
      errCode:   err.code,
      errMsg:    err.message,
    }));
    res.status(500).json(smtpErrorMessage(err));
  }
});

app.post('/api/test-email', testEmailLimiter, requireAuth, async (req, res) => {
  const to = req.body.email || process.env.DEFAULT_REMINDER_EMAIL;

  if (!to) return res.status(400).json(makeError('ERR-008', { message: 'Manjka email naslov.' }));
  if (!EMAIL_RE.test(to)) return res.status(400).json(makeError('ERR-008', { message: 'Email naslov ni veljaven.' }));

  const configErr = checkEmailConfig();
  if (configErr) return res.status(400).json(configErr);

  try {
    await sendEmail({
      from:    `"Maruša Reminder" <${process.env.MAIL_FROM || process.env.GMAIL_USER}>`,
      to,
      subject: 'Testni email — Maruša Reminder',
      text:    'Hej 👋\n\nEmail pošiljanje deluje! Maruša Reminder je pripravljena.\n\n— Maruša Reminder',
    });
    res.json({ ok: true, message: 'Email poslan.' });
  } catch (err) {
    console.error('Test email napaka:', JSON.stringify({
      provider:  process.env.EMAIL_PROVIDER || 'gmail-smtp',
      recipient: to,
      errCode:   err.code,
      errMsg:    err.message,
    }));
    res.status(500).json(smtpErrorMessage(err));
  }
});

// Protected: export all reminders as a downloadable JSON file
app.get('/api/reminders/export', requireAuth, async (req, res) => {
  try {
    const reminders = await loadReminders();
    res.setHeader('Content-Disposition', 'attachment; filename="reminders-backup.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(reminders, null, 2));
  } catch (err) {
    console.error('Napaka izvoza:', err.message);
    res.status(500).json(makeError('ERR-015'));
  }
});

// ── Start ─────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🌸 Maruša Reminder teče na http://localhost:${PORT}\n`);
  runSmtpDiagnostics().catch(() => {});
});
