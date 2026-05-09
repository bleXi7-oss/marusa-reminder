// ── Helpers ───────────────────────────────────────────────────

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString('sl-SI', {
    weekday: 'short', day: 'numeric', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function getStatus(reminder) {
  if (reminder.sent) return 'sent';
  if (new Date(reminder.remindAt) < new Date()) return 'overdue';
  return 'waiting';
}

function statusLabel(status) {
  if (status === 'sent')    return { text: 'Poslano',  cls: 'badge-sent' };
  if (status === 'overdue') return { text: 'Zamuja',   cls: 'badge-overdue' };
  return                           { text: 'Čaka',     cls: 'badge-waiting' };
}

function showMessage(el, text, type) {
  el.textContent = text;
  el.className = `message ${type}`;
  setTimeout(() => { el.className = 'message hidden'; }, 4500);
}

// ── Smart Reminder Parser ─────────────────────────────────────

const GREETING_RE  = /^(zdravo|živjo|hej|hello|hi\b|lep pozdrav|dober dan|dear\b|pozdravljeni)[,!.\s]*/i;
const SIGNATURE_RE = /\n[ \t]*(lep pozdrav|l\.?p\.?|s spoštovanjem|best regards|kind regards|regards|cheers|hvala in lep pozdrav)[^\n]*/gi;
const ACTION_WORDS = ['pokliči','poklic','pošlji','posreduj','preveri','preglej','pripravi','oddaj','pošljite','sestanek','meeting','call','send','submit','check','review','prepare'];

const BUSINESS_KEYWORDS = [
  { re: /\brač(un|una|unu|une|uni)\b|\binvoice\b/i,           label: 'račun' },
  { re: /\bplačil|\bpayment\b|\bunpaid\b|\boverdue\b/i,       label: 'plačilo' },
  { re: /\bdobavnic|\bdelivery note\b/i,                       label: 'dobavnica' },
  { re: /\bponudba|\bponudb|\bquotation\b|\bquote\b/i,        label: 'ponudba' },
  { re: /\bnaročiln|\border confirmation\b/i,                 label: 'naročilnica' },
  { re: /\bddv\b|\bvat\b/i,                                   label: 'DDV' },
  { re: /\bfollow.?up\b/i,                                    label: 'follow-up' },
  { re: /\bknjig|\baccounting\b/i,                            label: 'računovodstvo' },
  { re: /\bstranka|\bcustomer\b|\bclient\b/i,                 label: 'stranka' },
  { re: /\bdobavitelj|\bsupplier\b|\bvendor\b/i,              label: 'dobavitelj' },
];

const SL_DAYS = [
  [/\bponedeljk/i, 1], [/\btorek|\btork/i, 2], [/\bsred/i, 3],
  [/\bčetr/i, 4], [/\bpetek|\bpetk/i, 5], [/\bsobot/i, 6], [/\bnedelj/i, 0],
];
const EN_DAYS = [
  [/\bmonday/i, 1], [/\btuesday/i, 2], [/\bwednesday/i, 3],
  [/\bthursday/i, 4], [/\bfriday/i, 5], [/\bsaturday/i, 6], [/\bsunday/i, 0],
];
const SL_MONTHS = [
  ['januar', 1], ['februar', 2], ['marc', 3],   ['april', 4],
  ['maj',    5], ['junij',   6], ['julij',  7],  ['avgust', 8],
  ['septem', 9], ['oktob',  10], ['novem',  11], ['decem',  12],
];
const EN_MONTHS = {
  january:1, february:2, march:3, april:4, may:5, june:6,
  july:7, august:8, september:9, october:10, november:11, december:12,
  jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
};

function getNextWeekday(targetDay, forceNext) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let diff = targetDay - today.getDay();
  if (diff < 0 || (forceNext && diff === 0)) diff += 7;
  const d = new Date(today);
  d.setDate(today.getDate() + diff);
  return d;
}

function extractTime(text) {
  const lower = text.toLowerCase();

  const ampm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const min = ampm[2] ? parseInt(ampm[2], 10) : 0;
    if (ampm[3].toLowerCase() === 'am' && h === 12) h = 0;
    if (ampm[3].toLowerCase() === 'pm' && h !== 12) h += 12;
    return { hour: h, minute: min };
  }

  const ob = text.match(/(?:ob|at|@)\s*(\d{1,2})(?:[.:](\d{2})|h)?\b/i);
  if (ob) {
    const h = parseInt(ob[1], 10);
    const min = ob[2] ? parseInt(ob[2], 10) : 0;
    if (h >= 0 && h <= 23) return { hour: h, minute: min };
  }

  const okoli = text.match(/(?:okoli|okrog)\s+(\d{1,2})(?:[.:](\d{2}))?\b/i);
  if (okoli) {
    const h = parseInt(okoli[1], 10);
    const min = okoli[2] ? parseInt(okoli[2], 10) : 0;
    if (h >= 0 && h <= 23) return { hour: h, minute: min };
  }

  if (/\beod\b|\bcob\b|konec dneva|do konca dneva/.test(lower)) return { hour: 16, minute: 0 };
  if (/\bopoldne\b|\bnoon\b/.test(lower))                        return { hour: 12, minute: 0 };
  if (/zgodaj zjutraj|early morning/.test(lower))                return { hour:  7, minute: 0 };
  if (/\bzjutraj\b|\bmorning\b/.test(lower))                     return { hour:  9, minute: 0 };
  if (/\bdopoldne\b/.test(lower))                                return { hour:  9, minute: 0 };
  if (/\bpopoldne\b|\bafternoon\b/.test(lower))                  return { hour: 14, minute: 0 };
  if (/\bzvečer\b|\bevening\b/.test(lower))                      return { hour: 18, minute: 0 };

  return null;
}

