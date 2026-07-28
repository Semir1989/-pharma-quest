import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import NotifikacijePostavke from '../components/NotifikacijePostavke'
import NotifikacijeZvono from '../components/NotifikacijeZvono'
import useNotifikacije from '../hooks/useNotifikacije'
import { getBadges, featuredBadgeEmojis } from '../services/badges'
import { updateFeaturedBadges } from '../services/userProfile'
import { equippedCosmetics, COSMETICS } from '../data/cosmetics'
import {
  levelFromXp,
  rankFromLevel,
  featuredBadgeSlots,
  nextFeaturedSlotLevel,
} from '../utils/levels'

export default function Profil() {
  const { profile, user, isAdmin } = useAuth()
  const [badges, setBadges] = useState([])
  const [saving, setSaving] = useState(false)
  // Jedno stanje za oba prekidača (zvono u zaglavlju i sekcija ispod), da ne
  // znaju različitu istinu i ne zovu getToken() dvaput.
  const notif = useNotifikacije(user?.uid, profile)

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
  const nose = equippedCosmetics(profile)
  const nosiNesto = !!(nose.ring || nose.background || nose.aura)
  const ownedFrames = (profile.cosmetics?.owned || []).length

  // Istaknuti bedževi — koliko mjesta nosi trenutni level i šta je izabrano.
  const slots = featuredBadgeSlots(level)
  const nextSlotLevel = nextFeaturedSlotLevel(level)
  const featured = (profile.featuredBadges || []).filter((id) => earned[id]).slice(0, slots)

  // Klik na osvojen bedž ga ističe ili skida. Kad su sva mjesta puna, novi
  // izbor izbacuje najstariji — bez toga bi igrač morao prvo skidati, pa birati.
  async function toggleFeatured(badgeId) {
    if (saving || slots === 0 || !earned[badgeId]) return
    const next = featured.includes(badgeId)
      ? featured.filter((x) => x !== badgeId)
      : [...featured, badgeId].slice(-slots)
    setSaving(true)
    try {
      // Profil je live-pretplaćen, pa se avatar osvježi sam poslije upisa.
      await updateFeaturedBadges(user.uid, next)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-svh bg-slate-50">
      {/* Zaglavlje s avatarom, imenom i rangom */}
      <div
        className="flex items-center gap-4 px-5 pb-8 pt-10 text-white"
        style={{ background: 'linear-gradient(180deg, #0f5750 0%, #0a3b36 100%)' }}
      >
        <div className="relative">
          {/* Teal prsten je samo zadani okvir — kad igrač nosi osvojeni, on
              zamjenjuje prsten, da se dva okvira ne slažu jedan preko drugog. */}
          <Avatar
            id={profile.avatar}
            size={88}
            className={nosiNesto ? '' : 'ring-4 ring-teal-400'}
            badges={featuredBadgeEmojis(profile, badges)}
            cosmetics={nose}
          />
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-teal-600 px-3 py-0.5 text-xs font-bold shadow">
            Lvl {level}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-title text-2xl font-extrabold">
            {profile.displayName}
          </h1>
          <div className="mt-1 inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-sm">
            🛡️ {rank}
          </div>
        </div>
        {/* Prekidač notifikacija je ovdje, a ne samo u sekciji ispod: dok je
            stajao na dnu ekrana, igrači ga nisu nalazili. */}
        <NotifikacijeZvono notif={notif} tamno />
      </div>

      {/* Statistika: streak, tačnost, klan */}
      <div className="mx-4 -mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <Stat icon="🔥" label="Streak" value={`${profile.streak || 0} dana`} />
        <Stat icon="🎯" label="Tačnost" value={accuracyOverall(profile)} />
        <Stat icon="🛡️" label="Klan" value={profile.clan || '—'} />
      </div>

      {/* Notifikacije odmah ispod avatara i statistike — prije bedževa i
          kategorija, gdje su se ranije gubile. */}
      <NotifikacijePostavke uid={user?.uid} profile={profile} notif={notif} />

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
              const isFeatured = featured.includes(b.id)
              const canPick = isEarned && slots > 0
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggleFeatured(b.id)}
                  disabled={!canPick || saving}
                  className="flex flex-col items-center text-center disabled:cursor-default"
                  title={
                    canPick
                      ? isFeatured
                        ? 'Skini s avatara'
                        : 'Istakni na avataru'
                      : b.description
                  }
                >
                  <div
                    className={`relative flex h-14 w-14 items-center justify-center rounded-2xl text-2xl ${
                      isEarned ? 'bg-amber-100' : 'bg-slate-100 grayscale'
                    } ${isFeatured ? 'ring-2 ring-amber-500 ring-offset-2' : ''}`}
                  >
                    {isEarned ? b.emoji : '🔒'}
                    {isFeatured && (
                      <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white shadow">
                        ★
                      </span>
                    )}
                  </div>
                  <span className="mt-1 text-[11px] leading-tight text-slate-500">
                    {b.name}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Istaknuti bedževi — objašnjenje se mijenja s levelom */}
        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-center">
          {slots === 0 ? (
            <p className="text-xs text-slate-500">
              Bedževe otključavaš igranjem. Na{' '}
              <span className="font-bold text-slate-700">levelu {nextSlotLevel}</span> dobijaš prvo
              mjesto da jedan istakneš na avataru.
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-600">
                Klikni na osvojen bedž da ga istakneš na avataru —{' '}
                <span className="font-bold text-amber-600">
                  {featured.length}/{slots}
                </span>{' '}
                {slots === 1 ? 'mjesto' : 'mjesta'}.
              </p>
              {nextSlotLevel && (
                <p className="mt-1 text-[11px] text-slate-400">
                  Sljedeće mjesto na levelu {nextSlotLevel}.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* Okviri avatara — kolekcija je na zasebnom ekranu (30 komada) */}
      <div className="mx-4 mt-4">
        <Link
          to="/okviri"
          className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50"
        >
          <div className="flex items-center gap-3">
            <Avatar id={profile.avatar} size={40} cosmetics={nose} />
            <div>
              <h2 className="text-lg font-bold text-slate-800">Izgled avatara</h2>
              <p className="text-xs text-slate-500">
                Okvir, pozadina i aura · {ownedFrames}/{COSMETICS.length} osvojeno
              </p>
            </div>
          </div>
          <span className="text-sm font-bold text-teal-700">Otvori →</span>
        </Link>
      </div>

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
