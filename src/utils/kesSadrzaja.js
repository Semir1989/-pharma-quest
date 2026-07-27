// Keš statičnog sadržaja u localStorage (P4/P5, 27.07.2026).
//
// Taskovi, bedževi, XP kriva i banka pitanja se mijenjaju rijetko (admin), a
// čitali su se pri SVAKOM otvaranju aplikacije — keš je živio samo u memoriji
// modula, pa ga je brisao svaki reload i svaki restart PWA. To je bilo ~50
// Firestore čitanja po otvaranju.
//
// Sada: sadržaj stoji u localStorage, a svježina se potvrđuje JEDNIM malim
// dokumentom `config/content { version }`. Ako je verzija ista, ne čita se
// ništa više i ekrani se renderuju odmah, bez skeleton stanja.
//
// Verziju diže admin skripta (scripts/oznaci-izmjenu-sadrzaja.js, koju zovu
// postavi-taskove/postavi-bedzeve/postavi-levele). Ako je verzija nepoznata,
// keš se preskače i čita se iz baze — sigurna strana.

import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'

const PREFIKS = 'pq.sadrzaj.'

// Verzija sadržaja — jedan mali dokument, jednom po sesiji.
let verzijaPromise = null
export function verzijaSadrzaja() {
  if (!verzijaPromise) {
    verzijaPromise = getDoc(doc(db, 'config', 'content'))
      .then((s) => (s.exists() ? String(s.data().version ?? '') : ''))
      .catch(() => '') // bez verzije se keš ne koristi, ali aplikacija radi
  }
  return verzijaPromise
}

function procitaj(kljuc, verzija) {
  if (!verzija) return null
  try {
    const sirovo = localStorage.getItem(PREFIKS + kljuc)
    if (!sirovo) return null
    const zapis = JSON.parse(sirovo)
    return zapis.verzija === verzija ? zapis.podaci : null
  } catch {
    return null // pokvaren/nedostupan localStorage — samo se čita iz baze
  }
}

function upisi(kljuc, verzija, podaci) {
  if (!verzija) return
  try {
    localStorage.setItem(PREFIKS + kljuc, JSON.stringify({ verzija, podaci }))
  } catch {
    // Pun localStorage (quota) — keš je optimizacija, ne smije rušiti ekran.
  }
}

// Vrati iz keša ako je svjež, inače dovuci i zapamti.
// `dovuci` se poziva samo kad keša nema ili je zastario.
export async function kesirano(kljuc, dovuci) {
  const verzija = await verzijaSadrzaja()
  const iz = procitaj(kljuc, verzija)
  if (iz !== null) return iz
  const podaci = await dovuci()
  upisi(kljuc, verzija, podaci)
  return podaci
}

// Keš vezan za VLASTITU verziju (banka pitanja ima svoju, bank/index.version),
// a ne za config/content.
export async function kesiranoUzVerziju(kljuc, verzija, dovuci) {
  const iz = procitaj(kljuc, verzija)
  if (iz !== null) return iz
  const podaci = await dovuci()
  upisi(kljuc, verzija, podaci)
  return podaci
}
