# Pharma Quest — vanjski zadaci (EPC platforma, web, newsletter)

Nastavak na `Desktop/EPC igrica/Pharma Quest - Plan vanjskih zadataka.docx` (v1,
30.07.2026). Ovaj fajl prati **stanje izrade** i drži plan za ono što tek dolazi.

Datum: 31.07.2026. · Stanje koda: commit `71535e1`

---

## 0. Šta je URAĐENO i deployano (31.07.2026)

| Šta | Stanje |
|---|---|
| Brojevi questova 5 / 6 / 7 (bilo 3 / 5 / 4) | ✅ živo |
| Popravka brojača na početnoj (brojao cijeli bazen) | ✅ živo |
| Sedmični: 10 komentara — 300 XP, 3 žetona, 5 zelenih | ✅ živo, stalni |
| Sedmični: 30 lajkova — 500 XP, 4 žetona, 10 zelenih | ✅ živo, stalni |
| Mjesečni: 1 post — 750 XP, 5 žetona, 15 zelenih, 1 oživljavanje | ✅ živo, stalni |
| Dnevni: razgovor s članom iz druge države — 100 XP, 1 žeton | ✅ upisan, **kreće 01.08.** |
| Admin sekcija za ručnu potvrdu | ✅ živo |
| Žeton za oživljavanje u Preživljavanju | ✅ živo |
| Mjesečni period produžen do 31.08.2026. | ✅ živo |
| **Posjete stranicama farmaceutupraksi.ba** | ⏳ čeka podatke od tebe |
| **Brevo — provjera newslettera** | ⏳ čeka podatke od tebe |

### Odluke donesene 31.07.2026.

1. **„Bodovi za Klan" = zeleni bodovi** (`users.clanGold`), resurs za gradnju
   Zelenog Okruga. Ne diraju bodovanje klanskog rata.
2. **Ručna potvrda: admin dodjeljuje, bez prijave igrača.** U panelu izabereš
   igrača, upišeš broj (npr. 7/10 komentara) ili klikneš „Ispunjeno".
3. **Mjesečni period traje do kraja 31.08.**, novi kreće 01.09. Nema dana bez
   mjesečnih questova.
4. **Posjete se provjeravaju direktnim pingom s WordPressa**, ne preko GA4.

### Kako radi ručna potvrda

Admin panel → **Vanjski zadaci (EPC)** → izabereš igrača → upišeš broj.

Alat **ne isplaćuje nagradu** — upisuje samo napredak. XP, žetone i zelene bodove
igrač preuzima sam u Questovima, kao i kod svakog drugog questa. Zato nije moguće
slučajno isplatiti dvaput, a animacija nagrade radi normalno.

Nagrada za dnevni razgovor je **moja pretpostavka** (100 XP + 1 žeton) — nisi je
zadao. Reci ako želiš drugi iznos.

### Napomena o ovom periodu

Igrači koji već imaju zamrznut izbor dobili su nove zadatke **odmah**, bez
gubitka napretka — migracijom `npm run dopuni-izbore` (pokrenuta 31.07.2026,
dopunila 28 od 43 igrača; ostali su imali prazan ili istekao izbor, pa im ga
server pravi iz nule po novim pravilima).

Posljedica: sedmičnih ovaj period ima **7 umjesto 6** (zatečenih 5 + 2 obavezna
EPC). Od ponedjeljka 03.08. je normalnih 6. Uklanjanje petog zatečenog questa bi
igraču oduzelo nešto na čemu je već radio, pa je višak namjerno propušten.

**Dnevni EPC razgovor kreće 01.08.** (`odDatuma` u `taskovi-lista.js`) — dnevni
zadatak ubačen usred dana ostavlja igraču par sati do ponoći, a traži rad na
drugoj platformi.

> **Za ubuduće:** kad god se promijeni `TASK_COUNT` ili doda `always` quest,
> poslije `npm run postavi-taskove` mora ići i **`npm run dopuni-izbore --stvarno`**.
> Server dopunjava izbor sam, ali tek kad ga neko pozove — a klijent poziva
> `ensureDailyQuests` samo kad je izbor prazan. Bez skripte zatečeni igrači
> promjenu vide tek na sljedeći period.

