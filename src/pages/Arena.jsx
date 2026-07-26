import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import DuelCard from '../components/DuelCard'
import XpRaceCard from '../components/XpRaceCard'
import { getTournamentConfig } from '../services/tournament'
import { useArenaAlert } from '../utils/useArenaAlert'

// Arena — stalno mjesto za sva takmičenja: vikend dueli, XP trka i sedmično
// Preživljavanje. Prije su sve tri kartice stajale na početnoj i trošile ~40%
// prvog ekrana, iako dvije žive samo vikendom. Sada početna nosi samo core loop
// (XP, kviz, dnevni zadaci), a Arena raste koliko treba.
export default function Arena() {
  const { user } = useAuth()
  // undefined = još učitavam, null = nema configa. Bez te razlike bi prazno
  // stanje bljesnulo na svakom ulasku prije nego config stigne.
  const [cfg, setCfg] = useState(undefined)
  const { signals, markSeen } = useArenaAlert()

  useEffect(() => {
    let alive = true
    getTournamentConfig()
      .then((c) => alive && setCfg(c))
      .catch(() => alive && setCfg(null))
    return () => {
      alive = false
    }
  }, [])

  // Posjeta gasi signal u navigaciji do sutra (ili do novog eventa).
  const signalKey = signals.join(',')
  useEffect(() => {
    if (signalKey) markSeen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalKey])

  const weekendLive = !!cfg?.enabled && !!cfg?.key
  const cfgLoaded = cfg !== undefined

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h1 className="font-title text-3xl font-extrabold text-slate-900">Arena</h1>
        {signals.length > 0 && (
          <span className="rounded-xl bg-amber-50 px-3 py-1 text-sm font-bold text-amber-600">
            {signals.length} {signals.length === 1 ? 'te čeka' : 'čekaju te'}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Takmičenja — dueli, XP trka i sedmično Preživljavanje.
      </p>

      {/* Vikend event (Faza 2) — dvije odvojene kartice, jer su to dva
          različita takmičenja: duel traži prijavu unaprijed, XP trka ne. */}
      <DuelCard cfg={cfg} uid={user?.uid} />
      <XpRaceCard cfg={cfg} />

      {cfgLoaded && !weekendLive && (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-center">
          <p className="text-sm font-semibold text-slate-500">Vikend event nije aktivan</p>
          <p className="mt-1 text-xs text-slate-400">
            Dueli i XP trka otvaraju se vikendom.
          </p>
        </div>
      )}

      {/* Preživljavanje — sedmični izazov (Etapa 8) */}
      <Link
        to="/prezivljavanje"
        className="mt-4 flex items-center justify-between rounded-2xl p-4 text-white shadow-sm active:opacity-95"
        style={{ background: 'linear-gradient(180deg, #0f5750 0%, #0a3b36 100%)' }}
      >
        <div>
          <h2 className="text-lg font-bold">Preživljavanje</h2>
          <p className="text-xs text-teal-100">
            Sedmični izazov — izađi kad hoćeš, greška te izbacuje
          </p>
        </div>
        <span className="text-sm font-bold text-amber-300">Igraj →</span>
      </Link>
    </div>
  )
}
