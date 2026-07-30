# Klanski rat i Zeleni Okrug — tehnička dokumentacija

Automatizovani sedmični rat klanova + gradnja Okruga. Ponedjeljak 08:00 → petak
20:00 (Europe/Sarajevo), uparivanje nedjeljom u 00:00.

Datum: 29.07.2026. · Pravila: `functions/klan-rat.js` · Testovi: `npm run test-klanrat`

---

## 1. Arhitektura: zašto je bodovanje u RTDB-u

Ovo je najvažnija odluka u cijelom sistemu i ne treba je mijenjati bez razloga.

Jedan XP događaj u Firestoreu bi bio **šesti upis** u lanac koji već ima pet
(XP, level-milestone, bedževi, streak, taskProgress) i koji P2 iz optimizacijskog
izvještaja tek treba sažeti. Zato **cijelo živo bodovanje ide u RTDB uz
transakcije** — isti obrazac kao postojeći leaderboardi.

Firestore drži samo metapodatke i **konačan** rezultat: onoliko upisa koliko ima
mečeva, jednom sedmično.

```
RTDB (živo, besplatno, atomično)
  clanWar/{warId}/{clanId}/cp                 skor klana
                          /meta               { name, tag }
                          /members/{uid}      { name, avatar, cp }
                          /days/{dan}/cp      dnevni skor
                          /days/{dan}/aktivni/{uid} = true
                          /days/{dan}/bonus   'ispunjeno' | 'stit' | 'nedovoljno'
  clanWarDaily/{dan}/{uid}                    dnevni strop igrača (XP, ne CP)

Firestore (rijetko)
  config/clanWar          { enabled, warId, status, startAt, endAt,
                            boostKategorija, autoUparivanje }
  clanWars/{warId}        { warId, startAt, endAt, status, boostKategorija,
                            brojMeceva, brojKlanova, resolvedAt }
  clanWars/{warId}/matches/{matchId}
                          { clanIds[], grupni, bye, imena, status,
                            scores{}, winner, nerijeseno }
  clans/{clanId}          + clanRating, trezor, zadnjiRat
                          + okrug: { nivoi{}, gradnja{}, stit{}, historija[] }
  users/{uid}             + clanGold        zeleni bodovi igrača
                          + hint            { week, iskoristeno }
  quizSessions/{id}       + qSeconds, xpBonus, comboBonus   (zamrznuti bonusi)
                          + hintNa, hintSkriveni, hintOstalo
```

**RTDB pravila ne treba dirati** — klijent te čvorove ne čita direktno, sve ide
kroz callable `getClanWar`.

---

## 2. Tok bodova

`addClanWarCp(uid, xp, { xpPoKategoriji })` je **jedina** ulazna tačka. Zove se
s **tačno dva** mjesta:

| Mjesto | XP koji ulazi | Kategorija |
|---|---|---|
| kraj kviza (`submitAnswer`) | `awardedXp` (poslije dnevnog capa) | raspodjela po pitanjima |
| tačan odgovor u Preživljavanju | 3 XP + kovčeg | kategorija pitanja |

### U rat ulazi samo odigrano, ne pokupljeno

Nagrade za questove — dnevne, sedmične i mjesečne — **ne nose CP**. Rat mjeri
koliko se igra; questovi se pune iz istih tih kvizova, pa bi se isti trud
brojao dvaput, a klan bi mogao dobiti rat skupljanjem nagrada umjesto igranjem.

Klanski bonusi (+% CP kroz nivoe Zelenog Okruga) i dalje rade normalno — samo
djeluju isključivo na CP iz kviza i Preživljavanja.

> Do 30.07.2026. je `claimTask` greškom pripisivao CP. Ispravljeno, a CP koji je
> tim putem ušao u rat `2026-07-27` je oduzet (vidi `scripts/rat-skini-quest-cp.js`).

Redoslijed unutar funkcije:

1. **Dnevni strop** — RTDB transakcija na `clanWarDaily/{dan}/{uid}`; propušta se
   samo ono što staje ispod 1000 XP.