function extractRelativeMinutes(text) {
  const lower = text.toLowerCase();
  if (/čez\s+pol\s+ure/.test(lower))         return 30;
  const minM = lower.match(/čez\s+(\d+)\s+minut/);
  if (minM)                                  return parseInt(minM[1]);
  if (/čez\s+eno\s+uro/.test(lower))         return 60;
  const hrM = lower.match(/čez\s+(\d+)\s+ur[oa]?\b/);
  if (hrM)                                   return parseInt(hrM[1]) * 60;
  const enHr = lower.match(/\bin\s+(\d+)\s+hour/);
  if (enHr)                                  return parseInt(enHr[1]) * 60;
  const enMin = lower.match(/\bin\s+(\d+)\s+minut/);
  if (enMin)                                 return parseInt(enMin[1]);
  return null;
}

function extractDate(text) {
  const lower = text.toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const exact    = d => ({ date: d, tier: 'exact'    });
  const relative = d => ({ date: d, tier: 'relative' });
  const weekday  = d => ({ date: d, tier: 'weekday'  });
  const vague    = d => ({ date: d, tier: 'vague'    });

  if (/\bdanes\b|\btoday\b/.test(lower))    return relative(new Date(today));

  if (/\bjutri\b|\btomorrow\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 1); return relative(d);
  }
  if (/\bpojutrišnjem\b|\bday after tomorrow\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 2); return relative(d);
  }

  if (/čez\s+en\s+dan/.test(lower))  { const d = new Date(today); d.setDate(d.getDate() + 1); return relative(d); }
  if (/čez\s+dva\s+dn/.test(lower))  { const d = new Date(today); d.setDate(d.getDate() + 2); return relative(d); }
  if (/čez\s+tri\s+dn/.test(lower))  { const d = new Date(today); d.setDate(d.getDate() + 3); return relative(d); }

  const cezDni = lower.match(/čez\s+(\d+)\s+dn/);
  if (cezDni) { const d = new Date(today); d.setDate(d.getDate() + parseInt(cezDni[1])); return relative(d); }

  const cezTed = lower.match(/čez\s+(\d+)\s+ted/);
  if (cezTed) { const d = new Date(today); d.setDate(d.getDate() + parseInt(cezTed[1]) * 7); return relative(d); }
  if (/čez\s+en\s+ted|čez\s+ted/.test(lower)) { const d = new Date(today); d.setDate(d.getDate() + 7); return relative(d); }

  const inDays = lower.match(/\bin\s+(\d+)\s+day/);
  if (inDays) { const d = new Date(today); d.setDate(d.getDate() + parseInt(inDays[1])); return relative(d); }
  const inWeeks = lower.match(/\bin\s+(\d+)\s+week/);
  if (inWeeks) { const d = new Date(today); d.setDate(d.getDate() + parseInt(inWeeks[1]) * 7); return relative(d); }

  const yyyySlash = text.match(/\b(\d{4})\/(\d{2})\/(\d{2})\b/);
  if (yyyySlash) return exact(new Date(+yyyySlash[1], +yyyySlash[2]-1, +yyyySlash[3]));

  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return exact(new Date(+iso[1], +iso[2]-1, +iso[3]));

  const dmyDash = text.match(/\b(\d{1,2})-(\d{2})-(\d{4})\b/);
  if (dmyDash) return exact(new Date(+dmyDash[3], +dmyDash[2]-1, +dmyDash[1]));

  const dmyFull = text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  if (dmyFull) return exact(new Date(+dmyFull[3], +dmyFull[2]-1, +dmyFull[1]));

  const slashFull = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (slashFull) return exact(new Date(+slashFull[3], +slashFull[2]-1, +slashFull[1]));

  const dmyShort = text.match(/\b(\d{1,2})\.(\d{1,2})\.?(?!\d)/);
  if (dmyShort) {
    const d = new Date(today.getFullYear(), +dmyShort[2]-1, +dmyShort[1]);
    if (d < today) d.setFullYear(d.getFullYear() + 1);
    return exact(d);
  }

  const slashShort = text.match(/\b(\d{1,2})\/(\d{1,2})\b(?!\/\d)/);
  if (slashShort && +slashShort[1] <= 31 && +slashShort[2] <= 12) {
    const d = new Date(today.getFullYear(), +slashShort[2]-1, +slashShort[1]);
    if (d < today) d.setFullYear(d.getFullYear() + 1);
    return exact(d);
  }

  const dmShort = text.match(/\b(\d{1,2})-(\d{1,2})\b(?!-)/);
  if (dmShort && +dmShort[1] <= 31 && +dmShort[2] >= 1 && +dmShort[2] <= 12) {
    const d = new Date(today.getFullYear(), +dmShort[2]-1, +dmShort[1]);
    if (d < today) d.setFullYear(d.getFullYear() + 1);
    return exact(d);
  }

  for (const [stem, mNum] of SL_MONTHS) {
    const m = lower.match(new RegExp(`(\\d{1,2})\\.?\\s+${stem}`, 'i'));
    if (m) {
      const d = new Date(today.getFullYear(), mNum-1, +m[1]);
      if (d < today) d.setFullYear(d.getFullYear() + 1);
      return exact(d);
    }
  }

  for (const [mName, mNum] of Object.entries(EN_MONTHS)) {
    const m1 = text.match(new RegExp(`\\b${mName}\\s+(\\d{1,2})\\b`, 'i'));
    const m2 = text.match(new RegExp(`\\b(\\d{1,2})\\s+${mName}\\b`, 'i'));
    const day = m1 ? +m1[1] : (m2 ? +m2[1] : null);
    if (day) {
      const d = new Date(today.getFullYear(), mNum-1, day);
      if (d < today) d.setFullYear(d.getFullYear() + 1);
      return exact(d);
    }
  }

  if (/naslednji teden|drug teden|next week/.test(lower))
    return vague(getNextWeekday(1, true));
  if (/do konca tedna|konec tedna|end of (this )?week/.test(lower))
    return vague(getNextWeekday(5, false));

  const forceNext = /naslednji/.test(lower);
  for (const [re, dayNum] of SL_DAYS) {
    if (re.test(lower)) return weekday(getNextWeekday(dayNum, forceNext));
  }
  for (const [re, dayNum] of EN_DAYS) {
    if (re.test(lower)) return weekday(getNextWeekday(dayNum, /\bnext\b/.test(lower)));
  }

  if (/konec dneva|do konca dneva|\beod\b|\bcob\b/.test(lower))
    return relative(new Date(today));

  return { date: null, tier: null };
}

