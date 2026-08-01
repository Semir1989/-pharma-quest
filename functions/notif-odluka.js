// Odlučivanje o push notifikacijama — ČISTE funkcije, bez Firebasea.
//
// Namjerno odvojeno od index.js: pravila o tome kome i kada ide poruka su ono
// što se najlakše pokvari, a ovako se mogu testirati bez emulatora i bez
// slanja ijedne prave notifikacije (vidi scripts/test-notifikacije.mjs).

import { DUEL_QUESTIONS, KVALIFIKACIJA_PRAG } from './duel-pravila.js'

// Manji broj = viši prioritet. Kad je više razloga aktivno istovremeno, ide
// samo jedan — onaj koji igraču znači više. `dnevni` je namjerno zadnji: to je
// zamjenska poruka koja ide kad nema ničeg konkretnijeg za reći.
export const NOTIF_PRIORITET = {
  streak: 1,
  survival: 2,
  turnir: 3,
  energija: 4,
  dnevni: 5,
}

// Dva termina dnevno (9h i 20h) su 11 sati razmaknuta. Brana od 8h ne dira taj
// raspored, nego sprječava dvije poruke u istom terminu ako tick ikad ponovi
// izvršavanje (Cloud Scheduler garantuje "bar jednom", ne "tačno jednom").
export const NOTIF_RAZMAK = 8 * 60 * 60 * 1000

export function notifUkljucen(profile, tip) {
  return profile?.notifPrefs?.[tip] !== false // podrazumijevano UKLJUČENO
}

// Turnirska poruka za OVAJ tick (ili null). Zavisi samo od configa, ne od
// igrača, pa se računa jednom po ticku.
export function turnirskaPoruka(cfg, sada, sat) {
  if (!cfg || !cfg.enabled) return null
  // Prozor od 6h: tick je u 9 i 14, a prijave/početak ne padaju tačno na sat.
  const tekPocelo = (t) => t && sada >= t && sada < t + 6 * 60 * 60 * 1000

  if (sat === 9 && tekPocelo(cfg.regOpenAt)) {
    return {
      tip: 'turnir',
      title: 'Prijave za duel turnir su otvorene ⚔️',
      body: 'Prijavi se i čekaj protivnika.',
      url: '/turnir',
    }
  }
  if (sat === 20 && tekPocelo(cfg.openAt)) {
    return {
      tip: 'turnir',
      title: 'Duel turnir počinje 🏆',
      body: 'Tvoj meč te čeka.',
      url: '/turnir',
    }
  }
  return null
}

