# Pharma Quest — plan Faze 2

Nastavak na `Pharma_Quest_Vodic_Za_Izradu.pdf` (Etape 0–9 su zatvorene zaključno
s Etapom 8, zatvorena beta). Vodič Fazu 2 opisuje s dvije rečenice —
*"klanovi, bedževi, notifikacije, pa launch kampanja"* i *"klanovi, boss,
turniri"* — pa ovaj dokument popunjava ostatak.

Datum: 27.07.2026. · Stanje koda: commit `e931171`

---

## 0. Polazište

**Već gotovo iz te liste:**

- **Bedževi** — 14 definicija, server ih dodjeljuje (`awardBadges`), animacija otključavanja radi
- **Turniri** — sve tri vrste: Preživljavanje (sedmični endless), vikend XP trka, 1v1 duel bracket

**Ostaje:** klanovi, push notifikacije, boss, launch kampanja (nije kod).

**Izmjereno stanje igrača (27.07.2026, očitano iz produkcije):**

```
26 igrača · 0 koji nikad nisu igrali · 24 sa XP > 0
aktivni 7 dana:  25        aktivni 24h:  7
streak >= 3:      7
XP: top 3213, 2977, 2566 … medijana 264
146 kviz sesija ukupno = ~5,6 po igraču
```

Energija dozvoljava 3 kviza dnevno; prosječan igrač je odigrao ukupno oko dva
dana vrijedno kvizova. **Svi su probali, mali broj se vraća.** Sadržaj nije usko
grlo — povratak jeste. Ovaj nalaz određuje redoslijed ispod: prvo se popravlja
povratak, klanovi dolaze kad ima koga svrstavati.

**Dvije stavke iz Etape 8 su još otvorene** i ulaze u ovaj plan jer gađaju isti
problem: bedž "Pionir" i onboarding.

### Šta je pregledano u `Desktop/EPC igrica/` (27.07.2026)

Pročitan je **svaki** fajl u folderu. **Master plan "v1" na koji se vodič poziva
nije tamo** — ne treba ga više tražiti. Sadržaj foldera:

| Fajl | Šta je |
|---|---|
| `Pharma_Quest_Vodic_Za_Izradu.pdf` (10 str) | vodič, Etape 0–9; `guide_extract.txt` je vjerna ekstrakcija |
| `instrukcija claude code.docx` | upute za Firebase audit — izvor optimizacijskog izvještaja |
| `Ispravke.docx` | feedback testera (vidi ispod) |
| `specifikacije-slika.txt` | specifikacije grafike → poglavlje F2.8 |
| ostalo | banke pitanja, dizajn mockupi, ključevi |

Iz `Ispravke.docx` su izvučene **dvije stvari koje ulaze u ovaj plan** (F2.7 i
F2.8) i jedna provjera koja je zatvorena:

> **Sedam prijava "označim tačno a kaže netačno" — podaci su ISPRAVNI.**
> Provjerena su svih sedam pitanja u produkciji (27.07.2026): u **svakom**
> slučaju je tačan odgovor u `questionSecrets` upravo onaj koji tester navodi
> (denosumab, sertralin, insomnija=C, levotiroksin=D, superoksidni anion,
> cink oksid, crna katranasta stolica). Banka nije kriva. To potvrđuje raniju
> hipotezu da je uzrok bio **serverski tajmer** — popravljeno 24.07.
> (`GRACE_SECONDS` 6→15, commit `7f77813`), istog dana kad je `Ispravke.docx`
> nastao. **Provjeriti s testerima je li se ponovilo POSLIJE 24.07.**; ako
> jeste, tajmer nije uzrok i treba logovati razliku klijentskog i serverskog
> sata pri svakom odgovoru.

---

## F2.1 — Bedž "Pionir" (beta učesnici)

> Vodič, Etapa 8: *"Beta bedž 'Pionir' za sve učesnike (ekskluzivan, nikad više dostupan)."*

**Zašto prvo:** vremenski osjetljivo. Sada tačno znamo ko su ta 26 ljudi.
Poslije launcha se granica "ko je bio u beti" zamuti i bedž gubi smisao.
Posao je mali.

**Izvedba** — isti obrazac kao `turnir-sampion`:

- Nova definicija u `scripts/postavi-bedzeve.js`:
  `{ id: 'pionir', emoji: '🚩', name: 'Pionir', description: 'Učesnik zatvorene bete', metric: 'manual', goal: 999999, order: 0 }`
  (`metric: 'manual'` + ogroman prag ⇒ `awardBadges` ga nikad ne dodijeli sam)
