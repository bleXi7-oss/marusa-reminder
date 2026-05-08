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
- [ ] Obrazec se zapolni po razčlenjevanju
- [ ] Opomnik se shrani
- [ ] Prepoznavanje poslovnih ključnih besed deluje (račun, plačilo, ponudba...)

## Ročni način

- [ ] Direkten vnos naslova, opisa, datuma in emaila
- [ ] Hitri gumbi delujejo (Čez 1 uro, Jutri ob 9, Čez 3 dni, Naslednji teden)
- [ ] Opomnik se shrani

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
- [ ] Ikona namestitve vidna v brskalniku (Chrome/Edge)

## Git

- [ ] `git status` — `.env` ni med staged datotekami
- [ ] `node_modules/` ni v gitu
- [ ] `data/` ni v gitu
- [ ] Commit ustvarjen z jasnim sporočilom