function detectUrgency(text) {
  return /\bnujno\b|\burgent\b|\basap\b|\btakoj\b|\bčim prej\b|\bimmediately\b/.test(text.toLowerCase());
}

function countDateSignals(text) {
  let n = 0;
  if (/\bdanes\b|\btoday\b/i.test(text))   n++;
  if (/\bjutri\b|\btomorrow\b/i.test(text)) n++;
  if (/\d{1,2}\.\d{1,2}/.test(text))       n++;
  if (/\d{1,2}\/\d{1,2}/.test(text))       n++;
  for (const [re] of [...SL_DAYS, ...EN_DAYS]) if (re.test(text)) { n++; break; }
  return n;
}

function detectBusinessContext(text) {
  for (const { re, label } of BUSINESS_KEYWORDS) {
    if (re.test(text)) return label;
  }
  return null;
}

function extractTitle(text, businessContext) {
  const cleaned = text.replace(SIGNATURE_RE, '').trim();

  const subj = cleaned.match(/^(?:subject|zadeva):\s*(.+)/im);
  if (subj) return subj[1].trim().slice(0, 80);

  const SKIP_RE = /^(zdravo|živjo|hej|hello|hi\b|pozdravljeni|hvala|lep pozdrav|lp\b|dear\b)/i;
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const noGreeting = line.replace(GREETING_RE, '').trim();
    if (noGreeting.length < 4) continue;
    if (SKIP_RE.test(noGreeting)) continue;
    const lc = noGreeting.toLowerCase();
    if (ACTION_WORDS.some(w => lc.startsWith(w))) return noGreeting.slice(0, 80);
    return noGreeting.slice(0, 80);
  }

  if (businessContext) return `Preveri ${businessContext}`;
  return cleaned.slice(0, 80).trim();
}