---

## 1. Posjete stranicama — šta mi treba od tebe

Stranice koje si naveo:

```
https://farmaceutupraksi.ba
https://farmaceutupraksi.ba/blog-2/
https://farmaceutupraksi.ba/aplikacije-za-farmaceute/
https://farmaceutupraksi.ba/community/
```

### Kako će raditi

```
1. Igrač u Questovima pritisne „Otvori"
   → server izda JEDNOKRATNI nasumični kod i vrati link:
     https://farmaceutupraksi.ba/blog-2/?pq=<kod>

2. Stranica se otvori; snippet na sajtu broji sekunde
   SAMO dok je stranica stvarno vidljiva (Page Visibility API)

3. Na N sekundi snippet šalje POST na Cloud Function s tim kodom

4. Server provjeri kod (jednokratan, veže se za igrača i zadatak)
   → zadatak ispunjen, igrač preuzima nagradu
```

**U link NE ide uid igrača.** To je lični podatak u URL-u koji završava u tuđim
logovima. Kod je nasumičan, vrijedi jednom i ništa ne otkriva.

### Šta mi konkretno treba

| # | Šta | Zašto | Kako do toga |
|---|---|---|---|
| 1 | **Način da dodam snippet na WordPress** | bez koda na sajtu nema mjerenja | Najlakše: plugin **Code Snippets** (ili **WPCode**). Instaliraj ga pa mi javi — dam ti gotov kod za copy/paste. Alternativa: pristup temi (`functions.php`), ali plugin je sigurniji |
| 2 | **Potvrda da je sajt na HTTPS-u i da znaš gdje je „header/footer" ubacivanje** | snippet mora ići na SVE četiri stranice | Ako koristiš Code Snippets, ja ću napisati uslov po URL-u |
| 3 | **Koliko sekundi vrijedi kao „posjeta"** po stranici | to je jedina prava kočnica protiv klika-i-nazad | Prijedlog: naslovna **30 s**, blog **120 s**, aplikacije **60 s**, community **30 s** |
| 4 | **Nagrada po zadatku** | nisi je zadao | Prijedlog: **60 XP** po stranici (kao u docx-u), bez žetona — lakše je od komentara |
| 5 | **Idu li ove posjete u dnevne ili sedmične questove** | ti si rekao dnevne; docx savjetuje da vanjski zadaci NISU dnevni | Vidi upozorenje ispod |

### Jedno upozorenje prije nego krenem

U docx-u (§7) stoji pravilo: *„Vanjski zadaci NIKAD nisu dnevni — odobravanje ima
kašnjenje, a dnevni ističe u ponoć."*

To pravilo vrijedi za zadatke koje **ti ručno potvrđuješ**. Posjete stranicama su
**automatske i trenutne**, pa mogu biti dnevne bez problema — igrač klikne,
pročita, zadatak je odmah ispunjen.

Ali **dnevni EPC razgovor** (koji sam danas dodao, jer si ga tražio) jeste ručni.
Ako ga ti ne potvrdiš isti dan do ponoći, igraču propada. Tri opcije:

- ostaviti kako jeste i potvrđivati ga svaki dan (ti odlučuješ)
- prebaciti ga u **sedmične**, gdje imaš 7 dana da potvrdiš
- ostaviti dnevnim ali dati mu **cilj 1 sedmično** kroz sedmični period

Preporučujem **sedmični**. Reci šta hoćeš pa ću promijeniti — to je izmjena od
jednog reda u `scripts/taskovi-lista.js`.

### GA4 — za izvještaj, ne za nagradu

GA4 ostaje koristan da **ti** vidiš koliko prometa igrica donosi sajtu, ali nije
dobar kao uslov za nagradu: podaci kasne satima, imaju kvote, i traže povezivanje
sesije s igračem.

Zato na svaki quest link ide UTM oznaka:

```
?utm_source=pharma-quest&utm_medium=quest&utm_campaign=<id_zadatka>
```

