// Definicije questova — ČISTI PODACI, bez Firebasea.
//
// Izdvojeno iz postavi-taskove.js 31.07.2026. da `npm run test-questovi` može
// provjeriti STVARNI bazen (ne izmišljene fixture) bez servisnog ključa.
// Upisuje ih u Firestore `npm run postavi-taskove`.
//
// metric:
//   'quizzes'         odigrani kvizovi          'days'            dani s odigranim kvizom
//   'correct'         tačni odgovori u kvizu    'perfect'         kvizovi bez greške
//   'xp'              XP iz kvizova (max 300/dan)
//   'survivalCorrect' tačni u Preživljavanju    'survivalBest'    najduži niz u periodu
//   'duels'           odigrani duel mečevi      'tournamentXp'    XP tokom prozora turnira
//   'manual'          VANJSKI zadatak — igrica ga ne mjeri, napredak upisuje
//                     admin (panel → Vanjski zadaci → adminSetQuestProgress)
// category (opciono, uz 'correct'): broji samo tačne odgovore iz te kategorije
// event (opciono): 'survival' | 'tournament' — zadatak ulazi u ponudu SAMO dok
//   je event aktivan za tog igrača (ispao iz Preživljavanja = nema ga više).
// always (opciono): zadatak je UVIJEK u izboru, ne rotira se i ne može se
//   zamijeniti žetonom. Svaki `always` troši jedno mjesto od TASK_COUNT.
// tokens (opciono): { quizRefill, survivalRevive, streakFreeze, questReroll… }
//   — žetoni uz XP, sliježu u users.rewards.*
// clanGold (opciono): zeleni bodovi za gradnju Zelenog Okruga (users.clanGold)
//
// BALANS (dnevni strop: 3 kviza = max 30 pitanja = max 300 XP)
//  - Dnevni: svaki igrač dobija 5 na dan (deterministički po uid+datumu). Kad je
//    neki event živ, tačno 1 od tih 5 je event zadatak. Ciljevi su dostižni
//    unutar 3 kviza (osim vanjskog EPC zadatka, koji se ne igra u aplikaciji).
//  - Sedmični: 6 po igraču, od toga 2 stalna EPC zadatka. Ciljevi iz kvizova su
//    NAMJERNO iznad maksimuma za 3 dana (9 kvizova / 27 tačnih / 900 XP), pa se
//    najranije mogu završiti ČETVRTI dan.
//  - Mjesečni: 7 po igraču, od toga 1 stalni EPC zadatak. Ciljevi su iznad
//    maksimuma za 14 dana (42 kviza / 420 tačnih / 4200 XP) → najmanje 15 dana.
//
// KOLIKO KANDIDATA BAZEN MORA IMATI (TASK_COUNT = 5 / 6 / 7):
//   dnevni   5 = 1 event + 4 obična     → treba ≥ 4 rotirajuća
//   sedmični 6 = 2 always + 1 event + 3 → treba ≥ 4 rotirajuća (sedmica bez
//                                          eventa traži jedan više)
//   mjesečni 7 = 1 always + 1 event + 5 → treba ≥ 6 rotirajućih
// Ako bazen padne ispod toga, igrač tiho dobije MANJE zadataka nego što broj
// obećava. `npm run test-questovi` baš to provjerava — pokrenuti poslije svake
// izmjene ove liste.

