import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import { equipFrame } from '../services/userProfile'
import { FRAMES, framesBySource, equippedFrame } from '../data/cosmetics'

// Kolekcija okvira avatara (Etapa 9).
// Okvir je čist status — ne daje XP niti ijednu prednost. Osvaja se u
// eventima, a ovdje se bira koji se nosi. Neosvojeni se vide zamućeni, s
// uslovom ispisanim ispod: kolekcija koja se vidi je pola motivacije.
export default function Okviri() {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)

  if (!profile) return null

  const owned = profile.cosmetics?.owned || []
  const active = equippedFrame(profile)
  const grupe = framesBySource()

  async function odaberi(id) {
    if (saving) return
    setSaving(true)
    try {
      // Klik na okvir koji je već na avataru ga skida.
      await equipFrame(user.uid, active?.id === id ? null : id)
    } finally {
      setSaving(false)
    }
  }

  function nazad() {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/profil')
  }

  return (
    <div className="min-h-svh bg-slate-50 p-4">
      <button onClick={nazad} className="-ml-1 mb-2 font-bold text-teal-700 active:opacity-70">
        ← Nazad
      </button>

      <h1 className="font-title text-3xl font-extrabold text-slate-900">Okviri</h1>
      <p className="mt-1 text-sm text-slate-500">
        Osvojeno {owned.length} od {FRAMES.length}. Okvir se osvaja u eventima i ne daje nikakvu
        prednost u igri — samo se vidi.
      </p>

      {/* Pregled uživo — kako avatar izgleda s izabranim okvirom */}
      <div className="mt-4 flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm">
        <Avatar id={profile.avatar} size={72} frame={active} />
        <div className="min-w-0">
          <p className="font-bold text-slate-800">{active ? active.name : 'Bez okvira'}</p>
          <p className="text-xs text-slate-500">
            {active ? active.req : 'Klikni na osvojen okvir da ga staviš na avatar.'}
          </p>
          {active && (
            <button
              onClick={() => odaberi(active.id)}
              disabled={saving}
              className="mt-2 rounded-xl border border-slate-200 px-3 py-1 text-xs font-bold text-slate-500 active:bg-slate-50 disabled:opacity-60"
            >
              Skini okvir
            </button>
          )}
        </div>
      </div>

      {grupe.map(({ source, label, emoji, frames }) => {
        const imam = frames.filter((f) => owned.includes(f.id)).length
        return (
          <section key={source} className="mt-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-title text-lg font-extrabold text-slate-800">
                {emoji} {label}
              </h2>
              <span className="text-sm font-bold text-slate-400">
                {imam}/{frames.length}
              </span>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-3">
              {frames.map((f) => {
                const mine = owned.includes(f.id)
                const on = active?.id === f.id
                return (
                  <button
                    key={f.id}
                    onClick={() => mine && odaberi(f.id)}
                    disabled={!mine || saving}
                    className={`flex flex-col items-center rounded-2xl p-2.5 text-center ${
                      on ? 'bg-amber-50 ring-2 ring-amber-500' : 'bg-white shadow-sm'
                    } ${mine ? 'active:bg-slate-50' : 'opacity-45'}`}
                  >
                    <Avatar
                      id={profile.avatar}
                      size={46}
                      frame={mine ? f : { ...f, anim: null }}
                    />
                    <span className="mt-1.5 text-[11px] font-bold leading-tight text-slate-700">
                      {f.name}
                    </span>
                    <span className="mt-0.5 text-[10px] leading-tight text-slate-400">
                      {mine ? (on ? 'Na avataru ✓' : 'Osvojeno') : f.req}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}

      <p className="mt-6 text-center text-xs text-slate-400">
        Okviri se dodjeljuju automatski kad ispuniš uslov u eventu.
      </p>
    </div>
  )
}