function extractDescription(text) {
  const SKIP_RE = /^(zdravo|živjo|hej|hello|hi\b|pozdravljeni|hvala|lp\b|lep pozdrav|dear\b|s spoštovanjem)/i;
  const cleaned = text.replace(SIGNATURE_RE, '').trim();
  const lines = cleaned.split('\n')
    .map(l => l.trim())
    .filter(l => l.length >= 8)
    .filter(l => !SKIP_RE.test(l))
    .filter(l => !/^(?:subject|zadeva):/i.test(l));
  return lines.slice(0, 2).join(' ').replace(/\s+/g, ' ').slice(0, 140).trim();
}

function applyReminderOffset(date, offset) {
  const d = new Date(date);
  if (offset === '1h') d.setHours(d.getHours() - 1);
  if (offset === '1d') d.setDate(d.getDate() - 1);
  if (offset === '2d') d.setDate(d.getDate() - 2);
  if (offset === '3d') d.setDate(d.getDate() - 3);
  if (offset === '1w') d.setDate(d.getDate() - 7);
  return d;
}

function applyCustomReminderOffset(eventDate, amount, unit) {
  const d = new Date(eventDate);
  const n = parseInt(amount, 10);
  if      (unit === 'minut')   d.setMinutes(d.getMinutes() - n);
  else if (unit === 'ur')      d.setHours(d.getHours() - n);
  else if (unit === 'dni')     d.setDate(d.getDate() - n);
  else if (unit === 'tednov')  d.setDate(d.getDate() - n * 7);
  return d;
}

function parseSmartReminderText(text, offset) {
  const businessContext = detectBusinessContext(text);
  const title           = extractTitle(text, businessContext);
  const description     = extractDescription(text);

  // Sub-hour relative: "čez pol ure", "čez 30 minut", "in 2 hours" — no offset applied
  const relMins = extractRelativeMinutes(text);
  if (relMins !== null) {
    const now = new Date();
    now.setSeconds(0, 0);
    now.setMinutes(now.getMinutes() + relMins);
    return { title, eventDate: now, remindAt: now, description, confidence: 'high', warning: null, businessContext };
  }

  const { date: rawDate, tier } = extractDate(text);
  const timeResult = extractTime(text);
  const multiDate  = countDateSignals(text) >= 2;
  const urgent     = detectUrgency(text);

  if (!rawDate) {
    return {
      title, eventDate: null, remindAt: null, description, confidence: 'none', businessContext,
      warning: urgent ? 'Videti je nujno, ampak datuma nisem našla. Izberi datum ročno.' : null,
    };
  }

  // Build event date+time
  const eventDate = new Date(rawDate);
  eventDate.setHours(
    timeResult ? timeResult.hour   : 9,
    timeResult ? timeResult.minute : 0,
    0, 0
  );

  let confidence;
  if      (tier === 'exact' && timeResult)           confidence = 'high';
  else if (tier === 'exact' || tier === 'relative')  confidence = 'medium';
  else if (tier === 'weekday')                       confidence = 'medium';
  else                                               confidence = 'low';

  const warning = multiDate ? 'Našla sem več možnih datumov. Preveri, če je izbran pravi.' : null;

  return {
    title,
    eventDate,
    remindAt: applyReminderOffset(new Date(eventDate), offset),
    description, confidence, warning, businessContext,
  };
}