export const TASKS = [
  // ---- Dnevni bazen: osnovni (uvijek u igri) ----
  { id: 'daily-kviz-1', type: 'daily', title: 'Odigraj 1 kviz', shortTitle: '1 kviz', metric: 'quizzes', goal: 1, reward: 20, order: 1 },
  { id: 'daily-kviz-3', type: 'daily', title: 'Odigraj sva 3 dnevna kviza', shortTitle: '3 kviza', metric: 'quizzes', goal: 3, reward: 60, order: 2 },
  { id: 'daily-tacnih-12', type: 'daily', title: 'Odgovori tačno na 12 pitanja', shortTitle: '12 tačnih', metric: 'correct', goal: 12, reward: 30, order: 3 },
  { id: 'daily-tacnih-20', type: 'daily', title: 'Odgovori tačno na 20 pitanja', shortTitle: '20 tačnih', metric: 'correct', goal: 20, reward: 45, order: 4 },
  { id: 'daily-xp-150', type: 'daily', title: 'Osvoji 150 XP', shortTitle: '150 XP', metric: 'xp', goal: 150, reward: 30, order: 5 },
  { id: 'daily-xp-250', type: 'daily', title: 'Osvoji 250 XP', shortTitle: '250 XP', metric: 'xp', goal: 250, reward: 55, order: 6 },
  { id: 'daily-savrsen', type: 'daily', title: 'Odigraj kviz bez ijedne greške', shortTitle: 'Bez greške', metric: 'perfect', goal: 1, reward: 70, order: 7 },
  { id: 'daily-interakcije-3', type: 'daily', title: 'Odgovori tačno na 3 pitanja iz interakcija', shortTitle: '3 interakcije', metric: 'correct', category: 'interakcije', goal: 3, reward: 35, order: 8 },

  // Vanjski zadatak na EPC platformi — rotira se kao i ostali dnevni (nije
  // `always`). Nagrada je veća od kviz-zadataka jer traži rad izvan igrice;
  // 100 XP ≈ trećina dnevnog stropa iz kvizova.
  { id: 'daily-epc-razgovor', type: 'daily', title: 'Započni razgovor na EPC platformi sa članom iz druge države', shortTitle: 'EPC razgovor', metric: 'manual', goal: 1, reward: 100, tokens: { quizRefill: 1 }, order: 9 },

  // ---- Dnevni bazen: event zadaci (samo dok je event živ za igrača) ----
  { id: 'daily-survival-3', type: 'daily', event: 'survival', title: 'Preživljavanje: 3 tačna odgovora danas', shortTitle: '3 u nizu', metric: 'survivalCorrect', goal: 3, reward: 40, order: 10 },
  { id: 'daily-survival-6', type: 'daily', event: 'survival', title: 'Preživljavanje: 6 tačnih odgovora danas', shortTitle: '6 u nizu', metric: 'survivalCorrect', goal: 6, reward: 70, order: 11 },
  { id: 'daily-duel', type: 'daily', event: 'tournament', title: 'Odigraj svoj duel meč', shortTitle: 'Duel', metric: 'duels', goal: 1, reward: 60, order: 12 },
  { id: 'daily-turnir-xp-150', type: 'daily', event: 'tournament', title: 'Osvoji 150 XP tokom turnira', shortTitle: 'Turnir 150 XP', metric: 'tournamentXp', goal: 150, reward: 50, order: 13 },

  // ---- Sedmični: STALNI vanjski zadaci (EPC platforma, `always`) ----
  // Uvijek u izboru svakom igraču, ne mogu se zamijeniti žetonom. Napredak
  // upisuje admin iz panela; nagradu igrač preuzima sam.
  { id: 'weekly-epc-komentari-10', type: 'weekly', title: 'Napiši 10 komentara na EPC platformi', shortTitle: '10 komentara', metric: 'manual', goal: 10, reward: 300, tokens: { quizRefill: 3 }, clanGold: 5, always: true, order: 0 },
  { id: 'weekly-epc-lajkovi-30', type: 'weekly', title: 'Osvoji 30 lajkova na EPC platformi', shortTitle: '30 lajkova', metric: 'manual', goal: 30, reward: 500, tokens: { quizRefill: 4 }, clanGold: 10, always: true, order: 0.5 },

  // ---- Sedmični (rotirajući; najranije završiv 4. dan) ----
  { id: 'weekly-dana-4', type: 'weekly', title: 'Igraj kvizove 4 dana u sedmici', metric: 'days', goal: 4, reward: 150, order: 1 },
  { id: 'weekly-kvizovi-10', type: 'weekly', title: 'Odigraj 10 kvizova', metric: 'quizzes', goal: 10, reward: 130, order: 2 },
  { id: 'weekly-tacnih-100', type: 'weekly', title: 'Odgovori tačno na 100 pitanja', metric: 'correct', goal: 100, reward: 120, order: 3 },
  { id: 'weekly-xp-1000', type: 'weekly', title: 'Osvoji 1000 XP u kvizovima', metric: 'xp', goal: 1000, reward: 130, order: 4 },
  { id: 'weekly-interakcije-10', type: 'weekly', title: 'Odgovori tačno na 10 pitanja iz interakcija', metric: 'correct', category: 'interakcije', goal: 10, reward: 80, order: 5 },
  { id: 'weekly-survival-15', type: 'weekly', event: 'survival', title: 'Preživljavanje: 15 tačnih odgovora', metric: 'survivalCorrect', goal: 15, reward: 150, order: 6 },
  { id: 'weekly-survival-niz-10', type: 'weekly', event: 'survival', title: 'Preživljavanje: dostigni niz od 10', metric: 'survivalBest', goal: 10, reward: 120, order: 7 },

  // ---- Mjesečni: STALNI vanjski zadatak (EPC platforma, `always`) ----
  // Najveća nagrada u igri. Uz XP nosi 5 žetona za kviz, 15 zelenih bodova i
  // žeton za oživljavanje u Preživljavanju — realna vrijednost je oko 2000 XP.
  { id: 'monthly-epc-post-1', type: 'monthly', title: 'Napiši 1 post na EPC platformi', shortTitle: '1 post', metric: 'manual', goal: 1, reward: 750, tokens: { quizRefill: 5, survivalRevive: 1 }, clanGold: 15, always: true, order: 0 },

  // ---- Mjesečni (rotirajući; traže najmanje 15 dana igranja) ----
  { id: 'monthly-dana-15', type: 'monthly', title: 'Igraj kvizove 15 dana u mjesecu', metric: 'days', goal: 15, reward: 500, order: 1 },
  { id: 'monthly-kvizovi-45', type: 'monthly', title: 'Odigraj 45 kvizova', metric: 'quizzes', goal: 45, reward: 400, order: 2 },
  { id: 'monthly-tacnih-430', type: 'monthly', title: 'Odgovori tačno na 430 pitanja', metric: 'correct', goal: 430, reward: 350, order: 3 },
  { id: 'monthly-xp-4300', type: 'monthly', title: 'Osvoji 4300 XP u kvizovima', metric: 'xp', goal: 4300, reward: 350, order: 4 },
  { id: 'monthly-savrsenih-10', type: 'monthly', title: 'Odigraj 10 kvizova bez greške', metric: 'perfect', goal: 10, reward: 300, order: 5 },
  // Dva nova (31.07.2026.): bez njih bazen ima 5 rotirajućih, a mjesečnih se
  // sada dodjeljuje 7 (1 stalni + 1 event + 5) — igrač bi u sedmici bez
  // otvorenog Preživljavanja dobio 6 umjesto 7.
  { id: 'monthly-interakcije-40', type: 'monthly', title: 'Odgovori tačno na 40 pitanja iz interakcija', metric: 'correct', category: 'interakcije', goal: 40, reward: 320, order: 6 },
  { id: 'monthly-dana-22', type: 'monthly', title: 'Igraj kvizove 22 dana u mjesecu', metric: 'days', goal: 22, reward: 650, order: 7 },
  { id: 'monthly-survival-40', type: 'monthly', event: 'survival', title: 'Preživljavanje: 40 tačnih odgovora', metric: 'survivalCorrect', goal: 40, reward: 400, order: 8 },
]

// Stari taskovi (prije dnevnog limita) — gase se da ne stoje uz nove.
export const DEACTIVATE = [
  'daily-kviz',
  'daily-tacnih-7',
  'daily-xp-80',
  'weekly-kvizovi-5',
  'weekly-tacnih-30',
  'monthly-kvizovi-20',
  'monthly-tacnih-120',
  'monthly-xp-1500',
]