// Sve poruke koje su OVOG trenutka opravdane za ovog igrača, već filtrirane po
// njegovim postavkama i sortirane po prioritetu. Prazna lista = ne šalji ništa.
export function kandidatiZaNotifikaciju(profile, kontekst) {
  const { sat, sada, danas, danUSedmici, turnir } = kontekst
  const kandidati = []
  const igraoDanas = profile.lastPlayDay === danas

  // 1. NIZ U OPASNOSTI — najjača poruka, jer je vezana za nešto što igrač već
  // ima i ne želi izgubiti. Samo uveče i samo ako niz stvarno postoji.
  if (sat === 20 && !igraoDanas && (profile.streak || 0) >= 2) {
    kandidati.push({
      tip: 'streak',
      title: `Niz od ${profile.streak} dana ističe u ponoć 🔥`,
      body: 'Jedan kviz je dovoljan da ga sačuvaš.',
      url: '/kviz',
    })
  }

  // 2. PREŽIVLJAVANJE — sedmični pokušaj se resetuje srijedom.
  if (sat === 9 && danUSedmici === 3) {
    kandidati.push({
      tip: 'survival',
      title: 'Novi pokušaj Preživljavanja 🎯',
      body: 'Sedmica je resetovana — koliko daleko stižeš?',
      url: '/prezivljavanje',
    })
  }

  // 3. TURNIR
  if (turnir) kandidati.push(turnir)

  // 4. POVRATAK — igrača nema 3+ dana. Ide ujutro, jer je to poruka za nekoga
  // ko je ispao iz rutine pa mu treba cijeli dan da se vrati.
  // Gornja granica od 14 dana: ko je otišao prije dvije sedmice se ovime ne
  // vraća, a poruka bi mu samo smetala.
  if (sat === 9 && !igraoDanas) {
    const zadnji = profile.lastPlayDay ? Date.parse(profile.lastPlayDay) : NaN
    const danaBez = Number.isNaN(zadnji) ? null : Math.floor((sada - zadnji) / 86400000)
    if (danaBez !== null && danaBez >= 3 && danaBez <= 14) {
      kandidati.push({
        tip: 'energija',
        title: 'Fališ nam u Pharma Questu 👋',
        body: 'Čekaju te tri kviza i novi questovi.',
        url: '/',
      })
    }
  }

  // 5. DNEVNI KVIZ — zamjenska poruka kad nema ničeg konkretnijeg.
  //
  // Uslov `!igraoDanas` je ono što je čini podnošljivom: ko je već odigrao
  // danas ne dobija ništa. Bez toga bi ovo bilo obavještenje bez informacije,
  // a to je najbrži način da igrač ugasi notifikacije zauvijek.
  //
  // Energija se puni na 3 svaki novi dan (vidi quizEnergyState), pa je jutarnja
  // tvrdnja o punom spremniku tačna. Oba termina (9h i 20h po BiH) padaju u
  // isti UTC dan kao i lokalni, pa se `lastPlayDay` (UTC ključ) i ovdje
  // poklapa s onim što igrač smatra "danas".
  if (!igraoDanas) {
    kandidati.push(
      sat === 9
        ? {
            tip: 'dnevni',
            title: 'Energija je puna ⚡',
            body: 'Tri kviza te čekaju danas.',
            url: '/kviz',
          }
        : {
            tip: 'dnevni',
            title: 'Dnevni kviz te još čeka 📚',
            body: 'Ima vremena do ponoći — deset pitanja, pet minuta.',
            url: '/kviz',
          }
    )
  }

  return kandidati
    .filter((k) => notifUkljucen(profile, k.tip))
    .sort((a, b) => NOTIF_PRIORITET[a.tip] - NOTIF_PRIORITET[b.tip])
}

// Smije li ovaj igrač uopšte dobiti poruku sada (brana od 1 dnevno).
export function smijePrimiti(profile, sada) {
  if (!profile.lastNotifAt) return true
  return sada - profile.lastNotifAt >= NOTIF_RAZMAK
}

// ===========================================================================
// DOGAĐAJNE PORUKE (1v1 arena, klan)
//
// Za razliku od svega iznad, ovo NE ide kroz notifTick i NE pada na branu od
// 8h: poruke su vezane za trenutak koji se ne ponavlja (runda je počela, rok
// ističe, neko je poslao zahtjev za klan) i zakašnjela poruka bi bila
// beskorisna. Zato ih šalje ona funkcija koja događaj i izaziva.
//
// Igračevo gašenje tipa i dalje vrijedi: `turnir` i `klan` su isti prekidači
// koje već ima na Profilu, pa nema novih postavki koje bi trebalo objašnjavati.
// ===========================================================================

// Koliko prije roka runde ide podsjetnik onome ko još nije odigrao.
// tournamentTick ide svakih 30 min, pa prozor od 60 min garantuje bar jedan
// pogodak — a oznaka `podsjetnikRunda` na turniru sprječava drugi.
export const PODSJETNIK_PRIJE_MS = 60 * 60 * 1000