function toDatetimeLocalValue(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16);
}

// ── Render reminders ──────────────────────────────────────────

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderCard(r) {
  const status = getStatus(r);
  const { text, cls } = statusLabel(status);
  const card = document.createElement('div');
  card.className = `reminder-card${status === 'sent' ? ' sent' : ''}`;
  card.innerHTML = `
    <div class="card-header">
      <div class="card-title">${escHtml(r.title)}</div>
      <span class="badge ${cls}">${text}</span>
    </div>
    ${r.description ? `<div class="card-desc">${escHtml(r.description)}</div>` : ''}
    <div class="card-time">🕐 ${formatDate(r.remindAt)}</div>
    <div class="card-actions">
      ${status !== 'sent' ? `<button class="btn-small" onclick="sendNow('${r.id}', this)">Pošlji zdaj</button>` : ''}
      <button class="btn-small danger" onclick="deleteReminder('${r.id}', this)">Izbriši</button>
    </div>
  `;
  return card;
}

function renderAll(reminders) {
  const upcoming = reminders.filter(r => !r.sent);
  const sent     = reminders.filter(r => r.sent);
  const upcomingList = document.getElementById('upcomingList');
  const sentList     = document.getElementById('sentList');

  upcomingList.innerHTML = '';
  sentList.innerHTML = '';

  if (upcoming.length === 0) {
    upcomingList.innerHTML = '<div class="empty">Ni še nobenih opomnikov 😄</div>';
  } else {
    upcoming.sort((a, b) => new Date(a.remindAt) - new Date(b.remindAt));
    upcoming.forEach(r => upcomingList.appendChild(renderCard(r)));
  }

  if (sent.length === 0) {
    sentList.innerHTML = '<div class="empty">Še ni poslanih opomnikov.</div>';
  } else {
    sent.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
    sent.forEach(r => sentList.appendChild(renderCard(r)));
  }
}

async function loadReminders() {
  try {
    const res = await fetch('/api/reminders');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderAll(await res.json());
  } catch (err) {
    console.error('Napaka pri nalaganju opomnikov:', err.message);
  }
}

// ── Actions ───────────────────────────────────────────────────

