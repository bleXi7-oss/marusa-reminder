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
Object.setPrototypeOf(MockDate, RealDate);
global.Date = MockDate;

// ── Parser functions (synced from public/app.js) ─────────────────────────────

const GREETING_RE  = /^(zdravo|živjo|hej|hello|hi\b|lep pozdrav|dober dan|dear\b|pozdravljeni)[,!.\s]*/i;
const SIGNATURE_RE = /\n[ \t]*(lep pozdrav|l\.?p\.?|s spoštovanjem|best regards|kind regards|regards|cheers|hvala in lep pozdrav)[^\n]*/gi;

const BUSINESS_KEYWORDS = [
  { re: /\brač(un|una|unu|une|uni)\b|\binvoice\b/i,                              label: 'račun' },
  { re: /\bplačil|\bpayment\b|\bunpaid\b|\boverdue\b/i,                          label: 'plačilo' },
  { re: /\bdobavnic|\bdelivery note\b/i,                                          label: 'dobavnica' },
  { re: /\bponudba|\bponudb|\bquotation\b|\bquote\b/i,                           label: 'ponudba' },
  { re: /\bnaročiln|\border confirmation\b/i,                                    label: 'naročilnica' },
  { re: /\bddv\b|\bvat\b/i,                                                      label: 'DDV' },
  { re: /\bfollow.?up\b/i,                                                       label: 'follow-up' },
  { re: /\bknjig|\baccounting\b/i,                                               label: 'računovodstvo' },
  { re: /\bstranka|\bcustomer\b|\bclient\b/i,                                    label: 'stranka' },
  { re: /\bdobavitelj|\bsupplier\b|\bvendor\b/i,                                 label: 'dobavitelj' },
  { re: /\bopomin\b/i,                                                            label: 'opomin' },
  { re: /\bizvršb/i,                                                              label: 'izvršba' },
  { re: /\bzapadl[ae]\s+obveznost|\boutstanding\s+(?:balance|invoice)\b/i,       label: 'zapadle obveznosti' },
  { re: /\bneporavnan|\bneplačan\b/i,                                             label: 'neporavnano' },
  { re: /\bzadnji\s+opomin\b|\bfinal\s+notice\b/i,                               label: 'zadnji opomin' },
  { re: /\bpayment\s+reminder\b|\breminder\s+notice\b/i,                         label: 'opomnik plačila' },
  { re: /\bcollection\s+notice\b|\blegal\s+action\b|\bdebt\s+collect/i,          label: 'izterjava' },
];

const SL_DAYS = [
  [/\bponedelj/i, 1], [/\btorek|\btork/i, 2], [/\bsred/i, 3],
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

function nextWeekWeekday(targetDay) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const daysToNextMonday = dow === 0 ? 1 : 8 - dow;
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysToNextMonday);
  const offset = targetDay === 0 ? 6 : targetDay - 1;
  const d = new Date(nextMonday);
  d.setDate(nextMonday.getDate() + offset);
  return d;
}

function nthWeekdayOfMonth(year, month, targetDay, n) {
  const d = new Date(year, month, 1);
  while (d.getDay() !== targetDay) d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + (n - 1) * 7);
  return d;
}

