// Kozmetika avatara — osvaja se u eventima (Etapa 9).
//
// Svaki event daje SVOJU VRSTU ukrasa, da se na prvi pogled vidi odakle je.
// Ranije su sva tri davala prsten, pa se nisu razlikovala:
//
//   duel     → ring        okvir OKO avatara (metalik sa sjajem)
//   survival → background  POZADINA unutar kruga, ispod emojija
//   xprace   → aura        SJAJ koji izlazi izvan avatara
//
// Tri su nezavisna mjesta: igrač može nositi okvir, pozadinu i auru istovremeno
// (users/{uid}.cosmetics.ring / .background / .aura). Ništa od ovoga ne nosi XP
// niti ijednu prednost u igri — čist status.
//
// `anim` mora biti klasa iz index.css. Po vrsti:
//   ring       → shine | spin
//   background → bg-shift | bg-spin
//   aura       → aura-pulse | aura-spin

export const COSMETIC_KINDS = {
  ring: { label: 'Okviri', short: 'okvir', source: 'duel' },
  background: { label: 'Pozadine', short: 'pozadina', source: 'survival' },
  aura: { label: 'Aure', short: 'aura', source: 'xprace' },
}

export const COSMETIC_SOURCES = {
  survival: { label: 'Preživljavanje', emoji: '💀', kind: 'background' },
  duel: { label: '1v1 Dueli', emoji: '⚔️', kind: 'ring' },
  xprace: { label: 'XP trka', emoji: '🏆', kind: 'aura' },
}

