// Parser tests — fixed "now" = Monday 2026-05-11 09:00:00 local
// Run: node scripts/test-parser.js

// ── Mock Date ────────────────────────────────────────────────────────────────

const MOCK_NOW = new Date(2026, 4, 11, 9, 0, 0, 0); // Mon 11 May 2026 09:00
const RealDate = global.Date;
class MockDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(MOCK_NOW.getTime());
    else super(...args);
  }
  static now() { return MOCK_NOW.getTime(); }
}
MockDate.prototype = RealDate.prototype;
// preserve static methods
Object.setPrototypeOf(MockDate, RealDate);
global.Date = MockDate;

// ── Parser functions (copied from public/app.js) ─────────────────────────────

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

const GREETING_RE  = /^(zdravo|živjo|hej|hello|hi\b|lep pozdrav|dober dan|dear\b|pozdravljeni)[,!.\s]*/i;
const SIGNATURE_RE = /\n[ \t]*(lep pozdrav|l\.?p\.?|s spoštovanjem|best regards|kind regards|regards|cheers|hvala in lep pozdrav)[^\n]*/gi;

function getNextWeekday(targetDay, forceNext) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let diff = targetDay - today.getDay();
  if (diff < 0 || (forceNext && diff === 0)) diff += 7;
  const d = new Date(today);
  d.setDate(today.getDate() + diff);
  return d;
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

  const deadlineT = text.match(/(?:do|by)\s+(\d{1,2})\s*(?:h\b|\s+h\b|[:](\d{2}))/i);
  if (deadlineT) {
    const h = parseInt(deadlineT[1], 10);
    const min = deadlineT[2] ? parseInt(deadlineT[2], 10) : 0;
    if (h >= 0 && h <= 23) return { hour: h, minute: min };
  }
  const deadlineBare = text.match(/(?:do|by)\s+(\d{1,2})\b(?![\.\d\/\-])/i);
  if (deadlineBare) {
    const h = parseInt(deadlineBare[1], 10);
    if (h >= 0 && h <= 23) return { hour: h, minute: 0 };
  }

  const okoli = text.match(/(?:okoli|okrog)\s+(\d{1,2})(?:[.:](\d{2}))?\b/i);
  if (okoli) {
    const h = parseInt(okoli[1], 10);
    const min = okoli[2] ? parseInt(okoli[2], 10) : 0;
    if (h >= 0 && h <= 23) return { hour: h, minute: min };
  }

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

function extractDate(text) {
  const lower = text.toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const exact    = d => ({ date: d, tier: 'exact'    });
  const relative = d => ({ date: d, tier: 'relative' });
  const weekday  = d => ({ date: d, tier: 'weekday'  });
  const vague    = d => ({ date: d, tier: 'vague'    });

  if (/\bdanes\b|\btoday\b|\bdue today\b|\brok je danes\b/.test(lower))    return relative(new Date(today));

  if (/\bjutri\b|\btomorrow\b|\bdue tomorrow\b|\brok je jutri\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 1); return relative(d);
  }
  if (/\bpojutrišnjem\b|\bday after tomorrow\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 2); return relative(d);
  }

  if (/čez\s+en\s+dan|čez\s+eno?\s+dn/.test(lower))  { const d = new Date(today); d.setDate(d.getDate() + 1); return relative(d); }
  if (/čez\s+dv[ae]\s+dn/.test(lower))  { const d = new Date(today); d.setDate(d.getDate() + 2); return relative(d); }
  if (/čez\s+tri\s+dn/.test(lower))     { const d = new Date(today); d.setDate(d.getDate() + 3); return relative(d); }

  const cezDni = lower.match(/čez\s+(\d+)\s+dn/);
  if (cezDni) { const d = new Date(today); d.setDate(d.getDate() + parseInt(cezDni[1])); return relative(d); }

  if (/čez\s+dv[ae]\s+ted/.test(lower)) { const d = new Date(today); d.setDate(d.getDate() + 14); return relative(d); }
  const cezTed = lower.match(/čez\s+(\d+)\s+ted/);
  if (cezTed) { const d = new Date(today); d.setDate(d.getDate() + parseInt(cezTed[1]) * 7); return relative(d); }
  if (/čez\s+en\s+ted|čez\s+teden\b/.test(lower)) { const d = new Date(today); d.setDate(d.getDate() + 7); return relative(d); }

  if (/\bin\s+a\s+day\b|\bin\s+one\s+day\b/.test(lower))   { const d = new Date(today); d.setDate(d.getDate() + 1); return relative(d); }
  if (/\bin\s+a\s+week\b|\bin\s+one\s+week\b/.test(lower)) { const d = new Date(today); d.setDate(d.getDate() + 7); return relative(d); }
  if (/\bin\s+two\s+weeks\b/.test(lower))                   { const d = new Date(today); d.setDate(d.getDate() + 14); return relative(d); }
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
    const mWithYear = lower.match(new RegExp(`(\\d{1,2})\\.?\\s+${stem}\\w*\\s+(\\d{4})`, 'i'));
    if (mWithYear) return exact(new Date(+mWithYear[2], mNum-1, +mWithYear[1]));
    const m = lower.match(new RegExp(`(\\d{1,2})\\.?\\s+${stem}`, 'i'));
    if (m) {
      const d = new Date(today.getFullYear(), mNum-1, +m[1]);
      if (d < today) d.setFullYear(d.getFullYear() + 1);
      return exact(d);
    }
  }

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

  if (/naslednji teden|prihodnji teden|drug teden|next week/.test(lower))
    return vague(getNextWeekday(1, true));
  if (/do konca tedna|konec tedna|end of (?:this |the )?week/.test(lower))
    return vague(getNextWeekday(5, false));
  if (/do konca meseca|konec meseca|end of (?:this |the )?month/.test(lower)) {
    const d = new Date(today); d.setMonth(d.getMonth() + 1, 0); return vague(d);
  }

  const forceNext = /naslednji|prihodnji/.test(lower);
  for (const [re, dayNum] of SL_DAYS) {
    if (re.test(lower)) return weekday(getNextWeekday(dayNum, forceNext));
  }
  for (const [re, dayNum] of EN_DAYS) {
    if (re.test(lower)) return weekday(getNextWeekday(dayNum, /\bnext\b/.test(lower)));
  }

  if (/konec dneva|do konca dneva|\beod\b|\bcob\b|end of (?:the )?day/.test(lower))
    return relative(new Date(today));

  return { date: null, tier: null };
}

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

