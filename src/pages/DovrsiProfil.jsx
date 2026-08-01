import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { createUserProfile } from '../services/userProfile'
import BrandHeader from '../components/BrandHeader'
import AvatarPicker from '../components/AvatarPicker'
import { DEFAULT_AVATAR } from '../data/avatars'
import {
  DRZAVE,
  PODRAZUMIJEVANA_DRZAVA,
  validanTelefon,
  ocistiTelefon,
} from '../utils/drzave'

// Prikazuje se prijavljenom korisniku koji još nema Firestore profil.
//
// Isti podaci kao na registraciji (uključujući telefon i državu): ovo je drugi
// put kojim profil nastaje, i da ovdje fale, nalog koji je prošao ovuda ostao bi
// bez njih zauvijek — klijent ta polja poslije kreiranja ne smije pisati.
export default function DovrsiProfil() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [country, setCountry] = useState(PODRAZUMIJEVANA_DRZAVA)
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!validanTelefon(phone)) {
      setError('Unesi ispravan broj telefona (8–15 cifara).')
      return
    }
    setLoading(true)
    try {
      await createUserProfile(user.uid, {
        email: user.email,
        displayName: name.trim(),
        avatar,
        phone: ocistiTelefon(phone),
        country,
      })
      navigate('/')
    } catch {
      setError('Greška pri spremanju profila. Pokušaj ponovo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-white">
      <BrandHeader subtitle="Dovrši svoj profil" />

      <form
        onSubmit={handleSubmit}
        className="-mt-5 flex flex-1 flex-col gap-4 rounded-t-3xl bg-white px-6 pt-8"
      >
        <div>
          <p className="mb-3 text-center text-sm font-medium text-slate-500">
            Odaberi svog avatara
          </p>
          <AvatarPicker value={avatar} onChange={setAvatar} />
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <span className="text-teal-700">🧑</span>
          <input
            type="text"
            required
            placeholder="Tvoje ime"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 bg-transparent text-slate-800 outline-none placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <span className="text-teal-700">📱</span>
          <input
            type="tel"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="Broj telefona (npr. 061 123 456)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="flex-1 bg-transparent text-slate-800 outline-none placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <span className="text-teal-700">🌍</span>
          <select
            required
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="flex-1 bg-transparent text-slate-800 outline-none"
          >
            {DRZAVE.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-2xl bg-teal-800 py-4 text-lg font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
        >
          {loading ? 'Spremanje…' : 'Počni igru'}
        </button>
      </form>
    </div>
  )
}
