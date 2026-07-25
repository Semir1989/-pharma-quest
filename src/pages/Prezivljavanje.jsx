import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { startSurvival, submitSurvivalAnswer } from '../services/quizApi'
import { subscribeSurvivalLeaderboard, subscribeMyStreak } from '../services/survival'
import {
  secondsUntilSurvivalReset,
  formatCountdown,
  survivalWeekKey,
} from '../utils/periods'
import { track } from '../services/analytics'
import { markSurvivalChestOpened } from '../services/userProfile'
import { levelFromXp, rankFromLevel } from '../utils/levels'
import {
  CHEST_STEP,
  MAX_STEP,
  chestReward,
  openedThisWeek,
  unopenedChests,
} from '../utils/survivalLadder'
import SurvivalQuestion from '../components/SurvivalQuestion'
import LevelUpOverlay from '../components/LevelUpOverlay'
import BadgeUnlockOverlay from '../components/BadgeUnlockOverlay'
import ChestOpenOverlay from '../components/ChestOpenOverlay'
import SurvivalLadder from '../components/SurvivalLadder'
import Avatar from '../components/Avatar'

// Preživljavanje (Etapa 8): endless mod, jedna sedmična "sudbina".
// Za svaki tačan +3 XP. Poslije svakog tačnog odgovora igrač bira: izaći
// (niz se čuva, vraća se kad hoće) ili nastaviti. Izazov prekida SAMO netačan
// odgovor ili istek tajmera — tada je zaključan do srijede.
export default function Prezivljavanje() {
  const { profile, user } = useAuth()
  const navigate = useNavigate()

  // intro | loading | locked | closed | playing | paused | ended | error
  const [phase, setPhase] = useState('intro')
  const [question, setQuestion] = useState(null)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0) // za locked/paused/ended prikaz
  const [exhausted, setExhausted] = useState(false) // banka pitanja iscrpljena
  const [eventWindow, setEventWindow] = useState(null) // { openAt, closeAt } kad je zatvoreno
  const [rows, setRows] = useState([])
  const [levelUp, setLevelUp] = useState(null)
  const [badgeQueue, setBadgeQueue] = useState([])
  const [chest, setChest] = useState(null) // prag čiji se kovčeg upravo otvara
  const [ladderStreak, setLadderStreak] = useState(0) // niz te sedmice (RTDB)
  const xpAtStartRef = useRef(0)
  const badgesRef = useRef([]) // skupljeni novi bedževi tokom run-a
  const bonusRef = useRef(0) // skupljeni level-bonus XP tokom run-a

  // Live leaderboard tekuće sedmice.
  useEffect(() => subscribeSurvivalLeaderboard(setRows), [])

  // Vlastiti niz iz RTDB — ljestvica mora biti tačna i prije ulaska u izazov
  // (server ga upisuje poslije svakog odgovora), ne samo dok traje run.
  useEffect(() => subscribeMyStreak(user?.uid, setLadderStreak), [user?.uid])

  // Ista funkcija pokreće novi run, nastavlja pauzirani i donosi sljedeće
  // pitanje — server pitanje bira tek u ovom trenutku, nikad unaprijed.
  async function begin() {
    // Refove resetujemo SAMO na svjež ulazak. Ista funkcija donosi i sljedeće
    // pitanje usred run-a, pa bi bezuslovni reset pobrisao bedževe i bonus XP
    // skupljene do tada.
    const svjezUlazak = phase === 'intro' || phase === 'error'
    setPhase('loading')
    if (svjezUlazak) {
      badgesRef.current = []
      bonusRef.current = 0
      xpAtStartRef.current = profile?.xp || 0
    }
    try {
      const res = await startSurvival()
      if (res.closed) {
        setEventWindow({ openAt: res.openAt, closeAt: res.closeAt })
        setPhase('closed')
        return
      }
      if (res.locked) {
        setBestStreak(res.streak || 0)
        setExhausted(!!res.exhausted)
        setPhase('locked')
        return
      }
      setStreak(res.streak || 0)
      setQuestion(res.question)
      setPhase('playing')
      track(res.resumed ? 'survival_resume' : 'survival_start', { streak: res.streak || 0 })
    } catch {
      setPhase('error')
    }
  }

  async function handleSubmit(selected) {
    const res = await submitSurvivalAnswer(selected)
    setStreak(res.streak)
    if (res.newBadges?.length) badgesRef.current.push(...res.newBadges)
    if (res.levelBonus?.bonusXp) bonusRef.current += res.levelBonus.bonusXp
    return res
  }

  // Prikaži level-up/bedževe skupljene tokom run-a (na izlasku ili ispadanju).
  function flushOverlays() {
    const oldLevel = levelFromXp(xpAtStartRef.current)
    const newLevel = levelFromXp(profile?.xp || 0)
    if (newLevel > oldLevel) {
      track('level_up', { level: newLevel })
      setLevelUp({
        level: newLevel,
        rank: rankFromLevel(newLevel),
        rankChanged: rankFromLevel(newLevel) !== rankFromLevel(oldLevel),
        bonusXp: bonusRef.current,
      })
    }
    if (badgesRef.current.length) setBadgeQueue(badgesRef.current)
    // Ispražnjeno da se pri sljedećem izlasku iste animacije ne ponove.
    badgesRef.current = []
    bonusRef.current = 0
    xpAtStartRef.current = profile?.xp || 0
  }

  function handleNext(feedback) {
    if (feedback.finished) {
      // Netačan odgovor ili istek → izazov zaključan do srijede.
      setBestStreak(feedback.streak)
      setExhausted(!!feedback.exhausted)
      flushOverlays()
      setPhase('ended')
      return
    }
    // Tačan odgovor → sljedeće pitanje traži server (nije poslano unaprijed).
    setQuestion(null)
    begin()
  }

  // Dobrovoljni izlazak poslije tačnog odgovora — niz i pokušaj ostaju živi.
  function handleExit() {
    setBestStreak(streak)
    track('survival_exit', { streak })
    flushOverlays()
    setPhase('paused')
  }

  // Ljestvica niza (1 → 100). Dok traje run `streak` je svježiji od RTDB-a,
  // pa uzimamo veći od ta dva.
  const week = survivalWeekKey()
  const ladder = Math.max(ladderStreak, streak, bestStreak)
  const opened = openedThisWeek(profile?.survivalChest, week)
  const pendingChests = unopenedChests(ladder, opened)

  // Otvaranje kovčega je samo animacija — XP je server isplatio čim je niz
  // dostigao prag. Oznaku upisujemo odmah (ne po zatvaranju overlaya) da se ne
  // izgubi ako igrač zatvori aplikaciju usred animacije.
  function handleOpenChest(step) {
    setChest(step)
    track('survival_chest_open', { step })
    if (user?.uid) markSurvivalChestOpened(user.uid, week, step).catch(() => {})
  }

  // Animacije imaju prednost nad sadržajem (redoslijed: level → bedž → ekran).
  if (levelUp) {
    return (
      <LevelUpOverlay
        level={levelUp.level}
        rank={levelUp.rank}
        rankChanged={levelUp.rankChanged}
        bonusXp={levelUp.bonusXp}
        onClose={() => setLevelUp(null)}
      />
    )
  }
  if (badgeQueue.length > 0) {
    return (
      <BadgeUnlockOverlay
        badge={badgeQueue[0]}
        onClose={() => setBadgeQueue((q) => q.slice(1))}
      />
    )
  }

  if (chest) {
    const next = chest + CHEST_STEP
    return (
      <ChestOpenOverlay
        step={chest}
        reward={chestReward(chest)}
        nextStep={next <= MAX_STEP ? next : 0}
        nextReward={next <= MAX_STEP ? chestReward(next) : 0}
        onClose={() => setChest(null)}
      />
    )
  }

  if (phase === 'playing' && question) {
    return (
      <SurvivalQuestion
        key={question.id}
        question={question}
        streak={streak}
        onSubmit={handleSubmit}
        onNext={handleNext}
        onExit={handleExit}
      />
    )
  }

  return (
    <div className="p-4">
      <button
        onClick={() => navigate('/')}
        className="mb-3 flex items-center gap-1 text-sm font-bold text-slate-500 active:text-slate-700"
      >
        ← Nazad
      </button>

      {/* Zaglavlje */}
      <div
        className="rounded-3xl p-5 text-white shadow"
        style={{ background: 'linear-gradient(180deg, #0f5750 0%, #0a3b36 100%)' }}
      >
        <h1 className="font-title text-2xl font-extrabold">Preživljavanje</h1>
        <p className="text-sm text-teal-100">Sedmični izazov — koliko daleko možeš stići?</p>

        {phase === 'paused' && (
          <div className="mt-4 rounded-2xl bg-white/10 p-4 text-center">
            <p className="text-sm text-teal-100">Izazov je pauziran — niz ti je sačuvan</p>
            <p className="font-title text-5xl font-extrabold text-amber-300">{bestStreak}</p>
            <p className="mt-1 text-sm text-teal-100">
              +{bestStreak * 3} XP do sada · vrati se kad god hoćeš
            </p>
          </div>
        )}

        {phase === 'ended' && (
          <div className="mt-4 rounded-2xl bg-white/10 p-4 text-center">
            <p className="text-sm text-teal-100">
              {exhausted ? 'Prošao/la si cijelu banku pitanja!' : 'Tvoj niz ove sedmice'}
            </p>
            <p className="font-title text-5xl font-extrabold text-amber-300">{bestStreak}</p>
            <p className="mt-1 text-sm text-teal-100">+{bestStreak * 3} XP osvojeno · vrati se u srijedu</p>
          </div>
        )}

        {phase === 'locked' && (
          <div className="mt-4 rounded-2xl bg-white/10 p-4 text-center">
            <p className="text-sm text-teal-100">
              {exhausted
                ? 'Prošao/la si cijelu banku pitanja!'
                : 'Izazov za ovu sedmicu je završen'}
            </p>
            <p className="font-title text-4xl font-extrabold text-amber-300">Niz: {bestStreak}</p>
            <p className="mt-1 text-sm text-teal-100">
              Novi pokušaj za {formatCountdown(secondsUntilSurvivalReset())}
            </p>
          </div>
        )}

        {phase === 'closed' && (
          <div className="mt-4 rounded-2xl bg-white/10 p-4 text-center">
            <p className="text-sm text-teal-100">
              {eventWindow?.openAt && Date.now() < eventWindow.openAt
                ? 'Izazov još nije počeo'
                : 'Izazov je za ovu sedmicu završen'}
            </p>
            <p className="mt-1 font-title text-lg font-extrabold text-amber-300">
              {formatEventWindow(eventWindow)}
            </p>
            <button
              onClick={begin}
              className="mt-3 rounded-xl bg-white/15 px-4 py-2 text-sm font-bold text-white active:bg-white/25"
            >
              Provjeri ponovo
            </button>
          </div>
        )}
      </div>

      {/* Pravila + dugme (intro/error/pauza) */}
      {(phase === 'intro' || phase === 'loading' || phase === 'error' || phase === 'paused') && (
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
          <ul className="flex flex-col gap-2 pl-5 text-sm text-slate-600 marker:text-teal-600 list-disc">
            <li>Odgovaraj tačno — svaki tačan odgovor je <b>+3 XP</b> i produžava niz.</li>
            <li>
              Poslije svakog tačnog odgovora možeš <b>izaći i vratiti se kasnije</b> — niz ti
              se čuva.
            </li>
            <li>
              Svaki <b>10. tačan zaredom</b> otključava kovčeg: niz 10 je{' '}
              <b>+100 XP</b>, niz 20 <b>+200 XP</b>, niz 30 <b>+300 XP</b>…
            </li>
            <li>Izazov prekida samo netačan odgovor ili istek 20s.</li>
            <li>Sve traje do srijede, kad kreće nova sedmica.</li>
          </ul>
          {phase === 'error' && (
            <p className="mt-3 text-sm font-medium text-red-600">
              Ne mogu pokrenuti izazov. Provjeri konekciju pa pokušaj ponovo.
            </p>
          )}
          <button
            onClick={begin}
            disabled={phase === 'loading'}
            className="mt-4 w-full rounded-2xl bg-teal-700 py-4 font-title text-lg font-extrabold text-white shadow-md active:bg-teal-800 disabled:opacity-60"
          >
            {phase === 'loading'
              ? 'Pokrećem…'
              : phase === 'error'
                ? 'Pokušaj ponovo'
                : phase === 'paused'
                  ? `Nastavi izazov (niz: ${bestStreak})`
                  : 'Uđi u izazov'}
          </button>
        </div>
      )}

      {(phase === 'ended' || phase === 'paused') && (
        <button
          onClick={() => navigate('/')}
          className="mt-4 w-full rounded-2xl border-2 border-teal-700 py-3.5 font-title font-extrabold text-teal-700 active:bg-teal-50"
        >
          Nazad na početnu →
        </button>
      )}

      {/* Ljestvica niza — vidi se u svim fazama osim dok traje pitanje, pa i
          poslije izlaska i poslije ispadanja. */}
      <section className="mt-5">
        {pendingChests > 0 && (
          <div className="mb-2 flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 text-white shadow">
            <span className="text-2xl">🎁</span>
            <p className="flex-1 text-sm font-bold">
              {pendingChests === 1
                ? 'Imaš neotvoren kovčeg na ljestvici!'
                : `Imaš ${pendingChests} neotvorena kovčega na ljestvici!`}
              <span className="block font-normal text-amber-50">
                Pritisni ga da vidiš koliko si bonus XP-a osvojio/la.
              </span>
            </p>
          </div>
        )}
        <SurvivalLadder streak={ladder} opened={opened} onOpenChest={handleOpenChest} />
      </section>

      {/* Leaderboard sedmice */}
      <section className="mt-5">
        <h2 className="mb-2 px-1 font-title text-lg font-extrabold text-slate-900">
          Najduži nizovi ove sedmice
        </h2>
        {rows.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-center text-sm text-slate-400 shadow-sm">
            Još niko nije igrao ove sedmice — budi prvi!
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <div
                key={r.uid}
                className={`flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ${
                  r.uid === user?.uid ? 'ring-2 ring-teal-500' : ''
                }`}
              >
                <span className="w-6 text-center font-bold text-slate-400">{i + 1}</span>
                <Avatar id={r.avatar} size={36} />
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">{r.name}</span>
                <span className="font-title font-extrabold text-teal-700">{r.streak}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// "25.07. 08:00–20:00" — evropski format, 24h, BiH vrijeme (bez oslanjanja na locale).
function formatEventWindow(w) {
  if (!w?.openAt || !w?.closeAt) return ''
  const part = (ms, opts) =>
    Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Sarajevo', ...opts })
        .formatToParts(new Date(ms))
        .map((x) => [x.type, x.value])
    )
  const d = part(w.openAt, { day: '2-digit', month: '2-digit' })
  const t = (ms) => {
    const p = part(ms, { hour: '2-digit', minute: '2-digit', hour12: false })
    return `${p.hour}:${p.minute}`
  }
  return `${d.day}.${d.month}. ${t(w.openAt)}–${t(w.closeAt)}`
}