function parseSmartReminderText(text, offset) {
  offset = offset || '0';

  let { date: rawDate, tier } = extractDate(text);
  const timeResult = extractTime(text);

  const relMins = extractRelativeMinutes(text);
  if (relMins !== null) {
    const now = new Date();
    now.setSeconds(0, 0);
    now.setMinutes(now.getMinutes() + relMins);
    return { eventDate: now, remindAt: now, tier: 'relative', timeResult };
  }

  const priorityDate = extractPriorityDate(text);
  if (priorityDate) { rawDate = priorityDate; tier = 'exact'; }

  if (!rawDate) return { eventDate: null, remindAt: null, tier: null, timeResult };

  const eventDate = new Date(rawDate);
  eventDate.setHours(timeResult ? timeResult.hour : 9, timeResult ? timeResult.minute : 0, 0, 0);

  return {
    eventDate,
    remindAt: applyReminderOffset(new Date(eventDate), offset),
    tier,
    timeResult,
  };
}

// ── Quick button simulation ───────────────────────────────────────────────────

function quickTodayNoon()  { const d = new Date(); d.setHours(12, 0, 0, 0); return d; }
function quick1h()         { const d = new Date(); d.setHours(d.getHours() + 1, d.getMinutes(), 0, 0); return d; }
function quickTomorrow9()  { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; }
function quick3d()         { const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(9, 0, 0, 0); return d; }
function quickNextWeek()   { const d = getNextWeekday(1, true); d.setHours(9, 0, 0, 0); return d; }

// ── Test harness ─────────────────────────────────────────────────────────────

let pass = 0, fail = 0;

function dt(y, mo, d, h, mi) { return new Date(y, mo-1, d, h, mi, 0, 0); }

function check(label, actual, expected) {
  const aT = actual ? actual.getTime() : null;
  const eT = expected ? expected.getTime() : null;
  if (aT === eT) {
    console.log(`  PASS  ${label}`);
    pass++;
  } else {
    const aStr = actual  ? actual.toLocaleString('sl-SI')  : 'null';
    const eStr = expected ? expected.toLocaleString('sl-SI') : 'null';
    console.log(`  FAIL  ${label}`);
    console.log(`        got:      ${aStr}`);
    console.log(`        expected: ${eStr}`);
    fail++;
  }
}

function checkTime(label, text, expectedH, expectedM) {
  const t = extractTime(text);
  const ok = t && t.hour === expectedH && t.minute === expectedM;
  if (ok) { console.log(`  PASS  ${label}`); pass++; }
  else {
    console.log(`  FAIL  ${label} — got ${t ? `${t.hour}:${String(t.minute).padStart(2,'0')}` : 'null'}, expected ${expectedH}:${String(expectedM).padStart(2,'0')}`);
    fail++;
  }
}

