import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import { getBadges } from '../services/badges'
import { levelFromXp, rankFromLevel } from '../utils/levels'

export default function Profil() {
  const { profile, isAdmin } = useAuth()
  const [badges, setBadges] = useState([])

  useEffect(() => {
    getBadges()
      .then(setBadges)
      .catch(() => setBadges([]))
  }, [])

  if (!profile) return null

  const level = levelFromXp(profile.xp)
  const rank = rankFromLevel(level)
  const accuracyEntries = Object.entries(profile.accuracyByCategory || {})
  const earned = profile.badges || {}
  const earnedCount = badges.filter((b) => earned[b.id]).length

  return (
    <div className="min-h-svh bg-slate-50">
      {/* Zaglavlje s avatarom, imenom i rangom */}
      <div
        className="flex items-center gap-4 px-5 pb-8 pt-10 text-white"
        style={{ background: 'linear-gradient(180deg, #0f5750 0%, #0a3b36 100%)' }}
      >
        <div className="relative">
          <div className="rounded-full ring-4 ring-teal-400">
            <Avatar id={profile.avatar} size={88} />
          </div>
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-teal-600 px-3 py-0.5 text-xs font-bold shadow">
            Lvl {level}
          </span>
        </div>
        <div>
          <h1 className="font-title text-2xl font-extrabold">
            {profile.displayName}
          </h1>
          <div className="mt-1 inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-sm">
            🛡️ {rank}
          </div>
        </div>
      </div>

      {/* Statistika: streak, tačnost, klan */}
      <div className="mx-4 -mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <Stat icon="🔥" label="Streak" value={`${profile.streak || 0} dana`} />
        <Stat icon="🎯" label="Tačnost" value={accuracyOverall(profile)} />
        <Stat icon="🛡️" label="Klan" value={profile.clan || '—'} />
      </div>

      {/* Bedževi */}
      <section className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Bedževi</h2>
          {badges.length > 0 && (
            <span className="text-sm font-semibold text-slate-400">
              {earnedCount}/{badges.length}
            </span>
          )}
        </div>
        {badges.length === 0 ? (
          <p className="text-sm text-slate-400">Bedževi se učitavaju…</p>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {badges.map((b) => {
              const isEarned = !!earned[b.id]
              return (
                <div
                  key={b.id}
                  className="flex flex-col items-center text-center"
                  title={b.description}
                >
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl ${
                      isEarned ? 'bg-amber-100' : 'bg-slate-100 grayscale'
                    }`}
                  >
                    {isEarned ? b.emoji : '🔒'}
                  </div>
                  <span className="mt-1 text-[11px] leading-tight text-slate-500">
                    {b.name}
                  </span>
                </div>
              )
            })}
          </div>
        )}
        <p className="mt-3 text-center text-xs text-slate-400">
          Bedževe otključavaš igranjem.
        </p>
      </section>

      {/* Tačnost po oblastima */}
      <section className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-bold text-slate-800">
          Tačnost po oblastima
        </h2>
        {accuracyEntries.length === 0 ? (
          <p className="text-sm text-slate-400">
            Odigraj kvizove da vidiš svoju tačnost po oblastima.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {accuracyEntries.map(([cat, pct]) => (
              <div key={cat}>
                <div className="mb-1 flex justify-between text-sm text-slate-600">
                  <span>{cat}</span>
                  <span className="font-semibold">{pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-teal-600"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {isAdmin && (
        <div className="mx-4 mt-4">
          <Link
            to="/admin"
            className="flex items-center justify-between rounded-2xl bg-slate-900 p-4 text-white shadow-sm active:bg-black"
          >
            <span className="flex items-center gap-3">
              <span className="text-xl">🛠️</span>
              <span className="font-bold">Admin panel</span>
            </span>
            <span className="text-sm font-bold text-amber-300">Otvori →</span>
          </Link>
        </div>
      )}

      <div className="px-4 py-6">
        <button
          onClick={() => signOut(auth)}
          className="w-full rounded-xl border border-red-300 py-3 font-medium text-red-600"
        >
          Odjavi se
        </button>
      </div>
    </div>
  )
}

function Stat({ icon, label, value }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="text-xl">{icon}</span>
      <span className="mt-1 text-xs text-slate-400">{label}</span>
      <span className="text-sm font-bold text-slate-800">{value}</span>
    </div>
  )
}

function accuracyOverall(profile) {
  const entries = Object.values(profile.accuracyByCategory || {})
  if (entries.length === 0) return '—'
  const avg = Math.round(entries.reduce((a, b) => a + b, 0) / entries.length)
  return `${avg}%`
}
