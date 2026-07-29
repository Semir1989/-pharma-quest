import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { startQuizSession, submitQuizAnswer, resumeQuizQuestion } from '../services/quizApi'
import { useHint } from '../services/klanRatApi'
import { track } from '../services/analytics'
import { levelFromXp } from '../utils/levels'
import { formatCountdown, nextDailyResetAt } from '../utils/periods'
import { QUIZ_ENERGY_MAX, quizEnergy, rewardCounts } from '../utils/quizEnergy'
import { spendQuizRefill } from '../services/quizApi'
import QuestionScreen from '../components/quiz/QuestionScreen'
import ResultsScreen from '../components/quiz/ResultsScreen'

// Fallback strop XP-a dok server ne odgovori (izvor istine je server:
// DAILY_QUIZ_XP_CAP u functions/index.js). Podignut s 300 na 1000 kad su
// pokušaji postali energija — inače bi regenerisani kvizovi nosili nula XP-a.
const DEFAULT_XP_CAP = 1000

// Kviz (Etapa 6 — server verzija): server bira pitanja, provjerava odgovore
// i dodjeljuje XP. Klijent vodi samo prikaz i prikuplja feedback za pregled.
// Pokušaji rade kao ENERGIJA (Etapa 9): 3 odjednom, po jedan se regeneriše
// svaka 4 sata, novi dan puni na 3. Strop XP-a i dalje drži server.
export default function Kviz() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [phase, setPhase] = useState('intro') // intro | loading | playing | results | limited | error
  const [session, setSession] = useState(null) // { sessionId, total }
  const [question, setQuestion] = useState(null) // trenutno pitanje (bez tačnog odgovora)
  const [answers, setAnswers] = useState([]) // za pregled na rezultatima
  const [summary, setSummary] = useState(null) // { earnedXp, rawXp, capped, correctCount, total }
  const [limit, setLimit] = useState(null) // { used, limit, xpToday, xpCap, resetsAt }
  const [badgeQueue, setBadgeQueue] = useState([]) // novi bedževi za animaciju
  const [hintovi, setHintovi] = useState(0) // 50:50 iz Kliničke Apoteke
  const xpAtStartRef = useRef(0)

  async function startQuiz() {
    setPhase('loading')
    track('quiz_start')
    try {
      const res = await startQuizSession()
      setLimit({
        used: res.used,
        limit: res.limit,
        xpToday: res.xpToday,
        xpCap: res.xpCap,
        resetsAt: res.resetsAt,
      })
      if (res.limited) {
        track('quiz_limit_reached', { used: res.used })
        setPhase('limited')
        return
      }
      setSession({ sessionId: res.sessionId, total: res.total })
      setQuestion(res.question)
      setHintovi(res.hintovi || 0)
      setAnswers([])
      setSummary(null)
      setBadgeQueue([])
      xpAtStartRef.current = profile.xp || 0
      setPhase('playing')
    } catch {
      setPhase('error')
    }
  }

  // Šalje odgovor serveru; bilježi rezultat za pregled na kraju.
  async function handleSubmit(selected) {
    const res = await submitQuizAnswer(session.sessionId, selected)
    setAnswers((prev) => [
      ...prev,
      {
        question: {
          ...question,
          correctIndex: res.correctIndex,
          explanation: res.explanation,
        },
        selected,
        correct: res.correct,
      },
    ])
    if (res.finished) {
      setSummary(res.summary)
      setLimit({
        used: res.quizzesToday,
        limit: res.quizLimit,
        xpToday: res.xpToday,
        xpCap: res.xpCap,
        resetsAt: res.resetsAt,
      })
      track('quiz_complete', { score: res.summary.correctCount, total: res.summary.total, xp: res.summary.earnedXp })
      // Level-up se NE prikazuje ovdje: od Etape 9 svaki pređeni level ostavlja
      // kovčeg u XP baru na početnoj, a animacija ide samo na njegovo otvaranje.
      // Tako nagrada ima jedno mjesto i ne proleti usput iza rezultata kviza.
      const oldLevel = levelFromXp(xpAtStartRef.current)
      const newLevel = res.newLevel ?? levelFromXp(xpAtStartRef.current + res.summary.earnedXp)
      if (newLevel > oldLevel) track('level_up', { level: newLevel })
      // Novododijeljeni bedževi — animacija poslije level-upa (Etapa 8).
      if (res.newBadges?.length) setBadgeQueue(res.newBadges)
    }
    return res
  }

  function handleNext(feedback) {
    if (feedback.finished) {
      setPhase('results')
    } else {
      setQuestion(feedback.question)
    }
  }

  // Nastavak poslije pauze (zaključan ekran, poziv, druga aplikacija). Server
  // pomjeri rok pitanja da tačan odgovor ne bude poništen kao zakašnjeli;
  // pokušaj se ne troši i nijedan odgovor se ne gubi.
  async function handleResume() {
    const res = await resumeQuizQuestion(session.sessionId)
    track('quiz_resume', { index: res.question?.index })
    return res
  }

  if (phase === 'playing' && question) {
    return (
      <QuestionScreen
        key={question.index} // resetuje tajmer i izbor za svako pitanje
        question={question}
        total={session.total}
        onSubmit={handleSubmit}
        onNext={handleNext}
        onResume={handleResume}
        hintovi={hintovi}
        onHint={async () => {
          const r = await useHint({ sessionId: session.sessionId })
          if (!r.ponovljen) setHintovi(r.ostalo ?? 0)
          track('hint_50_50', { ostalo: r.ostalo })
          return r
        }}
      />
    )
  }

  if (phase === 'results') {
    return (
      <ResultsScreen
        answers={answers}
        earnedXp={summary?.earnedXp || 0}
        capped={summary?.capped ? { rawXp: summary.rawXp, cap: limit?.xpCap } : null}
        quizzesToday={limit ? `${limit.used}/${limit.limit}` : null}
        badge={badgeQueue[0] || null}
        onBadgeSeen={() => setBadgeQueue((q) => q.slice(1))}
        onContinue={() => navigate('/')}
      />
    )
  }

  // Energija se računa iz profila (server je upisuje) — brojač je tačan i
  // prije nego se kviz uopšte pokuša pokrenuti.
  const { energy, regenAt } = quizEnergy(profile)
  const { quizRefill } = rewardCounts(profile)
  const xpToday = limit?.xpToday ?? profile?.quizLimit?.xp ?? 0
  const xpCap = limit?.xpCap ?? DEFAULT_XP_CAP
  const exhausted = phase === 'limited' || energy <= 0

  if (exhausted) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center p-6 text-center">
        <span className="text-6xl">⏳</span>
        <h1 className="mt-4 font-title text-3xl font-extrabold text-slate-900">
          Nemaš pokušaja
        </h1>
        <p className="mt-2 text-slate-500">
          Danas si osvojio/la <b className="text-amber-600">{xpToday} XP</b> od{' '}
          {xpCap} mogućih.
          <br />
          Sljedeći pokušaj se regeneriše za:
        </p>
        <span className="mt-4 rounded-2xl bg-white px-6 py-3 font-mono text-2xl font-bold text-teal-800 shadow-sm">
          <RegenCountdown regenAt={regenAt} resetsAt={limit?.resetsAt} />
        </span>

        {quizRefill > 0 && (
          <RefillButton count={quizRefill} onDone={() => setPhase('intro')} />
        )}

        <p className="mt-4 max-w-xs text-sm text-slate-500">
          Jedan pokušaj se vraća svaka 4 sata, a u ponoć ih opet imaš{' '}
          {QUIZ_ENERGY_MAX}. Preživljavanje i turnir se ne broje ovdje.
        </p>
        <button
          onClick={() => navigate('/questovi')}
          className="mt-6 w-full max-w-xs rounded-2xl bg-teal-700 py-4 font-title text-lg font-extrabold text-white shadow-md active:bg-teal-800"
        >
          Pogledaj questove →
        </button>
      </div>
    )
  }

  // Intro / loading / error
  return (
    <div className="flex min-h-svh flex-col items-center justify-center p-6 text-center">
      <span className="text-6xl">🧪</span>
      <h1 className="mt-4 font-title text-3xl font-extrabold text-slate-900">Kviz</h1>

      <span className="mt-3 rounded-xl border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-bold text-teal-800">
        Pokušaji: {energy}/{QUIZ_ENERGY_MAX} · {xpToday}/{xpCap} XP danas
      </span>

      {phase === 'error' ? (
        <p className="mt-2 text-slate-500">
          Ne mogu pokrenuti kviz. Provjeri internet konekciju pa pokušaj ponovo.
        </p>
      ) : (
        <p className="mt-2 text-slate-500">
          10 nasumičnih pitanja · 30 sekundi po pitanju.
          <br />
          Ako te neko prekine, kviz se pauzira i čeka te.
          <br />
          Jedan pokušaj se vraća svaka 4 sata · najviše {xpCap} XP dnevno.
        </p>
      )}

      <button
        onClick={startQuiz}
        disabled={phase === 'loading'}
        className="mt-8 w-full max-w-xs rounded-2xl bg-teal-700 py-4 font-title text-lg font-extrabold text-white shadow-md active:bg-teal-800 disabled:opacity-60"
      >
        {phase === 'loading' ? 'Pokrećem kviz…' : phase === 'error' ? 'Pokušaj ponovo' : 'Započni kviz ▶'}
      </button>
    </div>
  )
}

