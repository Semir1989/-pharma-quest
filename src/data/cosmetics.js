// Okviri avatara — kozmetika koja se osvaja u eventima (Etapa 9).
//
// Čisto status: okvir ne daje nijedan XP niti ijednu prednost u igri. Igrač ga
// osvaja u eventu, a bira koji nosi. Server upisuje osvojene u
// users/{uid}.cosmetics.owned; klijent bira equipped iz te liste.
//
// Svaki izvor ima svoj vizuelni jezik, da se na prvi pogled vidi ODAKLE je:
//   survival — puni, "kovani" okviri; nagrada za niz u Preživljavanju
//   duel     — metalik sa sjajem koji prelazi preko okvira
//   xprace   — energija: rotirajući i pulsirajući prelivi
//
// `anim` mora biti jedna od klasa definisanih u index.css: spin | pulse | shine.
// `width` je debljina okvira na avataru od 88px — Avatar je skalira po veličini.

export const COSMETIC_SOURCES = {
  survival: { label: 'Preživljavanje', emoji: '💀' },
  duel: { label: '1v1 Dueli', emoji: '⚔️' },
  xprace: { label: 'XP trka', emoji: '🏆' },
}

export const FRAMES = [
  // --- Preživljavanje: nagrada po dostignutom nizu -------------------------
  { id: 'sv-10', name: 'Prvi korak', source: 'survival', req: 'Niz 10', width: 3,
    ring: 'linear-gradient(135deg,#92400e,#d97706)' },
  { id: 'sv-20', name: 'Izdržljiv', source: 'survival', req: 'Niz 20', width: 3,
    ring: 'linear-gradient(135deg,#475569,#94a3b8)' },
  { id: 'sv-30', name: 'Uporni', source: 'survival', req: 'Niz 30', width: 3,
    ring: 'linear-gradient(135deg,#0f766e,#2dd4bf)' },
  { id: 'sv-40', name: 'Nepokolebljiv', source: 'survival', req: 'Niz 40', width: 4,
    ring: 'linear-gradient(135deg,#3730a3,#818cf8)' },
  { id: 'sv-50', name: 'Polovina puta', source: 'survival', req: 'Niz 50', width: 4,
    ring: 'linear-gradient(135deg,#64748b,#e2e8f0,#94a3b8)', anim: 'shine' },
  { id: 'sv-60', name: 'Hladnokrvni', source: 'survival', req: 'Niz 60', width: 4,
    ring: 'linear-gradient(135deg,#0e7490,#a5f3fc)' },
  { id: 'sv-70', name: 'Neuništiv', source: 'survival', req: 'Niz 70', width: 4,
    ring: 'linear-gradient(135deg,#065f46,#34d399)' },
  { id: 'sv-80', name: 'Vatreni', source: 'survival', req: 'Niz 80', width: 5,
    ring: 'linear-gradient(135deg,#b91c1c,#f97316)', anim: 'pulse', glow: '249,115,22' },
  { id: 'sv-90', name: 'Legendarni niz', source: 'survival', req: 'Niz 90', width: 5,
    ring: 'linear-gradient(135deg,#a16207,#fde047)', anim: 'pulse', glow: '250,204,21' },
  { id: 'sv-100', name: 'Stotka', source: 'survival', req: 'Niz 100', width: 5,
    ring: 'conic-gradient(#ef4444,#f59e0b,#22c55e,#06b6d4,#6366f1,#d946ef,#ef4444)',
    anim: 'spin' },

  // --- Dueli: metalik sa sjajem -------------------------------------------
  { id: 'dl-part', name: 'Učesnik turnira', source: 'duel', req: 'Odigraj turnir', width: 3,
    ring: 'linear-gradient(135deg,#334155,#94a3b8,#475569)', anim: 'shine' },
  { id: 'dl-win1', name: 'Prva krv', source: 'duel', req: '1 pobjeda u duelu', width: 3,
    ring: 'linear-gradient(135deg,#7c2d12,#ea580c,#9a3412)', anim: 'shine' },
  { id: 'dl-win5', name: 'Duelist', source: 'duel', req: '5 pobjeda', width: 3,
    ring: 'linear-gradient(135deg,#92400e,#fbbf24,#b45309)', anim: 'shine' },
  { id: 'dl-win10', name: 'Veteran arene', source: 'duel', req: '10 pobjeda', width: 4,
    ring: 'linear-gradient(135deg,#475569,#f1f5f9,#64748b)', anim: 'shine' },
  { id: 'dl-win25', name: 'Mačevalac', source: 'duel', req: '25 pobjeda', width: 4,
    ring: 'linear-gradient(135deg,#0f172a,#cbd5e1,#334155)', anim: 'shine' },
  { id: 'dl-semi', name: 'Polufinalista', source: 'duel', req: 'Uđi u polufinale', width: 4,
    ring: 'linear-gradient(135deg,#1e40af,#93c5fd,#1d4ed8)', anim: 'shine' },
  { id: 'dl-final', name: 'Finalista', source: 'duel', req: 'Uđi u finale', width: 4,
    ring: 'linear-gradient(135deg,#5b21b6,#c4b5fd,#6d28d9)', anim: 'shine' },
  { id: 'dl-champ', name: 'Šampion turnira', source: 'duel', req: 'Osvoji turnir', width: 5,
    ring: 'linear-gradient(135deg,#a16207,#fef08a,#ca8a04)', anim: 'shine' },
  { id: 'dl-champ3', name: 'Trostruki šampion', source: 'duel', req: 'Osvoji 3 turnira', width: 5,
    ring: 'conic-gradient(#ca8a04,#fef9c3,#a16207,#fde047,#ca8a04)', anim: 'spin' },
  { id: 'dl-unbeaten', name: 'Savršen', source: 'duel', req: 'Osvoji turnir s punim skorom u finalu', width: 5,
    ring: 'linear-gradient(135deg,#020617,#64748b,#0f172a)', anim: 'shine' },

  // --- XP trka: energija ---------------------------------------------------
  { id: 'xp-run', name: 'Trkač', source: 'xprace', req: 'Učestvuj u trci', width: 3,
    ring: 'linear-gradient(135deg,#0f766e,#5eead4)' },
  { id: 'xp-500', name: 'Zalet', source: 'xprace', req: '500 XP u jednoj trci', width: 3,
    ring: 'linear-gradient(135deg,#0891b2,#67e8f9)', anim: 'pulse', glow: '34,211,238' },
  { id: 'xp-1000', name: 'Ubrzanje', source: 'xprace', req: '1000 XP u jednoj trci', width: 4,
    ring: 'linear-gradient(135deg,#1d4ed8,#93c5fd)', anim: 'pulse', glow: '96,165,250' },
  { id: 'xp-2000', name: 'Nadzvučni', source: 'xprace', req: '2000 XP u jednoj trci', width: 4,
    ring: 'conic-gradient(#312e81,#6366f1,#a5b4fc,#312e81)', anim: 'spin' },
  { id: 'xp-3', name: 'Treće mjesto', source: 'xprace', req: '3. mjesto u trci', width: 4,
    ring: 'linear-gradient(135deg,#78350f,#f59e0b)', anim: 'pulse', glow: '217,119,6' },
  { id: 'xp-2', name: 'Drugo mjesto', source: 'xprace', req: '2. mjesto u trci', width: 4,
    ring: 'linear-gradient(135deg,#475569,#e2e8f0)', anim: 'pulse', glow: '148,163,184' },
  { id: 'xp-1', name: 'Pobjednik trke', source: 'xprace', req: '1. mjesto u trci', width: 5,
    ring: 'conic-gradient(#a16207,#fde047,#fef9c3,#eab308,#a16207)', anim: 'spin' },
  { id: 'xp-hat3', name: 'Serija', source: 'xprace', req: 'Odigraj tri trke', width: 4,
    ring: 'linear-gradient(135deg,#7e22ce,#e9d5ff)', anim: 'pulse', glow: '168,85,247' },
  { id: 'xp-comet', name: 'Kometa', source: 'xprace', req: 'Najbolji odmah iza podijuma', width: 5,
    ring: 'conic-gradient(transparent,#22d3ee,#a5f3fc,#ffffff,transparent,transparent)',
    anim: 'spin' },
  { id: 'xp-nova', name: 'Nova', source: 'xprace', req: 'Pobijedi u trci 3 puta', width: 5,
    ring: 'conic-gradient(#f43f5e,#fb923c,#fde047,#ffffff,#fb923c,#f43f5e)', anim: 'spin' },
]

const BY_ID = new Map(FRAMES.map((f) => [f.id, f]))

export function frameById(id) {
  return id ? BY_ID.get(id) || null : null
}

// Okviri grupisani po izvoru, u redoslijedu iz kataloga — za prikaz kolekcije.
export function framesBySource() {
  return Object.keys(COSMETIC_SOURCES).map((source) => ({
    source,
    ...COSMETIC_SOURCES[source],
    frames: FRAMES.filter((f) => f.source === source),
  }))
}

// Okvir koji igrač trenutno nosi — samo ako ga stvarno posjeduje.
// Filtrira se i pri čitanju, da skidanje okvira iz kataloga ili s računa nikad
// ne ostavi "duh" okvir na avataru.
export function equippedFrame(profile) {
  const id = profile?.cosmetics?.frame
  if (!id) return null
  const owned = profile?.cosmetics?.owned || []
  return owned.includes(id) ? frameById(id) : null
}