U GA4 na sajtu to vidiš pod **Acquisition → Traffic acquisition**, izvor
`pharma-quest / quest`, a po kampanji razdvajaš koji zadatak koliko donosi.
**Za ovo mi ne treba ništa od tebe** — UTM oznake su dio linka koji igrica šalje.

U samoj igrici dodajem tri GA4 eventa da se vidi cijeli lijevak:

| Event | Kada | Parametri |
|---|---|---|
| `quest_link_open` | igrač pritisne „Otvori" | `task_id` |
| `quest_link_return` | igrač se vrati u igricu | `task_id`, `seconds` |
| `quest_link_verified` | ping sa sajta potvrdi posjetu | `task_id`, `seconds` |

---

## 2. Brevo — šta mi treba od tebe

Cilj: igrica sama provjeri je li email igrača na tvojoj newsletter listi i tek
onda dozvoli nagradu.

| # | Šta | Gdje se nalazi |
|---|---|---|
| 1 | **API ključ (v3)** | Brevo → SMTP & API → API Keys → Generate |
| 2 | **ID newsletter liste** | Brevo → Contacts → Lists, ID stoji uz ime liste |
| 3 | **Potvrda da je double opt-in uključen** | Brevo → forma za prijavu |
| 4 | **Nagrada za pretplatu** | nije zadana; docx predlaže **150 XP**, jednokratno |

**Ključ mi NE šalji u poruci ni u fajlu u repou.** Ide u Firebase Secret Manager:

```
firebase functions:secrets:set BREVO_API_KEY
```

Ta komanda traži da ključ zalijepiš u terminal — pokreni je ti sam kroz `!` u
ovoj sesiji, ili je pokreni u svom terminalu. Ja ga tada nikad ne vidim.

### Kako će raditi

```
GET https://api.brevo.com/v3/contacts/{email}
Header: api-key: <iz Secret Managera>

404  → nije pretplaćen
200  → provjeri: listIds sadrži tvoj ID  I  emailBlacklisted == false
```

Rezultat se kešira 24 sata po igraču (Brevo ima ograničenje broja poziva, a
odgovor se ionako rijetko mijenja).

### Dvije stvari koje se ne smiju preskočiti

1. **Email s profila igrača ≠ email s kojim se prijavio na newsletter.** Ko se
   prijavio drugim emailom, provjera će reći „nije pretplaćen". Zato zadatak
   mora imati i put ka tvojoj ručnoj potvrdi — a to sada već postoji (sekcija
   Vanjski zadaci), pa je dovoljno da zadatak bude i ručno dodjeljiv.
2. **U tekstu zadatka mora jasno pisati da igrica provjerava email igrača na
   listi.** To je obrada ličnog podatka i igrač ima pravo znati.

---

## 3. Redoslijed za vikend

| Faza | Šta | Blokira | Procjena |
|---|---|---|---|
| 1 | Link zadaci + UTM + GA4 eventi (bez pinga — samo mjerenje odsustva iz igrice) | ništa | pola dana |
| 2 | Snippet na farmaceutupraksi.ba + endpoint za ping | tvoj WordPress pristup | pola dana |
| 3 | Brevo provjera newslettera | API ključ + ID liste | pola dana |

Faza 1 se može pustiti odmah i bez ijednog podatka od tebe — mjeri koliko je
igrač bio odsutan iz igrice nakon klika. To je „provjera koja odvraća", ne dokaz.
Faza 2 je zamjenjuje pravim mjerenjem vremena na stranici, a igrač ne primijeti
razliku — mijenja se samo ono što server prihvata kao dokaz.

---

## 4. Otvorena pitanja

1. **Dnevni EPC razgovor** — ostaje dnevni (moraš potvrđivati svaki dan) ili
   prelazi u sedmične? *(preporuka: sedmični)*
2. **Nagrada za dnevni razgovor** — 100 XP + 1 žeton je moja pretpostavka.
3. **Nagrada za posjetu stranici** — 60 XP po stranici?
4. **Koliko sekundi** vrijedi kao posjeta, po stranici?
5. **Nagrada za newsletter** — 150 XP jednokratno?
6. **Zeleni bodovi za posjete i newsletter** — nose li ih uopšte? Trenutno ih
   nose samo tri EPC zadatka koje si zadao.
