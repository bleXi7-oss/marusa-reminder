// ── Helpers ───────────────────────────────────────────────────

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString('sl-SI', {
    weekday: 'short', day: 'numeric', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
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

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Rich message: accepts plain string or { code, message, action } object
function showMessage(el, text, type) {
  if (text && typeof text === 'object') {
    el.innerHTML =
      `<strong>${escHtml(text.code)}: ${escHtml(text.message)}</strong>` +
      (text.action ? `<div class="msg-action">Kaj preveriti: ${escHtml(text.action)}</div>` : '');
  } else {
    el.textContent = text;
  }
  el.className = `message ${type}`;
  setTimeout(() => { el.className = 'message hidden'; }, 5500);
}

// ── Access control ────────────────────────────────────────────

const CODE_KEY = 'marusa_code';

function getStoredCode() {
  return localStorage.getItem(CODE_KEY) || '';
}

// Wrapper for all /api/ calls — injects X-App-Code header when present
function apiFetch(url, options = {}) {
  const code = getStoredCode();
  const headers = { ...options.headers };
  if (code) headers['X-App-Code'] = code;
  return fetch(url, { ...options, headers });
}

function showLockScreen(message) {
  document.getElementById('lockScreen').classList.remove('hidden');
  document.getElementById('lockCodeInput').value = '';
  if (message) {
    showMessage(document.getElementById('lockMessage'), message, 'error');
  } else {
    document.getElementById('lockMessage').className = 'message hidden';
  }
  setTimeout(() => document.getElementById('lockCodeInput').focus(), 100);
}

function hideLockScreen() {
  document.getElementById('lockScreen').classList.add('hidden');
}

function handleUnauthorized() {
  localStorage.removeItem(CODE_KEY);
  showLockScreen({ code: 'ERR-001', message: 'Dostop zavrnjen.', action: 'Vpiši kodo za dostop.' });
}

// Checks /api/health to decide whether to show lock screen.
// Returns true if the app is ready to use.
async function initAuth() {
  let data;
  try {
    const res = await fetch('/api/health');
    data = await res.json();
  } catch {
    return true; // if health check fails, proceed without lock
  }

  if (!data.protected) {
    document.getElementById('lockBtn').classList.add('hidden');
    return true;
  }

  // Show lock button (app is protected)
  document.getElementById('lockBtn').classList.remove('hidden');

  if (!getStoredCode()) {
    showLockScreen();
    return false;
  }

  // Verify stored code against the protected endpoint
  try {
    const res = await apiFetch('/api/auth');
    if (res.status === 401) {
      handleUnauthorized();
      return false;
    }
  } catch {
    // Network error — proceed optimistically, API calls will fail if needed
  }

  return true;
}

// Lock screen submit
document.getElementById('lockSubmitBtn').addEventListener('click', async () => {
  const code = document.getElementById('lockCodeInput').value.trim();
  const msg  = document.getElementById('lockMessage');
  const btn  = document.getElementById('lockSubmitBtn');

  if (!code) return;

  btn.disabled = true;
  btn.textContent = 'Preverjam…';

  try {
    const res = await fetch('/api/auth', { headers: { 'X-App-Code': code } });
    if (res.ok) {
      localStorage.setItem(CODE_KEY, code);
      hideLockScreen();
      await loadReminders();
    } else {
      showMessage(msg, { code: 'ERR-001', message: 'Napačna koda za dostop.', action: 'Preveri APP_ACCESS_CODE v Render Environment Variables.' }, 'error');
      document.getElementById('lockCodeInput').focus();
    }
  } catch {
    showMessage(msg, 'Napaka pri preverjanju. Poskusi znova.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Odpri';
  }
});

document.getElementById('lockCodeInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('lockSubmitBtn').click();
});

// "Zakleni aplikacijo" button
document.getElementById('lockBtn').addEventListener('click', () => {
  localStorage.removeItem(CODE_KEY);
  showLockScreen();
});

// ── Email validation ──────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email, msgEl) {
  if (!email) {
    highlightField('email');
    showMessage(msgEl, { code: 'ERR-008', message: 'Email za opomnik manjka.', action: 'Vpiši email preden shraniš ali pošlješ opomnik.' }, 'error');
    return false;
  }
  if (!EMAIL_RE.test(email)) {
    highlightField('email');
    showMessage(msgEl, { code: 'ERR-008', message: 'Email ni veljaven.', action: 'Vpiši pravilen email naslov.' }, 'error');
    return false;
  }
  return true;
}

function highlightField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('field-error');
  el.focus();
  setTimeout(() => el.classList.remove('field-error'), 3000);
}

// ── Error display ─────────────────────────────────────────────

// Converts API response data to a display object { code, message, action }
function apiErrorDisplay(data) {
  if (data && data.code && data.message) {
    return { code: data.code, message: data.message, action: data.action || '' };
  }
  return data && data.message ? data.message : 'Napaka.';
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

  // AM/PM: 9am, 9:30 PM
  const ampm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const min = ampm[2] ? parseInt(ampm[2], 10) : 0;
    if (ampm[3].toLowerCase() === 'am' && h === 12) h = 0;
    if (ampm[3].toLowerCase() === 'pm' && h !== 12) h += 12;
    return { hour: h, minute: min };
  }

  // ob/at/@ 9, ob 9h, ob 9:30, ob 9.30
  const ob = text.match(/(?:ob|at|@)\s*(\d{1,2})(?:[.:](\d{2})|h)?\b/i);
  if (ob) {
    const h = parseInt(ob[1], 10);
    const min = ob[2] ? parseInt(ob[2], 10) : 0;
    if (h >= 0 && h <= 23) return { hour: h, minute: min };
  }

  // do/by 12h, do 12:30, do 12 h — explicit time suffix required to avoid matching dates
  const deadlineT = text.match(/(?:do|by)\s+(\d{1,2})\s*(?:h\b|\s+h\b|[:](\d{2}))/i);
  if (deadlineT) {
    const h = parseInt(deadlineT[1], 10);
    const min = deadlineT[2] ? parseInt(deadlineT[2], 10) : 0;
    if (h >= 0 && h <= 23) return { hour: h, minute: min };
  }
  // bare: do 12 / by 12 — only when NOT followed by date separators (., /, -)
  const deadlineBare = text.match(/(?:do|by)\s+(\d{1,2})\b(?![\.\d\/\-])/i);
  if (deadlineBare) {
    const h = parseInt(deadlineBare[1], 10);
    if (h >= 0 && h <= 23) return { hour: h, minute: 0 };
  }

  // okoli/okrog 12
  const okoli = text.match(/(?:okoli|okrog)\s+(\d{1,2})(?:[.:](\d{2}))?\b/i);
  if (okoli) {
    const h = parseInt(okoli[1], 10);
    const min = okoli[2] ? parseInt(okoli[2], 10) : 0;
    if (h >= 0 && h <= 23) return { hour: h, minute: min };
  }

  // Named times — check more specific patterns first
  if (/\bopolnoči\b|\bmidnight\b/.test(lower))                                             return { hour:  0, minute: 0 };
  if (/\bopoldne\b|\bnoon\b|\bpoldne\b/.test(lower))                                      return { hour: 12, minute: 0 };
  if (/konec dneva|do konca dneva|\beod\b|\bcob\b|end of (?:the )?day|by end of (?:the )?day/.test(lower)) return { hour: 17, minute: 0 };
  if (/konec tedna|do konca tedna|end of (?:the )?week|by end of (?:the )?week/.test(lower))               return { hour: 17, minute: 0 };
  if (/konec meseca|do konca meseca|end of (?:the )?month|by end of (?:the )?month/.test(lower))           return { hour: 17, minute: 0 };
  if (/zgodaj zjutraj|early morning/.test(lower))                                          return { hour:  7, minute: 0 };
  if (/\bzjutraj\b|\bmorning\b/.test(lower))                                               return { hour:  9, minute: 0 };
  if (/\bdopoldne\b/.test(lower))                                                          return { hour:  9, minute: 0 };
  if (/\bpopoldne\b|\bafternoon\b/.test(lower))                                            return { hour: 14, minute: 0 };
  if (/\bzvečer\b|\bevening\b|\btonight\b/.test(lower))                                    return { hour: 18, minute: 0 };

  return null;
}