// Odbrojavanje do sljedećeg pokušaja. Cilj je regeneracija (svaka 4 sata), a
// ako je nema — ponoć po BiH vremenu, kad se spremnik ionako puni na pun.
function RegenCountdown({ regenAt, resetsAt }) {
  const target = regenAt || resetsAt || nextDailyResetAt()
  const [left, setLeft] = useState(() => Math.max(0, Math.floor((target - Date.now()) / 1000)))

  useEffect(() => {
    const t = setInterval(
      () => setLeft(Math.max(0, Math.floor((target - Date.now()) / 1000))),
      1000
    )
    return () => clearInterval(t)
  }, [target])

  return formatCountdown(left)
}

// Trošenje žetona iz kovčega na ekranu kviza — igrač ne mora nazad na početnu.
function RefillButton({ count, onDone }) {
  const [trosi, setTrosi] = useState(false)
  const [greska, setGreska] = useState('')

  async function potrosi() {
    if (trosi) return
    setTrosi(true)
    setGreska('')
    try {
      await spendQuizRefill()
      track('quiz_refill_use')
      // Profil je live-pretplaćen; energija stiže sama, pa se ekran otključa.
      onDone()
    } catch (e) {
      setGreska(e?.message || 'Nije uspjelo, pokušaj ponovo.')
      setTrosi(false)
    }
  }

  return (
    <>
      <button
        onClick={potrosi}
        disabled={trosi}
        className="mt-4 w-full max-w-xs rounded-2xl bg-amber-500 py-3.5 font-title font-extrabold text-white shadow active:bg-amber-600 disabled:opacity-60"
      >
        {trosi ? 'Trošim…' : `🎟️ Iskoristi žeton (+1 pokušaj) · imaš ${count}`}
      </button>
      {greska && <p className="mt-2 text-sm font-medium text-red-600">{greska}</p>}
    </>
  )
}
