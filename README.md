# 🌸 Maruša Reminder

**Ne pozabi follow-upa.**

Osebna lokalna aplikacija za Gmail opomnike.  
Ustvariš opomnik → ob pravem času dobiš email na Gmail.

---

## Kaj aplikacija počne

- Ustvari opomnike z naslovom, opisom in datumom
- Ob nastavljenem času samodejno pošlje email na Gmail
- Pametni vnos: prilepi besedilo/mail, Maruša razčleni datum in naslov
- Ročni vnos: direkten vnos brez parsiranja
- Deluje kot PWA — namestljiva na telefon ali namizje
- Vsi podatki so shranjeni lokalno v `data/reminders.json`
- Brez baze podatkov, brez prijave, brez oblaka

---

## Zahteve

- Node.js (LTS) — [nodejs.org](https://nodejs.org)
- Gmail račun z App Password

---

## Namestitev

```bash
npm install
cp .env.example .env
# izpolni .env s svojimi Gmail podatki
npm start
```

Odpri brskalnik: **http://localhost:3001**

---

## Nastavitev Gmail App Password

Gmail App Password je posebno geslo samo za to aplikacijo.  
**Nikoli ne uporabi normalnega Gmail gesla.**

1. Odpri [myaccount.google.com/security](https://myaccount.google.com/security)
2. Vklopi **2-stopenjsko preverjanje**
3. Pojdi na [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
4. Ustvari novo geslo — ime: `Marusa Reminder`
5. Kopiraj generirano geslo (16 znakov)

### .env datoteka

```
GMAIL_USER=tvoj.email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
MAIL_FROM=tvoj.email@gmail.com
DEFAULT_REMINDER_EMAIL=tvoj.email@gmail.com
PORT=3001
```

---

## Uporaba

### Pametni način

1. Prilepi besedilo (email, sporočilo, opomba)
2. Izberi, koliko prej te opomni (preset ali po meri)
3. Klikni **Razberi opomnik**
4. Maruša prikaže predogled: Opravilo, Dogodek (čas iz besedila), Opomnik (čas po offsetu)
5. Klikni **Shrani opomnik** za potrditev — ali **Uredi** za ročni popravek

Podprti formati datumov:
- `jutri ob 10`, `v petek`, `naslednji ponedeljek`
- `12.5.`, `12.5.2026`, `12/5`, `2026-05-12`
- `12 maja`, `May 12`
- `čez 3 dni`, `čez teden`, `in 2 days`
- `čez pol ure`, `čez 30 minut`

Parsiranje je **pravilo-osnovno, brez AI**. Če datuma ni mogoče prepoznati, Maruša sporoči napako in te prosi za ročni vnos.

### Ročni način

1. Vnesi naslov, opis, datum in email
2. Uporabi hitre gumbe: Čez 1 uro / Jutri ob 9 / Čez 3 dni / Naslednji teden
3. Klikni **Shrani opomnik**

### Zapomnitev emaila

Obkljukaj **Zapomni si moj email** — naslov se shrani v brskalnik (localStorage) in se samodejno vpiše ob naslednjem obisku.

### Offset opomnika

Preset: Ob času dogodka / 1 uro prej / 1 dan prej / 2 dni / 3 dni / 1 teden

Po meri: vnesi število in enoto (minut / ur / dni / tednov)

---

## Testiranje emaila

1. Vnesi email v polje
2. Klikni **Pošlji testni Gmail**
3. Preveri Gmail mapo

---

## Samodejno pošiljanje

Strežnik vsako minuto preveri opomnike.  
Ko nastopi čas → pošlje email → označi kot poslano.

**Pomembno:** Opomniki delujejo samo, ko Node.js strežnik teče.  
Zapri terminal = opomniki se ne pošljejo.

---

## PWA namestitev

**Telefon (Android/iOS):** Odpri v brskalniku → meni → Dodaj na začetni zaslon  
**Računalnik (Chrome/Edge):** Klikni ikono namestitve (⊕) v naslovni vrstici ali meni → Namesti aplikacijo

Aplikacija ima ikono rožice (🌸) in deluje kot prava namizna/mobilna aplikacija.

### Gumb za pomoč (?)

Klikni `?` gumb poleg izbirnika načina za kratek opis kako aplikacija deluje.

---

## Struktura projekta

```
files/
  server.js          — Express strežnik + email logika
  .env               — Gmail nastavitve (ne commitaj!)
  .env.example       — primer nastavitev
  data/
    reminders.json   — shranjeni opomniki
  public/
    index.html       — glavna stran
    style.css        — oblikovanje
    app.js           — frontend logika + parser
    manifest.json    — PWA konfiguracija
    service-worker.js— PWA offline podpora
```

---

## Namestitev na Render

Gmail SMTP **ne deluje zanesljivo na Render free tier** — Render blokira odhodne TCP povezave na portih 465 in 587 (ETIMEDOUT).  
Priporočena rešitev je **Resend** (brezplačno, 3000 emailov/mesec, pošilja prek HTTPS).

### Resend — obvezne Environment Variables na Render

| Spremenljivka | Vrednost |
|---|---|
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` | `re_xxx` (iz resend.com) |
| `MAIL_FROM` | `onboarding@resend.dev` ali tvoja domena |
| `DEFAULT_REMINDER_EMAIL` | `tvoj.email@gmail.com` |
| `NODE_ENV` | `production` |
| `APP_ACCESS_CODE` | `tvoja-tajna-koda` (ščiti javno URL-jo) |

> `APP_ACCESS_CODE` je enostavna zaščita pred naključnimi obiskovalci na javnem Render URL-ju.  
> Hraniti zasebno — zamenjaj, če jo po nesreči deliš. To ni polno prijav sistema.

> `MAIL_FROM=onboarding@resend.dev` je Resendov testni naslov — deluje brez lastne domene.  
> Za lastno domeno (npr. `marusa@tvoja-domena.si`) je treba domeno verificirati na resend.com.

### Korak 1 — Pridobi Resend API ključ

1. Registriraj se na [resend.com](https://resend.com) (brezplačno)
2. Ustvari API ključ v API Keys razdelku
3. Nastavi env var `RESEND_API_KEY=re_xxx` na Render

### Korak 2 — Preveri nastavitve

```
https://marusa-reminder.onrender.com/api/email-status
```

Pričakovan odgovor z Resend:

```json
{
  "provider": "resend",
  "hasResendApiKey": true,
  "hasMailFrom": true,
  "hasDefaultReminderEmail": true,
  "gmailSmtpAvailable": false
}
```

### Korak 3 — Pošlji testni email

Klikni **Pošlji testni Gmail** v aplikaciji — pri `provider: resend` gre prek Resend API.

Napake:

| code | Pomen |
|---|---|
| `RESEND_ERROR` | Napačen API ključ ali MAIL_FROM ni verificiran |
| `MISSING_RESEND_CONFIG` | `RESEND_API_KEY` ni nastavljen na Render |

---

### Gmail SMTP — samo za lokalno uporabo

Gmail SMTP ostane kot fallback (brez `EMAIL_PROVIDER=resend`).  
Za lokalno testiranje nastavi v `.env`:

```
GMAIL_USER=tvoj.email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
MAIL_FROM=tvoj.email@gmail.com
```

Diagnostičen SMTP test (samo za Gmail):

```
http://localhost:3001/api/smtp-test
```

Napake pri Gmail SMTP:

| code | Pomen |
|---|---|
| `CONNECTION_ERROR` | TCP/timeout — Render blokira SMTP |
| `AUTH_ERROR` | Napačen App Password |
| `DNS_ERROR` | SMTP_HOST ni dosegljiv |
| `MISSING_CONFIG` | `GMAIL_USER` ali `GMAIL_APP_PASSWORD` nista nastavljena |

---

## Odpravljanje težav

**Gmail ne deluje:**
- Preveri App Password v `.env`
- Preveri da je 2-stopenjsko preverjanje vklopljeno
- Preveri `GMAIL_USER` in `GMAIL_APP_PASSWORD`

**Opomnik ni bil poslan:**
- Preveri da strežnik teče (`npm start`)
- Klikni **Pošlji zdaj** na opomnik
- Preveri konzolo za napake

**Pametni način ne prepozna datuma:**
- Parsiranje je pravilo-osnovno — poskusi z jasnejšim formatom
- Ročno nastavi datum v obrazcu

---

Narejen z ❤️ za osebno uporabo.
