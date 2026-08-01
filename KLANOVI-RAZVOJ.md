# Klanovi — takmičenje i razvoj (prijedlog)

Nastavak na modul klanova (deployan 28.07.2026, commit `e453492`). Klanovi već
imaju model, uloge, zahtjeve za učlanjenje i **prozore takmičenja**, ali
**bodovanje nije napravljeno** — to je bio svjestan izbor ("samo registracija
zasad"). Zato `clanXP` stoji na 0 i `clanLevel` na 1 kod svih klanova.

Ovaj dokument popunjava to: pet formata takmičenja, sistem nadogradnji unutar
klana, i mehanizam vikend bossa.

Datum: 29.07.2026. · Stanje koda: commit `3c8023c`

---

## 0. Šta je zatečeno i mora se poštovati

| Činjenica | Posljedica za plan |
|---|---|
| Prozor takmičenja je **pon 08:00 – pet 18:00**, prijave **sub–ned 20:00** (`functions/klan-pravila.js`) | Klanovi već **ne diraju vikend** — to je upravo ono što tražiš. Ne mijenjati prozore. |
| Vikend je zauzet: XP trka (pet 18 → ned 18) i duel turnir (ista dva dana) | Klanski sadržaj radnim danima, boss kao **jedini** klanski događaj koji dodiruje vikend. |
| Klan ima **najviše 10 članova** (`MAX_CLANOVA`) | Format ne smije nagrađivati veličinu klana, inače je popunjenost jedina strategija. |
| Prag za osnivanje je **level 10** | **Prvo izmjeriti koliko igrača ima lvl 10+.** Ako je to 2–3 ljudi, cijelo takmičenje nema učesnike. |
| XP lanac već ima 5 upisa na `users/{uid}` po akciji (P2 iz optimizacijskog izvještaja) | **Klanski bodovi idu u RTDB, ne u Firestore.** `increment` na RTDB čvoru je isti obrazac kao leaderboardi — nula Firestore upisa, pa klanovi ne pogoršavaju ono što P2 tek treba popraviti. |
| 29 igrača, medijana XP 427, 14 aktivnih u 24h | Sve ispod pretpostavlja **3–4 klana po 6–8 ljudi**. Formati koji traže 20+ klanova otpadaju. |

---

## 1. Pet formata takmičenja

Poredani po odnosu efekta i posla. Svi rade unutar postojećeg prozora
pon 08:00 – pet 18:00 i ne traže da igrači budu online u isto vrijeme.

### F1 — Liga najboljih pet (preporuka za prvo)

Sabira se sedmični XP **pet najboljih članova** klana, ne svih.

- **Zašto top-5:** klan od 10 ljudi inače uvijek tuče klan od 6, pa se
  takmičenje pretvara u trku za popunjavanjem. Sa top-5 mali klan s pet
  ozbiljnih igrača pobjeđuje veliki klan s pet putnika.
- **Izvedba:** RTDB `clanWeek/{weekId}/{clanId}/{uid}` = XP te sedmice
  (`increment` na istom mjestu gdje se već piše `leaderboard/weekly`).
  Na kraju prozora funkcija pročita čvor, uzme pet najvećih, sabere.
- **Posao:** mali. Jedan RTDB upis u postojećem lancu + finalizacija u
  `tournamentTick`.
- **Rizik:** nizak.

### F2 — Štafeta znanja (klanski niz)

Klan ima zajednički niz: svaki dan u kojem je **bar troje članova** odigralo
kviz produžava niz. Prekid ga vraća na nulu.

- **Zašto:** izmjereno usko grlo nije sadržaj nego **povratak** (14 od 29
  aktivnih u 24h). Ovo je jedini format u kojem te saigrač lično zove da uđeš
  u igru, jer bez tebe pada cijelom klanu.
- **Izvedba:** dnevni brojač u RTDB; `notifTick` u 20h javi klanu ako niz
  visi ("Fali još jedan igrač da niz ostane živ").
- **Posao:** srednji (traži novi tip notifikacije u `functions/notif-odluka.js`).
- **Rizik:** nizak. Pazi na jedno: prag od troje na klan od šest je grub kad je
  ljeto i pola ekipe na godišnjem — prag neka bude `min(3, ceil(članovi/3))`.

### F3 — Tematska sedmica

Svake sedmice se izvlači jedna kategorija iz banke (interakcije, osteoporoza,
antibiotici…). Za klanski skor se broje **samo tačni odgovori iz te
kategorije**, dvostruko.

- **Zašto:** banka ima ~35 tema i 642 pitanja koja se sad troše ravnomjerno.
  Ovako svaka sedmica ima svoj karakter, a igrači uče usmjereno — što je i
  stručni cilj aplikacije, ne samo igrački.
- **Izvedba:** `config/clanWeek` s izvučenom kategorijom; `correctByCategory`
  se već računa u `submitAnswer`, pa je podatak tu.
- **Posao:** mali. Nadograđuje se na F1.
- **Rizik:** nizak, uz jednu zamku: kategorije nisu ravnomjerne (kardiologija
  ima 2 pitanja, interakcije 36). **Izvlačiti samo iz kategorija s 20+ pitanja.**

### F4 — Klan protiv klana (dnevni parovi)

Svaki radni dan klan dobija jednog protivnika. Ko tog dana ima više tačnih
odgovora, uzima bod. Pon–pet = do pet bodova; sedmicu dobija klan s najviše
bodova.

- **Zašto:** jedini format s **direktnim protivnikom**. Tabela je apstraktna,
  "danas igramo protiv Rx Tima" nije.
- **Izvedba:** round-robin je već riješen problem — logika je ista kao
  `buildBracket`, samo bez eliminacije. Sa 4 klana to je 3 kola, pa se ponavlja.
- **Posao:** srednji.
- **Rizik:** srednji. Sa **neparnim brojem klanova** neko svaki dan pauzira, a
  sa 2 klana je ista dva protivnika pet dana zaredom — dosadno. **Ne uvoditi
  dok ne bude bar 4 klana.**

### F5 — Osvajanje apoteka (mapa)

Mapa od 6–8 tačaka ("apoteke"). Klan zauzima tačku kad na njoj skupi prag
bodova; držanje tačke nosi pasivni bonus (npr. +5% XP članovima) dok je ne
preotmu.

- **Zašto:** jedini format u kojem se rezultat **ne resetuje** sedmično, pa
  klan ima šta braniti i osjećaj kontinuiteta.
- **Posao:** velik — nova mapa, novi ekran, nova pravila.
- **Rizik:** visok. Ovo je Faza 3, ne sad. Zapisano da se ne izgubi.

**Preporuka:** krenuti s **F1 + F3** (jedna izvedba, jer F3 samo mijenja šta se
broji), pa **F2** kad se vidi da takmičenje uopšte ima učesnika. F4 čeka 4 klana,
F5 čeka Fazu 3.

---

## 2. Šta se nadograđuje unutar klana

Da bi klan bio nešto što se razvija, a ne samo lista imena, trebaju mu dvije
odvojene stvari:

- **`clanXP` / `clanLevel`** — trag rezultata, raste i nikad ne pada. Samo
  brojka i prestiž.
- **`clanBodovi`** — valuta koja se **troši** na nadogradnje. Dobija se za
  plasman u sedmičnom takmičenju (npr. 1. mjesto 100, 2. 60, 3. 40, učešće 20).

Razdvojiti ih je bitno: ako se troši isto što i raste, klan koji nadograđuje
pada na ljestvici i kažnjen je zbog razvoja.

### Pet nadogradnji

| Nadogradnja | Efekat | Zašto baš ova |
|---|---|---|
| 🧪 **Laboratorij** | +3% XP članovima po nivou (max 5 nivoa = +15%) | Najjednostavniji i najrazumljiviji efekat; dira sve što igrač već radi. |
| ⚡ **Skladište** | +1 na strop energije kvizova (3 → 4 → 5) | Direktno rješava "nemam više pokušaja", najčešći zid u igri. **Oprez: mijenja `QUIZ_ENERGY_MAX`, koji je danas konstanta na serveru — traži da strop postane podatak s profila.** |
| 📚 **Biblioteka** | +1 besplatna zamjena dnevnog questa sedmično | Koristi već postojeći žeton `questReroll`, nula novog koda za efekat. |
| 🏛️ **Sala** | Kapacitet klana 10 → 12 → 15 | Jedina nadogradnja koju **ne** treba raditi prije nego bude 40+ igrača, inače povećava prazna mjesta. |
| ✨ **Vitrina** | Otključava klansku auru/okvir avatara svim članovima | Koristi postojeći sistem kozmetike (`ring`/`background`/`aura`), bez nove grafike. Vidljiv status = najjeftiniji motivator koji imamo. |

**Redoslijed izgradnje:** Laboratorij → Biblioteka → Vitrina → Skladište → Sala.
Prve tri su čist podatak i ne diraju vruć put bodovanja; Skladište dira strop
energije, Sala dira model klana.

---

## 3. Vikend boss — mehanizam

Dogovoreno je da boss ide i da u njemu učestvuju **svi klanovi**, uz to da se
"potroši energija kroz učešće". Prijedlog mehanizma:

### Kako radi

1. Boss se pojavljuje **petkom u 18:00** i traje do **nedjelje u 18:00** —
   isti prozor kao XP trka, namjerno: to je jedini termin kad je aktivnost
   ionako najveća, pa boss ne otvara novi front nego se **sabira preko
   postojećeg**.
2. Boss ima **HP**. Svaki **tačan odgovor bilo gdje u igri** (kviz,
   Preživljavanje, duel) skida HP:
   - običan tačan odgovor → **1 HP**
   - tačan odgovor iz **bossove kategorije** → **3 HP**
   - tačan odgovor u Preživljavanju → **2 HP** (kratak tajmer, teže je)
3. **Energija je municija.** Igrač bez pokušaja ne može napadati — a žeton
   `quizRefill` iz kovčega postaje "dodatni napad". To je odgovor na "da mu
   potroše energiju kroz učešće": ne uvodi se nova valuta, koristi se ona koja
   već postoji i koju igrači već razumiju.
4. **Šteta se pripisuje i igraču i njegovom klanu.** Dvije ljestvice:
   pojedinačna i klanska. Igrač bez klana igra samo za sebe — boss ne smije
   biti zid za 2/3 igrača koji nisu ni u jednom klanu.
5. Ako boss **padne** prije nedjelje 18:00 — svi koji su nanijeli bar 1 HP
   dobijaju nagradu (XP + kovčeg), a klan s najviše štete dobija klanske
   bodove. Ako **ne padne** — nagrade dobijaju samo prva tri klana, a boss se
   sljedeće sedmice vraća s **istim** HP-om (ne raste dok ga zajednica ne obori).

### Kalibracija HP-a (ovdje se boss najlakše pokvari)

Ne fiksirati broj napamet. Formula:

```
HP = aktivni_igrači_vikendom × prosječno_tačnih_po_igraču × 1.2
```

Množilac 1,2 znači: boss pada tek ako se zajednica malo pomjeri iznad
uobičajenog. **Prije prvog bossa izmjeriti stvaran broj tačnih odgovora u
jednom vikendu** (podatak postoji u `categoryStats` i u sedmičnom leaderboardu).
Prvi boss namjerno postaviti **premekano** — boss koji padne u subotu je dobra
vijest, boss koji preživi jer je HP bio nagađan ubija format odmah.

### Trošak

Nula novih Firestore upisa: HP je jedan **RTDB brojač** uz `increment`, isti
obrazac kao leaderboardi. Šteta po igraču/klanu su još dva RTDB čvora.

---

## 4. Redoslijed

```
1. Izmjeriti koliko igrača ima level 10+          ← blokira sve ostalo
2. F1 (liga top-5) + clanBodovi                   ← bez ovoga clanXP ostaje 0
3. F3 (tematska sedmica)                          ← ista izvedba kao F1
4. Nadogradnje: Laboratorij → Biblioteka → Vitrina
5. Boss (kalibracija iz stvarnih podataka)
6. F2 (štafeta) kad takmičenje ima učesnika
7. F4 kad bude 4+ klana · F5 = Faza 3
```

---

## 5. Otvorena pitanja

1. **Koliko igrača ima level 10+?** Ako ih je manje od 5, spustiti prag za
   osnivanje ili odgoditi najavu klanova.
2. **Bodovi za plasman** — predloženo 100/60/40/20. Je li razlika prvog i
   zadnjeg premala (svi grade jednakom brzinom) ili prevelika (prvi klan bježi
   nepovratno)?
3. **Boss i igrači bez klana** — dobijaju li punu nagradu? Prijedlog: da, ali
   bez klanskog dijela.
4. **Skladište** traži da strop energije postane podatak na profilu umjesto
   konstante `QUIZ_ENERGY_MAX`. Radimo li tu izmjenu ili Skladište ispada?
5. **Šta ako klan raspusti vođa usred takmičenja** — propadaju li bodovi
   članovima? Prijedlog: sedmica se poništava samo tom klanu.

---

## Notifikacija vodstvu o zahtjevu za ulazak (01.08.2026.)

`requestJoinClan` sada javlja **osnivaču i savjetnicima** da neko čeka odobrenje
(`obavijestiVodstvo` u `functions/index.js`, tekst u `porukaZahtjevaZaKlan`).

Zašto zaseban put umjesto postojećeg `obavijestiClan`:

- zahtjev je **zadatak za vodstvo**, ne vijest za klan — običnom članu je to
  obavijest bez ijedne moguće akcije, a takve poruke su najbrži put do toga da
  igrač ugasi notifikacije;
- `clanNotice` se pritom **ne** upisuje: to polje je zajednička klanska vijest
  koju vide svi, a zahtjev na čekanju vodstvo ionako vidi u sekciji Klan.

Ide pod postojećim tipom `klan` (isti prekidač kao ostale klanske poruke), ali s
vlastitim tagom `klan-zahtjev` — da ga obavijest o novom članu ne obriše s
ekrana prije nego vodstvo odluči.

**Izlazak iz klana se već javljao** i javlja se i dalje svim članovima
(`leaveClan` → `obavijestiClan`), pa vodstvo tu poruku dobija kroz taj put.
Slanje ide POSLIJE transakcije i u `try/catch`: zahtjev je već upisan, a
neposlana notifikacija nije razlog da igrač dobije grešku.