- Nova skripta `scripts/dodijeli-pionire.js`:
  - dodjeljuje `badges.pionir` svima koji **postoje u `users` na dan pokretanja**
  - `--stvarno` zastavica (bez nje samo ispiše koga bi dodijelio) — isti obrazac
    kao `isplati-survival-kovcege.js`
  - idempotentno (preskoči one koji ga već imaju)
- `order: 0` da stoji prvi u kolekciji na profilu

**Odluka koja treba tvoja:** ide li Pionir **svima koji su registrovani**, ili
samo onima koji su **stvarno igrali** (24 od 26 imaju XP > 0)? Prijedlog: svima
registrovanim — bedž je za učešće u beti, ne za rezultat.

**Kontrolna tačka:** 26 profila ima `badges.pionir`; bedž se vidi na profilu i
može se istaknuti na avataru; novi korisnik registrovan sutra ga **ne** dobija.

**Rizik:** nizak.

---

## F2.2 — Push notifikacije (FCM)

**Cilj:** vratiti igrače koji su probali pa stali. Ovo je jedina stavka koja
direktno gađa izmjereno usko grlo.

### Tehnički okvir

- **Firebase Cloud Messaging (Web Push)** + VAPID ključ (Firebase konzola →
  Project settings → Cloud Messaging → Web Push certificates)
- **Token po uređaju** u `users/{uid}.fcmTokens` (lista, ne jedan string —
  isti igrač ima telefon i desktop). Uz svaki token spremiti `updatedAt` da se
  mrtvi mogu čistiti.
- **Slanje sa servera** preko Admin SDK-a (`messaging().sendEachForMulticast`).
  Neispravni tokeni se vraćaju u odgovoru → odmah ih brisati iz profila, inače
  lista raste zauvijek.

### Odluka: service worker

`vite-plugin-pwa` je na `generateSW`, a FCM traži svoj `firebase-messaging-sw.js`.
Dvije opcije:

| | Odvojeni SW (`public/firebase-messaging-sw.js`) | Spojeni (`injectManifest`) |
|---|---|---|
| Posao | mali — samo dodati fajl | preći s `generateSW`, prepisati SW |
| Rizik | dva SW-a u istom scope-u | dira postojeći offline sloj koji radi |
| Preporuka | **ovo** za početak | tek ako odvojeni napravi problem |

### iOS ograničenje (bitno — pola publike)

Web push na iOS-u radi **samo ako je PWA instalirana na home screen**, iOS 16.4+.
Igrač koji igru otvara u Safariju neće nikad dobiti notifikaciju i to se ne može
zaobići. Zato:

- onboarding (F2.3) mora nositi korak "dodaj na početni ekran" za iPhone
- u Profilu prikazati iskreno stanje: *"Notifikacije: nedostupne — instaliraj
  aplikaciju na početni ekran"* umjesto tihog neuspjeha

### Tipovi poruka (prijedlog)

| Tip | Kada | Primjer |
|---|---|---|
| Energija puna | kad se spremnik napuni na 3 | "Imaš 3 kviza na raspolaganju ⚡" |
| Preživljavanje | srijeda, reset sedmičnog pokušaja | "Novi pokušaj Preživljavanja je tu 🎯" |
| Turnir | otvaranje prijava i početak igre | "Vikend duel počinje večeras" |
| Streak u opasnosti | uveče, ako danas nije igrao a streak ≥ 2 | "Tvoj niz od 5 dana ističe u ponoć 🔥" |
| Quest pred istek | ako je task na ≥ 80% a period ističe | "Fali ti još 2 tačna za nagradu" |

**Streak u opasnosti** je vjerovatno najjači od svih — vezan je za nešto što
igrač već ima i ne želi izgubiti.

### Higijena (ovo odlučuje hoće li notifikacije pomoći ili odmoći)

- **najviše 1 notifikacija dnevno po igraču**, uz prioritet tipova
- **nikad između 22:00 i 08:00** po lokalnom vremenu (BiH, UTC+2)
- **per-tip opt-out** u Profilu, ne samo "sve ili ništa"
- ne slati onome ko je **danas već igrao**
- mjeriti otvaranja (GA4 `notification_open`) — ako tip ne donosi povratak, gasi se

### Struktura

- `users/{uid}.notifPrefs` `{ energija, survival, turnir, streak, questovi }` (sve `true` po defaultu)
- `users/{uid}.lastNotifAt` — brana za "1 dnevno"
- scheduled funkcija `notifTick` (svakih 30 min, kao `tournamentTick`) koja bira
  kome šta ide
