# Maruša Reminder — Deployment Checklist

## 1. Lokalna namestitev

- [ ] Node.js nameščen (`node --version`)
- [ ] `npm install` izveden (mapa `node_modules/` obstaja)
- [ ] `.env` ustvarjena iz `.env.example` in izpolnjena
- [ ] `npm start` se zažene brez napak
- [ ] Konzola prikaže: `Maruša Reminder teče na http://localhost:3001`
- [ ] `http://localhost:3001` odpre aplikacijo v brskalniku

## 2. Gmail (lokalno)

- [ ] `GMAIL_USER` nastavljen
- [ ] `GMAIL_APP_PASSWORD` nastavljen (16-mestno App Password)
- [ ] Testni email poslan: **?** → **Pošlji testni Gmail**
- [ ] Email prispel v Gmail mapo

## 3. GitHub

- [ ] `git status` — `.env` ni med staged datotekami
- [ ] `node_modules/` ni v gitu
- [ ] `data/` ni v gitu
- [ ] Commit ustvarjen z jasnim sporočilom
- [ ] Push na GitHub uspešen

## 4. Render — Resend nastavitev

- [ ] Registracija na [resend.com](https://resend.com) (brezplačno)
- [ ] API ključ ustvarjen v Resend → API Keys
- [ ] Na Render nastavljene Environment Variables:
  - [ ] `EMAIL_PROVIDER=resend`
  - [ ] `RESEND_API_KEY=re_xxx`
  - [ ] `MAIL_FROM=onboarding@resend.dev` (ali verificirana domena)
  - [ ] `DEFAULT_REMINDER_EMAIL=tvoj.email@gmail.com`
  - [ ] `NODE_ENV=production`
  - [ ] `APP_ACCESS_CODE=tvoja-tajna-koda`

## 5. Render — Redeploy

- [ ] Render → Manual Deploy → Deploy latest commit
- [ ] Deploy uspešen (zelena oznaka v Render dashboardu)
- [ ] `/api/health` vrne `"ok": true, "protected": true`

## 6. Testiranje na Render

### Email

- [ ] `/api/email-status` (z `X-App-Code` headerjem) vrne `"provider": "resend"` in `"hasResendApiKey": true`
- [ ] Testni email poslan prek Render: **?** → **Pošlji testni Gmail**
- [ ] Email prispel v Gmail mapo
- [ ] Startup log prikazuje `[SMTP diagnostics] Preskočeno — EMAIL_PROVIDER=resend.`

### Opomnik od začetka do konca

- [ ] Ustvari opomnik z datumom 1–2 minuti v prihodnosti
- [ ] Počakaj — email mora prispeti
- [ ] Opomnik v aplikaciji označen kot poslan

### Zaklenjen zaslon

- [ ] Ob odprtju se prikaže zaklenjen zaslon
- [ ] Napačna koda → sporoči `ERR-001`
- [ ] Pravilna koda → odklene aplikacijo
- [ ] Opomniki se naložijo šele po odklenjenju
- [ ] Gumb **Zakleni aplikacijo** (v headerju) vrne na zaklenjen zaslon
- [ ] API klic brez kode vrne HTTP 401

### Render Free sleep

- [ ] Zapri tab, počakaj >15 min, odpri znova
- [ ] App se zbudi v 30–60 sekundah (med zbujanjem morda `ERR-012`)
- [ ] Po zbujanju vse deluje normalno

## 7. Pametni način

- [ ] Prilepi besedilo z datumom → Maruša prepozna datum
- [ ] Predogled prikazuje Opravilo / Dogodek / Opomnik
- [ ] **Shrani opomnik** shrani opomnik
- [ ] **Uredi** zapusti predogled in sprosti polja
- [ ] Brez datuma → `ERR-014` + ročni vnos

## 8. Ročni način

- [ ] Direkten vnos naslova, opisa, datuma in emaila
- [ ] Hitri gumbi delujejo (Čez 1 uro, Jutri ob 9, Čez 3 dni, Naslednji teden)
- [ ] **Zapomni si moj email** shrani email v localStorage
- [ ] Email se obnovi ob naslednjem obisku

## 9. Mobilna/PWA namestitev

- [ ] Odpri app na telefonu (Android/iOS)
- [ ] Meni → Dodaj na začetni zaslon
- [ ] App se odpre kot standalone (brez brskalnikove vrstice)
- [ ] Ikona rožice vidna na začetnem zaslonu

## 10. Napake / error handling

- [ ] `ERR-001` pri napačni kodi ✓
- [ ] `ERR-002/003` pri napačnem Resend ključu ✓
- [ ] `ERR-008` pri praznem ali neveljavnem emailu ✓
- [ ] `ERR-014` pri neprepoznanem datumu ✓
- [ ] Napake prikazane z ERR kodo + razlago + kaj preveriti