export const COSMETICS = [
  // --- Preživljavanje → POZADINE (ispod emojija, po dostignutom nizu) -------
  { id: 'sv-10', name: 'Prvi korak', kind: 'background', source: 'survival', req: 'Niz 10',
    bg: 'linear-gradient(160deg,#92400e,#d97706)' },
  { id: 'sv-20', name: 'Izdržljiv', kind: 'background', source: 'survival', req: 'Niz 20',
    bg: 'linear-gradient(160deg,#334155,#94a3b8)' },
  { id: 'sv-30', name: 'Uporni', kind: 'background', source: 'survival', req: 'Niz 30',
    bg: 'linear-gradient(160deg,#0f766e,#2dd4bf)' },
  { id: 'sv-40', name: 'Nepokolebljiv', kind: 'background', source: 'survival', req: 'Niz 40',
    bg: 'linear-gradient(160deg,#3730a3,#818cf8)' },
  { id: 'sv-50', name: 'Polovina puta', kind: 'background', source: 'survival', req: 'Niz 50',
    bg: 'linear-gradient(110deg,#475569,#f1f5f9,#64748b)', anim: 'bg-shift' },
  { id: 'sv-60', name: 'Hladnokrvni', kind: 'background', source: 'survival', req: 'Niz 60',
    bg: 'linear-gradient(160deg,#0e7490,#a5f3fc)' },
  { id: 'sv-70', name: 'Neuništiv', kind: 'background', source: 'survival', req: 'Niz 70',
    bg: 'linear-gradient(160deg,#065f46,#34d399)' },
  { id: 'sv-80', name: 'Vatreni', kind: 'background', source: 'survival', req: 'Niz 80',
    bg: 'linear-gradient(110deg,#7f1d1d,#f97316,#b91c1c)', anim: 'bg-shift' },
  { id: 'sv-90', name: 'Legendarni niz', kind: 'background', source: 'survival', req: 'Niz 90',
    bg: 'linear-gradient(110deg,#854d0e,#fde047,#a16207)', anim: 'bg-shift' },
  { id: 'sv-100', name: 'Stotka', kind: 'background', source: 'survival', req: 'Niz 100',
    bg: 'conic-gradient(#ef4444,#f59e0b,#22c55e,#06b6d4,#6366f1,#d946ef,#ef4444)',
    anim: 'bg-spin' },

  // --- Dueli → OKVIRI (metalik sa sjajem koji prelazi) ---------------------
  { id: 'dl-part', name: 'Učesnik turnira', kind: 'ring', source: 'duel', req: 'Odigraj turnir',
    width: 3, ring: 'linear-gradient(135deg,#334155,#94a3b8,#475569)', anim: 'shine' },
  { id: 'dl-win1', name: 'Prva krv', kind: 'ring', source: 'duel', req: '1 pobjeda u duelu',
    width: 3, ring: 'linear-gradient(135deg,#7c2d12,#ea580c,#9a3412)', anim: 'shine' },
  { id: 'dl-win5', name: 'Duelist', kind: 'ring', source: 'duel', req: '5 pobjeda',
    width: 3, ring: 'linear-gradient(135deg,#92400e,#fbbf24,#b45309)', anim: 'shine' },
  { id: 'dl-win10', name: 'Veteran arene', kind: 'ring', source: 'duel', req: '10 pobjeda',
    width: 4, ring: 'linear-gradient(135deg,#475569,#f1f5f9,#64748b)', anim: 'shine' },
  { id: 'dl-win25', name: 'Mačevalac', kind: 'ring', source: 'duel', req: '25 pobjeda',
    width: 4, ring: 'linear-gradient(135deg,#0f172a,#cbd5e1,#334155)', anim: 'shine' },
  { id: 'dl-semi', name: 'Polufinalista', kind: 'ring', source: 'duel', req: 'Uđi u polufinale',
    width: 4, ring: 'linear-gradient(135deg,#1e40af,#93c5fd,#1d4ed8)', anim: 'shine' },
  { id: 'dl-final', name: 'Finalista', kind: 'ring', source: 'duel', req: 'Uđi u finale',
    width: 4, ring: 'linear-gradient(135deg,#5b21b6,#c4b5fd,#6d28d9)', anim: 'shine' },
  { id: 'dl-champ', name: 'Šampion turnira', kind: 'ring', source: 'duel', req: 'Osvoji turnir',
    width: 5, ring: 'linear-gradient(135deg,#a16207,#fef08a,#ca8a04)', anim: 'shine' },
  { id: 'dl-champ3', name: 'Trostruki šampion', kind: 'ring', source: 'duel', req: 'Osvoji 3 turnira',
    width: 5, ring: 'conic-gradient(#ca8a04,#fef9c3,#a16207,#fde047,#ca8a04)', anim: 'spin' },
  { id: 'dl-unbeaten', name: 'Savršen', kind: 'ring', source: 'duel',
    req: 'Osvoji turnir s punim skorom u finalu',
    width: 5, ring: 'linear-gradient(135deg,#020617,#64748b,#0f172a)', anim: 'shine' },

  // --- XP trka → AURE (sjaj koji izlazi izvan avatara) ---------------------
  { id: 'xp-run', name: 'Trkač', kind: 'aura', source: 'xprace', req: 'Učestvuj u trci',
    glow: '45,212,191', spread: 10 },
  { id: 'xp-500', name: 'Zalet', kind: 'aura', source: 'xprace', req: '500 XP u jednoj trci',
    glow: '34,211,238', spread: 12, anim: 'aura-pulse' },
  { id: 'xp-1000', name: 'Ubrzanje', kind: 'aura', source: 'xprace', req: '1000 XP u jednoj trci',
    glow: '96,165,250', spread: 14, anim: 'aura-pulse' },
  { id: 'xp-2000', name: 'Nadzvučni', kind: 'aura', source: 'xprace', req: '2000 XP u jednoj trci',
    glow: '129,140,248', spread: 16, anim: 'aura-pulse' },
  { id: 'xp-3', name: 'Treće mjesto', kind: 'aura', source: 'xprace', req: '3. mjesto u trci',
    glow: '217,119,6', spread: 12, anim: 'aura-pulse' },
  { id: 'xp-2', name: 'Drugo mjesto', kind: 'aura', source: 'xprace', req: '2. mjesto u trci',
    glow: '203,213,225', spread: 14, anim: 'aura-pulse' },
  { id: 'xp-1', name: 'Pobjednik trke', kind: 'aura', source: 'xprace', req: '1. mjesto u trci',
    glow: '250,204,21', spread: 18, anim: 'aura-pulse' },
  { id: 'xp-hat3', name: 'Serija', kind: 'aura', source: 'xprace', req: 'Odigraj tri trke',
    glow: '168,85,247', spread: 14, anim: 'aura-pulse' },
  { id: 'xp-comet', name: 'Kometa', kind: 'aura', source: 'xprace', req: 'Najbolji odmah iza podijuma',
    spread: 16, anim: 'aura-spin',
    sweep: 'conic-gradient(transparent 0deg,transparent 250deg,rgba(34,211,238,0.85) 330deg,#ffffff 360deg)' },
  { id: 'xp-nova', name: 'Nova', kind: 'aura', source: 'xprace', req: 'Pobijedi u trci 3 puta',
    spread: 20, anim: 'aura-spin',
    sweep: 'conic-gradient(rgba(244,63,94,0.8),rgba(251,146,60,0.8),rgba(253,224,71,0.9),#ffffff,rgba(251,146,60,0.8),rgba(244,63,94,0.8))' },
]

const BY_ID = new Map(COSMETICS.map((c) => [c.id, c]))

export function cosmeticById(id) {
  return id ? BY_ID.get(id) || null : null
}

// Grupisano po izvoru (= po vrsti), u redoslijedu kataloga.
export function cosmeticsBySource() {
  return Object.keys(COSMETIC_SOURCES).map((source) => ({
    source,
    ...COSMETIC_SOURCES[source],
    items: COSMETICS.filter((c) => c.source === source),
  }))
}

// Sve tri stvari koje igrač trenutno nosi, provjerene protiv liste osvojenih.
// Filtrira se i pri ČITANJU, da uklanjanje iz kataloga ili s računa nikad ne
// ostavi "duh" ukras na avataru.
export function equippedCosmetics(profile) {
  const owned = profile?.cosmetics?.owned || []
  const uzmi = (kind) => {
    const id = profile?.cosmetics?.[kind]
    if (!id || !owned.includes(id)) return null
    const c = cosmeticById(id)
    return c && c.kind === kind ? c : null
  }
  return { ring: uzmi('ring'), background: uzmi('background'), aura: uzmi('aura') }
}
