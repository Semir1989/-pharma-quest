// Kategorije pitanja — normalizacija i pronalaženje sličnih.
//
// Kategorija je "slug": mala slova, bez naših dijakritika, riječi spojene
// crticom (npr. 'klinicka-farmacija', 'trudnoca-dojenje'). Bez ovoga bi ista
// kategorija lako živjela u više oblika — 'OTC' i 'otc', 'Klinička farmacija'
// i 'klinicka-farmacija' — pa bi se questovi po kategoriji i statistika
// tačnosti nečujno cijepali na dva brojača.

const DIJAKRITICI = { č: 'c', ć: 'c', ž: 'z', š: 's', đ: 'd' }

// 'Klinička Farmacija ' → 'klinicka-farmacija'
export function normalizeCategory(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[čćžšđ]/g, (ch) => DIJAKRITICI[ch])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Za prikaz u listi: 'trudnoca-dojenje' → 'Trudnoca dojenje'
export function categoryLabel(slug) {
  const s = String(slug || '').replace(/-/g, ' ')
  return s ? s[0].toUpperCase() + s.slice(1) : ''
}

// Udaljenost izmjene (Levenshtein) — koliko je znakova potrebno promijeniti.
function distance(a, b) {
  if (a === b) return 0
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let ugao = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const sljedeci = prev[j]
      prev[j] = Math.min(
        prev[j] + 1, // brisanje
        prev[j - 1] + 1, // umetanje
        ugao + (a[i - 1] === b[j - 1] ? 0 : 1) // zamjena
      )
      ugao = sljedeci
    }
  }
  return prev[b.length]
}

// Postojeće kategorije bliske unosu — hvata i tipfelere ('antibitoici') i
// varijante iste riječi ('antibiotik' / 'antibiotici'). Vraća najbliže prvo.
export function similarCategories(slug, postojece, limit = 3) {
  const s = normalizeCategory(slug)
  if (s.length < 3) return []
  return postojece
    .filter((k) => k !== s)
    .map((k) => ({ k, d: k.includes(s) || s.includes(k) ? 0 : distance(s, k) }))
    .filter(({ k, d }) => d <= Math.max(2, Math.floor(Math.min(s.length, k.length) / 4)))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map(({ k }) => k)
}

// Popis kategorija iz banke pitanja, s brojem pitanja, poredan po abecedi.
export function categoriesFromQuestions(questions) {
  const broj = new Map()
  for (const q of questions || []) {
    const k = normalizeCategory(q.category)
    if (k) broj.set(k, (broj.get(k) || 0) + 1)
  }
  return [...broj.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
