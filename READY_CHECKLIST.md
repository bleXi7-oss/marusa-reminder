# Maruša Reminder — Ready Checklist

Preveri pred prvim zagonom in po vsaki večji spremembi.

## Namestitev

- [ ] Node.js nameščen (`node --version`)
- [ ] `npm install` izveden (mapa `node_modules/` obstaja)
- [ ] `.env` datoteka ustvarjena in izpolnjena
- [ ] `GMAIL_USER` nastavljen
- [ ] `GMAIL_APP_PASSWORD` nastavljen (16-mestno App Password)
- [ ] `PORT=3001` nastavljen
- [ ] `.env` ni commitana v git

## Strežnik

- [ ] `npm start` se zažene brez napak
- [ ] Konzola prikaže: `🌸 Maruša Reminder teče na http://localhost:3001`
- [ ] `http://localhost:3001` odpre aplikacijo v brskalniku

## Gmail

- [ ] Testni email poslan (gumb "Pošlji testni Gmail")
- [ ] Email prispel v Gmail mapo

## Pametni način

- [ ] Paste teksta z datumom → Maruša prepozna datum
- [ ] Prikaže se predogled (Opravilo / Dogodek / Opomnik)
- [ ] Gumb "Shrani opomnik" v predogledu shrani opomnik
- [ ] Gumb "Uredi" zapusti predogled in sprosti polja
- [ ] Če datuma ni → sporoči "Datuma nisem prepoznala 😅" in odpre ročni vnos
- [ ] Prepoznavanje poslovnih ključnih besed deluje (račun, plačilo, ponudba...)

## Ročni način

- [ ] Direkten vnos naslova, opisa, datuma in emaila
- [ ] Hitri gumbi delujejo (Čez 1 uro, Jutri ob 9, Čez 3 dni, Naslednji teden)
- [ ] Opomnik se shrani
- [ ] "Zapomni si moj email" — shrani email v localStorage in ga obnovi ob naslednjem obisku

## Offset

- [ ] Preset offset deluje (1 dan prej itd.)
- [ ] Po meri offset deluje (npr. 5 minut, 2 uri, 10 dni)
- [ ] Validacija: napaka pri vrednosti izven 1–365

## Opomniki

- [ ] Prihajajoči opomniki se prikažejo po shranjevanju
- [ ] Po osvežitvi strani se opomniki ohranijo
- [ ] Gumb "Pošlji zdaj" deluje
- [ ] Gumb "Izbriši" deluje
- [ ] Samodejno pošiljanje deluje (počakaj do nastavljenega časa)
- [ ] Poslani opomniki se prikažejo v "Poslani opomniki"

## PWA

- [ ] `manifest.json` dostopen na `/manifest.json`
- [ ] `service-worker.js` dostopen na `/service-worker.js`
- [ ] Ikone obstajajo v `public/icons/` (icon-192.png, icon-512.png, apple-touch-icon.png ...)
- [ ] Favicon viden v zavihku brskalnika (rožica)
- [ ] Ikona namestitve vidna v Chrome/Edge (gumb ⊕ v naslovni vrstici)
- [ ] Aplikacija deluje kot standalone po namestitvi
- [ ] Gumb za pomoč (?) prikazuje razlago

## Render deployment — Resend (priporočeno)

- [ ] Render env var `EMAIL_PROVIDER=resend` nastavljen
- [ ] Render env var `RESEND_API_KEY=re_xxx` nastavljen (iz resend.com)
- [ ] Render env var `MAIL_FROM` nastavljen (`onboarding@resend.dev` ali verificirana domena)
- [ ] Render env var `DEFAULT_REMINDER_EMAIL` nastavljen
- [ ] Render env var `NODE_ENV=production` nastavljen
- [ ] `/api/email-status` vrne `"provider": "resend"` in `"hasResendApiKey": true`
- [ ] Testni email poslan prek Render (`Pošlji testni Gmail`)
- [ ] Napake v UI prikazujejo slovensko sporočilo (RESEND_ERROR / MISSING_RESEND_CONFIG)
- [ ] Startup log prikazuje `[SMTP diagnostics] Preskočeno — EMAIL_PROVIDER=resend.`

## Render deployment — Gmail SMTP (samo lokalno / fallback)

- [ ] Gmail SMTP deluje lokalno (`/api/smtp-test` vrne `ok: true`)
- [ ] Startup log prikazuje `[SMTP DNS]` z resolvanimi IP naslovi
- [ ] Startup log prikazuje `[SMTP verify] OK` z `elapsedMs`
- [ ] Napake v UI prikazujejo slovensko sporočilo (timeout / auth / DNS — ne generično)
- [ ] Če `/api/smtp-test` vrne `CONNECTION_ERROR` z `elapsedMs ~30000` → Render blokira SMTP → uporabi Resend

## Git

- [ ] `git status` — `.env` ni med staged datotekami
- [ ] `node_modules/` ni v gitu
- [ ] `data/` ni v gitu
- [ ] Commit ustvarjen z jasnim sporočilom