// "petak 08:00" — dan i sat po BiH vremenu. Datum se ne piše: rokovi su uvijek
// unutar par dana, a kraća poruka bolje stane na zaključan ekran.
export function formatRok(ms) {
  if (!ms) return 'uskoro'
  return new Intl.DateTimeFormat('bs-BA', {
    timeZone: 'Europe/Sarajevo',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date(ms))
    .replace(',', '')
}

// Poruka kad runda POČNE. `vrsta` je 'duel' ili 'kvalifikacija' — isti trenutak,
// ali potpuno različit zadatak, pa se i tekst mora razlikovati.
export function porukaNoveRunde({ tid, round, rounds, rok, vrsta = 'duel' }) {
  const ime =
    round === rounds ? 'Finale' : round === rounds - 1 ? 'Polufinale' : `Runda ${round}`
  const kada = formatRok(rok)
  return {
    tip: 'turnir',
    title: vrsta === 'kvalifikacija' ? `${ime} — kvalifikacija ⚔️` : `${ime} je počela ⚔️`,
    body:
      vrsta === 'kvalifikacija'
        ? `Nemaš protivnika: pogodi bar ${KVALIFIKACIJA_PRAG} od ${DUEL_QUESTIONS} do ${kada} da prođeš dalje.`
        : `Protivnik ti je izvučen. Odigraj do ${kada} ili prolazi on.`,
    url: '/turnir',
    // Svoj tag po rundi: podsjetnik koji stiže sat prije roka NE smije obrisati
    // ovu poruku, i obrnuto — to su dva različita poziva na istu akciju.
    tag: `duel-runda-${tid}-r${round}`,
  }
}

// Poruka sat vremena prije roka — samo onome ko još NIJE odigrao.
//
// `hitno` je tačno kad je poruku poslao tick u zadnjem satu. Admin isti tekst
// šalje i ranije (adminPodsjetiNeodigrale), a tvrdnja "ostao ti je sat vremena"
// tada nije istinita — zato naslov ovisi o njoj, a tijelo nosi tačan rok u oba
// slučaja.
export function porukaRokRunde({ tid, round, rok, vrsta = 'duel', hitno = true }) {
  const kada = formatRok(rok)
  const naslov = hitno
    ? '⏳ Ostao ti je sat vremena'
    : vrsta === 'kvalifikacija'
      ? `Kvalifikacija te čeka — runda ${round}`
      : `Tvoj duel čeka — runda ${round}`
  return {
    tip: 'turnir',
    title: naslov,
    body:
      vrsta === 'kvalifikacija'
        ? `Kvalifikacija runde ${round} se zatvara u ${kada}. Ko ne odigra, ispada.`
        : `Runda ${round} se zatvara u ${kada}. Ako ne odigraš, protivnik prolazi bez borbe.`,
    url: '/turnir',
    tag: `duel-rok-${tid}-r${round}`,
  }
}

// Treba li OVOM ticku poslati podsjetnik za rok tekuće runde.
// Vraća broj runde ili null. `t` je dokument turnira.
export function trebaPodsjetnikRunde(t, sada) {
  if (!t || t.status !== 'active') return null
  const round = t.currentRound
  const rok = (t.roundDeadlines || [])[round - 1]
  if (!rok) return null
  // Poslan već jednom za ovu rundu — oznaka je na turniru, ne na igraču, pa
  // ponovljeno izvršavanje ticka ne pravi drugu poruku.
  if (t.podsjetnikRunda === round) return null
  if (sada < rok - PODSJETNIK_PRIJE_MS) return null
  if (sada >= rok) return null // rok je prošao: rundu zatvara tick, podsjetnik nema smisla
  return round
}

// Poruka vodstvu klana kad neko pošalje zahtjev za ulazak.
export function porukaZahtjevaZaKlan({ ime, klan, ukupno = 1 }) {
  return {
    tip: 'klan',
    title: 'Novi zahtjev za klan 📨',
    body:
      ukupno > 1
        ? `${ime} želi u klan ${klan}. Zahtjeva na čekanju: ${ukupno}.`
        : `${ime} želi u klan ${klan}. Odobri ili odbij u sekciji Klan.`,
    url: '/klan',
    // Odvojen tag od ostalih klanskih poruka: zahtjev čeka odluku, pa ga
    // obavijest o novom članu ne smije zbrisati s ekrana.
    tag: 'klan-zahtjev',
  }
}
