// Pravila 1v1 duela — čiste funkcije, bez Firestorea i bez vremena "sada".
//
// Isti obrazac kao klan-pravila.js i notif-odluka.js: sve što odlučuje ishod
// meča stoji ovdje i testira se s `npm run test-duel`, bez emulatora.

// Jedan sat za cijeli duel, ne po pitanju: 120 sekundi na 10 pitanja. Igrač sam
// raspoređuje vrijeme — može stati na teškom pitanju ako drugdje nadoknadi.
export const DUEL_QUESTIONS = 10
export const DUEL_TOTAL_SECONDS = 120

// Preostalo vrijeme duela u sekundama (nikad ispod nule).
export function duelPreostalo(startedAt, sada = Date.now()) {
  const proteklo = (sada - (startedAt || sada)) / 1000
  return Math.max(0, Math.round(DUEL_TOTAL_SECONDS - proteklo))
}

// Odredi pobjednika meča.
//
// Redoslijed pravila:
//   1. prazan slot        → protivnik prolazi (bye)
//   2. samo jedan odigrao → walkover
//   3. niko nije odigrao  → žrijeb (nema ničega drugog)
//   4. veći broj tačnih   → pobjeda
//   5. isti broj tačnih   → prolazi onaj ko je duel ZAVRŠIO RANIJE
//
// Peto pravilo je zamijenilo žrijeb: kod žrijeba igrač ne može ništa uraditi da
// poveća svoje šanse, a ovako izlazak na megdan prvog dana runde nosi prednost.
// Žrijeb ostaje samo kao zadnja brana za mečeve odigrane prije ove izmjene,
// gdje vremena završetka nisu ni upisana.
export function resolveMatch(m, zrijeb = () => Math.random() < 0.5) {
  if (m.p1 && !m.p2) return m.p1
  if (m.p2 && !m.p1) return m.p2
  if (!m.p1 && !m.p2) return null
  if (m.p1Played && !m.p2Played) return m.p1
  if (m.p2Played && !m.p1Played) return m.p2
  if (!m.p1Played && !m.p2Played) return zrijeb() ? m.p1 : m.p2
  if ((m.p1Score || 0) > (m.p2Score || 0)) return m.p1
  if ((m.p2Score || 0) > (m.p1Score || 0)) return m.p2
  if (m.p1FinishedAt && m.p2FinishedAt) {
    return m.p1FinishedAt <= m.p2FinishedAt ? m.p1 : m.p2
  }
  if (m.p1FinishedAt) return m.p1
  if (m.p2FinishedAt) return m.p2
  return zrijeb() ? m.p1 : m.p2
}
