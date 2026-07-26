import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getTasks, progressForType, taskValue, claimTask, dailyTasksFor } from '../services/tasks'
import { rerollDailyQuest } from '../services/quizApi'
import { rewardCounts } from '../utils/quizEnergy'
import { levelFromXp } from '../utils/levels'
import { track } from '../services/analytics'
import BadgeUnlockOverlay from '../components/BadgeUnlockOverlay'
import {
  secondsUntilDailyReset,
  formatCountdown,
  daysUntilWeekEnd,
  daysUntilMonthEnd,
} from '../utils/periods'
import CircleProgress from '../components/CircleProgress'

// Questovi ekran (Modul 6): dnevni / sedmični / mjesečni taskovi
// s kružnim progresom i "Preuzmi" dugmetom za nagrade.
// Dnevni se rotiraju — svaki dan tri zadatka iz bazena, a kad je event živ
// jedan od njih je vezan za taj event (izbor pravi i zamrzne server).
export default function Questovi() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState(null) // { daily, weekly, monthly }
  const [dailyPicks, setDailyPicks] = useState(null) // 3 današnja dnevna questa
  const [claiming, setClaiming] = useState(null) // id taska čija se nagrada upisuje
  const [badgeQueue, setBadgeQueue] = useState([]) // novi bedževi za animaciju
  const [rerolling, setRerolling] = useState(null) // id questa koji se mijenja

  useEffect(() => {
    getTasks().then(setTasks).catch(() => setTasks({ daily: [], weekly: [], monthly: [] }))
  }, [])

  // Današnji izbor: iz profila ako postoji, inače ga server napravi i zamrzne.
  const pickedKey = (profile?.taskProgress?.daily?.picked || []).join(',')
  useEffect(() => {
    if (!tasks || !profile) return
    let alive = true
    dailyTasksFor(tasks.daily, profile).then((list) => alive && setDailyPicks(list))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, pickedKey])

  if (!profile) return null

  async function handleClaim(task) {
    if (claiming) return
    setClaiming(task.id)
    try {
      const xpBefore = profile.xp || 0
      const { reward, newLevel: serverLevel, newBadges } = await claimTask(task)
      track('task_claim', { taskId: task.id, reward })
      // Profil se osvježava sam (live listener) — claimed i XP stižu odmah.
      // Level-up animacija je od Etape 9 vezana za kovčeg u XP baru na početnoj,
      // pa se ovdje samo bilježi događaj.
      const oldLevel = levelFromXp(xpBefore)
      const newLevel = serverLevel ?? levelFromXp(xpBefore + reward)
      if (newLevel > oldLevel) track('level_up', { level: newLevel })
      // Novododijeljeni bedževi — animacija poslije level-upa (Etapa 8).
      if (newBadges?.length) setBadgeQueue(newBadges)
    } finally {
      setClaiming(null)
    }
  }

  // Zamjena dnevnog questa žetonom iz kovčega. Namjerno ZAMJENA, ne reset:
  // reset bi značio da isti quest nosi XP dvaput.
  async function handleReroll(task) {
    if (rerolling) return
    setRerolling(task.id)
    try {
      await rerollDailyQuest(task.id)
      track('quest_reroll', { taskId: task.id })
      // Profil je live-pretplaćen; novi picked stiže sam i lista se osvježi.
    } catch {
      // Server je odbio (nema žetona, quest već preuzet) — stanje ostaje isto.
    } finally {
      setRerolling(null)
    }
  }

  if (badgeQueue.length > 0) {
    return (
      <BadgeUnlockOverlay
        badge={badgeQueue[0]}
        onClose={() => setBadgeQueue((q) => q.slice(1))}
      />
    )
  }

  // Questovi više nisu tab u donjoj navigaciji (zamijenila ih je Arena), pa
  // ekran mora imati vlastiti izlaz. Nazad kroz historiju kad je ima, inače na
  // početnu — da deep link ili reload ne izbace igrača iz aplikacije.
  function nazad() {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/')
  }

  return (
    <div className="p-4">
      <button onClick={nazad} className="-ml-1 mb-2 font-bold text-teal-700 active:opacity-70">
        ← Nazad
      </button>

      {/* Naslov + level */}
      <div className="flex items-center justify-between">
        <h1 className="font-title text-3xl font-extrabold text-slate-900">Questovi</h1>
        <span className="flex items-center gap-1 rounded-xl bg-white px-3 py-1 text-sm font-bold text-teal-800 shadow-sm">
          ⭐ Lvl {levelFromXp(profile.xp)}
        </span>
      </div>

      {tasks === null ? (
        <p className="mt-8 text-center text-slate-400">Učitavam taskove…</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <DailySection
            tasks={dailyPicks}
            profile={profile}
            claiming={claiming}
            onClaim={handleClaim}
            onReroll={handleReroll}
            rerolling={rerolling}
            zetona={rewardCounts(profile).questReroll}
          />
          <PeriodSection
            title="Sedmični"
            icon="📅"
            renewText={`Obnavlja se za ${daysUntilWeekEnd()} ${daysUntilWeekEnd() === 1 ? 'dan' : 'dana'}`}
            type="weekly"
            color="#0f766e"
            bgClass="bg-teal-50"
            tasks={tasks.weekly}
            profile={profile}
            claiming={claiming}
            onClaim={handleClaim}
          />
          <PeriodSection
            title="Mjesečni"
            icon="🗓️"
            renewText={`Obnavlja se za ${daysUntilMonthEnd()} ${daysUntilMonthEnd() === 1 ? 'dan' : 'dana'}`}
            type="monthly"
            color="#d97706"
            bgClass="bg-amber-50"
            tasks={tasks.monthly}
            profile={profile}
            claiming={claiming}
            onClaim={handleClaim}
          />
        </div>
      )}
    </div>
  )
}

