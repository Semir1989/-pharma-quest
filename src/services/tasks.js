import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { periodKey } from '../utils/periods'
import { kesirano } from '../utils/kesSadrzaja'
import { claimTaskReward, ensureDailyQuests } from './quizApi'

// Servis za task sistem (Modul 6).
// Definicije taskova žive u Firestore 'tasks' kolekciji (admin skripta),
// a napredak korisnika u users/{uid}.taskProgress po periodu (daily/weekly/monthly).
//
// Dnevni questovi se ROTIRAJU: svaki igrač dobija 3 zadatka iz bazena, izbor je
// determinističan po (uid, dan) i zamrznut na serveru u taskProgress.daily.picked.
// Klijent taj izbor samo čita iz profila — ako ga još nema, traži ga od servera.

// Sve aktivne taskove grupisane po tipu: { daily: [...], weekly: [...], monthly: [...] }
// Keširano po sesiji (taskovi se rijetko mijenjaju) — štedi Firestore reads jer
// Home i Questovi oba traže taskove. Osvježava se pri reloadu aplikacije.
let tasksPromise = null
export function getTasks() {
  if (!tasksPromise) {
    tasksPromise = fetchTasks().catch((e) => {
      tasksPromise = null
      throw e
    })
  }
  return tasksPromise
}

// Keširano u localStorage uz config/content.version — questovi se renderuju
// odmah pri otvaranju aplikacije, bez čekanja mreže (ranije 33 čitanja).
function fetchTasks() {
  return kesirano('tasks', dovuciTaskove)
}

async function dovuciTaskove() {
  const snap = await getDocs(query(collection(db, 'tasks'), where('active', '==', true)))
  const grouped = { daily: [], weekly: [], monthly: [] }
  for (const d of snap.docs) {
    const task = { id: d.id, ...d.data() }
    if (grouped[task.type]) grouped[task.type].push(task)
  }
  for (const list of Object.values(grouped)) list.sort((a, b) => (a.order || 0) - (b.order || 0))
  return grouped
}

const EMPTY = {
  quizzes: 0,
  correct: 0,
  xp: 0,
  days: 0,
  perfect: 0,
  survivalCorrect: 0,
  survivalBest: 0,
  duels: 0,
  tournamentXp: 0,
  byCategory: {},
  claimed: {},
  picked: null,
}

// Napredak za dati tip perioda — ako je period istekao, vraća prazan ("lijeni reset").
export function progressForType(profile, type) {
  const stored = profile?.taskProgress?.[type]
  if (!stored || stored.period !== periodKey(type)) return { ...EMPTY, period: periodKey(type) }
  return { ...EMPTY, ...stored, byCategory: stored.byCategory || {}, claimed: stored.claimed || {} }
}

// Koliko je korisnik napredovao na konkretnom tasku.
export function taskValue(progress, task) {
  if (task.metric === 'correct' && task.category) return progress.byCategory[task.category] || 0
  return progress[task.metric] || 0
}

// Questovi jednog tipa za ovog igrača, iz zamrznutog izbora na serveru.
// Ako izbor još ne postoji (prvi ulazak u periodu), traži ga od Cloud Functiona
// — server tada uzme u obzir koji su eventi za igrača živi. Vraća [] samo kad
// server nije dostupan: radije ništa nego pogrešna lista.
//
// Od 30.07.2026. izbor postoji i za sedmične i mjesečne questove, pa se ista
// funkcija koristi za sva tri tipa. Polja u odgovoru servera: `picked` (dnevni,
// ime zadržano zbog starijih klijenata), `pickedWeekly`, `pickedMonthly`.
const POLJE_IZBORA = { daily: 'picked', weekly: 'pickedWeekly', monthly: 'pickedMonthly' }

export async function tasksFor(all, profile, type) {
  const progress = progressForType(profile, type)
  let picked = progress.picked
  if (!Array.isArray(picked) || picked.length === 0) {
    try {
      picked = (await ensureDailyQuests())[POLJE_IZBORA[type]]
    } catch {
      return []
    }
  }
  const byId = new Map(all.map((t) => [t.id, t]))
  return (picked || [])
    .map((id) => byId.get(id))
    .filter(Boolean)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
}

// Zadržano ime za dnevne — koristi ga i Home ekran.
export async function dailyTasksFor(allDaily, profile) {
  return tasksFor(allDaily, profile, 'daily')
}

// Filtriranje po VEĆ zamrznutom izboru, bez poziva servera. Za mjesta koja ne
// smiju čekati mrežu (brojač na početnoj). Dok izbor ne postoji, vraća sve —
// tako brojač ne pokazuje 0 prije nego se izbor prvi put zamrzne.
export function izabrani(profile, sviTipa, type) {
  const picked = progressForType(profile, type).picked
  if (!Array.isArray(picked) || picked.length === 0) return sviTipa || []
  return (sviTipa || []).filter((t) => picked.includes(t.id))
}

// Ukupan XP koji igrač može odmah preuzeti — zadatak je završen, a nagrada
// nije podignuta. Početna time zna da li da ponudi "Preuzmi" umjesto "Pogledaj".
// Broje se SAMO questovi iz igračevog izbora, za sva tri perioda — ostali za
// njega tog perioda ne postoje.
export function claimableXp(profile, tasks, dailyPicks) {
  if (!profile || !tasks) return 0
  const groups = [
    ['daily', dailyPicks || []],
    ['weekly', izabrani(profile, tasks.weekly, 'weekly')],
    ['monthly', izabrani(profile, tasks.monthly, 'monthly')],
  ]
  let total = 0
  for (const [type, list] of groups) {
    const progress = progressForType(profile, type)
    for (const task of list) {
      if (taskValue(progress, task) >= task.goal && !progress.claimed[task.id]) {
        total += task.reward || 0
      }
    }
  }
  return total
}

// Preuzimanje nagrade (Etapa 6): server provjerava uslov i dodjeljuje XP —
// klijent više ništa ne upisuje sam. Vraća { reward, newBadges } — reward za
// level-up provjeru, newBadges za animaciju otključavanja bedža (Etapa 8).
export async function claimTask(task) {
  const { reward, newLevel, levelBonus, newBadges } = await claimTaskReward(task.id)
  return { reward, newLevel, levelBonus, newBadges: newBadges || [] }
}
