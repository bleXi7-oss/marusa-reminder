# 🌸 Maruša Reminder

**Ne pozabi follow-upa.**

Osebna aplikacija za Gmail opomnike.  
Ustvariš opomnik → ob pravem času dobiš email na Gmail.

---

## Kaj aplikacija počne

- Ustvari opomnike z naslovom, opisom in datumom
- Ob nastavljenem času samodejno pošlje email
- Pametni vnos: prilepi besedilo ali mail, Maruša razčleni datum in naslov
- Ročni vnos: direkten vnos brez parsiranja
- Zaklenjena aplikacija: zaščiti z dostopno kodo pred nepooblaščenim dostopom
- Deluje kot PWA — namestljiva na telefon ali namizje
- Tema: 3 prednastavljene teme (Maruša, Gozd, Noč) in lastne barve, shranjeno v brskalnik
- Vsi podatki shranjeni lokalno v `data/reminders.json`
- Brez baze podatkov, brez prijave, brez oblaka

---

## Zahteve

- Node.js (LTS) — [nodejs.org](https://nodejs.org)
- Gmail račun z App Password (za lokalno) **ali** Resend API ključ (za Render)

---

## Namestitev (lokalno)

```bash
npm install
cp .env.example .env
# izpolni .env s svojimi Gmail podatki
npm start
```

Odpri brskalnik: **http://localhost:3001**

---

## Gmail App Password

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

## Načini vnosa

### Pametni način

1. Prilepi besedilo (email, sporočilo, opomba)
2. Izberi, koliko prej te opomni (preset ali po meri)
3. Klikni **Razberi opomnik**
4. Maruša prikaže predogled:
   - **Opravilo** — razčlenjen naslov
   - **Dogodek** — datum in čas iz besedila
   - **Opomnik** — kdaj boš dobil email (po offsetu)
5. Klikni **Shrani opomnik** za potrditev — ali **Uredi** za ročni popravek

Podprti formati datumov:
- `jutri ob 10`, `v petek`, `naslednji ponedeljek`
- `12.5.`, `12.5.2026`, `12/5`, `2026-05-12`
- `12 maja`, `May 12`
- `čez 3 dni`, `čez teden`, `in 2 days`
- `čez pol ure`, `čez 30 minut`

Parsiranje je **pravilo-osnovno, brez AI**. Če datuma ni mogoče prepoznati, Maruša sporoči napako (`ERR-014`) in odpre ročni vnos.

### Ročni način

1. Vnesi naslov, opis, datum in email
2. Uporabi hitre gumbe: Čez 1 uro / Jutri ob 9 / Čez 3 dni / Naslednji teden
3. Klikni **Shrani opomnik**

### Zapomnitev emaila

Obkljukaj **Zapomni si moj email** — naslov se shrani v brskalnik (localStorage) in se samodejno vpiše ob naslednjem obisku.

---

## Offset opomnika

Preset: Ob času dogodka / 1 uro prej / 1 dan prej / 2 dni / 3 dni / 1 teden

Po meri: vnesi število in enoto (minut / ur / dni / tednov), obseg 1–365

---

## Zaklenjena aplikacija (APP_ACCESS_CODE)

Ko je `APP_ACCESS_CODE` nastavljen (priporočeno za Render), se ob odprtju prikaže zaklenjen zaslon.

- Napačna koda → sporoči `ERR-001`
- Pravilna koda → odklene aplikacijo
- Opomniki se naložijo šele po odklenjenju
- Gumb **Zakleni aplikacijo** (v headerju) počisti kodo in vrne na zaklenjen zaslon
- API klici brez veljavne kode vrnejo HTTP 401

---

## Testiranje emaila

Gumb **Pošlji testni Gmail** je v razdelku za pomoč:

1. Vnesi email v polje za opomnik
2. Klikni **?** za odprtje pomoči
3. Klikni **Pošlji testni Gmail**
4. Preveri Gmail mapo

---

## Samodejno pošiljanje

Strežnik vsako minuto preveri opomnike.  
Ko nastopi čas → pošlje email → označi kot poslano.

**Pomembno:** Opomniki delujejo samo, ko Node.js strežnik teče.  
Zapri terminal = opomniki se ne pošljejo.

---

## Napake (ERR kode)

| Koda | Pomen | Kaj preveriti |
|------|-------|---------------|
| ERR-001 | Napačna koda za dostop | `APP_ACCESS_CODE` v Render env vars |
| ERR-002 | Resend API key manjka | `RESEND_API_KEY` v Render env vars |
| ERR-003 | Resend napaka pri pošiljanju | `RESEND_API_KEY`, `MAIL_FROM` in Render logs |
| ERR-004 | `MAIL_FROM` ni nastavljen | `MAIL_FROM` v Render env vars |
| ERR-005 | `DEFAULT_REMINDER_EMAIL` ni nastavljen | `DEFAULT_REMINDER_EMAIL` v Render env vars |
| ERR-006 | Opomnik ni bil najden | Osveži stran |
| ERR-007 | Opomnik ni bil shranjen | Preveri Render logs |
| ERR-008 | Email manjka ali ni veljaven | Vnesi pravilen email naslov |
| ERR-009 | Datum manjka ali je neveljaven | Izberi pravilen datum in uro |
| ERR-010 | Render/redeploy problem | Render → Manual Deploy |
| ERR-011 | GitHub ni posodobljen | Zaženi `git push` |
| ERR-012 | App se zbuja (Render Free) | Počakaj 30–60 sekund in poskusi znova |
| ERR-013 | SMTP blokiran ali auth napaka | Na Render: uporabi Resend |
| ERR-014 | Datum ni prepoznan | Izberi datum ročno |
| ERR-015 | Nepričakovana napaka | Preveri konzolo strežnika |
| ERR-016 | Preveč zahtevkov | Počakaj 15 minut in poskusi znova |

---

## Tema

V pomoči (`?`) izberi med prednastavljenimi temami ali nastavi lastne barve:

- **Maruša** — privzeta kremna/rožnata tema
- **Gozd** — mirna zelena tema
- **Noč** — temna tema

Lastne barve (poudarek, ozadje, kartica) se takoj uveljavijo in shranijo v brskalnik (`localStorage`). Gumb **Ponastavi temo** vrne na privzeto temo Maruša.

---

## PWA namestitev

**Telefon (Android/iOS):** Odpri v brskalniku → meni → Dodaj na začetni zaslon  
**Računalnik (Chrome/Edge):** Klikni ikono namestitve (⊕) v naslovni vrstici ali meni → Namesti aplikacijo

Aplikacija ima ikono rožice (🌸) in deluje kot prava namizna/mobilna aplikacija.

---

## Struktura projekta

```
files/
  server.js          — Express strežnik + email logika
  .env               — Gmail/Resend nastavitve (ne commitaj!)
  .env.example       — primer nastavitev
  data/
    reminders.json   — shranjeni opomniki
  public/
    index.html       — glavna stran
    style.css        — oblikovanje
    app.js           — frontend logika + parser
    manifest.json    — PWA konfiguracija
    service-worker.js— PWA offline podpora
    icons/           — PWA ikone
```

---

## Namestitev na Render

Gmail SMTP **ne deluje zanesljivo na Render free tier** — Render blokira odhodne TCP na portih 465 in 587 (ETIMEDOUT).  
Priporočena rešitev je **Resend** (brezplačno, 3000 emailov/mesec, pošilja prek HTTPS).

### Resend — priporočeno za Render

#### Obvezne Environment Variables na Render

| Spremenljivka | Vrednost |
|---|---|
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` | `re_xxx` (iz resend.com) |
| `MAIL_FROM` | `onboarding@resend.dev` ali tvoja verificirana domena |
| `DEFAULT_REMINDER_EMAIL` | `tvoj.email@gmail.com` |
| `NODE_ENV` | `production` |
| `APP_ACCESS_CODE` | `tvoja-tajna-koda` (ščiti javni URL) |

> **`MAIL_FROM=onboarding@resend.dev`** je Resendov testni naslov — deluje brez lastne domene.  
> Brez verificirane domene Resend dovoli pošiljanje **samo na email, s katerim si registriran na Resend**.  
> Za lastno domeno verificiraj domeno na resend.com.

> **`APP_ACCESS_CODE`** ščiti aplikacijo pred naključnimi obiskovalci na javnem Render URL-ju.  
> Hraniti zasebno — zamenjaj, če jo po nesreči deliš. To ni polno prijavni sistem.

#### Koraki za nastavitev

1. Registriraj se na [resend.com](https://resend.com) (brezplačno)
2. Ustvari API ključ v razdelku API Keys
3. Nastavi env vars na Render (tabela zgoraj)
4. Klikni **Manual Deploy** v Render dashboardu

### Gmail SMTP — samo za lokalno

Gmail SMTP ostane kot fallback za lokalno testiranje (brez `EMAIL_PROVIDER=resend`).  
Na Render ne deluje — Render blokira odhodne SMTP povezave.

Diagnostičen test (samo lokalno):
```
http://localhost:3001/api/smtp-test
```

---

## Kako testirati

### 1. Zdravje aplikacije
```
GET /api/health
```
Pričakuješ lokalno: `{ "ok": true, "protected": false }`  
Pričakuješ na Render: `{ "ok": true, "protected": true }`

### 2. Email nastavitve
```
GET /api/email-status    (z X-App-Code headerjem, če je zaščiteno)
```
Pričakuješ na Render z Resend:
```json
{
  "provider": "resend",
  "hasResendApiKey": true,
  "hasMailFrom": true,
  "hasDefaultReminderEmail": true,
  "gmailSmtpAvailable": false
}
```

### 3. Testni email
1. Vnesi email v polje za opomnik
2. Klikni **?** za pomoč
3. Klikni **Pošlji testni Gmail**
4. Preveri Gmail mapo

### 4. Opomnik od začetka do konca
1. Ustvari opomnik z datumom 1–2 minuti v prihodnosti
2. Počakaj
3. Preveri Gmail — email mora prispeti
4. Opomnik mora biti označen kot poslano v aplikaciji

---

## Znane omejitve

- **Render Free plan spi:** Render free tier ugasne aplikacijo po 15 minutah neaktivnosti. Ob prvem odprtju se zbudi v 30–60 sekundah (`ERR-012`). Opomniki, ki bi morali biti poslani med spanjem, bodo poslani ob naslednjem zbujanju.
- **Gmail SMTP na Render ne deluje:** Render blokira odhodne SMTP povezave. Na Render vedno uporabljai Resend.
- **Parser je pravilo-osnoven:** Pametni način razčleni datum z regularnimi izrazi — brez AI. Nestandardni formati morda ne bodo prepoznani.
- **Ni multi-user sistema:** Ena instanca = en uporabnik. Brez prijave, brez ločenih računov.
- **Opomniki delujejo samo ko strežnik teče:** Lokalno: zapri terminal = opomniki se ne pošljejo.

---

## Odpravljanje težav

**Gmail ne deluje lokalno:**
- Preveri App Password v `.env`
- Preveri da je 2-stopenjsko preverjanje vklopljeno
- Preveri `GMAIL_USER` in `GMAIL_APP_PASSWORD`

**Resend ne deluje na Render:**
- Preveri `RESEND_API_KEY` in `EMAIL_PROVIDER=resend` v Render env vars
- Preveri da `MAIL_FROM` ni prazno
- Z `onboarding@resend.dev` lahko pošiljaš samo na email, s katerim si registriran na Resend

**Opomnik ni bil poslan:**
- Preveri da strežnik teče (`npm start`)
- Klikni **Pošlji zdaj** na opomnik
- Preveri konzolo za napake

**Pametni način ne prepozna datuma:**
- Parsiranje je pravilo-osnovno — poskusi z jasnejšim formatom (npr. `12.5.2026 ob 10:00`)
- Ročno nastavi datum v obrazcu

---

## Git varnost

- `.env` je v `.gitignore` — **nikoli ne commitaj `.env`**
- `node_modules/` je v `.gitignore`
- `data/` je v `.gitignore`

Pred vsakim commitom preveri: `git status`

---

Narejen z ❤️ za osebno uporabo.
