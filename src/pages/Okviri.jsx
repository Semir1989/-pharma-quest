import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import { equipCosmetic } from '../services/userProfile'
import { COSMETICS, cosmeticsBySource, equippedCosmetics } from '../data/cosmetics'

// Kolekcija ukrasa avatara (Etapa 9).
//
// Svaki event daje svoju vrstu, pa su i tri nezavisna mjesta: okvir (dueli),
// pozadina (Preživljavanje) i aura (XP trka). Igrač može nositi sva tri
// istovremeno. Ništa ne daje XP niti prednost — osvaja se i vidi.
export default function Okviri() {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)

  if (!profile) return null

  const owned = profile.cosmetics?.owned || []
  const nose = equippedCosmetics(profile)
  const grupe = cosmeticsBySource()

  async function odaberi(item) {
    if (saving) return
    setSaving(true)
    try {
      // Klik na ono što je već na avataru ga skida.
      const vec = nose[item.kind]?.id === item.id
      await equipCosmetic(user.uid, item.kind, vec ? null : item.id)
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

      <h1 className="font-title text-3xl font-extrabold text-slate-900">Izgled avatara</h1>
      <p className="mt-1 text-sm text-slate-500">
        Osvojeno {owned.length} od {COSMETICS.length}. Svaki event daje svoju vrstu ukrasa i sva tri
        se mogu nositi istovremeno.
      </p>

      {/* Pregled uživo — sva tri sloja zajedno */}
      <div className="mt-4 flex items-center gap-5 rounded-2xl bg-white p-5 shadow-sm">
        <Avatar id={profile.avatar} size={76} cosmetics={nose} />
        <div className="min-w-0 text-xs">
          <Red naziv="Okvir" vrijednost={nose.ring?.name} />
          <Red naziv="Pozadina" vrijednost={nose.background?.name} />
          <Red naziv="Aura" vrijednost={nose.aura?.name} />
        </div>
      </div>

      {grupe.map(({ source, label, emoji, kind, items }) => {
        const imam = items.filter((c) => owned.includes(c.id)).length
        return (
          <section key={source} className="mt-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-title text-lg font-extrabold text-slate-800">
                {emoji} {label}
              </h2>
              <span className="text-sm font-bold text-slate-400">
                {imam}/{items.length}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {kind === 'ring' && 'Okvir oko avatara'}
              {kind === 'background' && 'Pozadina unutar avatara'}
              {kind === 'aura' && 'Sjaj oko avatara'}
            </p>

            <div className="mt-2 grid grid-cols-3 gap-3">
              {items.map((c) => {
                const mine = owned.includes(c.id)
                const on = nose[c.kind]?.id === c.id
                // U mreži se prikazuje SAMO ovaj ukras, bez ostala dva —
                // inače se ne vidi šta koji zapravo radi.
                const samo = { ring: null, background: null, aura: null, [c.kind]: c }
                return (
                  <button
                    key={c.id}
                    onClick={() => mine && odaberi(c)}
                    disabled={!mine || saving}
                    className={`flex flex-col items-center rounded-2xl px-2.5 py-3 text-center ${
                      on ? 'bg-amber-50 ring-2 ring-amber-500' : 'bg-white shadow-sm'
                    } ${mine ? 'active:bg-slate-50' : 'opacity-45'}`}
                  >
                    <Avatar id={profile.avatar} size={44} cosmetics={samo} />
                    <span className="mt-2 text-[11px] font-bold leading-tight text-slate-700">
                      {c.name}
                    </span>
                    <span className="mt-0.5 text-[10px] leading-tight text-slate-400">
                      {mine ? (on ? 'Nosim ✓' : 'Osvojeno') : c.req}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}

      <p className="mt-6 text-center text-xs text-slate-400">
        Ukrasi se dodjeljuju automatski kad ispuniš uslov u eventu.
      </p>
    </div>
  )
}

function Red({ naziv, vrijednost }) {
  return (
    <p className="leading-relaxed">
      <span className="text-slate-400">{naziv}: </span>
      <span className={vrijednost ? 'font-bold text-slate-800' : 'text-slate-400'}>
        {vrijednost || '—'}
      </span>
    </p>
  )
}