2. **Množilac** — srijeda 1.5× na izvučenu kategoriju, petak 08–20 sve 2×.
3. **R&D bonus** — +5% CP po nivou.
4. **Upis** — tri RTDB transakcije + oznaka dnevne aktivnosti.

### Množioci se SABIRAJU, ne množe

```
petak + kategorija = 1 + (2−1) + (1.5−1) = 2.5× , a ne 3×
```

Da se množe, cijeli rat bi se odlučivao u pet sati petka i ponedjeljak ne bi
imao smisla. (U praksi se i ne sreću: boost je samo srijedom.)

### Srijedni boost je proporcionalan

Kviz od 10 pitanja rijetko je cijeli iz jedne kategorije. Zato `submitAnswer`
šalje `xpPoKategoriji`, pa se boostuje samo onaj dio XP-a koji stvarno pripada
izvučenoj kategoriji. Bez te raspodjele boost se **ne** primjenjuje — nikad se
ne pretpostavlja u korist igrača.

---

## 3. Dnevni bonus za učešće

+100 CP klanu ako je ≥70% članova tog dana bilo aktivno (prag zaokružen
**nagore**: klan od 8 treba 6, ne 5,6).

Obračunava se **tek kad dan prođe** — igrač koji odigra u 21h inače ne bi ušao u
brojanje. Idempotentno: oznaka `days/{dan}/bonus` je i rezultat i brava.

**Štit smjene** (Dežurna Apoteka, nivo 4+) prašta jedan propušten dan sedmično.
Troši se samo kad je prag stvarno propušten.

---

## 4. Nagrade

| Ishod | Rating | Zeleni bodovi u trezor |
|---|---|---|
| pobjeda | +30 | 300 + CP/50 |
| nerješeno | +15 | 200 + CP/50 |
| poraz | +5 | 120 + CP/50 |

Poraz **ne oduzima** rating (`ratingPoraz = 5`). Apotekarska Inspekcija je zato
trenutno neaktivna — spremna je i proradi čim se `config.ratingPoraz` postavi na
negativan broj.

Član koji je bio aktivan dobija lično: `20 + vlastitiCP/100`, ×1.5 ako je klan
pobijedio, × (1 + bonus Biljne Apoteke).

Kod **izjednačenja nema žrijeba** — rat traje pet dana i bacanje novčića bi bilo
gore nego u duelu.

---

## 5. Balans za ~16 igrača

Račun po klanu koji dobije rat, uz 8 članova i 5 poluaktivnih:

```
CP sedmično       ≈ 5 igrača × ~700 XP × ~1.15 (množioci) ≈ 4000
+ bonusi učešća   ≈ 5 dana × 100                          =  500
                                                    ukupno ≈ 4500–5000 CP

trezor            = 300 + 5000/50                          ≈ 400
članovi (8×~30)                                            ≈ 240
                                       u opticaju sedmično ≈ 600–650
```

### Cijene nadogradnji

`cijena(nivo) = baza × [1, 2, 3.5, 5.5, 8]`

| Tier | Baza | N1 | N2 | N3 | N4 | N5 | Ukupno |
|---|---|---|---|---|---|---|---|
| **A** — Logistički, Galenski | 200 | 200 | 400 | 700 | 1100 | 1600 | **4000** |
| **B** — R&D, Dežurna, Biljna, Dječija | 300 | 300 | 600 | 1050 | 1650 | 2400 | **6000** |
| **C** — Klinička, Muzej, Inspekcija | 400 | 400 | 800 | 1400 | 2200 | 3200 | **8000** |

Namjerno: **prvi nivo jeftinog objekta (200) padne već u prvoj sedmici.** Klan
mora vidjeti da se gradnja pomjera prije nego izgubi interes. Pun jeftin objekat
je posao od ~7 sedmica, cijeli Okrug (54.000 bodova) je cilj za nekoliko mjeseci.

