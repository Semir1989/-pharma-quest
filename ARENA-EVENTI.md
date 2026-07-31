# Arena: 1v1 turnir i XP trka

Stanje: 31.07.2026.

Do ovog koraka su 1v1 dueli i XP trka bili **jedan** event: dijelili su
`config/tournament`, jedan prozor i jednu stranicu (`/turnir`). Klik na karticu
XP trke vodio je na duel bracket, a ljestvica trke je stajala ispod stabla
turnira. Sada su to dva odvojena eventa.

## Šta je gdje

| | 1v1 Arena | XP trka |
|---|---|---|
| Config | `config/tournament` | `config/xpRace` |
| Stranica | `/turnir` | `/xp-trka` |
| Podaci | `tournaments/{key}` (bracket, prijave, mečevi) | RTDB `tournament/{key}` + `xpRaces/{key}` |
| Servis | `src/services/tournament.js` | `src/services/xpTrka.js` |
| Prijava | da, unaprijed | ne, XP se sam sabira |

**Prelazni period:** dok `config/xpRace` ne postoji, i server i klijent za trku
padaju nazad na prozor turnira. Zatečeni event zato radi bez prekida. Prvi upis
iz admin panela („Spremi prozor XP trke") ih trajno razdvaja — do tada panel
piše *„dijeli prozor s turnirom"*.

RTDB putanja ljestvice je namjerno ostala `tournament/{key}` iako je event
preimenovan: pod njom stoje rezultati tekućeg eventa i pravila
(`database.rules.json`), a preseljenje bi ih bacilo.

## Raspored rundi

`functions/turnir-raspored.js` — čiste funkcije, test `npm run test-raspored`.

Prije: prozor eventa se dijelio na jednake dijelove. Petak 18:00 → nedjelja
18:00 kroz pet rundi davalo je rokove u **03:36** i **08:24** ujutru, pa su
runde prolazile na walkover dok igrači spavaju.

Sada rokovi padaju samo u termine **08:00 / 14:00 / 20:00 po BiH vremenu**:

- prva runda se zatvara u **08:00 narednog dana** od početka eventa;
- svaka sljedeća ide na prvi naredni termin (14:00, 20:00, pa sutra 08:00 …);
- turnir s puno rundi se time sam razvuče kroz sedmicu, bez noćnih rokova.

Za event od petka 18:00: sub 08:00 → sub 14:00 → sub 20:00 → ned 08:00 →
ned 14:00.

## Bracket

Prije se popunjavalo redom, pa je 20 prijavljenih u mreži od 32 davalo 10 punih
i **6 potpuno praznih** mečeva; praznina se penjala kroz stablo (ukupno 10
mrtvih ćelija) i gurala stvarne mečeve van ekrana.

Sada `paroviPrveRunde()` višak mjesta pretvara u **bye**: 20 igrača → 4 puna
meča + 12 igrača koji čekaju drugu rundu, ravnomjerno raspoređeno kroz kolonu.
Nijedan meč nije prazan.

`Bracket.jsx` uz to preskače meč bez ijednog imena (druga brana), označava bye,
prikazuje avatare i rok runde, ističe moj meč i sam skroluje na tekuću rundu.

## Popravka zatečenog bracketa

Bracket napravljen po starom pravilu se ne mora rušiti — čisti se:

```
npm run popravi-turnir            # samo prikaže šta bi uradio
npm run popravi-turnir -- --pisi  # upiše
```

Briše mrtve grane i postavlja rokove na BiH termine. **Skorovi, prijave i
odigrani mečevi se ne diraju**, a rokovi već zatvorenih rundi ostaju kakvi jesu.
Isto rade i dugmad u panelu (`adminPruneEmptyMatches`, `adminSetRoundDeadlines`)
kad su funkcije deployane.

Urađeno nad eventom `2026-07-31`: obrisano 10 praznih mečeva (31 → 21), rokovi
pomjereni s 03:36/13:12/22:48/08:24/18:00 na 08:00/14:00/20:00/08:00/14:00.

## Admin panel

`EventKontrola.jsx` drži **prozore** (turnir, XP trka, Preživljavanje) i
otkazivanje. `TurnirKontrola.jsx` drži sve **nad tekućim turnirom**:

- **rezultati po meču** — ko je odigrao i s koliko tačnih, čim preda; panel se
  sam osvježava svakih 20 s (igračima skor ostaje skriven do zatvaranja runde);
- **raspored rundi** — ručno ili „Predloži po BiH terminima";
- **ručni pobjednik meča** — za žalbu ili pokvareno pitanje;
- **poništi duel igraču** — briše sesiju i njegov skor u otvorenom meču;
- **zatvori zaglavljene** — duel kojem je vrijeme isteklo, a igrač se nije vratio
  na ekran, upisuje se s onim što je stigao odgovoriti (inače prolazi kao da
  nije igrao);
- **očisti prazne mečeve**;
- **podsjeti neodigrale** — push samo onima kojima meč ističe u tekućoj rundi;
- **dijagnostika** — popis onoga što je već zapelo (prazne grane, rok koji je
  prošao a runda stoji, nerastući rokovi, mečevi bez punih 10 pitanja,
  zaglavljene sesije).

## Vrijeme u duelu

2 minute vrijede za **svih 10 pitanja**, ne po pitanju (za razliku od kviza,
gdje je 30 s po pitanju). To sada piše ispod tajmera i ispod trake u
`DuelQuestionScreen.jsx` — igrači su se zadržavali na prvom pitanju misleći da
je sat po pitanju.