- pravila: `notifPrefs` i `fcmTokens` smije pisati sam igrač (dodati u
  `hasOnly` listu u `firestore.rules`) — nisu XP polja

**Kontrolna tačka:** notifikacija stigne na instaliranu PWA na Androidu i
iPhoneu; gašenje tipa u Profilu je zaista zaustavi; igrač koji je danas igrao
ne dobija "energija puna"; ništa ne stiže noću.

**Rizik:** srednji. Najveći rizik nije tehnički nego **spam** — previše poruka
i igrači isključe notifikacije zauvijek, što je nepovratno.

---

## F2.3 — Onboarding (3 ekrana)

> Vodič, Etapa 1, ekran #8: *"Šta je igra → kako se napreduje → izbor avatara"*.
> Dizajn postoji: `Desktop/EPC igrica/onboarding.png`.

Trenutno postoji samo `DovrsiProfil` (ime + avatar). Novi igrač uleti u igru bez
konteksta — a medijana od 264 XP govori da dobar dio ne shvati šta dalje.

**Ekrani:**
1. **Šta je igra** — kvizovi iz struke, XP, leveli
2. **Kako se napreduje** — questovi, streak, eventi (Preživljavanje/turnir)
3. **Izbor avatara** — spaja se s postojećim `DovrsiProfil`

**Dodati četvrti korak samo za iPhone** (detekcija: iOS + nije `standalone`):
"Dodaj na početni ekran" s uputstvom — bez toga F2.2 ne postoji za te igrače.

**Kontrolna tačka:** novi nalog vidi tri ekrana prije Home-a; postojeći igrači
ih ne vide; iPhone korisnik dobija uputstvo za instalaciju.

**Rizik:** nizak. Ne dira bodovanje.

---

## F2.4 — P2 iz optimizacijskog izvještaja (prije klanova)

Puni opis: `Desktop/EPC igrica/Firebase-optimizacija-izvjestaj-26-07-2026.txt`.
Sažetak: XP, level-milestone, bedževi, streak i taskProgress se danas upisuju
kroz **pet odvojenih upisa** na `users/{uid}` po jednoj akciji.

**Zašto baš ovdje, prije klanova:** klanski XP je **šesti** upis u taj lanac.
Ako klanove uradimo prije P2, P2 postaje skuplji i rizičniji. Ako P2 uradimo
prije, klanski doprinos se uklopi u već postojeću jednu transakciju.

**Rizik:** visok — dira bodovanje. Ide zasebno, s testom na emulatoru prije
deploya. `scripts/test-funkcije.mjs` je popravljen 27.07. i pokriva kviz →
nagrade → leaderboard, pa je mreža spremna.

---

## F2.5 — Klanovi

**Preduslov:** P2 gotov, i dovoljno igrača da klan ima smisla. Sa 26 igrača
ispada 3–4 klana po 6–8 ljudi, što je tanko. Vodič klanove i sam stavlja iza
beta izlaznog kriterija (**D7 ≥ 35%**, provjeriti u GA4).

Polje `users/{uid}.clan` **već postoji** (null pri registraciji) i prikazuje se
na Profilu — model ima kuku spremnu.

### Model podataka

```
clans/{clanId}
  name, tag (3–5 znakova), emoji, ownerUid,
  memberCount, totalXp, createdAt, joinPolicy ('open' | 'na-poziv')

clans/{clanId}/members/{uid}
  name, avatar, xpContributed, joinedAt, role ('vodja' | 'clan')

users/{uid}.clan = clanId | null

RTDB: leaderboard/clans/{clanId} = { name, emoji, xp, memberCount }
```

Ljestvica klanova ide u **RTDB**, kao i sve ostale — nula Firestore čitanja.

### Pravila

- `clans/*` čitanje za prijavljene, **pisanje samo server** (callable funkcije)
- `createClan`, `joinClan`, `leaveClan`, `kickMember` kao callable, s provjerama:
  - jedan igrač = jedan klan
  - ime/tag jedinstveni (rezervacija preko `clanNames/{lowercaseName}` dokumenta)
  - minimalni level za osnivanje klana (prijedlog: 5) — da se ne prave prazni klanovi
  - vođa ne može izaći dok ne prenese vodstvo ili raspusti klan

### Klanski XP

Svaki XP koji igrač osvoji doprinosi i klanu. **Mora ući u istu transakciju kao
ostatak profila** (vidi F2.4), inače vraćamo problem koji je P2 riješio.
`clans/{clanId}.totalXp` se diže preko `FieldValue.increment()`, a
`members/{uid}.xpContributed` isto — increment ne traži čitanje.