**Ako broj igrača naraste, dizati `CIJENA_BAZA`, ne krivu** — kriva je podešena
tako da svaki sljedeći nivo bude osjetno teži, a to ne treba mijenjati.

### Efekti po nivou

| Objekat | Nivo 1 | Nivo 5 |
|---|---|---|
| 📦 Logistički Centar | +5% XP | +25% XP |
| ⚗️ Galenski Laboratorij | +1 s | +5 s |
| 🔬 R&D Centar | +5% CP | +25% CP |
| 🌙 Dežurna Apoteka | — | 2 štita (prvi na nivou 4) |
| 🌿 Biljna Apoteka | +10% bodova | +50% bodova |
| 🧸 Dječija Apoteka | combo +5% | combo +25% |
| 🩺 Klinička Apoteka | 1× 50:50 | 3× 50:50 |
| 🏛️ Muzej | titule/ukrasi | — |
| 📋 Inspekcija | −10% gubitka | −50% gubitka |

Combo se pali od **trećeg** tačnog odgovora zaredom u istom kvizu.

**Bonusi ne mogu probiti dnevni cap** (`DAILY_QUIZ_XP_CAP`) — samo brže dovode
do njega. Računaju se poslije osnovnog zbira, a prije capa.

---

## 6. Gradnja (crowdfund)

Klan bira **jedan** cilj; sa ~600 bodova sedmično dva paralelna cilja znače da
nijedan ne bude gotov, a nedovršena gradnja ne daje nikakav bonus.

- cilj bira osnivač ili savjetnik (`startBuild`)
- svako ulaže svoje bodove (`contributeToBuild`), vođa i iz trezora
- prima se **samo ono što fali** — ostatak bi inače bio nepovratno zaključan
- na 100% se nivo diže **sam** i cilj se briše
- otkazivanje **vraća uloge tačno onima koji su ih dali**

---

## 7. Zakazani posao

**Jedan** posao, `clanWarTick`, svakih sat vremena u 5. minuti.

Cloud Scheduler je besplatan do 3 posla, a projekat ih već ima 3 (`tournamentTick`,
`notifTick`, `survivalWeeklyReset`). Ovaj je **četvrti i košta ~$0.10 mjesečno**;
četiri odvojena posla (nedjelja/ponedjeljak/dnevno/petak) koštala bi ~$0.40.
Granularnost od sat vremena je dovoljna jer su svi prelomi na pun sat.

Tick radi četiri stvari, redom: zatvori istekli rat → obračunaj dnevne bonuse →
upari klanove (nedjelja 00:00) → pokreni rat (ponedjeljak 08:00).

---

## 8. Admin panel

`RatKontrola` u admin panelu. Redoslijed poluga prati posao:

