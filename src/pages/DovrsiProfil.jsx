import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { createUserProfile } from '../services/userProfile'
import BrandHeader from '../components/BrandHeader'
import AvatarPicker from '../components/AvatarPicker'
import { DEFAULT_AVATAR } from '../data/avatars'

// Prikazuje se prijavljenom korisniku koji još nema Firestore profil.
export default function DovrsiProfil() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await createUserProfile(user.uid, {
        email: user.email,
        displayName: name.trim(),
        avatar,
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
