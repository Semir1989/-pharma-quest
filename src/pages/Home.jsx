import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import CircleProgress from '../components/CircleProgress'
import InstallBanner from '../components/InstallBanner'
import LevelChests from '../components/LevelChests'
import QuestProgress from '../components/QuestProgress'
import QuizEnergy from '../components/QuizEnergy'
import { levelFromXp, xpProgress } from '../utils/levels'
import {
  getTasks,
  progressForType,
  taskValue,
  dailyTasksFor,
  claimableXp,
} from '../services/tasks'

function greeting() {
  const h = new Date().getHours()
  if (h < 11) return 'Dobro jutro'
  if (h < 18) return 'Dobar dan'
  return 'Dobro veče'
}

// Početna nosi SAMO core loop: ko sam, koliko mi treba do levela, šta igram
// danas. Vikend dueli, XP trka i Preživljavanje žive u Areni (tab u donjoj
// navigaciji) — prije su trošili ~40% prvog ekrana, a aktivni su par dana.
export default function Home() {
  const { profile } = useAuth()
  // Taskovi se učitavaju JEDNOM ovdje, pa se dijele kartici dnevnih zadataka i
  // banneru napretka — inače bi oba zvala dailyTasksFor, a on zna otići na
  // server po današnji izbor.
  const [tasks, setTasks] = useState(null) // { daily, weekly, monthly }
  const [daily, setDaily] = useState(null) // današnja tri

  const pickedKey = (profile?.taskProgress?.daily?.picked || []).join(',')
  useEffect(() => {
    if (!profile) return
    let alive = true
    getTasks()
      .then(async (t) => {
        if (!alive) return
        setTasks(t)
        const list = await dailyTasksFor(t.daily, profile)
        if (alive) setDaily(list)
      })
      .catch(() => alive && setDaily([]))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedKey, !!profile])

  if (!profile) return null

  const level = levelFromXp(profile.xp)
  const prog = xpProgress(profile.xp)

  return (
    <div className="p-4">
      {/* Gornji red: avatar, level, streak */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar id={profile.avatar} size={52} className="ring-2 ring-teal-500" />
          <span className="flex items-center gap-1 rounded-xl border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-bold text-teal-800">
            ⭐ Lvl {level}
          </span>
        </div>
        <span className="flex items-center gap-1 rounded-xl bg-white px-3 py-1 text-sm font-bold text-orange-500 shadow-sm">
          🔥 {profile.streak || 0}
        </span>
      </div>

      {/* Pozdrav + XP bar */}
      <h1 className="mt-5 font-title text-3xl font-extrabold text-slate-900">
        {greeting()}, {profile.displayName}!
      </h1>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-3 flex-1 rounded-full bg-slate-200">
          <div
            className="h-3 rounded-full bg-amber-400"
            style={{ width: `${prog.percent}%` }}
          />
        </div>
        <span className="text-sm font-bold text-amber-600">
          {prog.current}/{prog.needed} XP
        </span>
      </div>

      {/* Kovčezi za pređene levele — jedini put do level-up animacije */}
      <LevelChests profile={profile} />

      {/* Pokušaji za kviz — energija koja se regeneriše svaka 4 sata */}
      <QuizEnergy profile={profile} />

      {/* Instaliraj aplikaciju (Modul 8 — PWA) */}
      <InstallBanner />

      {/* Dnevni taskovi — kružići napretka (Modul 6) */}
      <DailyTasksCard profile={profile} tasks={tasks} daily={daily} />

      {/* Napredak sva tri perioda — svijetli kad negdje ima XP za preuzeti */}
      <QuestProgress tasks={tasks} daily={daily} profile={profile} />

      {/* Leaderboard kartica (Modul 7) */}
      <Link
        to="/leaderboard"
        className="mt-4 flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-xl">🏆</span>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Leaderboard</h2>
            <p className="text-xs text-slate-500">Globalni i sedmični poredak — uživo</p>
          </div>
        </div>
        <span className="text-sm font-bold text-teal-700">Pogledaj →</span>
      </Link>
    </div>
  )
}

// Kartica dnevnih taskova s kružnim progresom — klik vodi na Questove.
// Prikazuje ista tri zadatka koja je server izabrao za današnji dan.
//
// Desna oznaka je i prečica do nagrade: ako igrač ima nepreuzeti XP bilo gdje
// (dnevni, sedmični ili mjesečni zadaci), "Pogledaj" se pretvara u "Preuzmi
// N XP" i vodi na Questove, gdje preuzimanje već ima level-up i bedž animacije.
function DailyTasksCard({ profile, tasks, daily }) {
  if (!daily || daily.length === 0) return null

  const progress = progressForType(profile, 'daily')
  const allDone = daily.every((t) => taskValue(progress, t) >= t.goal)
  const claimable = claimableXp(profile, tasks, daily)

  return (
    <Link
      to="/questovi"
      className="mt-6 block rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">Dnevni zadaci</h2>
        {claimable > 0 ? (
          <span className="rounded-xl bg-amber-500 px-3 py-1.5 font-title text-sm font-extrabold text-white shadow-sm">
            ⭐ Preuzmi {claimable} XP
          </span>
        ) : (
          <span className={`text-sm font-bold ${allDone ? 'text-green-600' : 'text-teal-700'}`}>
            {allDone ? 'Sve završeno! ✓' : 'Pogledaj →'}
          </span>
        )}
      </div>
      <div className="mt-3 flex justify-around">
        {daily.map((task) => {
          const value = taskValue(progress, task)
          return (
            <div key={task.id} className="flex w-24 flex-col items-center text-center">
              <CircleProgress value={value} goal={task.goal} done={value >= task.goal} size={48} />
              <span className="mt-1 text-[11px] leading-tight text-slate-500">{task.shortTitle || task.title}</span>
            </div>
          )
        })}
      </div>
    </Link>
  )
}
