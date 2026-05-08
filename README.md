# 🌸 Maruša Reminder

**Ne pozabi follow-upa.**

Preprosta osebna aplikacija za Gmail opomnike.  
Ustvariš opomnik → ob pravem času dobiš email.

---

## Kaj aplikacija počne?

- Ustvari opomnike z naslovom, opisom in datumom
- Ob nastavljenem času samodejno pošlje email na Gmail
- Deluje kot PWA – namestljiva na telefon ali namizje
- Vse je shranjeno lokalno, brez baze podatkov

---

## Namestitev

### 1. Namesti Node.js

Obiši [nodejs.org](https://nodejs.org) in prenesi LTS verzijo.  
Po namestitvi preveri v terminalu:

```bash
node --version
```

### 2. Prenesi projekt

```bash
git clone <url-projekta>
cd marusa-reminder
npm install
```

### 3. Ustvari Gmail App Password

Gmail App Password je posebno geslo samo za to aplikacijo.  
**Nikoli ne uporabljaš normalnega Gmail gesla.**

Koraki:
1. Odpri [myaccount.google.com/security](https://myaccount.google.com/security)
2. Vklopi **2-stopenjsko preverjanje** (če še ni vklopljeno)
3. Pojdi na [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
4. Klikni **Ustvari App Password**
5. Ime: `Marusa Reminder`
6. Kopiraj generirano geslo (16 znakov)

### 4. Nastavi .env datoteko

```bash
cp .env.example .env
```

Odpri `.env` in izpolni:

```
GMAIL_USER=tvoj.email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
MAIL_FROM=tvoj.email@gmail.com
DEFAULT_REMINDER_EMAIL=tvoj.email@gmail.com
PORT=3000
```

---

## Zagon aplikacije

```bash
npm start
```

Odpri brskalnik na:  
👉 **http://localhost:3000**

---

## Testiranje emaila

1. Izpolni email polje v aplikaciji
2. Klikni **Pošlji testni Gmail**
3. Preveri svojo Gmail mapo

Če email pride → vse deluje! ✓

---

## Namestitev kot aplikacija (PWA)

### Na telefonu (Android ali iPhone)
1. Odpri http://localhost:3000 v brskalniku
2. Tapni meni brskalnika (⋮ ali Share)
3. Izberi **Dodaj na začetni zaslon**
4. Potrdi

### Na računalniku (Chrome/Edge)
1. Odpri http://localhost:3000
2. V naslovni vrstici klikni ikono namestitve (📥)
3. Klikni **Namesti**

---

## Kako deluje samodejno pošiljanje?

Aplikacija vsako minuto preveri opomnike.  
Ko nastopi čas opomnika → pošlje email → označi kot poslano.

**⚠️ Pomembno:** Email opomniki delujejo samo, ko Node.js strežnik teče.  
Če zapreš terminal, opomniki ne bodo poslani.

Za zanesljivo delovanje pusti terminal odprt ali zaženi aplikacijo na strežniku.

---

## Struktura projekta

```
marusa-reminder/
  server.js          ← Express strežnik + email logika
  .env               ← Tvoje Gmail nastavitve (ne commitaj!)
  data/
    reminders.json   ← Shranjeni opomniki
  public/
    index.html       ← Glavna stran
    style.css        ← Oblikovanje
    app.js           ← Frontend logika
    manifest.json    ← PWA konfiguracija
    service-worker.js← PWA offline podpora
```

---

## Pametni vnos iz maila/teksta

Na vrhu aplikacije je kartica **"Prilepi mail ali tekst"**.

1. Prilepi besedilo (email, sporočilo, opombo)
2. Izberi, koliko prej te opomni
3. Klikni **Razberi opomnik**
4. Aplikacija zapolni obrazec — ti ga le pregledaš in shraniš

**Pomembno:** To je preprosto pravilo-osnovno razčlenjevanje, ne AI.  
Deluje najboljše z jasnimi datumi, kot so:

```
jutri ob 10
do petka
v četrtek ob 14
15.5.2026
naslednji ponedeljek
```

Če datum ni prepoznan, aplikacija sporoči:  
*"Datuma nisem prepoznal. Prosim izberi datum ročno."*

---

## Težave?

**Gmail povezava ne deluje:**
- Preveri App Password v `.env`
- Preveri da je 2-stopenjsko preverjanje vklopljeno
- App Password ne sme imeti presledkov (ali pa jih pusti – Gmail jih ignorira)

**Opomnik ni bil poslan:**
- Preveri da strežnik teče (`npm start`)
- Preveri da je čas opomnika v preteklosti ali sedanjosti
- Odpri http://localhost:3000 in klikni **Pošlji zdaj**

---

Narejen z ❤️ za osebno uporabo.