// Dnevna sekcija — tamna kartica s odbrojavanjem do ponoći.
function DailySection({ tasks, profile, claiming, onClaim, onReroll, rerolling, zetona }) {
  const [seconds, setSeconds] = useState(secondsUntilDailyReset())

  useEffect(() => {
    const t = setInterval(() => setSeconds(secondsUntilDailyReset()), 1000)
    return () => clearInterval(t)
  }, [])

  const progress = progressForType(profile, 'daily')

  return (
    <section
      className="rounded-3xl p-4 shadow"
      style={{ background: 'linear-gradient(180deg, #0f5750 0%, #0a3b36 100%)' }}
    >
      <div className="flex items-center justify-between text-white">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-xl">📅</span>
          <div>
            <h2 className="font-title text-xl font-extrabold">Dnevni</h2>
            <p className="text-xs text-teal-100">Novi zadaci za</p>
          </div>
        </div>
        <span className="flex items-center gap-1 rounded-xl bg-white/10 px-3 py-1.5 font-mono text-sm font-bold">
          🕐 {formatCountdown(seconds)}
        </span>
      </div>

      {zetona > 0 && (
        <p className="mt-2 rounded-xl bg-white/10 px-3 py-1.5 text-xs text-teal-50">
          🎟️ Imaš {zetona} {zetona === 1 ? 'žeton' : 'žetona'} za zamjenu — klikni „Zamijeni" na
          questu koji ti ne odgovara.
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {tasks === null ? (
          <p className="py-4 text-center text-sm text-teal-100/70">Biram današnje zadatke…</p>
        ) : (
          tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              progress={progress}
              color="#0f766e"
              claiming={claiming}
              onClaim={onClaim}
              onReroll={zetona > 0 ? onReroll : null}
              rerolling={rerolling === task.id}
            />
          ))
        )}
      </div>
    </section>
  )
}

// Sedmična / mjesečna sekcija — svijetla kartica.
// Event zadatak koji igraču više nije dostupan (npr. ispao iz Preživljavanja)
// ostaje vidljiv samo ako je na njemu već nešto zaradio — da može preuzeti
// nagradu — ali s jasnom oznakom da mu je event zatvoren.
function PeriodSection({ title, icon, renewText, type, color, bgClass, tasks, profile, claiming, onClaim }) {
  const progress = progressForType(profile, type)
  const visible = tasks.filter(
    (t) => !t.event || eventLive(profile, t.event) || taskValue(progress, t) > 0
  )

  return (
    <section className={`rounded-3xl ${bgClass} p-4`}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-xl shadow-sm">{icon}</span>
        <div>
          <h2 className="font-title text-xl font-extrabold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">{renewText}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {visible.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            progress={progress}
            color={color}
            claiming={claiming}
            onClaim={onClaim}
            eventClosed={!!task.event && !eventLive(profile, task.event)}
          />
        ))}
      </div>
    </section>
  )
}

// Status eventa upisuje server u profil (users/{uid}.eventStatus) pri ulasku
// u event i pri ispadanju — klijent survivalRuns po pravilima ne smije čitati.
function eventLive(profile, event) {
  return profile?.eventStatus?.[event] === true
}

const EVENT_LABEL = { survival: '🔥 Preživljavanje', tournament: '🏆 Turnir' }

// Jedan red taska: kružić, naziv, XP oznaka ili Preuzmi/Preuzeto.
function TaskRow({ task, progress, color, claiming, onClaim, eventClosed, onReroll, rerolling }) {
  const value = taskValue(progress, task)
  const done = value >= task.goal
  const claimed = !!progress.claimed[task.id]
  // Zamjena ima smisla samo dok nagrada nije preuzeta.
  const moze = !!onReroll && !claimed

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
      <CircleProgress value={value} goal={task.goal} color={color} done={done} />
      <div className="min-w-0 flex-1">
        {task.event && (
          <span className="text-[11px] font-bold uppercase tracking-wide text-amber-600">
            {EVENT_LABEL[task.event] || task.event}
          </span>
        )}
        <p className="font-semibold leading-snug text-slate-800">{task.title}</p>
        {done && !claimed && <p className="text-sm font-bold text-green-600">Završeno!</p>}
        {claimed && <p className="text-sm text-slate-400">Nagrada preuzeta ✓</p>}
        {moze && !done && (
          <button
            onClick={() => onReroll(task)}
            disabled={rerolling}
            className="mt-0.5 text-xs font-bold text-teal-700 underline active:opacity-70 disabled:opacity-50"
          >
            {rerolling ? 'Mijenjam…' : '🎟️ Zamijeni'}
          </button>
        )}
        {eventClosed && !done && (
          <p className="text-sm text-slate-400">Event zatvoren — nastavak u srijedu</p>
        )}
      </div>
      {done && !claimed ? (
        <button
          onClick={() => onClaim(task)}
          disabled={claiming !== null}
          className="rounded-xl bg-amber-500 px-4 py-2 font-title font-extrabold text-white shadow active:bg-amber-600 disabled:opacity-60"
        >
          {claiming === task.id ? '…' : '⭐ Preuzmi'}
        </button>
      ) : (
        <span className={`rounded-xl border px-3 py-1 text-sm font-bold ${claimed ? 'border-slate-200 text-slate-300' : 'border-amber-300 bg-amber-50 text-amber-600'}`}>
          +{task.reward} XP
        </span>
      )}
    </div>
  )
}