async function sendNow(id, btn) {
  btn.disabled = true;
  btn.textContent = 'Pošiljam…';
  try {
    const res  = await fetch(`/api/reminders/${id}/send-now`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Napaka');
    await loadReminders();
  } catch (err) {
    alert(err.message || 'Pošiljanje ni uspelo. Preveri Gmail nastavitve.');
    btn.disabled = false;
    btn.textContent = 'Pošlji zdaj';
  }
}

async function deleteReminder(id, btn) {
  if (!confirm('Izbriši ta opomnik?')) return;
  btn.disabled = true;
  try {
    await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
    await loadReminders();
  } catch {
    btn.disabled = false;
  }
}

// ── Form save ─────────────────────────────────────────────────

async function savePendingReminder() {
  const title    = document.getElementById('title').value.trim();
  const desc     = document.getElementById('description').value.trim();
  const localVal = document.getElementById('remindAt').value;
  const remindAt = localVal ? new Date(localVal).toISOString() : '';
  const email    = document.getElementById('email').value.trim();
  const msg      = document.getElementById('formMessage');

  if (!title || !remindAt || !email) {
    exitPreviewMode();
    showMessage(msg, 'Prosim izpolni naslov, datum in email.', 'error');
    return;
  }

  exitPreviewMode();

  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Shranjujem…';

  try {
    const res  = await fetch('/api/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description: desc, remindAt, email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Napaka');

    document.getElementById('title').value = '';
    document.getElementById('description').value = '';
    document.getElementById('smartText').value = '';

    const nextDay = new Date();
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(9, 0, 0, 0);
    document.getElementById('remindAt').value = toDatetimeLocalValue(nextDay);

    showMessage(msg, '✓ Opomnik shranjen!', 'success');
    await loadReminders();
  } catch (err) {
    showMessage(msg, err.message || 'Shranjevanje ni uspelo.', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Shrani opomnik';
  }
}

document.getElementById('saveBtn').addEventListener('click', savePendingReminder);

document.getElementById('testEmailBtn').addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  const msg   = document.getElementById('formMessage');
  const btn   = document.getElementById('testEmailBtn');

  btn.disabled = true;
  btn.textContent = 'Pošiljam…';

  try {
    const res  = await fetch('/api/test-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email || undefined }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Napaka');
    showMessage(msg, '✓ Testni email poslan! Preveri Gmail.', 'success');
  } catch (err) {
    showMessage(msg, err.message || 'Gmail napaka. Preveri App Password.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Pošlji testni Gmail';
  }
});

// ── Preview Mode ──────────────────────────────────────────────

function enterPreviewMode(eventDate, remindAt) {
  const manualSection = document.getElementById('manualSection');
  manualSection.classList.add('preview-mode');

  const fmtOpts = {
    day: 'numeric', month: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  };

  document.getElementById('previewTitle').textContent    = document.getElementById('title').value || '—';
  document.getElementById('previewEvent').textContent    = eventDate ? eventDate.toLocaleString('sl-SI', fmtOpts) : '—';
  document.getElementById('previewReminder').textContent = remindAt  ? remindAt.toLocaleString('sl-SI', fmtOpts) : '—';

  document.getElementById('previewBlock').classList.remove('hidden');
  document.getElementById('normalActions').classList.add('hidden');
  document.getElementById('manualHint').classList.add('hidden');
}

function exitPreviewMode() {
  const manualSection = document.getElementById('manualSection');
  if (!manualSection.classList.contains('preview-mode')) return;

  manualSection.classList.remove('preview-mode');
  document.getElementById('previewBlock').classList.add('hidden');
  document.getElementById('normalActions').classList.remove('hidden');
  document.getElementById('manualHint').classList.remove('hidden');
}

document.getElementById('previewSaveBtn').addEventListener('click', savePendingReminder);

document.getElementById('previewEditBtn').addEventListener('click', () => {
  exitPreviewMode();
  document.getElementById('title').focus();
});

// ── Mode Switch ───────────────────────────────────────────────

const MODE_KEY = 'marusa_mode';

function setMode(mode) {
  const smartSection  = document.getElementById('smartSection');
  const manualSection = document.getElementById('manualSection');

  document.getElementById('modeSmartBtn').classList.toggle('active', mode === 'smart');
  document.getElementById('modeManualBtn').classList.toggle('active', mode === 'manual');
  localStorage.setItem(MODE_KEY, mode);

  if (mode === 'smart') {
    smartSection.classList.remove('hidden');
    manualSection.classList.add('hidden');
    exitPreviewMode();
  } else {
    smartSection.classList.add('hidden');
    manualSection.classList.remove('hidden');
  }
}

function revealManualForm() {
  const s = document.getElementById('manualSection');
  if (!s.classList.contains('hidden')) {
    s.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  s.classList.remove('hidden');
  s.style.opacity = '0';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    s.style.transition = 'opacity 0.22s ease';
    s.style.opacity = '1';
    setTimeout(() => {
      s.style.transition = '';
      s.style.opacity = '';
      s.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 240);
  }));
}

document.getElementById('modeSmartBtn').addEventListener('click', () => setMode('smart'));
document.getElementById('modeManualBtn').addEventListener('click', () => setMode('manual'));

// ── Custom Offset Toggle ──────────────────────────────────────

document.getElementById('customOffsetToggle').addEventListener('change', function () {
  document.getElementById('customOffsetFields').classList.toggle('hidden', !this.checked);
  document.getElementById('smartOffset').disabled = this.checked;
});

// ── Smart Paste ───────────────────────────────────────────────