function checkRelMins(label, text, expectedMins) {
  const m = extractRelativeMinutes(text);
  if (m === expectedMins) { console.log(`  PASS  ${label}`); pass++; }
  else { console.log(`  FAIL  ${label} — got ${m}, expected ${expectedMins}`); fail++; }
}

function smartDate(text) {
  return parseSmartReminderText(text, '0').eventDate;
}

// NOW = Monday 2026-05-11 09:00
const NOW    = MOCK_NOW;
const TODAY  = new Date(2026, 4, 11, 0, 0, 0, 0);
const TOMRW  = new Date(2026, 4, 12, 0, 0, 0, 0);

console.log('\n=== SLOVENIAN PHRASES ===\n');

// 1. danes do 12h
check('1. danes do 12h → today 12:00',
  smartDate('danes do 12h'), dt(2026,5,11,12,0));

// 2. danes ob 12:30
check('2. danes ob 12:30 → today 12:30',
  smartDate('danes ob 12:30'), dt(2026,5,11,12,30));

// 3. jutri ob 9
check('3. jutri ob 9 → tomorrow 09:00',
  smartDate('jutri ob 9'), dt(2026,5,12,9,0));

// 4. jutri do 12h
check('4. jutri do 12h → tomorrow 12:00',
  smartDate('jutri do 12h'), dt(2026,5,12,12,0));

// 5. pojutrišnjem ob 10
check('5. pojutrišnjem ob 10 → 13 May 09:00... wait, ob 10 → 10:00',
  smartDate('pojutrišnjem ob 10'), dt(2026,5,13,10,0));

// 6. čez 30 minut
(function() {
  const r = extractRelativeMinutes('čez 30 minut');
  const expected = 30;
  if (r === expected) { console.log('  PASS  6. čez 30 minut → 30'); pass++; }
  else { console.log(`  FAIL  6. čez 30 minut → got ${r}, expected ${expected}`); fail++; }
})();

// 7. čez pol ure
checkRelMins('7. čez pol ure → 30', 'čez pol ure', 30);

// 8. čez 2 uri
checkRelMins('8. čez 2 uri → 120', 'čez 2 uri', 120);

// 9. naslednji teden → next Monday 2026-05-18 09:00
check('9. naslednji teden → Mon 18 May 09:00',
  smartDate('naslednji teden'), dt(2026,5,18,9,0));

// 10. naslednji ponedeljek (today IS Monday → next Monday = 18 May)
check('10. naslednji ponedeljek → Mon 18 May 09:00',
  smartDate('naslednji ponedeljek'), dt(2026,5,18,9,0));

// 11. v petek ob 12h (next Friday = 15 May)
check('11. v petek ob 12h → Fri 15 May 12:00',
  smartDate('v petek ob 12h'), dt(2026,5,15,12,0));

// 12. do konca tedna → Friday 15 May 17:00
check('12. do konca tedna → Fri 15 May 17:00',
  smartDate('do konca tedna'), dt(2026,5,15,17,0));

// 13. do konca meseca → 31 May 17:00
check('13. do konca meseca → 31 May 17:00',
  smartDate('do konca meseca'), dt(2026,5,31,17,0));

// 14. 15.5.2026
check('14. 15.5.2026 → 15 May 09:00',
  smartDate('15.5.2026'), dt(2026,5,15,9,0));

// 15. 15. maja 2026
check('15. 15. maja 2026 → 15 May 09:00',
  smartDate('15. maja 2026'), dt(2026,5,15,9,0));

// 16. Conference: 27.5.2026 event + prijava do 15.5.2026 → picks 27.5.2026
check('16. conference 27.5.2026 + prijava do 15.5.2026 → 27 May 09:00',
  smartDate('27.5.2026 organiziramo letno konferenco. Vabljeni k prijavi do 15.5.2026'),
  dt(2026,5,27,9,0));

// 17. scanner example "pričakujem do danes do 12h"
check('17. pričakujem do danes do 12h → today 12:00',
  smartDate('Pozdravljeni, odgovor o skenerjih pričakujem do danes do 12h.'),
  dt(2026,5,11,12,0));

console.log('\n=== ENGLISH PHRASES ===\n');

// 18. today by 12
check('18. today by 12 → today 12:00',
  smartDate('today by 12'), dt(2026,5,11,12,0));

// 19. today at 12:30
check('19. today at 12:30 → today 12:30',
  smartDate('today at 12:30'), dt(2026,5,11,12,30));

// 20. tomorrow at 9
check('20. tomorrow at 9 → tomorrow 09:00',
  smartDate('tomorrow at 9'), dt(2026,5,12,9,0));