function extractRelativeMinutes(text) {
  const lower = text.toLowerCase();
  const SL_NUMS = { 'eno':1,'en':1,'ena':1,'dve':2,'dva':2,'tri':3,'štiri':4,'pet':5,'šest':6,'sedem':7,'osem':8,'devet':9,'deset':10 };
  const EN_NUMS = { 'one':1,'two':2,'three':3,'four':4,'five':5,'six':6,'seven':7,'eight':8,'nine':9,'ten':10 };

  if (/čez\s+pol\s+ure/.test(lower))            return 30;
  if (/in\s+half\s+an?\s+hour/.test(lower))     return 30;

  const slMin = lower.match(/čez\s+(\d+)\s+minut/);
  if (slMin) return parseInt(slMin[1]);
  const slMinW = lower.match(/čez\s+(eno|en|dve|dva|tri|štiri|pet|šest|sedem|osem|deset)\s+minut/);
  if (slMinW) return SL_NUMS[slMinW[1]] || 1;
  const enMin = lower.match(/\bin\s+(\d+)\s+minut/);
  if (enMin) return parseInt(enMin[1]);

  if (/čez\s+eno\s+ur[oa]|čez\s+en\s+ur[oa]/.test(lower)) return 60;
  if (/\bin\s+one\s+hour/.test(lower))          return 60;

  const slHr = lower.match(/čez\s+(\d+)\s+ur[oiea]?\b/);
  if (slHr) return parseInt(slHr[1]) * 60;
  const slHrW = lower.match(/čez\s+(dve|dva|tri|štiri|pet|šest|sedem|osem|devet|deset)\s+ur/);
  if (slHrW) return (SL_NUMS[slHrW[1]] || 1) * 60;

  const enHr = lower.match(/\bin\s+(\d+)\s+hour/);
  if (enHr) return parseInt(enHr[1]) * 60;
  const enHrW = lower.match(/\bin\s+(one|two|three|four|five|six|seven|eight|nine|ten)\s+hour/);
  if (enHrW) return (EN_NUMS[enHrW[1]] || 1) * 60;

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

  // "rok je danes", "due today", "danes", "tonight" etc.
  if (/\bdanes\b|\btoday\b|\bdue today\b|\brok je danes\b|\btonight\b/.test(lower))    return relative(new Date(today));

  if (/\bjutri\b|\btomorrow\b|\bdue tomorrow\b|\brok je jutri\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 1); return relative(d);
  }
  if (/\bpojutrišnjem\b|\bday after tomorrow\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 2); return relative(d);
  }

  // Slovenian relative days
  if (/čez\s+en\s+dan|čez\s+eno?\s+dn/.test(lower))  { const d = new Date(today); d.setDate(d.getDate() + 1); return relative(d); }
  if (/čez\s+dv[ae]\s+dn/.test(lower))  { const d = new Date(today); d.setDate(d.getDate() + 2); return relative(d); }
  if (/čez\s+tri\s+dn/.test(lower))     { const d = new Date(today); d.setDate(d.getDate() + 3); return relative(d); }

  const cezDni = lower.match(/čez\s+(\d+)\s+dn/);
  if (cezDni) { const d = new Date(today); d.setDate(d.getDate() + parseInt(cezDni[1])); return relative(d); }

  // Slovenian weeks
  if (/čez\s+en\s+ted|čez\s+teden\b/.test(lower)) { const d = new Date(today); d.setDate(d.getDate() + 7);  return relative(d); }
  if (/čez\s+dv[ae]\s+ted/.test(lower))            { const d = new Date(today); d.setDate(d.getDate() + 14); return relative(d); }
  if (/čez\s+tri\s+ted/.test(lower))               { const d = new Date(today); d.setDate(d.getDate() + 21); return relative(d); }
  if (/čez\s+štiri\s+ted/.test(lower))             { const d = new Date(today); d.setDate(d.getDate() + 28); return relative(d); }
  const cezTed = lower.match(/čez\s+(\d+)\s+ted/);
  if (cezTed) { const d = new Date(today); d.setDate(d.getDate() + parseInt(cezTed[1]) * 7); return relative(d); }

  // English relative days/weeks
  if (/\bin\s+a\s+day\b|\bin\s+one\s+day\b/.test(lower))     { const d = new Date(today); d.setDate(d.getDate() + 1);  return relative(d); }
  if (/\bin\s+two\s+days?\b/.test(lower))                     { const d = new Date(today); d.setDate(d.getDate() + 2);  return relative(d); }
  if (/\bin\s+three\s+days?\b/.test(lower))                   { const d = new Date(today); d.setDate(d.getDate() + 3);  return relative(d); }
  if (/\bin\s+four\s+days?\b/.test(lower))                    { const d = new Date(today); d.setDate(d.getDate() + 4);  return relative(d); }
  const inDays = lower.match(/\bin\s+(\d+)\s+day/);
  if (inDays) { const d = new Date(today); d.setDate(d.getDate() + parseInt(inDays[1])); return relative(d); }
  if (/\bin\s+a\s+week\b|\bin\s+one\s+week\b/.test(lower))   { const d = new Date(today); d.setDate(d.getDate() + 7);  return relative(d); }
  if (/\bin\s+two\s+weeks?\b/.test(lower))                    { const d = new Date(today); d.setDate(d.getDate() + 14); return relative(d); }
  if (/\bin\s+three\s+weeks?\b/.test(lower))                  { const d = new Date(today); d.setDate(d.getDate() + 21); return relative(d); }
  if (/\bin\s+four\s+weeks?\b/.test(lower))                   { const d = new Date(today); d.setDate(d.getDate() + 28); return relative(d); }
  const inWeeks = lower.match(/\bin\s+(\d+)\s+week/);
  if (inWeeks) { const d = new Date(today); d.setDate(d.getDate() + parseInt(inWeeks[1]) * 7); return relative(d); }

  // Explicit date formats (most specific first)
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

  // Named Slovenian months: "15. maja 2026", "15 maja", "15. maj"
  for (const [stem, mNum] of SL_MONTHS) {
    const mWithYear = lower.match(new RegExp(`(\\d{1,2})\\.?\\s+${stem}\\w*\\s+(\\d{4})`, 'i'));
    if (mWithYear) return exact(new Date(+mWithYear[2], mNum-1, +mWithYear[1]));
    const m = lower.match(new RegExp(`(\\d{1,2})\\.?\\s+${stem}`, 'i'));
    if (m) {
      const d = new Date(today.getFullYear(), mNum-1, +m[1]);
      if (d < today) d.setFullYear(d.getFullYear() + 1);
      return exact(d);
    }
  }

  // Named English months: "May 15 2026", "15 May 2026", "May 15th"
  for (const [mName, mNum] of Object.entries(EN_MONTHS)) {
    const m1 = text.match(new RegExp(`\\b${mName}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\b`, 'i'));
    const m2 = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${mName}(?:\\s+(\\d{4}))?\\b`, 'i'));
    if (m1) {
      const day = +m1[1]; const yr = m1[2] ? +m1[2] : today.getFullYear();
      const d = new Date(yr, mNum-1, day);
      if (!m1[2] && d < today) d.setFullYear(d.getFullYear() + 1);
      return exact(d);
    }
    if (m2) {
      const day = +m2[1]; const yr = m2[2] ? +m2[2] : today.getFullYear();
      const d = new Date(yr, mNum-1, day);
      if (!m2[2] && d < today) d.setFullYear(d.getFullYear() + 1);
      return exact(d);
    }
  }

  // Combined: "naslednji teden v petek" / "next week Friday" — MUST precede generic "naslednji teden"
  if (/naslednji teden|prihodnji teden|drug teden/.test(lower)) {
    for (const [re, dayNum] of SL_DAYS) {
      if (re.test(lower)) return weekday(getNextWeekday(dayNum, true));
    }
  }
  if (/next week/.test(lower)) {
    for (const [re, dayNum] of EN_DAYS) {
      if (re.test(lower)) return weekday(getNextWeekday(dayNum, true));
    }
  }

  // "naslednji teden", "prihodnji teden", "next week" → next Monday (no specific weekday)
  if (/naslednji teden|prihodnji teden|drug teden|next week/.test(lower))
    return vague(getNextWeekday(1, true));

  // end of next week → next Friday
  if (/konec naslednjega tedna|end of next week/.test(lower))
    return weekday(getNextWeekday(5, true));
  // end of week → this Friday
  if (/do konca tedna|konec tedna|end of (?:this |the )?week/.test(lower))
    return vague(getNextWeekday(5, false));
  // end of month → last day of current month
  if (/do konca meseca|konec meseca|end of (?:this |the )?month/.test(lower)) {
    const d = new Date(today); d.setMonth(d.getMonth() + 1, 0); return vague(d);
  }

  // "naslednji mesec [day]" / "next month [day]"
  const nextMonthDaySL = lower.match(/naslednji mesec\s+(\d{1,2})/);
  if (nextMonthDaySL) {
    const d = new Date(today); d.setMonth(d.getMonth() + 1, parseInt(nextMonthDaySL[1])); return exact(d);
  }
  const nextMonthDayEN = lower.match(/next month(?:\s+on(?:\s+the)?)?\s+(\d{1,2})(?:st|nd|rd|th)?/);
  if (nextMonthDayEN) {
    const d = new Date(today); d.setMonth(d.getMonth() + 1, parseInt(nextMonthDayEN[1])); return exact(d);
  }

  // "prvi [weekday] naslednji mesec" / "first [weekday] next month"
  function firstWeekdayOfMonth(year, month, targetDay) {
    const d = new Date(year, month, 1);
    while (d.getDay() !== targetDay) d.setDate(d.getDate() + 1);
    return d;
  }
  if (/\bprv[ia]\b/.test(lower) && /naslednji mesec|prihodnji mesec/.test(lower)) {
    for (const [re, dayNum] of SL_DAYS) {
      if (re.test(lower)) {
        const nm = new Date(today); nm.setMonth(nm.getMonth() + 1);
        return exact(firstWeekdayOfMonth(nm.getFullYear(), nm.getMonth(), dayNum));
      }
    }
  }
  if (/\bfirst\b/.test(lower) && /next month/.test(lower)) {
    for (const [re, dayNum] of EN_DAYS) {
      if (re.test(lower)) {
        const nm = new Date(today); nm.setMonth(nm.getMonth() + 1);
        return exact(firstWeekdayOfMonth(nm.getFullYear(), nm.getMonth(), dayNum));
      }
    }
  }

  // Weekdays — "naslednji"/"prihodnji"/"next" force the NEXT occurrence even if today matches
  const forceNext = /naslednji|prihodnji/.test(lower);
  for (const [re, dayNum] of SL_DAYS) {
    if (re.test(lower)) return weekday(getNextWeekday(dayNum, forceNext));
  }
  for (const [re, dayNum] of EN_DAYS) {
    if (re.test(lower)) return weekday(getNextWeekday(dayNum, /\bnext\b/.test(lower)));
  }

  // "end of day" → return today (time will be set to 17:00 by extractTime)
  if (/konec dneva|do konca dneva|\beod\b|\bcob\b|end of (?:the )?day/.test(lower))
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

function stripDeadlineTail(text) {
  return text
    .replace(/\s*\bpričakujem\b.*$/i, '')
    .replace(/\s*\bprosim\b.*$/i, '')
    .replace(/\s*\bhvala\b.*$/i, '')
    .replace(/\s*\bthank you\b.*$/i, '')
    .replace(/\s*\b(?:do\s+(?:danes|jutri|petka|srede|torka|četrtka|sobote|nedelje|konca|naslednjega)|by\s+(?:today|tomorrow|friday|monday|tuesday|wednesday|thursday|saturday|sunday|end|the\s+end))\b.*$/i, '')
    .replace(/\s*\bnajkasnej(?:e|š[ae])\b.*$/i, '')
    .replace(/\s*[,.]$/, '')
    .trim();
}

// When text has multiple explicit dates, pick the event date over the deadline date
function extractPriorityDate(text) {
  const found = [];
  const re = /(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const d = new Date(+m[3], +m[2]-1, +m[1]);
    if (isNaN(d.getTime())) continue;
    const before = text.slice(Math.max(0, m.index - 80), m.index).toLowerCase();
    const isDeadline = /\b(?:do|prijav|registr|apply|submit|pošlji|pošljite|oddaj|najkasnej|rok\b|deadline|due|register|by)\b/.test(before);
    found.push({ date: d, isDeadline });
  }
  if (found.length < 2) return null;
  const eventDate = found.find(f => !f.isDeadline);
  return eventDate ? eventDate.date : null;
}

// Strip date/time phrases for short single-line title extraction
function stripDateTimePhrases(text) {
  return text
    .replace(/\bob\s+\d{1,2}(?:[.:]\d{2})?h?\b/gi, '')
    .replace(/\b(?:at|@)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, '')
    .replace(/\b\d{1,2}:\d{2}\b/g, '')
    .replace(/\b(?:zjutraj|dopoldne|popoldne|zvečer|ponoči|morning|afternoon|evening|tonight|noon|midnight)\b/gi, '')
    .replace(/\b(?:naslednji|prihodnji)\s+(?:teden|mesec)\b/gi, '')
    .replace(/\b(?:naslednji[a-z]*|prihodnji[a-z]*|drug)\s+(?:petek|ponedeljek|torek|sred[oa]|četrtek|soboto?|nedeljo?)\b/gi, '')
    .replace(/\bta\s+(?:petek|ponedeljek|torek|sred[oa]|četrtek|soboto?|nedeljo?)\b/gi, '')
    .replace(/\bv\s+(?:petek|ponedeljek|torek|sred[oa]|četrtek|soboto?|nedeljo?)\b/gi, '')
    .replace(/\bčez\s+(?:\w+\s+){0,2}(?:dan|dni|teden|tedne|uro|ur|minut)\b/gi, '')
    .replace(/\b(?:jutri|danes|pojutrišnjem)\b/gi, '')
    .replace(/\bnext\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\bthis\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\b(?:tomorrow|today|tonight)\b/gi, '')
    .replace(/\bin\s+\w+\s+(?:days?|weeks?|hours?|minutes?)\b/gi, '')
    .replace(/\b(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*[,.\-–]\s*/, '')
    .trim();
}

function extractTitle(text, businessContext) {
  const cleaned = text.replace(SIGNATURE_RE, '').trim();

  const subj = cleaned.match(/^(?:subject|zadeva):\s*(.+)/im);
  if (subj) return subj[1].trim().slice(0, 80);

  const SKIP_RE = /^(zdravo|živjo|hej|hello|hi\b|pozdravljeni|hvala|lep pozdrav|lp\b|dear\b)/i;
  const FILLER_START = /^(?:vesela bom[,.]?\s*(?:če\s*se\s*vidimo\.?)?|prosim\b|hvala\b|thank you\b)\s*/i;
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);

  // For short single-line inputs, strip date/time phrases to extract the core noun
  if (lines.length === 1) {
    const stripped = stripDateTimePhrases(lines[0]).replace(GREETING_RE, '').trim();
    if (stripped.length >= 2 && !SKIP_RE.test(stripped)) {
      const t = stripped.charAt(0).toUpperCase() + stripped.slice(1);
      return t.slice(0, 80);
    }
  }

  for (const line of lines) {
    let t = line.replace(GREETING_RE, '').trim();
    if (t.length < 4) continue;
    if (SKIP_RE.test(t)) continue;
    t = t.replace(FILLER_START, '').trim();
    if (t.length < 4) continue;
    // Strip leading date prefix: "27.5.2026 "
    t = t.replace(/^\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}\s+/, '');
    // Strip "please " prefix
    t = t.replace(/^please\s+/i, '');
    // Strip deadline tail phrases
    t = stripDeadlineTail(t);
    if (t.length < 4) continue;
    // Capitalize first letter
    t = t.charAt(0).toUpperCase() + t.slice(1);
    return t.slice(0, 80);
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
  if (offset === '10m') d.setMinutes(d.getMinutes() - 10);
  if (offset === '15m') d.setMinutes(d.getMinutes() - 15);
  if (offset === '30m') d.setMinutes(d.getMinutes() - 30);
  if (offset === '1h')  d.setHours(d.getHours() - 1);
  if (offset === '2h')  d.setHours(d.getHours() - 2);
  if (offset === '1d')  d.setDate(d.getDate() - 1);
  if (offset === '2d')  d.setDate(d.getDate() - 2);
  if (offset === '3d')  d.setDate(d.getDate() - 3);
  if (offset === '1w')  d.setDate(d.getDate() - 7);
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

  const relMins = extractRelativeMinutes(text);
  if (relMins !== null) {
    const now = new Date();
    now.setSeconds(0, 0);
    now.setMinutes(now.getMinutes() + relMins);
    return { title, eventDate: now, remindAt: now, description, confidence: 'high', confidenceReason: 'Zaznano relativno besedilo z jasnim časom.', warning: null, businessContext };
  }

  let { date: rawDate, tier } = extractDate(text);
  const timeResult = extractTime(text);
  const multiDate  = countDateSignals(text) >= 2;
  const urgent     = detectUrgency(text);

  // When multiple explicit dates exist, prefer the event date over a deadline date
  const priorityDate = extractPriorityDate(text);
  if (priorityDate) {
    rawDate = priorityDate;
    // Keep tier as 'exact' since it's an explicit date
    tier = 'exact';
  }

  if (!rawDate) {
    return {
      title, eventDate: null, remindAt: null, description, confidence: 'none', confidenceReason: 'Datum ni bil zaznan.', businessContext,
      warning: urgent ? 'Videti je nujno, ampak datuma nisem našla. Izberi datum ročno.' : null,
    };
  }

  const eventDate = new Date(rawDate);
  eventDate.setHours(
    timeResult ? timeResult.hour   : 9,
    timeResult ? timeResult.minute : 0,
    0, 0
  );

  let confidence, confidenceReason;
  if (tier === 'exact' && timeResult) {
    confidence = 'high'; confidenceReason = 'Zaznan jasen datum in ura.';
  } else if ((tier === 'relative' || tier === 'weekday') && timeResult) {
    confidence = 'high'; confidenceReason = 'Zaznan jasen datum in ura.';
  } else if (tier === 'exact' || tier === 'relative' || tier === 'weekday') {
    confidence = 'medium'; confidenceReason = 'Ura ni bila najdena, uporabljena je privzeta 09:00.';
  } else {
    confidence = 'low'; confidenceReason = 'Datum je ohlapno določen, preveri.';
  }

  const warning = multiDate ? 'Našla sem več možnih datumov. Preveri, če je izbran pravi.' : null;
  if (multiDate) confidenceReason = 'Najdenih je več datumov, preveri izbiro.';

  return {
    title,
    eventDate,
    remindAt: applyReminderOffset(new Date(eventDate), offset),
    description, confidence, confidenceReason, warning, businessContext,
  };
}

function toDatetimeLocalValue(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16);
}

// EU 24h display format: "13. 5. 2026, 09:00"
function formatEU24h(date) {
  if (!date || isNaN(date.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${date.getDate()}. ${date.getMonth() + 1}. ${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Parse EU 24h format back to Date
function parseEU24hDate(str) {
  const m = str.trim().match(/^(\d{1,2})[.\s]+(\d{1,2})[.\s]+(\d{4})[,\s]+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

// Set both the hidden datetime-local and the visible EU display field
function setRemindAt(date) {
  const hidden  = document.getElementById('remindAt');
  const display = document.getElementById('remindAtDisplay');
  if (!date || isNaN(date.getTime())) {
    hidden.value = '';
    if (document.activeElement !== display) display.value = '';
  } else {
    hidden.value = toDatetimeLocalValue(date);
    if (document.activeElement !== display) display.value = formatEU24h(date);
  }
}

// Parse what the user typed into the display field and commit it
function applyRemindAtDisplay() {
  const display = document.getElementById('remindAtDisplay');
  const text = display.value.trim();
  if (!text) {
    document.getElementById('remindAt').value = '';
    updateTimingPreview();
    updateFollowUpPreview();
    return;
  }
  // Try strict EU format first, then natural language
  let parsed = parseEU24hDate(text);
  if (!parsed) {
    const r = parseSmartReminderText(text, '0');
    parsed = r.eventDate;
  }
  if (parsed && !isNaN(parsed.getTime())) {
    document.getElementById('remindAt').value = toDatetimeLocalValue(parsed);
    display.value = formatEU24h(parsed);
  }
  document.querySelectorAll('.btn-quick').forEach(b => b.classList.remove('active'));
  updateTimingPreview();
  updateFollowUpPreview();
}

// ── UX helpers ────────────────────────────────────────────────

let lastParsedEventDate = null;
let editingReminderId = null;
let allReminders = [];

function formatSlDate(date) {
  return date.toLocaleString('sl-SI', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function updateDetectCard(eventDate, remindAt) {
  const card = document.getElementById('detectCard');
  if (!eventDate) { card.classList.add('hidden'); return; }

  const fmtLong  = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };
  const fmtShort = { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };

  document.getElementById('detectEventText').textContent  = eventDate.toLocaleString('sl-SI', fmtLong);
  const reminderLine = (!remindAt || remindAt.getTime() === eventDate.getTime())
    ? 'Opomnik: ob istem času'
    : 'Opomnik: ' + remindAt.toLocaleString('sl-SI', fmtShort);
  document.getElementById('detectReminderText').textContent = reminderLine;

  card.classList.remove('hidden');
}

function updateConfidenceIndicator(confidence, reason) {
  const el = document.getElementById('confidenceIndicator');
  if (!el) return;
  if (!confidence) { el.classList.add('hidden'); return; }
  const level  = confidence === 'high' ? 'green' : (confidence === 'medium' || confidence === 'low') ? 'yellow' : 'red';
  const icons  = { green: '🟢', yellow: '🟡', red: '🔴' };
  const labels = { green: 'Zelo zanesljivo', yellow: 'Mogoče napačen datum', red: 'Datum ni jasen' };
  el.innerHTML = `<span class="conf-icon">${icons[level]}</span> <span class="conf-label">${labels[level]}</span>${reason ? ` — ${escHtml(reason)}` : ''}`;
  el.className = `confidence-indicator conf-${level}`;
}

function updateTimingPreview() {
  const el  = document.getElementById('timingPreview');
  if (!el) return;
  const val = document.getElementById('remindAt').value;
  if (!val) { el.classList.add('hidden'); return; }

  const d   = new Date(val);
  const now = new Date();
  el.classList.remove('hidden');

  if (d < now) {
    el.className  = 'timing-preview warning';
    el.textContent = '⚠ Opomnik bi bil poslan v preteklosti.';
  } else {
    el.className  = 'timing-preview';
    el.textContent = 'Opomnik bo poslan: ' + formatSlDate(d);
  }
}

function formatFollowUpDelay(minutes) {
  const m = { 60: 'čez 1 uro', 120: 'čez 2 uri', 1440: 'čez 1 dan', 2880: 'čez 2 dni' };
  return m[minutes] || (minutes < 60 ? minutes + ' min' : minutes < 1440 ? (minutes/60) + ' h' : (minutes/1440) + ' dni');
}

function getFollowUpMinutes() {
  const sel = document.getElementById('followUpSelect');
  if (!sel) return 0;
  const v = sel.value;
  if (v === '0') return 0;
  if (v === 'custom') {
    const n    = parseInt(document.getElementById('followUpAmount').value, 10) || 1;
    const unit = document.getElementById('followUpUnit').value;
    if (unit === 'minut')  return n;
    if (unit === 'ur')     return n * 60;
    if (unit === 'dni')    return n * 1440;
    if (unit === 'tednov') return n * 10080;
  }
  return parseInt(v, 10);
}

function updateFollowUpPreview() {
  const el = document.getElementById('followUpPreview');
  if (!el) return;
  const minutes = getFollowUpMinutes();
  if (minutes === 0) { el.classList.add('hidden'); return; }
  const val = document.getElementById('remindAt').value;
  if (!val) { el.classList.add('hidden'); return; }
  const followUpTime = new Date(new Date(val).getTime() + minutes * 60000);
  el.classList.remove('hidden');
  if (followUpTime < new Date()) {
    el.className   = 'timing-preview warning';
    el.textContent = '⚠ Nadaljnji opomnik bi bil v preteklosti.';
  } else {
    el.className   = 'timing-preview';
    el.textContent = '↩ Nadaljnji opomnik: ' + formatFollowUpDelay(minutes) + '\nPoslan bo: ' + formatSlDate(followUpTime);
  }
}

function recomputeSmartRemind() {
  if (!lastParsedEventDate) return;
  const useCustom = document.getElementById('customOffsetToggle').checked;
  let remindAt;
  if (useCustom) {
    const amount = parseInt(document.getElementById('customOffsetAmount').value, 10) || 1;
    const unit   = document.getElementById('customOffsetUnit').value;
    remindAt = applyCustomReminderOffset(new Date(lastParsedEventDate), amount, unit);
  } else {
    remindAt = applyReminderOffset(new Date(lastParsedEventDate), document.getElementById('smartOffset').value);
  }
  setRemindAt(remindAt);
  const fmtOpts = { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };
  const previewReminderEl = document.getElementById('previewReminder');
  if (previewReminderEl) previewReminderEl.textContent = remindAt.toLocaleString('sl-SI', fmtOpts);
  updateDetectCard(lastParsedEventDate, remindAt);
  updateTimingPreview();
}

// ── Pinned Reminders ──────────────────────────────────────────

const PINNED_KEY = 'marusa_pinned';

function getPinnedIds() {
  try { return new Set(JSON.parse(localStorage.getItem(PINNED_KEY) || '[]')); }
  catch { return new Set(); }
}

function setPinned(id, pinned) {
  const ids = getPinnedIds();
  if (pinned) ids.add(id); else ids.delete(id);
  localStorage.setItem(PINNED_KEY, JSON.stringify([...ids]));
}

function isPinned(id) { return getPinnedIds().has(id); }

function togglePin(id) {
  setPinned(id, !isPinned(id));
  renderAll(allReminders);
}

// ── Render reminders ──────────────────────────────────────────

function renderCard(r) {
  const status = getStatus(r);
  const { text, cls } = statusLabel(status);
  const pinned = isPinned(r.id);
  const card = document.createElement('div');
  card.className = `reminder-card${status === 'sent' ? ' sent' : ''}${pinned ? ' pinned' : ''}`;
  card.innerHTML = `
    <div class="card-header">
      <div class="card-title">${escHtml(r.title)}</div>
      <span class="badge ${cls}">${text}</span>
    </div>
    ${r.description ? `<div class="card-desc">${escHtml(r.description)}</div>` : ''}
    <div class="card-time">🕐 ${formatDate(r.remindAt)}</div>
    ${r.followUp && r.followUp.enabled ? `<div class="card-followup${r.followUp.sentAt ? ' sent' : ''}">↩ ${r.followUp.sentAt ? 'Nadaljnji opomnik poslan ✓' : 'Nadaljnji opomnik ' + formatFollowUpDelay(r.followUp.delayMinutes)}</div>` : ''}
    <div class="card-actions">
      ${!r.sent ? `<button class="btn-pin${pinned ? ' pinned' : ''}" onclick="togglePin('${r.id}')" title="${pinned ? 'Odpni' : 'Pripni'}">📌</button>` : ''}
      ${status !== 'sent' ? `<button class="btn-small" onclick="sendNow('${r.id}', this)">Pošlji zdaj</button>` : ''}
      <button class="btn-small" onclick="editReminder('${r.id}')">Uredi</button>
      <button class="btn-small danger" onclick="deleteReminder('${r.id}', this)">Izbriši</button>
    </div>
  `;
  return card;
}

function renderAll(reminders) {
  allReminders = reminders;
  checkAndNotify(reminders);
  checkAndNotifyFollowUps(reminders);
  renderInsights(reminders);

  const now      = new Date();
  const upcoming = reminders.filter(r => !r.sent && new Date(r.remindAt) > now);
  const history  = reminders.filter(r => r.sent || new Date(r.remindAt) <= now);
  const upcomingList = document.getElementById('upcomingList');
  const historyList  = document.getElementById('sentList');

  upcomingList.innerHTML = '';
  historyList.innerHTML  = '';

  if (upcoming.length === 0) {
    upcomingList.innerHTML = '<div class="empty">Ni prihodnjih opomnikov 😄</div>';
  } else {
    upcoming.sort((a, b) => {
      const pa = isPinned(a.id) ? 0 : 1;
      const pb = isPinned(b.id) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return new Date(a.remindAt) - new Date(b.remindAt);
    });
    upcoming.forEach(r => upcomingList.appendChild(renderCard(r)));
  }

  if (history.length === 0) {
    historyList.innerHTML = '<div class="empty">Ni preteklih opomnikov.</div>';
  } else {
    history.sort((a, b) => new Date(b.remindAt) - new Date(a.remindAt));
    history.forEach(r => historyList.appendChild(renderCard(r)));
  }
}

async function loadReminders() {
  try {
    const res = await apiFetch('/api/reminders');
    if (res.status === 401) { handleUnauthorized(); return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderAll(await res.json());
  } catch (err) {
    if (err.message !== 'unauthorized') {
      console.error('Napaka pri nalaganju opomnikov:', err.message);
    }
  }
}

// ── Actions ───────────────────────────────────────────────────

async function sendNow(id, btn) {
  btn.disabled = true;
  btn.textContent = 'Pošiljam…';
  const msg = document.getElementById('formMessage');
  try {
    const res  = await apiFetch(`/api/reminders/${id}/send-now`, { method: 'POST' });
    const data = await res.json();
    if (res.status === 401) { handleUnauthorized(); return; }
    if (!res.ok) {
      showMessage(msg, apiErrorDisplay(data), 'error');
      return;
    }
    showMessage(msg, '✓ Email poslan!', 'success');
    await loadReminders();
  } catch {
    showMessage(msg, 'Pošiljanje ni uspelo.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Pošlji zdaj';
  }
}

async function deleteReminder(id, btn) {
  btn.disabled = true;
  if (id === editingReminderId) exitEditMode();
  const reminderData = allReminders.find(r => r.id === id);
  const undoData = reminderData ? { ...reminderData, pinned: isPinned(id) } : null;
  try {
    const res = await apiFetch(`/api/reminders/${id}`, { method: 'DELETE' });
    if (res.status === 401) { handleUnauthorized(); btn.disabled = false; return; }
    if (!res.ok) { btn.disabled = false; return; }
    if (undoData) showUndoToast(undoData);
    await loadReminders();
  } catch {
    btn.disabled = false;
  }
}

// ── Undo Delete ───────────────────────────────────────────────

let undoPending = null;
let undoTimer   = null;

function showUndoToast(reminderData) {
  undoPending = reminderData;
  if (undoTimer) clearTimeout(undoTimer);
  const toast = document.getElementById('undoToast');
  toast.classList.remove('hidden', 'hiding');
  undoTimer = setTimeout(() => hideUndoToast(), 5000);
}

function hideUndoToast() {
  const toast = document.getElementById('undoToast');
  if (toast.classList.contains('hidden')) return;
  toast.classList.add('hiding');
  setTimeout(() => {
    toast.classList.add('hidden');
    toast.classList.remove('hiding');
    undoPending = null;
    undoTimer   = null;
  }, 220);
}

document.getElementById('undoBtn').addEventListener('click', async () => {
  if (!undoPending) return;
  const data = undoPending;
  hideUndoToast();
  try {
    const res = await apiFetch('/api/reminders', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title: data.title, description: data.description, remindAt: data.remindAt, email: data.email }),
    });
    if (res.ok) {
      const created = await res.json();
      if (data.pinned) setPinned(created.id, true);
      await loadReminders();
    }
  } catch {}
});

// ── Edit Reminder ─────────────────────────────────────────────

function enterEditMode(reminder) {
  editingReminderId = reminder.id;
  document.getElementById('editModeTitle').textContent = 'Urejate: ' + reminder.title;
  document.getElementById('editModeBanner').classList.remove('hidden');
  document.getElementById('saveBtn').textContent = 'Posodobi opomnik';
}

function exitEditMode() {
  if (!editingReminderId) return;
  editingReminderId = null;
  document.getElementById('editModeBanner').classList.add('hidden');
  document.getElementById('saveBtn').textContent = 'Shrani opomnik';
}

async function editReminder(id) {
  const reminder = allReminders.find(r => r.id === id);
  if (!reminder) return;
  setMode('manual');
  exitPreviewMode();
  document.getElementById('title').value       = reminder.title;
  document.getElementById('description').value = reminder.description || '';
  setRemindAt(new Date(reminder.remindAt));
  document.getElementById('email').value       = reminder.email;
  lastParsedEventDate = null;
  updateDetectCard(null);
  updateConfidenceIndicator(null);
  // Restore follow-up setting
  const followUpSel = document.getElementById('followUpSelect');
  if (reminder.followUp && reminder.followUp.enabled) {
    const presets = [60, 120, 1440, 2880];
    if (presets.includes(reminder.followUp.delayMinutes)) {
      followUpSel.value = String(reminder.followUp.delayMinutes);
      document.getElementById('followUpCustomFields').classList.add('hidden');
    } else {
      followUpSel.value = 'custom';
      document.getElementById('followUpCustomFields').classList.remove('hidden');
      const mins = reminder.followUp.delayMinutes;
      if (mins < 60) {
        document.getElementById('followUpAmount').value = mins;
        document.getElementById('followUpUnit').value   = 'minut';
      } else if (mins < 1440) {
        document.getElementById('followUpAmount').value = Math.round(mins / 60);
        document.getElementById('followUpUnit').value   = 'ur';
      } else {
        document.getElementById('followUpAmount').value = Math.round(mins / 1440);
        document.getElementById('followUpUnit').value   = 'dni';
      }
    }
  } else {
    followUpSel.value = '0';
    document.getElementById('followUpCustomFields').classList.add('hidden');
  }

  enterEditMode(reminder);
  updateTimingPreview();
  updateFollowUpPreview();
  document.getElementById('manualSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.getElementById('cancelEditBtn').addEventListener('click', exitEditMode);

// ── Form save ─────────────────────────────────────────────────

async function savePendingReminder() {
  const title    = document.getElementById('title').value.trim();
  const desc     = document.getElementById('description').value.trim();
  const localVal = document.getElementById('remindAt').value;
  const remindAt = localVal ? new Date(localVal).toISOString() : '';
  const email    = document.getElementById('email').value.trim();
  const msg      = document.getElementById('formMessage');

  if (!title || !remindAt) {
    exitPreviewMode();
    showMessage(msg, 'Prosim izpolni naslov in datum.', 'error');
    return;
  }

  if (!validateEmail(email, msg)) {
    exitPreviewMode();
    return;
  }

  const isEditing = !!editingReminderId;
  exitPreviewMode();

  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Shranjujem…';

  try {
    const url    = isEditing ? `/api/reminders/${editingReminderId}` : '/api/reminders';
    const method = isEditing ? 'PATCH' : 'POST';
    const followUpMinutes  = getFollowUpMinutes();
    const followUpPayload  = followUpMinutes > 0 ? { enabled: true, delayMinutes: followUpMinutes } : null;
    const res  = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title, description: desc, remindAt, email, followUp: followUpPayload }),
    });
    const data = await res.json();
    if (res.status === 401) { handleUnauthorized(); return; }
    if (!res.ok) {
      showMessage(msg, apiErrorDisplay(data), 'error');
      return;
    }

    exitEditMode();
    document.getElementById('title').value = '';
    document.getElementById('description').value = '';
    document.getElementById('smartText').value = '';

    const nextDay = new Date();
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(9, 0, 0, 0);
    setRemindAt(nextDay);
    lastParsedEventDate = null;
    updateDetectCard(null);
    updateConfidenceIndicator(null);
    document.getElementById('quickDateInput').value = '';
    document.getElementById('followUpSelect').value = '0';
    document.getElementById('followUpCustomFields').classList.add('hidden');
    updateTimingPreview();
    updateFollowUpPreview();

    showMessage(msg, isEditing ? '✓ Opomnik posodobljen!' : '✓ Opomnik shranjen!', 'success');
    await loadReminders();
  } catch {
    showMessage(msg, 'Shranjevanje ni uspelo.', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Shrani opomnik';
  }
}

document.getElementById('saveBtn').addEventListener('click', savePendingReminder);

document.getElementById('testEmailBtn').addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  const msg   = document.getElementById('testEmailMsg');
  const btn   = document.getElementById('testEmailBtn');

  if (!validateEmail(email, msg)) return;

  btn.disabled = true;
  btn.textContent = 'Pošiljam…';

  try {
    const res  = await apiFetch('/api/test-email', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email }),
    });
    const data = await res.json();
    if (res.status === 401) { handleUnauthorized(); return; }
    if (!res.ok) {
      showMessage(msg, apiErrorDisplay(data), 'error');
      return;
    }
    showMessage(msg, '✓ Testni email poslan! Preveri Gmail.', 'success');
  } catch {
    showMessage(msg, 'Pošiljanje ni uspelo.', 'error');
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
    hour: '2-digit', minute: '2-digit', hour12: false,
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
    exitEditMode();
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

document.getElementById('helpBtn').addEventListener('click', function () {
  const card = document.getElementById('helpCard');
  const show = card.classList.contains('hidden');
  card.classList.toggle('hidden', !show);
  this.classList.toggle('active', show);
});

// ── Custom Offset Toggle ──────────────────────────────────────

document.getElementById('customOffsetToggle').addEventListener('change', function () {
  document.getElementById('customOffsetFields').classList.toggle('hidden', !this.checked);
  document.getElementById('smartOffset').disabled = this.checked;
  recomputeSmartRemind();
});

document.getElementById('smartOffset').addEventListener('change', recomputeSmartRemind);
document.getElementById('customOffsetAmount').addEventListener('input', recomputeSmartRemind);
document.getElementById('customOffsetUnit').addEventListener('change', recomputeSmartRemind);

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

  const { title, eventDate, remindAt, description, confidence, confidenceReason, warning } = result;

  document.getElementById('title').value       = title;
  document.getElementById('description').value = description;

  const displayInput = document.getElementById('remindAtDisplay');

  if (remindAt && confidence !== 'low' && confidence !== 'none') {
    setRemindAt(remindAt);
    displayInput.style.borderColor = '';

    const isPast = remindAt < new Date();
    if (isPast) {
      showMessage(msg, 'Opomnik bi bil poslan v preteklosti. Izberi manjši zamik ali kasnejši čas.', 'error');
    } else if (warning) {
      showMessage(msg, warning, 'error');
    } else {
      showMessage(msg, 'Opomnik pripravljen 👌', 'success');
    }

    showExtractedContacts(extractContacts(text));
    revealManualForm();
    if (!isPast) enterPreviewMode(eventDate, remindAt);
    lastParsedEventDate = new Date(eventDate);
    updateDetectCard(eventDate, remindAt);
    updateConfidenceIndicator(confidence, confidenceReason);
    updateTimingPreview();
    updateFollowUpPreview();

  } else {
    setRemindAt(null);
    displayInput.style.borderColor = 'var(--amber)';
    setTimeout(() => { displayInput.style.borderColor = ''; }, 4500);

    const errMsg = warning
      ? warning
      : { code: 'ERR-014', message: 'Datuma nisem prepoznala.', action: 'Izberi datum ročno.' };
    showMessage(msg, errMsg, 'error');

    lastParsedEventDate = null;
    updateDetectCard(null);
    updateConfidenceIndicator(confidence, confidenceReason);
    showExtractedContacts(extractContacts(text));
    revealManualForm();
  }
});

// ── Quick Buttons ─────────────────────────────────────────────

function setQuickTime(date, btn) {
  setRemindAt(date);
  document.querySelectorAll('.btn-quick').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  updateTimingPreview();
  updateFollowUpPreview();
}

document.getElementById('quickTodayNoon').addEventListener('click', function() {
  const d = new Date(); d.setHours(12, 0, 0, 0); setQuickTime(d, this);
});
document.getElementById('quickTomorrow9').addEventListener('click', function() {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); setQuickTime(d, this);
});
document.getElementById('quickTomorrow12').addEventListener('click', function() {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0); setQuickTime(d, this);
});
document.getElementById('quickFriday12').addEventListener('click', function() {
  const d = getNextWeekday(5, false); d.setHours(12, 0, 0, 0); setQuickTime(d, this);
});
document.getElementById('quickNextWeek').addEventListener('click', function() {
  const d = getNextWeekday(1, true); d.setHours(9, 0, 0, 0); setQuickTime(d, this);
});

document.getElementById('remindAtDisplay').addEventListener('blur', applyRemindAtDisplay);
document.getElementById('remindAtDisplay').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { applyRemindAtDisplay(); e.preventDefault(); }
});
document.getElementById('remindAtDisplay').addEventListener('input', () => {
  document.querySelectorAll('.btn-quick').forEach(b => b.classList.remove('active'));
});

// ── Quick Edit Chips ──────────────────────────────────────────

function applyChip(newDate) {
  if (!newDate || isNaN(newDate.getTime())) return;
  setRemindAt(newDate);
  document.querySelectorAll('.btn-quick').forEach(b => b.classList.remove('active'));
  updateTimingPreview();
  updateFollowUpPreview();
  if (lastParsedEventDate) updateDetectCard(lastParsedEventDate, newDate);
}

document.getElementById('chip1h').addEventListener('click', () => {
  const val = document.getElementById('remindAt').value;
  const d = val ? new Date(val) : new Date(); d.setHours(d.getHours() + 1); applyChip(d);
});
document.getElementById('chip2h').addEventListener('click', () => {
  const val = document.getElementById('remindAt').value;
  const d = val ? new Date(val) : new Date(); d.setHours(d.getHours() + 2); applyChip(d);
});
document.getElementById('chipJutri').addEventListener('click', () => {
  const val = document.getElementById('remindAt').value;
  const d = val ? new Date(val) : null;
  const t = new Date(); t.setDate(t.getDate() + 1);
  t.setHours(d ? d.getHours() : 9, d ? d.getMinutes() : 0, 0, 0);
  applyChip(t);
});
document.getElementById('chipPetek').addEventListener('click', () => {
  const val = document.getElementById('remindAt').value;
  const d = val ? new Date(val) : null;
  const f = getNextWeekday(5, false);
  f.setHours(d ? d.getHours() : 12, d ? d.getMinutes() : 0, 0, 0);
  applyChip(f);
});
document.getElementById('chip0900').addEventListener('click', () => {
  const val = document.getElementById('remindAt').value;
  const d = val ? new Date(val) : new Date(); d.setHours(9, 0, 0, 0); applyChip(d);
});
document.getElementById('chip1200').addEventListener('click', () => {
  const val = document.getElementById('remindAt').value;
  const d = val ? new Date(val) : new Date(); d.setHours(12, 0, 0, 0); applyChip(d);
});
document.getElementById('chip1700').addEventListener('click', () => {
  const val = document.getElementById('remindAt').value;
  const d = val ? new Date(val) : new Date(); d.setHours(17, 0, 0, 0); applyChip(d);
});

// ── Quick Date Helper ─────────────────────────────────────────

function applyQuickDate() {
  const text = document.getElementById('quickDateInput').value.trim();
  const msg  = document.getElementById('quickDateMsg');
  if (!text) { showMessage(msg, 'Vpiši besedilo za hitri datum.', 'error'); return; }

  const result = parseSmartReminderText(text, '0');
  if (!result.eventDate || result.confidence === 'none') {
    showMessage(msg, { code: 'ERR-014', message: 'Datuma nisem prepoznala.', action: 'Poskusi z jasnejšim formatom, npr. "jutri ob 9" ali "next Friday at 12".' }, 'error');
    return;
  }

  setRemindAt(result.eventDate);
  document.getElementById('quickDateInput').value = '';
  document.querySelectorAll('.btn-quick').forEach(b => b.classList.remove('active'));
  updateTimingPreview();
  updateFollowUpPreview();
  if (lastParsedEventDate) updateDetectCard(lastParsedEventDate, result.eventDate);
  showMessage(msg, '✓ Datum nastavljen.', 'success');
}

document.getElementById('quickDateApplyBtn').addEventListener('click', applyQuickDate);
document.getElementById('quickDateInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') applyQuickDate();
});

// ── Follow-up Reminder ────────────────────────────────────────

document.getElementById('followUpSelect').addEventListener('change', function () {
  document.getElementById('followUpCustomFields').classList.toggle('hidden', this.value !== 'custom');
  updateFollowUpPreview();
});
document.getElementById('followUpAmount').addEventListener('input', updateFollowUpPreview);
document.getElementById('followUpUnit').addEventListener('change', updateFollowUpPreview);

// ── Smart Extracted Contacts ──────────────────────────────────

function extractContacts(text) {
  const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const found = []; const seen = new Set(); let m;
  while ((m = re.exec(text)) !== null && found.length < 3) {
    const e = m[0].toLowerCase();
    if (!seen.has(e)) { seen.add(e); found.push(e); }
  }
  return found;
}

function useContactEmail(email) {
  document.getElementById('email').value = email;
  if (document.getElementById('rememberEmail').checked) localStorage.setItem(EMAIL_KEY, email);
  updateEmailStatus();
}

function showExtractedContacts(contacts) {
  const section = document.getElementById('contactsSection');
  const chips   = document.getElementById('contactChips');
  if (!contacts || contacts.length === 0) {
    section.classList.add('hidden');
    chips.innerHTML = '';
    return;
  }
  chips.innerHTML = '';
  contacts.forEach(email => {
    const chip = document.createElement('div');
    chip.className = 'contact-chip';
    chip.title     = 'Klikni za kopiranje';
    chip.innerHTML = `<span class="contact-chip-email">${escHtml(email)}</span><button type="button" class="contact-chip-use" onclick="useContactEmail(${JSON.stringify(email)})">Uporabi</button>`;
    chip.addEventListener('click', (e) => {
      if (e.target.classList.contains('contact-chip-use')) return;
      navigator.clipboard.writeText(email).catch(() => {});
    });
    chips.appendChild(chip);
  });
  section.classList.remove('hidden');
}

// ── History Intelligence ──────────────────────────────────────

function buildHistoryInsights(reminders) {
  if (reminders.length < 3) return [];
  const insights = [];

  const hourCounts = {};
  reminders.forEach(r => { const h = new Date(r.remindAt).getHours(); hourCounts[h] = (hourCounts[h] || 0) + 1; });
  const topHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
  if (topHour && topHour[1] >= 2) insights.push(`Najpogostejši čas opomnika: ${String(topHour[0]).padStart(2, '0')}:00.`);

  const fuCount = reminders.filter(r => r.followUp && r.followUp.enabled).length;
  if (fuCount > 0) insights.push(`Ustvarjaš nadaljnje opomnike (${fuCount}x).`);

  const STOP = new Set(['in','na','za','ob','do','od','po','je','se','so','to','ko','da','bi','ga','jo','mi','ti','mu','ji','ter','ali','ker','med','pri']);
  const wordCounts = {};
  reminders.forEach(r => {
    r.title.toLowerCase().split(/[\s,.:;!?]+/).forEach(w => {
      if (w.length >= 4 && !STOP.has(w)) wordCounts[w] = (wordCounts[w] || 0) + 1;
    });
  });
  const topWords = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]).slice(0, 2).filter(e => e[1] >= 2);
  if (topWords.length > 0) insights.push(`Pogoste besede: ${topWords.map(e => e[0]).join(', ')}.`);

  const overdue = reminders.filter(r => !r.sent && new Date(r.remindAt) < new Date()).length;
  const sent    = reminders.filter(r => r.sent).length;
  if (overdue > 0) insights.push(`${overdue} zamujeni${overdue === 1 ? '' : 'h'} opomnik${overdue === 1 ? '' : 'ov'}.`);
  else if (sent >= 3) insights.push(`${sent} opomnikov uspešno poslanih.`);

  return insights;
}

function renderInsights(reminders) {
  const section = document.getElementById('insightsSection');
  const list    = document.getElementById('insightsList');
  if (!section || !list) return;
  const insights = buildHistoryInsights(reminders);
  if (insights.length === 0) { section.classList.add('hidden'); return; }
  list.innerHTML = insights.map(t => `<div class="insight-item">${escHtml(t)}</div>`).join('');
  section.classList.remove('hidden');
}

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

// ── Theme ─────────────────────────────────────────────────────

const THEME_KEY        = 'marusa_theme';
const THEME_CUSTOM_KEY = 'marusa_theme_custom';

const THEMES = {
  marusa: { '--bg':'#f9f5f0','--surface':'#ffffff','--border':'#ede8e0','--text':'#2c2521','--muted':'#8a7f78','--accent':'#c96a4a','--accent-lt':'#f5e8e3' },
  forest: { '--bg':'#f0f5f1','--surface':'#ffffff','--border':'#cde0d2','--text':'#1e2d21','--muted':'#5e8066','--accent':'#3d8c52','--accent-lt':'#d8eede' },
  night:  { '--bg':'#1e1e2a','--surface':'#28283a','--border':'#3e3e56','--text':'#e0e0f0','--muted':'#9090b0','--accent':'#a087d4','--accent-lt':'#3a2860' },
};

function lightenColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const h = n => Math.round(n).toString(16).padStart(2, '0');
  return '#' + h(r + (255-r)*0.82) + h(g + (255-g)*0.82) + h(b + (255-b)*0.82);
}

function applyTheme(name, customColors) {
  const vars = Object.assign({}, THEMES[name] || THEMES.marusa);

  if (name === 'custom' && customColors) {
    Object.assign(vars, THEMES.marusa);
    if (customColors.accent) { vars['--accent'] = customColors.accent; vars['--accent-lt'] = lightenColor(customColors.accent); }
    if (customColors.bg)      vars['--bg']      = customColors.bg;
    if (customColors.surface) vars['--surface'] = customColors.surface;
  }

  const root = document.documentElement;
  for (const prop in vars) root.style.setProperty(prop, vars[prop]);
  root.setAttribute('data-theme', name);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', vars['--accent']);

  const accentEl  = document.getElementById('customAccent');
  const bgEl      = document.getElementById('customBg');
  const surfaceEl = document.getElementById('customSurface');
  if (accentEl)  accentEl.value  = vars['--accent'];
  if (bgEl)      bgEl.value      = vars['--bg'];
  if (surfaceEl) surfaceEl.value = vars['--surface'];

  document.querySelectorAll('.btn-theme').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === name);
  });
}

function loadSavedTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'marusa';
  let custom = null;
  if (saved === 'custom') {
    try { custom = JSON.parse(localStorage.getItem(THEME_CUSTOM_KEY) || '{}'); } catch {}
  }
  applyTheme(saved, custom);
}

document.querySelectorAll('.btn-theme').forEach(btn => {
  btn.addEventListener('click', function () {
    applyTheme(this.dataset.theme, null);
    localStorage.setItem(THEME_KEY, this.dataset.theme);
    localStorage.removeItem(THEME_CUSTOM_KEY);
  });
});

['customAccent', 'customBg', 'customSurface'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    const custom = {
      accent:  document.getElementById('customAccent').value,
      bg:      document.getElementById('customBg').value,
      surface: document.getElementById('customSurface').value,
    };
    applyTheme('custom', custom);
    localStorage.setItem(THEME_KEY, 'custom');
    localStorage.setItem(THEME_CUSTOM_KEY, JSON.stringify(custom));
  });
});

document.getElementById('resetThemeBtn').addEventListener('click', () => {
  applyTheme('marusa', null);
  localStorage.setItem(THEME_KEY, 'marusa');
  localStorage.removeItem(THEME_CUSTOM_KEY);
});

// ── Browser Notifications ─────────────────────────────────────

const appStartTime = Date.now();
const NOTIF_KEY    = 'marusa_notified';

function getNotifiedIds() {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]')); }
  catch { return new Set(); }
}

function markNotified(id) {
  const ids = getNotifiedIds();
  ids.add(id);
  localStorage.setItem(NOTIF_KEY, JSON.stringify([...ids]));
}

function checkAndNotify(reminders) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const notified = getNotifiedIds();
  const now = Date.now();
  reminders.forEach(r => {
    if (notified.has(r.id)) return;
    const t = new Date(r.remindAt).getTime();
    // Only notify for reminders that became due after app started (30s tolerance)
    if (t <= now && t >= appStartTime - 30000) {
      try {
        const n = new Notification('🔔 Maruša Reminder', {
          body: r.title + (r.description ? '\n' + r.description : ''),
          icon: '/icons/apple-touch-icon.png',
          tag:  'marusa-' + r.id,
        });
        n.onclick = () => { window.focus(); };
      } catch(e) {}
      markNotified(r.id);
    }
  });
}

const NOTIF_FOLLOWUP_KEY = 'marusa_notified_followup';

function getNotifiedFollowUpIds() {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIF_FOLLOWUP_KEY) || '[]')); }
  catch { return new Set(); }
}

function markFollowUpNotified(id) {
  const ids = getNotifiedFollowUpIds();
  ids.add(id);
  localStorage.setItem(NOTIF_FOLLOWUP_KEY, JSON.stringify([...ids]));
}

function checkAndNotifyFollowUps(reminders) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const notified = getNotifiedFollowUpIds();
  const now = Date.now();
  reminders.forEach(r => {
    if (!r.followUp || !r.followUp.enabled) return;
    if (notified.has(r.id)) return;
    const followUpTime = new Date(r.remindAt).getTime() + r.followUp.delayMinutes * 60000;
    if (followUpTime <= now && followUpTime >= appStartTime - 30000) {
      try {
        const n = new Notification('🔔 Maruša Follow-up', {
          body: 'Ponovno preveri: ' + r.title,
          icon: '/icons/apple-touch-icon.png',
          tag:  'marusa-followup-' + r.id,
        });
        n.onclick = () => { window.focus(); };
      } catch(e) {}
      markFollowUpNotified(r.id);
    }
  });
}

function updateNotifUI() {
  const statusEl = document.getElementById('notifStatus');
  const btn      = document.getElementById('notifRequestBtn');
  if (!statusEl || !btn) return;

  if (!('Notification' in window)) {
    statusEl.textContent = 'Ta brskalnik ne podpira obvestil.';
    btn.classList.add('hidden');
    return;
  }

  if (Notification.permission === 'granted') {
    statusEl.textContent = '✓ Browser obvestila omogočena.';
    statusEl.className   = 'notif-status notif-granted';
    btn.classList.add('hidden');
  } else if (Notification.permission === 'denied') {
    statusEl.textContent = 'Obvestila so blokirana. Omogoči jih v nastavitvah brskalnika.';
    statusEl.className   = 'notif-status';
    btn.classList.add('hidden');
  } else {
    statusEl.textContent = 'Dovoli browser obvestila za hitre opomnike.';
    statusEl.className   = 'notif-status';
    btn.classList.remove('hidden');
  }
}

document.getElementById('notifRequestBtn').addEventListener('click', async () => {
  if (!('Notification' in window)) return;
  await Notification.requestPermission();
  updateNotifUI();
});

// ── PWA Install ───────────────────────────────────────────────

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); });

// ── Init ──────────────────────────────────────────────────────

(async function init() {
  loadSavedTheme();

  // Default reminder time: tomorrow at 09:00
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  setRemindAt(d);

  // Restore saved email — readonly is set in HTML to block browser autofill until this point
  const savedEmail = localStorage.getItem(EMAIL_KEY);
  const emailEl = document.getElementById('email');
  if (savedEmail) {
    emailEl.value = savedEmail;
    document.getElementById('rememberEmail').checked = true;
  }
  emailEl.removeAttribute('readonly');
  updateEmailStatus();

  // Restore last mode
  setMode(localStorage.getItem(MODE_KEY) || 'smart');

  updateTimingPreview();
  updateFollowUpPreview();

  updateNotifUI();

  // Auth check (lock screen / protected mode)
  const ready = await initAuth();
  if (ready) await loadReminders();
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch(() => {});
}

setInterval(async () => {
  // Only refresh when the app is unlocked (lock screen not visible)
  if (document.getElementById('lockScreen').classList.contains('hidden')) {
    await loadReminders();
  }
}, 60 * 1000);