document.getElementById('smartBtn').addEventListener('click', () => {
  const text      = document.getElementById('smartText').value.trim();
  const msg       = document.getElementById('smartMessage');
  const useCustom = document.getElementById('customOffsetToggle').checked;

  if (!text) {
    showMessage(msg, 'Prilepi besedilo najprej.', 'error');
    return;
  }

  let result;
  if (useCustom) {
    const amount = parseInt(document.getElementById('customOffsetAmount').value, 10);
    const unit   = document.getElementById('customOffsetUnit').value;
    if (!amount || amount < 1 || amount > 365) {
      showMessage(msg, 'Vnesi število med 1 in 365.', 'error');
      return;
    }
    result = parseSmartReminderText(text, '0');
    if (result.remindAt) {
      result.remindAt = applyCustomReminderOffset(result.remindAt, amount, unit);
    }
  } else {
    result = parseSmartReminderText(text, document.getElementById('smartOffset').value);
  }

  const { title, eventDate, remindAt, description, confidence, warning } = result;

  document.getElementById('title').value       = title;
  document.getElementById('description').value = description;

  const remindAtInput = document.getElementById('remindAt');

  if (remindAt && confidence !== 'low' && confidence !== 'none') {
    remindAtInput.value = toDatetimeLocalValue(remindAt);
    remindAtInput.style.borderColor = '';

    if (remindAt < new Date()) {
      showMessage(msg, 'Izračunan opomnik je v preteklosti. Preveri datum ali offset.', 'error');
    } else if (warning) {
      showMessage(msg, warning, 'error');
    } else {
      showMessage(msg, 'Opomnik pripravljen 👌', 'success');
    }

    revealManualForm();
    enterPreviewMode(eventDate, remindAt);

  } else {
    remindAtInput.value = '';
    remindAtInput.style.borderColor = 'var(--amber)';
    setTimeout(() => { remindAtInput.style.borderColor = ''; }, 4500);

    const errMsg = warning
      ? warning
      : 'Datuma nisem prepoznala 😅 Prosim izberi datum ročno.';
    showMessage(msg, errMsg, 'error');

    revealManualForm();
    // Don't enter preview mode — let user fill in the date
  }
});

// ── Quick Buttons ─────────────────────────────────────────────

function setQuickTime(date) {
  document.getElementById('remindAt').value = toDatetimeLocalValue(date);
}

document.getElementById('quick1h').addEventListener('click', () => {
  const d = new Date(); d.setHours(d.getHours() + 1, d.getMinutes(), 0, 0); setQuickTime(d);
});
document.getElementById('quickTomorrow9').addEventListener('click', () => {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); setQuickTime(d);
});
document.getElementById('quick3d').addEventListener('click', () => {
  const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(9, 0, 0, 0); setQuickTime(d);
});
document.getElementById('quickNextWeek').addEventListener('click', () => {
  const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); setQuickTime(d);
});

// ── Email Remember ────────────────────────────────────────────

const EMAIL_KEY = 'marusa_email';

function updateEmailStatus() {
  const el      = document.getElementById('emailStatus');
  const saved   = localStorage.getItem(EMAIL_KEY);
  const checked = document.getElementById('rememberEmail').checked;
  if (checked && saved) {
    el.textContent = 'Email je shranjen ✓';
    el.className   = 'email-status saved';
  } else {
    el.textContent = 'Email se uporabi za opomnike.';
    el.className   = 'email-status';
  }
}

document.getElementById('rememberEmail').addEventListener('change', function () {
  if (this.checked) {
    const e = document.getElementById('email').value.trim();
    if (e) localStorage.setItem(EMAIL_KEY, e);
  } else {
    localStorage.removeItem(EMAIL_KEY);
  }
  updateEmailStatus();
});

document.getElementById('email').addEventListener('input', function () {
  if (document.getElementById('rememberEmail').checked && this.value.trim()) {
    localStorage.setItem(EMAIL_KEY, this.value.trim());
  }
  updateEmailStatus();
});

// ── PWA Install ───────────────────────────────────────────────

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); });

// ── Init ──────────────────────────────────────────────────────

(function init() {
  // Default reminder time: tomorrow at 09:00
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  document.getElementById('remindAt').value = toDatetimeLocalValue(d);

  // Restore saved email
  const savedEmail = localStorage.getItem(EMAIL_KEY);
  if (savedEmail) {
    document.getElementById('email').value = savedEmail;
    document.getElementById('rememberEmail').checked = true;
  }
  updateEmailStatus();

  // Restore last mode
  setMode(localStorage.getItem(MODE_KEY) || 'smart');
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch(() => {});
}

loadReminders();
setInterval(loadReminders, 60 * 1000);