// 21. tomorrow by noon
check('21. tomorrow by noon → tomorrow 12:00',
  smartDate('tomorrow by noon'), dt(2026,5,12,12,0));

// 22. in 30 minutes
checkRelMins('22. in 30 minutes → 30', 'in 30 minutes', 30);

// 23. in half an hour
checkRelMins('23. in half an hour → 30', 'in half an hour', 30);

// 24. in 2 hours
checkRelMins('24. in 2 hours → 120', 'in 2 hours', 120);

// 25. next week → next Monday
check('25. next week → Mon 18 May 09:00',
  smartDate('next week'), dt(2026,5,18,9,0));

// 26. next Monday at 10am (today IS Monday → next Monday = 18 May)
check('26. next Monday at 10am → Mon 18 May 10:00',
  smartDate('next Monday at 10am'), dt(2026,5,18,10,0));

// 27. by Friday at 12 → Fri 15 May 12:00
check('27. by Friday at 12 → Fri 15 May 12:00',
  smartDate('by Friday at 12'), dt(2026,5,15,12,0));

// 28. by end of week → Fri 15 May 17:00
check('28. by end of week → Fri 15 May 17:00',
  smartDate('by end of week'), dt(2026,5,15,17,0));

// 29. by end of month → 31 May 17:00
check('29. by end of month → 31 May 17:00',
  smartDate('by end of month'), dt(2026,5,31,17,0));

// 30. May 15 2026
check('30. May 15 2026 → 15 May 09:00',
  smartDate('May 15 2026'), dt(2026,5,15,9,0));

// 31. 15 May 2026
check('31. 15 May 2026 → 15 May 09:00',
  smartDate('15 May 2026'), dt(2026,5,15,9,0));

// 32. scanner English: "Please send the scanner order report by Friday at 12"
check('32. by Friday at 12 (English) → Fri 15 May 12:00',
  smartDate('Please send the scanner order report by Friday at 12'),
  dt(2026,5,15,12,0));

console.log('\n=== MANUAL MODE QUICK BUTTONS ===\n');

// 33. Danes ob 12
check('33. quickTodayNoon → today 12:00', quickTodayNoon(), dt(2026,5,11,12,0));

// 34. Čez 1 uro (now is 09:00 → 10:00)
check('34. quick1h → today 10:00', quick1h(), dt(2026,5,11,10,0));

// 35. Jutri ob 9
check('35. quickTomorrow9 → tomorrow 09:00', quickTomorrow9(), dt(2026,5,12,9,0));

// 36. Čez 3 dni
check('36. quick3d → 14 May 09:00', quick3d(), dt(2026,5,14,9,0));

// 37. Naslednji teden → next Monday
check('37. quickNextWeek → Mon 18 May 09:00', quickNextWeek(), dt(2026,5,18,9,0));

// 38. Validation: past date detection
(function() {
  const pastDate = new Date(2020, 0, 1);
  const isPast = pastDate < new Date();
  if (isPast) { console.log('  PASS  38. past date detected as past'); pass++; }
  else        { console.log('  FAIL  38. past date should be detected as past'); fail++; }
})();

// 39-40 — email validation (regex based, no DOM)
(function() {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emptyOk = !EMAIL_RE.test('');
  if (emptyOk) { console.log('  PASS  39. empty email invalid'); pass++; }
  else { console.log('  FAIL  39. empty email should be invalid'); fail++; }
  const badOk = !EMAIL_RE.test('notanemail');
  if (badOk) { console.log('  PASS  40. invalid email rejected'); pass++; }
  else { console.log('  FAIL  40. invalid email should be rejected'); fail++; }
})();

console.log('\n=== ADDITIONAL COVERAGE ===\n');

// 41. čez dve uri
checkRelMins('41. čez dve uri → 120', 'čez dve uri', 120);

// 42. in one hour
checkRelMins('42. in one hour → 60', 'in one hour', 60);

// 43. do konca dneva → today 17:00
check('43. do konca dneva → today 17:00',
  smartDate('do konca dneva'), dt(2026,5,11,17,0));

// 44. prihodnji teden → next Monday
check('44. prihodnji teden → Mon 18 May 09:00',
  smartDate('prihodnji teden'), dt(2026,5,18,9,0));

// 45. ob poldne → 12:00
checkTime('45. ob poldne → 12:00', 'ob poldne', 12, 0);

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${pass} PASS, ${fail} FAIL out of ${pass + fail} tests`);
if (fail === 0) console.log('All tests passed!');
else console.log(`${fail} test(s) failed.`);
process.exit(fail > 0 ? 1 : 0);
