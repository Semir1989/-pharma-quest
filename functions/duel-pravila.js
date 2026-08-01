// Pravila 1v1 duela — čiste funkcije, bez Firestorea i bez vremena "sada".
//
// Isti obrazac kao klan-pravila.js i notif-odluka.js: sve što odlučuje ishod
// meča stoji ovdje i testira se s `npm run test-duel`, bez emulatora.

// Jedan sat za cijeli duel, ne po pitanju: 120 sekundi na 10 pitanja. Igrač sam
// raspoređuje vrijeme — može stati na teškom pitanju ako drugdje nadoknadi.
export const DUEL_QUESTIONS = 10
export const DUEL_TOTAL_SECONDS = 120

// KVALIFIKACIJA — igrač koji u rundi POSLIJE PRVE ostane bez protivnika.
//
// Ranije je takav prolazio besplatno (bye). Od 01.08.2026. mora odigrati istih
// 10 pitanja i pogoditi bar 6, inače ispada. Razlog je pošten bracket: prolaz
// bez ijednog odgovorenog pitanja u polufinalu vrijedi isto koliko i pobjeda
// nad živim protivnikom, a to nije isti podvig.
//
// U PRVOJ rundi bye ostaje besplatan: tu su byevi posljedica bracketa (20
// prijavljenih u stablu od 32 daje 12 byeva), pa bi prag značio da polovina
// učesnika ispada prvog dana bez ijednog meča.
export const KVALIFIKACIJA_PRAG = 6

// Je li meč kvalifikacija: tako označen i stvarno ima samo jednog igrača.
// Oznaku postavlja server (resolveByes) kad rundu otvori s praznim slotom.
export function jeKvalifikacija(m) {
  if (!m?.kvalifikacija) return false
  return !!(m.p1 || m.p2) && !(m.p1 && m.p2)
}

// Preostalo vrijeme duela u sekundama (nikad ispod nule).
export function duelPreostalo(startedAt, sada = Date.now()) {
  const proteklo = (sada - (startedAt || sada)) / 1000
  return Math.max(0, Math.round(DUEL_TOTAL_SECONDS - proteklo))
}

// Odredi pobjednika meča.
//
// Redoslijed pravila:
//   0. kvalifikacija      → sam prolazi tek s KVALIFIKACIJA_PRAG tačnih
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
//
// Nula je prva namjerno: kvalifikacija IZGLEDA kao bye (prazan slot), pa bi je
// pravilo 1 propustilo besplatno.
export function resolveMatch(m, zrijeb = () => Math.random() < 0.5) {
  if (jeKvalifikacija(m)) return kvalifikacijaProsla(m) ? m.p1 || m.p2 : null
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

// Je li igrač položio kvalifikaciju. Ko nije ni izašao na teren do roka runde
// NIJE položio — prolaz se ovdje zarađuje, ne čeka.
export function kvalifikacijaProsla(m) {
  const naP1 = !!m.p1
  const odigrao = naP1 ? m.p1Played : m.p2Played
  const skor = (naP1 ? m.p1Score : m.p2Score) || 0
  return !!odigrao && skor >= KVALIFIKACIJA_PRAG
}