1. **Upozorenja** — prvo što se vidi (⛔ blokira pokretanje, ⚠️ traži pažnju).
2. **Ručno uparivanje** — biraš parove sam; prazno = automatski po ratingu.
3. **Napravi parove** → **Pokreni rat ODMAH** (s dugmetom „petak 20:00").
4. **⏸ Pauziraj bodovanje** — prva poluga ako nešto krene po zlu; staje pripis,
   nagrade se **ne** isplaćuju.
5. **Zatvori rat** — isplata nagrada, dva koraka potvrde.
6. **Otkaži rat** — briše mečeve i skorove, bez nagrada.
7. **Preračunaj bonus dana** — kad se ispravi članstvo ili tick padne.

Isto s računara: `npm run pokreni-rat -- --stvarno --do "2026-07-31 20:00"`,
uz `--par klanA,klanB` za ručno uparivanje.

---

## 9. Šta može poći po zlu

| Rizik | Kako je pokriveno |
|---|---|
| **Dvostruka isplata nagrada** | `zavrsiRat` provjerava `status === 'resolved'` i izlazi. Testirano. |
| **CP poslije zatvaranja** | Zatvaranje pomjera `endAt` na sada, pa i instanca sa zastarjelim kešom vidi istekao prozor. |
| **Jedan igrač odlučuje rat** | Dnevni strop od 1000 XP po igraču (RTDB transakcija, ne može se preskočiti). |
| **Bonusi probijaju dnevni cap XP-a** | Bonusi se računaju prije capa, cap ostaje mjerodavan. |
| **Klan nadogradi objekat usred kviza** | `qSeconds`, `xpBonus` i `comboBonus` se zamrzavaju u sesiju pri startu. |
| **Server odbija odgovor koji je sam dozvolio** | Tajmer se provjerava po `session.qSeconds`, ne po konstanti. |
| **50:50 otkriva tačan odgovor ponavljanjem** | Jedan hint po pitanju, rezultat se pamti u sesiji; ponovni poziv ne troši upotrebu. |
| **Klan nije uparen a skuplja CP** | Admin panel to javlja kao ⚠️ upozorenje. |
| **Prag učešća veći od broja članova** | Admin panel javlja ⚠️ prije pokretanja. |
| **Neparan broj klanova** | Zadnja tri idu u grupni meč; niko ne sjedi sedmicu. |
| **Otkazivanje gradnje spali tuđe bodove** | Povrat tačno onima koji su uložili. |
| **Ulog veći od onog što fali** | Prima se samo razlika. |
| **Obrisan nalog ruši zatvaranje rata** | Isplata po članu je u `.catch(() => {})`. |
| **Bonus obračunat usred dana** | Dan se obračunava tek kad prođe. |
| **Dvostruki bonus pri preračunu** | `adminWarRecomputeDay` prvo oduzme stari bonus. |

### Poznato ograničenje

`invalidirajRatKes()` čisti keš **samo one instance funkcije** u kojoj se izvršio.
Cloud Functions drži više instanci, pa je stvarna granica zastarjelosti TTL:

- **konfiguracija rata: 30 s**
- **nivoi Okruga po igraču: 5 minuta**

Praktično: nadograđen objekat počne djelovati svima najkasnije za 5 minuta.
Ako to ikad postane problem, rješenje **nije** kraći TTL (to vraća čitanja na
vrući put) nego verzija sadržaja u jednom dokumentu, kao `config/content.version`
kod taskova.

`adminWarStatus` namjerno zaobilazi keš — inače bi admin poslije klika na
„Pokreni" još pola minute gledao staro stanje i mislio da poluga ne radi.

---

## 10. Odstupanja od specifikacije

Tri stvari iz zahtjeva se razlikuju od zatečenog stanja igre. Nisu tiho
prilagođene nego zapisane ovdje:

1. **„Igrač može osvojiti najviše 1000 XP u 24h" — to danas NE važi.**
   `DAILY_QUIZ_XP_CAP = 1000` odnosi se samo na XP **iz kvizova**; nagrade za
   questove, Preživljavanje i turniri idu **povrh** toga. Rat zato ima vlastiti
   dnevni strop od 1000 XP po igraču (`DNEVNI_CP_STROP`), koji radi bez obzira
   na to odakle XP dolazi. Ako želiš da i globalni XP bude tvrdo ograničen na
   1000/dan, to je zasebna izmjena u `submitSurvivalAnswer` i `claimTask`.

2. **„11 dnevnih kvizova" — energija danas daje najviše 9.** Strop je 3 odjednom
   + 1 regeneracija svaka 4 sata (6 dnevno). Preko 9 se ide samo žetonima
   (`quizRefill`) iz kovčega. Nisam dirao energiju.

3. **„Gold/Coins" ne postoji u igri.** Uveden je novi resurs **zeleni bodovi**
   (`users.clanGold`, `clans.trezor`) koji služi isključivo za gradnju Okruga.
   Biljna Apoteka povećava njega.

**Prozor petak 20:00** se razlikuje od starog `TAKMICENJE_KRAJ_SAT = 18` u
`klan-pravila.js`. Stara vrijednost je namjerno ostavljena — nju koristi ekran
prijava za onaj prvi, nebodovani model takmičenja. Rat ima svoje prozore.