function lastWeekdayOfMonth(year, month, targetDay) {
  const d = new Date(year, month + 1, 0);
  while (d.getDay() !== targetDay) d.setDate(d.getDate() - 1);
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
  if (/\btakoj\b|\bčim prej\b|\b(?:as\s+soon\s+as\s+possible|asap)\b|\burgentno\b|\bnujno\b|\bimmediately\b/.test(lower))
    return { hour: 17, minute: 0 };

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

  if (/\bdanes\b|\btoday\b|\bdue today\b|\brok je danes\b|\btonight\b/.test(lower))    return relative(new Date(today));

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

  if (/čez\s+en\s+ted|čez\s+teden\b/.test(lower)) { const d = new Date(today); d.setDate(d.getDate() + 7);  return relative(d); }
  if (/čez\s+dv[ae]\s+ted/.test(lower))            { const d = new Date(today); d.setDate(d.getDate() + 14); return relative(d); }
  if (/čez\s+tri\s+ted/.test(lower))               { const d = new Date(today); d.setDate(d.getDate() + 21); return relative(d); }
  if (/čez\s+štiri\s+ted/.test(lower))             { const d = new Date(today); d.setDate(d.getDate() + 28); return relative(d); }
  const cezTed = lower.match(/čez\s+(\d+)\s+ted/);
  if (cezTed) { const d = new Date(today); d.setDate(d.getDate() + parseInt(cezTed[1]) * 7); return relative(d); }

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

  const SL_ORD = { 'enega':1,'enem':1,'dveh':2,'dvema':2,'treh':3,'štirih':4,'petih':5,'šestih':6,'sedmih':7,'osmih':8,'devetih':9,'desetih':10,'petnajstih':15,'trideset':30,'tridesetih':30 };
  const vRokuTedW = lower.match(/\bv\s+roku\s+(\w+)\s+tede?n/);
  if (vRokuTedW) { const weeks = SL_ORD[vRokuTedW[1]] || parseInt(vRokuTedW[1]) || 1; const d = new Date(today); d.setDate(d.getDate() + weeks * 7); return { date: d, tier: 'deadline' }; }
  const vTednih = lower.match(/\bv\s+(?:roku\s+)?(\d+)\s+tede?n/);
  if (vTednih) { const d = new Date(today); d.setDate(d.getDate() + parseInt(vTednih[1]) * 7); return { date: d, tier: 'deadline' }; }

  const vDnehNum = lower.match(/\bv\s+(?:roku\s+)?(\d+)\s+dn/);
  if (vDnehNum) { const d = new Date(today); d.setDate(d.getDate() + parseInt(vDnehNum[1])); return { date: d, tier: 'deadline' }; }
  const vDnehWord = lower.match(/\bv\s+(?:roku\s+)?(\w+)\s+dn/);
  if (vDnehWord && SL_ORD[vDnehWord[1]] !== undefined) { const d = new Date(today); d.setDate(d.getDate() + SL_ORD[vDnehWord[1]]); return { date: d, tier: 'deadline' }; }

  const EN_ORD_W = { 'one':1,'two':2,'three':3,'four':4,'five':5,'six':6,'seven':7,'eight':8,'nine':9,'ten':10,'fourteen':14,'fifteen':15,'thirty':30 };
  const withinDays = lower.match(/\bwithin\s+(\d+)\s+days?\b/);
  if (withinDays) { const d = new Date(today); d.setDate(d.getDate() + parseInt(withinDays[1])); return { date: d, tier: 'deadline' }; }
  const withinDaysW = lower.match(/\bwithin\s+(one|two|three|four|five|six|seven|eight|nine|ten|fourteen|fifteen|thirty)\s+days?\b/);
  if (withinDaysW && EN_ORD_W[withinDaysW[1]]) { const d = new Date(today); d.setDate(d.getDate() + EN_ORD_W[withinDaysW[1]]); return { date: d, tier: 'deadline' }; }
  const withinWeeks = lower.match(/\bwithin\s+(\d+)\s+weeks?\b/);
  if (withinWeeks) { const d = new Date(today); d.setDate(d.getDate() + parseInt(withinWeeks[1]) * 7); return { date: d, tier: 'deadline' }; }

  if (/naslednji teden|prihodnji teden|drug teden/.test(lower)) {
    for (const [re, dayNum] of SL_DAYS) {
      if (re.test(lower)) return weekday(nextWeekWeekday(dayNum));
    }
  }
  if (/next week/.test(lower)) {
    for (const [re, dayNum] of EN_DAYS) {
      if (re.test(lower)) return weekday(nextWeekWeekday(dayNum));
    }
  }

  if (/naslednji teden|prihodnji teden|drug teden|next week/.test(lower))
    return vague(getNextWeekday(1, true));

  if (/konec naslednjega tedna|end of next week/.test(lower))
    return weekday(nextWeekWeekday(5));
  if (/do konca tedna|konec tedna|end of (?:this |the )?week/.test(lower))
    return vague(getNextWeekday(5, false));
  if (/do konca meseca|konec meseca|end of (?:this |the )?month/.test(lower)) {
    const d = new Date(today); d.setMonth(d.getMonth() + 1, 0); return vague(d);
  }

  const nextMonthDaySL = lower.match(/naslednji mesec\s+(\d{1,2})/);
  if (nextMonthDaySL) {
    const d = new Date(today); d.setMonth(d.getMonth() + 1, parseInt(nextMonthDaySL[1])); return exact(d);
  }
  const nextMonthDayEN = lower.match(/next month(?:\s+on(?:\s+the)?)?\s+(\d{1,2})(?:st|nd|rd|th)?/);
  if (nextMonthDayEN) {
    const d = new Date(today); d.setMonth(d.getMonth() + 1, parseInt(nextMonthDayEN[1])); return exact(d);
  }

  const SL_ORD_NTH = { prvi:1,prva:1,drugi:2,druga:2,tretji:3,tretja:3,četrti:4,četrta:4,peti:5,peta:5 };
  const slOrdNM = lower.match(/\b(prvi|prva|drugi|druga|tretji|tretja|četrti|četrta|peti|peta|zadnji|zadnja)\b/);
  if (slOrdNM && /naslednji mesec|prihodnji mesec/.test(lower)) {
    for (const [re, dayNum] of SL_DAYS) {
      if (re.test(lower)) {
        const nm = new Date(today); nm.setMonth(nm.getMonth() + 1);
        const n = SL_ORD_NTH[slOrdNM[1]];
        return exact(n
          ? nthWeekdayOfMonth(nm.getFullYear(), nm.getMonth(), dayNum, n)
          : lastWeekdayOfMonth(nm.getFullYear(), nm.getMonth(), dayNum));
      }
    }
  }
  const EN_ORD_NTH = { first:1,second:2,third:3,fourth:4,fifth:5 };
  const enOrdNM = lower.match(/\b(first|second|third|fourth|fifth|last)\b/);
  if (enOrdNM && /next month/.test(lower)) {
    for (const [re, dayNum] of EN_DAYS) {
      if (re.test(lower)) {
        const nm = new Date(today); nm.setMonth(nm.getMonth() + 1);
        const n = EN_ORD_NTH[enOrdNM[1]];
        return exact(n
          ? nthWeekdayOfMonth(nm.getFullYear(), nm.getMonth(), dayNum, n)
          : lastWeekdayOfMonth(nm.getFullYear(), nm.getMonth(), dayNum));
      }
    }
  }

  if (/\bzadnj[ia]\b/.test(lower) && !/naslednji mesec|prihodnji mesec|next month/.test(lower)) {
    for (const [re, dayNum] of SL_DAYS) {
      if (re.test(lower)) {
        let d = lastWeekdayOfMonth(today.getFullYear(), today.getMonth(), dayNum);
        if (d < today) d = lastWeekdayOfMonth(today.getFullYear(), today.getMonth() + 1, dayNum);
        return weekday(d);
      }
    }
  }
  if (/\blast\b/.test(lower) && /\bof\s+(?:the\s+)?month\b/.test(lower)) {
    for (const [re, dayNum] of EN_DAYS) {
      if (re.test(lower)) {
        let d = lastWeekdayOfMonth(today.getFullYear(), today.getMonth(), dayNum);
        if (d < today) d = lastWeekdayOfMonth(today.getFullYear(), today.getMonth() + 1, dayNum);
        return weekday(d);
      }
    }
  }

  // "najkasneje do [weekday]" / "no later than [weekday]" — forceNext so diff===0 (today) still jumps ahead
  if (/\bnajkasneje\b/.test(lower) || /\bno\s+later\s+than\b/.test(lower)) {
    for (const [re, dayNum] of SL_DAYS) {
      if (re.test(lower)) return weekday(getNextWeekday(dayNum, true));
    }
    for (const [re, dayNum] of EN_DAYS) {
      if (re.test(lower)) return weekday(getNextWeekday(dayNum, true));
    }
  }

  const forceNext = /naslednji|prihodnji/.test(lower);
  for (const [re, dayNum] of SL_DAYS) {
    if (re.test(lower)) return weekday(forceNext ? nextWeekWeekday(dayNum) : getNextWeekday(dayNum, false));
  }
  for (const [re, dayNum] of EN_DAYS) {
    if (re.test(lower)) return weekday(/\bnext\b/.test(lower) ? nextWeekWeekday(dayNum) : getNextWeekday(dayNum, false));
  }

  if (/konec dneva|do konca dneva|\beod\b|\bcob\b|end of (?:the )?day/.test(lower))
    return relative(new Date(today));

  if (/\btakoj\b|\bčim prej\b|\b(?:as\s+soon\s+as\s+possible|asap)\b|\burgentno\b|\bnujno\b|\bimmediately\b/.test(lower))
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
    .replace(/\s*\boziroma\s+najkasnej\w*\b.*$/i, '')
    .replace(/\s*\bod\s+prejema\b.*$/i, '')
    .replace(/\s*\bv\s+(?:roku\s+)?\d+\s+dn\w*\b.*$/i, '')
    .replace(/\s*\bwithin\s+\d+\s+days?\b.*$/i, '')
    .replace(/\s*\bčim prej\b.*$/i, '')
    .replace(/\s*,?\s*(?:čim prej|takoj|asap|urgentno|nujno)\s*$/i, '')
    // SL payment-date tails (e.g. "Plačajo do 22.5.2026", "Plačilo do 22.5.")
    .replace(/\s*\b(?:plačaj[oe]|plačil[oa]|plačan[oa]?|plačati|poravna(?:jo|no)|bo\s+plačan[oa]?)\s+do\s+[\d][\d./\-]*.*$/gi, '')
    // EN payment-date tails (e.g. "payment will be made by 22.5.2026", "due by 22.5.")
    .replace(/\s*\b(?:pay(?:ment)?(?:\s+will\s+be\s+made)?|paid)\s+by\s+[\d][\d./\-]*.*$/gi, '')
    .replace(/\s*\bdue\s+by\s+[\d][\d./\-]*.*$/gi, '')
    .replace(/\s*[,.]$/, '')
    .trim();
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

function extractPaymentDeadlineDate(text) {
  const PAYMENT_RE = /(?:plačaj[oe]\s+do|plačil[oa]\s+do|plačan[oa]?\s+do|bo\s+plačan[oa]?\s+do|plačati\s+do|poravna(?:jo|no)\s+do|rok\s+plačila\s+do|pay\s+by|payment\s+(?:will\s+be\s+made\s+)?by|paid\s+by|due\s+by)\s+(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/gi;
  let m;
  while ((m = PAYMENT_RE.exec(text)) !== null) {
    const d = new Date(+m[3], +m[2]-1, +m[1]);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function extractAllExplicitDates(text) {
  const found = [];
  const re = /(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const d = new Date(+m[3], +m[2]-1, +m[1]);
    if (!isNaN(d.getTime())) found.push(d);
  }
  return found;
}

function stripDateTimePhrases(text) {
  return text
    .replace(/\bob\s+\d{1,2}(?:[.:]\d{2})?h?\b/gi, '')
    .replace(/\b(?:at|@)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, '')
    .replace(/\b\d{1,2}:\d{2}\b/g, '')
    .replace(/\b(?:zjutraj|dopoldne|popoldne|zvečer|ponoči|morning|afternoon|evening|tonight|noon|midnight)\b/gi, '')
    .replace(/\bnajkasneje\s+do\s+(?:ponedeljka|torka|srede|četrtka|petka|sobote|nedelje)\b/gi, '')
    .replace(/\bno\s+later\s+than\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\bdo\s+konca\s+meseca\b/gi, '')
    .replace(/\bkonec\s+meseca\b/gi, '')
    .replace(/\bby\s+(?:the\s+)?end\s+of\s+(?:the\s+)?month\b/gi, '')
    .replace(/\bend\s+of\s+(?:the\s+)?month\b/gi, '')
    .replace(/\bdo\s+konca\s+tedna\b/gi, '')
    .replace(/\bkonec\s+tedna\b/gi, '')
    .replace(/\bby\s+(?:the\s+)?end\s+of\s+(?:the\s+)?week\b/gi, '')
    .replace(/\bend\s+of\s+(?:the\s+)?week\b/gi, '')
    .replace(/\bdo\s+konca\s+dneva\b/gi, '')
    .replace(/\bby\s+(?:the\s+)?end\s+of\s+(?:the\s+)?day\b/gi, '')
    .replace(/\bend\s+of\s+(?:the\s+)?day\b/gi, '')
    .replace(/\bdo\s+(?:ponedeljka|torka|srede|četrtka|petka|sobote|nedelje)\b/gi, '')
    .replace(/\bby\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\b(?:prvi|prva|drugi|druga|tretji|tretja|četrti|četrta|peti|peta|zadnji|zadnja)\s+(?:ponedeljek|torek|sred\w+|četrtek|petek|soboto?|nedeljo?)\b/gi, '')
    .replace(/\b(?:first|second|third|fourth|fifth|last)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\b(?:naslednji|prihodnji)\s+(?:teden|mesec)\b/gi, '')
    .replace(/\b(?:naslednji\w*|prihodnji\w*|drug)\s+(?:petek|ponedeljek|torek|sred[oa]|četrtek|soboto?|nedeljo?)\b/gi, '')
    .replace(/\bta\s+(?:petek|ponedeljek|torek|sred[oa]|četrtek|soboto?|nedeljo?)\b/gi, '')
    .replace(/\bv\s+(?:petek|ponedeljek|torek|sred[oa]|četrtek|soboto?|nedeljo?)\b/gi, '')
    .replace(/\bv\s+(?:tem\s+)?mesecu\b/gi, '')
    .replace(/\bof\s+(?:the\s+)?month\b/gi, '')
    .replace(/\b(?:ponedeljek|torek|sreda|sredo|sredin\w+|četrtek|petek|sobota|soboto|nedelja|nedeljo)\b/gi, '')
    .replace(/\bčez\s+(?:\w+\s+){0,2}(?:dan|dni|teden|tedne|uro|ur|minut)\b/gi, '')
    .replace(/\b(?:jutri|danes|pojutrišnjem)\b/gi, '')
    .replace(/\bnext\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\bthis\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\b(?:tomorrow|today|tonight)\b/gi, '')
    .replace(/\bin\s+\w+\s+(?:days?|weeks?|hours?|minutes?)\b/gi, '')
    .replace(/\b(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\bv\s+roku\s+\w+\s+\w+\b/gi, '')
    .replace(/\bv\s+(?:roku\s+)?\d+\s+\w+(?:\s+od\b.*)?/gi, '')
    .replace(/\bwithin\s+(?:\d+|\w+)\s+\w+\b/gi, '')
    .replace(/\bnajkasneje\s+v\b[^,.]*/gi, '')
    .replace(/\bnajkasneje\b/gi, '')
    .replace(/\boziroma\b/gi, '')
    .replace(/\bčim prej\b/gi, '')
    .replace(/\btakoj\b/gi, '')
    .replace(/\b(?:urgentno|nujno|asap)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*[,.\-–]\s*/, '')
    .trim();
}

const BUSINESS_FILLER_RE = /^(?:prosimo,?\s*(?:da\s*|za\s*)?|pričakujemo\s*(?:plačilo\s*|odgovor\s*)?|please\s+(?:pay|settle|send|reply|respond|submit|review|note|be\s+advised)\s*(?:the\s+)?|kindly\s*(?:note\s*)?|note\s+that\s*)/i;

function extractTitle(text, businessContext) {
  const cleaned = text.replace(SIGNATURE_RE, '').trim();

  const subj = cleaned.match(/^(?:subject|zadeva):\s*(.+)/im);
  if (subj) return subj[1].trim().slice(0, 80);

  const SKIP_RE = /^(zdravo|živjo|hej|hello|hi\b|pozdravljeni|hvala|lep pozdrav|lp\b|dear\b)/i;
  const FILLER_START = /^(?:vesela bom[,.]?\s*(?:če\s*se\s*vidimo\.?)?|prosim\b|hvala\b|thank you\b)\s*/i;
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);

  if (lines.length === 1) {
    let stripped = stripDateTimePhrases(lines[0]).replace(GREETING_RE, '').trim();
    // Strip leading context/note date (e.g. "12.5.2026 Klic z Anito. Plačajo do 22.5.")
    stripped = stripped.replace(/^\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}\s+/, '');
    stripped = stripped.replace(BUSINESS_FILLER_RE, '').trim();
    stripped = stripDeadlineTail(stripped);
    if (stripped.length < 8 && /^(?:reply|respond|answer|submit|check)\s*$/i.test(stripped)) {
      const reg = lines[0].match(/\bregarding\s+(.{3,50}?)(?:\s+within\b|\.|,|$)/i);
      if (reg) stripped = reg[1].trim();
    }
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
    t = t.replace(BUSINESS_FILLER_RE, '').trim();
    if (t.length < 4) continue;
    t = t.replace(/^\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}\s+/, '');
    t = t.replace(/^please\s+/i, '');
    t = stripDeadlineTail(t);
    if (t.length < 4) continue;
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

  const paymentDate = extractPaymentDeadlineDate(text);
  if (paymentDate) {
    rawDate = paymentDate;
    tier = 'exact';
  } else {
    const priorityDate = extractPriorityDate(text);
    if (priorityDate) {
      rawDate = priorityDate;
      tier = 'exact';
    }
  }

  const alternativeDates = rawDate
    ? extractAllExplicitDates(text).filter(d =>
        d.getFullYear() !== rawDate.getFullYear() ||
        d.getMonth()    !== rawDate.getMonth()    ||
        d.getDate()     !== rawDate.getDate()
      ).filter((d, i, arr) => arr.findIndex(x => x.getTime() === d.getTime()) === i)
    : [];

  if (!rawDate) {
    return {
      title, eventDate: null, remindAt: null, description, confidence: 'none',
      confidenceReason: 'Datum ni bil zaznan.', businessContext, alternativeDates: [],
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
  if (tier === 'deadline') {
    confidence = 'high'; confidenceReason = 'Zaznan jasen rok (plačilni/odgovorni rok).';
  } else if (tier === 'exact' && timeResult) {
    confidence = 'high'; confidenceReason = 'Zaznan jasen datum in ura.';
  } else if ((tier === 'relative' || tier === 'weekday') && timeResult) {
    confidence = 'high'; confidenceReason = 'Zaznan jasen datum in ura.';
  } else if (tier === 'exact' || tier === 'relative' || tier === 'weekday') {
    confidence = 'medium'; confidenceReason = 'Ura ni bila najdena, uporabljena je privzeta 09:00.';
  } else if (tier === 'vague' && timeResult) {
    confidence = 'medium'; confidenceReason = 'Datum je okvirno določen, preveri.';
  } else {
    confidence = 'low'; confidenceReason = 'Datum je ohlapno določen, preveri.';
  }

  const warning = (multiDate && alternativeDates.length === 0)
    ? 'Našla sem več možnih datumov. Preveri, če je izbran pravi.'
    : null;
  if (multiDate && alternativeDates.length === 0) confidenceReason = 'Najdenih je več datumov, preveri izbiro.';

  return {
    title, eventDate,
    remindAt: applyReminderOffset(new Date(eventDate), offset || '0'),
    description, confidence, confidenceReason, warning, businessContext, alternativeDates,
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

function checkStr(label, actual, expected) {
  if (actual === expected) {
    console.log(`  PASS  ${label}`);
    pass++;
  } else {
    console.log(`  FAIL  ${label}`);
    console.log(`        got:      "${actual}"`);
    console.log(`        expected: "${expected}"`);
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

function smartTitle(text) {
  return parseSmartReminderText(text, '0').title;
}

function smartAltDates(text) {
  return parseSmartReminderText(text, '0').alternativeDates || [];
}

function checkNum(label, actual, expected) {
  if (actual === expected) {
    console.log(`  PASS  ${label}`);
    pass++;
  } else {
    console.log(`  FAIL  ${label} — got ${actual}, expected ${expected}`);
    fail++;
  }
}

// NOW = Monday 2026-05-11 09:00
// Next Friday = 2026-05-15
// End of May = 2026-05-31
// First Monday of June 2026 = 2026-06-01

console.log('\n=== REQUIRED CASES (SL + EN) ===\n');

// SL1: naslednji petek ob 12h oddaj poročilo → NEXT WEEK's Fri 22 May 12:00, title "Oddaj poročilo"
check('SL1 date: naslednji petek ob 12h oddaj poročilo → Fri 22 May 12:00',
  smartDate('naslednji petek ob 12h oddaj poročilo'), dt(2026,5,22,12,0));
checkStr('SL1 title: naslednji petek ob 12h oddaj poročilo → "Oddaj poročilo"',
  smartTitle('naslednji petek ob 12h oddaj poročilo'), 'Oddaj poročilo');

// SL2: do konca meseca pripravi poročilo → 31 May 17:00, title "Pripravi poročilo"
check('SL2 date: do konca meseca pripravi poročilo → 31 May 17:00',
  smartDate('do konca meseca pripravi poročilo'), dt(2026,5,31,17,0));
checkStr('SL2 title: do konca meseca pripravi poročilo → "Pripravi poročilo"',
  smartTitle('do konca meseca pripravi poročilo'), 'Pripravi poročilo');

// SL3: prvi ponedeljek naslednji mesec sestanek → 1 Jun 09:00, title "Sestanek"
check('SL3 date: prvi ponedeljek naslednji mesec sestanek → Mon 1 Jun 09:00',
  smartDate('prvi ponedeljek naslednji mesec sestanek'), dt(2026,6,1,9,0));
checkStr('SL3 title: prvi ponedeljek naslednji mesec sestanek → "Sestanek"',
  smartTitle('prvi ponedeljek naslednji mesec sestanek'), 'Sestanek');

// EN4: next Friday at 12 submit report → NEXT WEEK's Fri 22 May 12:00, title "Submit report"
check('EN4 date: next Friday at 12 submit report → Fri 22 May 12:00',
  smartDate('next Friday at 12 submit report'), dt(2026,5,22,12,0));
checkStr('EN4 title: next Friday at 12 submit report → "Submit report"',
  smartTitle('next Friday at 12 submit report'), 'Submit report');

// EN5: prepare report by the end of the month → 31 May 17:00, title "Prepare report"
check('EN5 date: prepare report by the end of the month → 31 May 17:00',
  smartDate('prepare report by the end of the month'), dt(2026,5,31,17,0));
checkStr('EN5 title: prepare report by the end of the month → "Prepare report"',
  smartTitle('prepare report by the end of the month'), 'Prepare report');

// EN6: first Monday next month meeting → Mon 1 Jun 09:00, title "Meeting"
check('EN6 date: first Monday next month meeting → Mon 1 Jun 09:00',
  smartDate('first Monday next month meeting'), dt(2026,6,1,9,0));
checkStr('EN6 title: first Monday next month meeting → "Meeting"',
  smartTitle('first Monday next month meeting'), 'Meeting');

console.log('\n=== ADDITIONAL PHRASE COVERAGE ===\n');

// zadnji petek v mesecu → last Friday of May = 29 May 09:00
check('zadnji petek v mesecu → Fri 29 May 09:00',
  smartDate('zadnji petek v mesecu preglej poročilo'), dt(2026,5,29,9,0));
checkStr('zadnji petek v mesecu title → "Preglej poročilo"',
  smartTitle('zadnji petek v mesecu preglej poročilo'), 'Preglej poročilo');

// drugi torek naslednji mesec → 2nd Tuesday of June = 9 Jun 09:00
check('drugi torek naslednji mesec → Tue 9 Jun 09:00',
  smartDate('drugi torek naslednji mesec sestanek'), dt(2026,6,9,9,0));

// konec tedna → Fri 15 May 17:00
check('konec tedna → Fri 15 May 17:00',
  smartDate('konec tedna oddaj naloge'), dt(2026,5,15,17,0));

// do petka → this Fri 15 May 09:00
check('do petka → Fri 15 May 09:00',
  smartDate('do petka oddaj poročilo'), dt(2026,5,15,9,0));

// najkasneje do ponedeljka → Mon 18 May 09:00
check('najkasneje do ponedeljka → Mon 18 May 09:00',
  smartDate('najkasneje do ponedeljka oddaj naloge'), dt(2026,5,18,9,0));

// last Friday of the month review report → last Fri of May = 29 May
check('last Friday of the month review report → Fri 29 May 09:00',
  smartDate('last Friday of the month review report'), dt(2026,5,29,9,0));
checkStr('last Friday of the month title → "Review report"',
  smartTitle('last Friday of the month review report'), 'Review report');

// second Tuesday next month → 2nd Tue of June = 9 Jun
check('second Tuesday next month → Tue 9 Jun 09:00',
  smartDate('second Tuesday next month meeting'), dt(2026,6,9,9,0));

// end of the week → Fri 15 May 17:00
check('end of the week → Fri 15 May 17:00',
  smartDate('end of the week submit tasks'), dt(2026,5,15,17,0));

// by Friday → Fri 15 May 09:00
check('by Friday → Fri 15 May 09:00',
  smartDate('by Friday submit report'), dt(2026,5,15,9,0));

// no later than Monday → Mon 18 May 09:00
check('no later than Monday → Mon 18 May 09:00',
  smartDate('no later than Monday submit tasks'), dt(2026,5,18,9,0));

console.log('\n=== SLOVENIAN PHRASES ===\n');

check('danes do 12h → today 12:00',
  smartDate('danes do 12h'), dt(2026,5,11,12,0));

check('danes ob 12:30 → today 12:30',
  smartDate('danes ob 12:30'), dt(2026,5,11,12,30));

check('jutri ob 9 → tomorrow 09:00',
  smartDate('jutri ob 9'), dt(2026,5,12,9,0));

check('jutri do 12h → tomorrow 12:00',
  smartDate('jutri do 12h'), dt(2026,5,12,12,0));

check('pojutrišnjem ob 10 → 13 May 10:00',
  smartDate('pojutrišnjem ob 10'), dt(2026,5,13,10,0));

checkRelMins('čez 30 minut → 30', 'čez 30 minut', 30);
checkRelMins('čez pol ure → 30', 'čez pol ure', 30);
checkRelMins('čez 2 uri → 120', 'čez 2 uri', 120);

check('naslednji teden → Mon 18 May 09:00',
  smartDate('naslednji teden'), dt(2026,5,18,9,0));

check('naslednji ponedeljek → Mon 18 May 09:00',
  smartDate('naslednji ponedeljek'), dt(2026,5,18,9,0));

check('v petek ob 12h → Fri 15 May 12:00',
  smartDate('v petek ob 12h'), dt(2026,5,15,12,0));

check('do konca tedna → Fri 15 May 17:00',
  smartDate('do konca tedna'), dt(2026,5,15,17,0));

check('do konca meseca → 31 May 17:00',
  smartDate('do konca meseca'), dt(2026,5,31,17,0));

check('15.5.2026 → 15 May 09:00',
  smartDate('15.5.2026'), dt(2026,5,15,9,0));

check('15. maja 2026 → 15 May 09:00',
  smartDate('15. maja 2026'), dt(2026,5,15,9,0));

check('conference 27.5.2026 + prijava do 15.5.2026 → 27 May 09:00',
  smartDate('27.5.2026 organiziramo letno konferenco. Vabljeni k prijavi do 15.5.2026'),
  dt(2026,5,27,9,0));

check('pričakujem do danes do 12h → today 12:00',
  smartDate('Pozdravljeni, odgovor o skenerjih pričakujem do danes do 12h.'),
  dt(2026,5,11,12,0));

console.log('\n=== ENGLISH PHRASES ===\n');

check('today by 12 → today 12:00',
  smartDate('today by 12'), dt(2026,5,11,12,0));

check('today at 12:30 → today 12:30',
  smartDate('today at 12:30'), dt(2026,5,11,12,30));

check('tomorrow at 9 → tomorrow 09:00',
  smartDate('tomorrow at 9'), dt(2026,5,12,9,0));

check('tomorrow by noon → tomorrow 12:00',
  smartDate('tomorrow by noon'), dt(2026,5,12,12,0));

checkRelMins('in 30 minutes → 30', 'in 30 minutes', 30);
checkRelMins('in half an hour → 30', 'in half an hour', 30);
checkRelMins('in 2 hours → 120', 'in 2 hours', 120);

check('next week → Mon 18 May 09:00',
  smartDate('next week'), dt(2026,5,18,9,0));

check('next Monday at 10am → Mon 18 May 10:00',
  smartDate('next Monday at 10am'), dt(2026,5,18,10,0));

check('by Friday at 12 → Fri 15 May 12:00',
  smartDate('by Friday at 12'), dt(2026,5,15,12,0));

check('by end of week → Fri 15 May 17:00',
  smartDate('by end of week'), dt(2026,5,15,17,0));

check('by end of month → 31 May 17:00',
  smartDate('by end of month'), dt(2026,5,31,17,0));

check('May 15 2026 → 15 May 09:00',
  smartDate('May 15 2026'), dt(2026,5,15,9,0));

check('15 May 2026 → 15 May 09:00',
  smartDate('15 May 2026'), dt(2026,5,15,9,0));

check('by Friday at 12 (English scanner) → Fri 15 May 12:00',
  smartDate('Please send the scanner order report by Friday at 12'),
  dt(2026,5,15,12,0));

console.log('\n=== QUICK BUTTONS ===\n');

check('quickTodayNoon → today 12:00', quickTodayNoon(), dt(2026,5,11,12,0));
check('quick1h → today 10:00', quick1h(), dt(2026,5,11,10,0));
check('quickTomorrow9 → tomorrow 09:00', quickTomorrow9(), dt(2026,5,12,9,0));
check('quick3d → 14 May 09:00', quick3d(), dt(2026,5,14,9,0));
check('quickNextWeek → Mon 18 May 09:00', quickNextWeek(), dt(2026,5,18,9,0));

console.log('\n=== MISC ===\n');

(function() {
  const pastDate = new Date(2020, 0, 1);
  const isPast = pastDate < new Date();
  if (isPast) { console.log('  PASS  past date detected as past'); pass++; }
  else        { console.log('  FAIL  past date should be detected as past'); fail++; }
})();

(function() {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emptyOk = !EMAIL_RE.test('');
  if (emptyOk) { console.log('  PASS  empty email invalid'); pass++; }
  else { console.log('  FAIL  empty email should be invalid'); fail++; }
  const badOk = !EMAIL_RE.test('notanemail');
  if (badOk) { console.log('  PASS  invalid email rejected'); pass++; }
  else { console.log('  FAIL  invalid email should be rejected'); fail++; }
})();

checkRelMins('čez dve uri → 120', 'čez dve uri', 120);
checkRelMins('in one hour → 60', 'in one hour', 60);
check('do konca dneva → today 17:00', smartDate('do konca dneva'), dt(2026,5,11,17,0));
check('prihodnji teden → Mon 18 May 09:00', smartDate('prihodnji teden'), dt(2026,5,18,9,0));
checkTime('ob poldne → 12:00', 'ob poldne', 12, 0);

console.log('\n=== COLLECTION / PAYMENT NOTES ===\n');

// COLL1: SL collection note — first date is context date, deadline comes after payment phrase
check('COLL1 date: SL two-date note (plačajo do) → 22 May 09:00',
  smartDate('12.5.2026 Govorim z Anito ker računovodkinje ni. Plačajo do 22.5.2026'),
  dt(2026,5,22,9,0));
checkStr('COLL1 title: leading context date removed',
  smartTitle('12.5.2026 Govorim z Anito ker računovodkinje ni. Plačajo do 22.5.2026'),
  'Govorim z Anito ker računovodkinje ni');

// COLL2: EN two-date payment note
check('COLL2 date: EN two-date note (payment will be made by) → 22 May 09:00',
  smartDate('12.5.2026 Called accounting. Payment will be made by 22.5.2026'),
  dt(2026,5,22,9,0));

// COLL3: Single-date SL — "Račun bo plačan do"
check('COLL3 date: Račun bo plačan do 22.5.2026 → 22 May 09:00',
  smartDate('Račun bo plačan do 22.5.2026'),
  dt(2026,5,22,9,0));
checkStr('COLL3 title: "Račun"',
  smartTitle('Račun bo plačan do 22.5.2026'),
  'Račun');

// COLL4: Single-date EN — "Please pay by"
check('COLL4 date: Please pay by 22.5.2026 → 22 May 09:00',
  smartDate('Please pay by 22.5.2026'),
  dt(2026,5,22,9,0));

// COLL5: Multiple dates — payment deadline must win over context date
check('COLL5 date: plačilo do — deadline wins → 22 May 09:00',
  smartDate('12.5.2026 Klic z računovodjo. Plačilo do 22.5.2026.'),
  dt(2026,5,22,9,0));

// COLL6 regression: conference + prijava do → event date still wins (existing behaviour)
check('COLL6 regression: conference + prijava do → event date 27 May 09:00',
  smartDate('27.5.2026 organiziramo letno konferenco. Vabljeni k prijavi do 15.5.2026'),
  dt(2026,5,27,9,0));

console.log('\n=== ALTERNATIVE DATE CHIPS ===\n');

// ALT1: SL two-date payment note → selected=22 May, alt=[12 May]
{
  const alts = smartAltDates('12.5.2026 Govorim z Anito. Plačajo do 22.5.2026');
  checkNum('ALT1: alternativeDates length = 1', alts.length, 1);
  check('ALT1: alt date is 12 May 2026', alts[0], dt(2026,5,12,0,0));
}

// ALT2: EN two-date payment note → selected=22 May, alt=[12 May]
{
  const alts = smartAltDates('12.5.2026 Called accounting. Payment will be made by 22.5.2026');
  checkNum('ALT2: alternativeDates length = 1', alts.length, 1);
  check('ALT2: alt date is 12 May 2026', alts[0], dt(2026,5,12,0,0));
}

// ALT3: single-date text → no alternatives
checkNum('ALT3: single date → alternativeDates empty',
  smartAltDates('Račun bo plačan do 22.5.2026').length, 0);

// ALT4: conference+prijava regression → selected=27 May, alt=[15 May]
{
  const alts = smartAltDates('27.5.2026 organiziramo letno konferenco. Vabljeni k prijavi do 15.5.2026');
  checkNum('ALT4: conference+prijava → 1 alt', alts.length, 1);
  check('ALT4: alt date is 15 May 2026', alts[0], dt(2026,5,15,0,0));
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${pass} PASS, ${fail} FAIL out of ${pass + fail} tests`);
if (fail === 0) console.log('All tests passed!');
else console.log(`${fail} test(s) failed.`);
process.exit(fail > 0 ? 1 : 0);
