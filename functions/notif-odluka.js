// Odlučivanje o push notifikacijama — ČISTE funkcije, bez Firebasea.
//
// Namjerno odvojeno od index.js: pravila o tome kome i kada ide poruka su ono
// što se najlakše pokvari, a ovako se mogu testirati bez emulatora i bez
// slanja ijedne prave notifikacije (vidi scripts/test-notifikacije.mjs).

// Manji broj = viši prioritet. Kad su dva razloga aktivna istovremeno, ide
// samo jedan — onaj koji igraču znači više.
export const NOTIF_PRIORITET = { streak: 1, survival: 2, turnir: 3, energija: 4 }

export const NOTIF_RAZMAK = 20 * 60 * 60 * 1000 // najviše jedna poruka u 20h

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
  if (sat === 14 && tekPocelo(cfg.openAt)) {
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
  if (sat === 19 && !igraoDanas && (profile.streak || 0) >= 2) {
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

  // 4. PODSJETNIK — igrača nema 3+ dana. Namjerno NIJE "energija ti je puna":
  // onome ko igra svaki dan je to šum, a onome koga nema je nebitno.
  // Gornja granica od 14 dana: ko je otišao prije dvije sedmice se ovime ne
  // vraća, a poruka bi mu samo smetala.
  if (sat === 14 && !igraoDanas) {
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

  return kandidati
    .filter((k) => notifUkljucen(profile, k.tip))
    .sort((a, b) => NOTIF_PRIORITET[a.tip] - NOTIF_PRIORITET[b.tip])
}

// Smije li ovaj igrač uopšte dobiti poruku sada (brana od 1 dnevno).
export function smijePrimiti(profile, sada) {
  if (!profile.lastNotifAt) return true
  return sada - profile.lastNotifAt >= NOTIF_RAZMAK
}