**Otvoreno pitanje:** računa li se klanski XP **od ulaska u klan** ili se nosi
zatečeni XP? Prijedlog: **od ulaska** — inače se isplati skakati po klanovima.

### Ekran

`src/pages/Klan.jsx` je trenutno prazan placeholder, a **tab je živ u donjoj
navigaciji** — to je najvidljivija rupa u aplikaciji. Ekran nosi: moj klan
(članovi + doprinos), ljestvica klanova, pretraga/osnivanje.

**Kontrolna tačka:** igrač može osnovati klan, drugi mu se pridružiti, XP oba
ulaze u klanski total, ljestvica klanova se osvježava uživo, izlazak iz klana
ne briše lični XP.

**Rizik:** visok — nova domena, dira XP put.

---

## F2.6 — Boss (prijedlog, nije iz vodiča)

Vodič "boss" pominje **jednom, bez ijednog detalja**. Ovo je prijedlog, ne plan
po vodiču — treba tvoja odluka prije nego uđe u red.

### Zamisao: sedmični zajednički boss

Cijela zajednica ruši istog protivnika. Umjesto da se igrači takmiče
međusobno (što već rade kroz tri turnira), ovdje **sarađuju** — a to je jedini
format koji sa 26 igrača radi bolje nego s 500.

- Boss ima **HP** (npr. 3.000). Svaki tačan odgovor bilo gdje u igri (kviz,
  Preživljavanje, duel) skida **1 HP**, težina pitanja može množiti.
- Traje od ponedjeljka do nedjelje. Ako padne — **svi koji su doprinijeli**
  dobijaju nagradu (XP + ekskluzivni okvir avatara preko postojećeg
  `awardCosmetics`).
- Ako ne padne, sljedeće sedmice se vraća s istim HP-om (ne raste dok ga
  zajednica ne obori).
- Tematika iz struke: *"Rezistentni soj"*, *"Polifarmacija"*, *"Interakcija"* —
  svaki boss veže bonus na svoju kategoriju pitanja (npr. tačan odgovor iz
  `interakcije` skida 3 HP umjesto 1).

**Zašto se dobro uklapa:**
- HP je jedan RTDB brojač uz `increment` — jeftino, i već imamo taj obrazac
- daje smisao igračima s malo XP-a: i jedan tačan odgovor vidljivo pomjera traku
- ne takmiči se s postojećim eventima nego se **sabira** preko njih

**Otvoreno:** HP kalibracija. Pri trenutnom prometu (~146 sesija ukupno,
~5,6 po igraču) 3.000 HP je vjerovatno previše — treba izračunati iz stvarnog
broja tačnih odgovora sedmično prije nego se broj fiksira.

**Rizik:** srednji. Ne dira bodovanje ako je HP odvojen brojač.

---

## F2.7 — Kozmetika koja se otključava XP-om (iz `Ispravke.docx`)

> Tester, `Ispravke.docx`, prva stavka: *"Razmisliti da se dodaju sitni pokloni
> koji se otključaju sa skupljanjem bodova? Npr za avatar naočare, šešir,
> majica, lude frizure, promena boje pozadine i slično."*

**Ovo je dijelom već izgrađeno, i to je dobra vijest.** `src/data/cosmetics.js`
ima **30 ukrasa u tri nezavisna slota**:

| Slot | Šta je | Odakle se osvaja |
|---|---|---|
| `ring` | okvir oko avatara | 1v1 dueli |
| `background` | pozadina unutar kruga | Preživljavanje |
| `aura` | sjaj izvan avatara | XP trka |

Sve je CSS (bez slika), nosi ga `Avatar.jsx`, bira se na `/okviri`, dodjeljuje
`awardCosmetics`. "Promjena boje pozadine" iz testerove liste **već postoji**.

**Prava rupa je uslov otključavanja.** Sva tri izvora su **eventi**. Igrač koji
ne igra Preživljavanje, duel ni XP trku ne može dobiti **nijedan** ukras. A po
izmjerenom stanju to je većina: 21 survival run i 7 igrača sa streakom ≥ 3 na
26 igrača. Drugim riječima — sistem nagrađivanja postoji, ali ga medijanski
igrač nikad ne vidi.

**Prijedlog:**

1. **Nivo 1 (jeftino, veliki efekat):** dodati **XP/level pragove** kao četvrti
   izvor za dio postojećih 30 ukrasa. Nijedna nova grafika ne treba — samo novi
   `source: 'level'` u katalogu i provjera u `awardCosmetics` pozvana iz istog
   mjesta gdje već ide `awardLevelMilestones`. Igrač na levelu 5 dobija prvi
   okvir i odmah ima šta da nosi.
