import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getUserProfile } from '../services/userProfile'
import Avatar from '../components/Avatar'
import { levelFromXp, rankFromLevel } from '../utils/levels'

// Javni profil igrača (Modul 7) — otvara se klikom na red u leaderboardu.
export default function JavniProfil() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(undefined) // undefined = učitava

  useEffect(() => {
    getUserProfile(uid).then(setProfile).catch(() => setProfile(null))
  }, [uid])

  if (profile === undefined) {
    return <p className="mt-10 text-center text-slate-400">Učitavam profil…</p>
  }
  if (profile === null) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-500">Profil nije pronađen.</p>
        <button onClick={() => navigate(-1)} className="mt-4 font-bold text-teal-700">
          ← Nazad
        </button>
      </div>
    )
  }

  const level = levelFromXp(profile.xp)
  const accuracyEntries = Object.entries(profile.accuracyByCategory || {})

  return (
    <div className="min-h-svh bg-slate-50">
      {/* Zaglavlje */}
      <div
        className="px-5 pb-8 pt-6 text-white"
        style={{ background: 'linear-gradient(180deg, #0f5750 0%, #0a3b36 100%)' }}
      >
        <button onClick={() => navigate(-1)} className="mb-4 font-bold text-teal-100">
          ← Nazad
        </button>
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="rounded-full ring-4 ring-teal-400">
              <Avatar id={profile.avatar} size={88} />
            </div>
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-teal-600 px-3 py-0.5 text-xs font-bold shadow">
              Lvl {level}
            </span>
          </div>
          <div>
            <h1 className="font-title text-2xl font-extrabold">{profile.displayName}</h1>
            <div className="mt-1 inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-sm">
              🛡️ {rankFromLevel(level)}
            </div>
          </div>
        </div>
      </div>

      {/* Statistika */}
      <div className="mx-4 -mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <Stat icon="⭐" label="XP" value={profile.xp || 0} />
        <Stat icon="🔥" label="Streak" value={`${profile.streak || 0} dana`} />
        <Stat icon="🛡️" label="Klan" value={profile.clan || '—'} />
      </div>

      {/* Tačnost po oblastima */}
      <section className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-bold text-slate-800">Tačnost po oblastima</h2>
        {accuracyEntries.length === 0 ? (
          <p className="text-sm text-slate-400">Još nema odigranih kvizova.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {accuracyEntries.map(([cat, pct]) => (
              <div key={cat}>
                <div className="mb-1 flex justify-between text-sm text-slate-600">
                  <span>{cat}</span>
                  <span className="font-semibold">{pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-teal-600" style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
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