2. **Nivo 2 (traži grafiku):** avatar **dodaci** — naočare, šešir, majica,
   frizura. Ovo je novi sloj iznad avatara i **traži prave slike**, pa zavisi
   od F2.8. Novi slot `accessory` u istom modelu (`cosmetics.owned` + pravila
   koja već postoje).

Nivo 1 preporučujem odmah — jeftin je i direktno gađa isti problem povratka kao
notifikacije. Nivo 2 čeka grafiku.

**Kontrolna tačka:** igrač koji nikad nije igrao event, a stigao je do levela 5,
ima bar jedan ukras koji može obući.

**Rizik:** nizak (nivo 1) — kozmetika ne nosi nikakvu prednost u igri, pravila
za `cosmetics` već postoje i testirana su.

---

## F2.8 — Vizuelni upgrade (iz `specifikacije-slika.txt`)

Dokument od 24.07.2026. već ima **kompletne specifikacije**: dimenzije, formate,
imena fajlova i foldere. Ništa se ne treba dogovarati — samo napraviti slike.

| # | Šta | Izvor | Folder | Stanje |
|---|---|---|---|---|
| 1 | 6 avatara | 512×512 WebP | `public/avatars/` | avatari su **trenutno emoji** |
| 2 | 14 bedževa | 256×256 | `public/badges/` | trenutno emoji |
| 3 | UI ikonice | SVG | `public/icons/` | trenutno emoji/inline SVG |
| 4 | Hero ilustracije | 512×512 | `public/illustrations/` | nema |
| 5 | PWA ikone / logo | vidi dokument | `public/` | postoje |

Redoslijed po efektu (iz samog dokumenta): **avatari → bedževi → ikonice →
ilustracije → logo**.

**Ovo je jedina stavka u Fazi 2 koja ne zavisi od koda nego od tebe** — dok
slike ne postoje, nema se šta implementirati. Kad ubaciš fajlove po tim
imenima, posao na strani koda je mali: `Avatar.jsx` da koristi slike uz emoji
fallback, i zamjena emoji bedževa slikama.

**Rizik:** nizak. Emoji fallback znači da djelimično isporučen set ne kvari ništa.

---

## Redoslijed i zavisnosti

```
F2.1 Pionir ──────────────────► (nezavisno, vremenski osjetljivo)

F2.2 Notifikacije ──┐
                    ├─► iOS traži instaliranu PWA
F2.3 Onboarding ────┘

F2.4 P2 ──────────► F2.5 Klanovi   (klanski XP je 6. upis u lanac)

F2.6 Boss ────────► (nezavisno, ali kalibracija traži podatke)
```

| # | Stavka | Rizik | Zavisi od |
|---|---|---|---|
| 1 | Pionir bedž | nizak | — |
| 2 | Kozmetika po levelu (F2.7 nivo 1) | nizak | — |
| 3 | Push notifikacije | srednji | — |
| 4 | Onboarding | nizak | ide uz #3 (iOS) |
| 5 | P2 (jedna transakcija) | **visok** | — |
| 6 | Klanovi | **visok** | #5 |
| 7 | Boss | srednji | podaci za kalibraciju |
| — | Vizuelni upgrade (F2.8) | nizak | **tvoja grafika**, ide paralelno |
| — | Avatar dodaci (F2.7 nivo 2) | nizak | F2.8 |

Stavke 1 i 2 su obje jeftine i obje gađaju povratak igrača, pa idu prve —
igrač dobija nešto vidljivo prije nego uopšte krenu notifikacije.

---

## Otvorena pitanja za odluku

1. **Pionir** — svima registrovanim (26) ili samo onima koji su igrali (24)?
2. **Klanovi** — klanski XP se broji od ulaska u klan ili se nosi zatečeni?
3. **Klanovi** — minimalni level za osnivanje (prijedlog 5) i maksimalna
   veličina klana?
4. **Boss** — ulazi li u Fazu 2 ili čeka Fazu 3?
5. **Beta gate** — kolika je stvarna D7 retencija u GA4? Vodič traži ≥ 35%
   prije nego se ide na klanove i launch.
6. **Kozmetika po levelu** — koji pragovi (prijedlog: prvi ukras na levelu 5,
   pa svakih 10 levela) i koliko od postojećih 30 ukrasa premjestiti na taj
   izvor, a koliko ostaviti ekskluzivno za evente?
7. **Bug s bodovanjem** — javlja li iko od testera "tačno a kaže netačno"
   **poslije 24.07.**? Ako da, tajmer nije uzrok i treba dublja dijagnostika.
