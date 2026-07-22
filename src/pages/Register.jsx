import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase'
import { authErrorToBosnian } from '../utils/authErrors'
import { createUserProfile } from '../services/userProfile'
import BrandHeader from '../components/BrandHeader'
import AvatarPicker from '../components/AvatarPicker'
import { MailIcon, LockIcon, EyeIcon, EyeOffIcon } from '../components/icons'
import { DEFAULT_AVATAR } from '../data/avatars'

export default function Register() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Lozinke se ne poklapaju.')
      return
    }
    setLoading(true)
    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      )
      await createUserProfile(cred.user.uid, {
        email: email.trim(),
        displayName: name.trim(),
        avatar,
      })
      navigate('/')
    } catch (err) {
      setError(authErrorToBosnian(err.code))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-white">
      <BrandHeader subtitle="Kreiraj svoj profil" />

      <form
        onSubmit={handleSubmit}
        className="-mt-5 flex flex-1 flex-col gap-4 rounded-t-3xl bg-white px-6 pt-8"
      >
        {/* Izbor avatara */}
        <div>
          <p className="mb-3 text-center text-sm font-medium text-slate-500">
            Odaberi svog avatara
          </p>
          <AvatarPicker value={avatar} onChange={setAvatar} />
        </div>

        {/* Ime */}
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
          <MailIcon className="h-6 w-6 shrink-0 text-teal-700" />
          <input
            type="email"
            required
            placeholder="Email adresa"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 bg-transparent text-slate-800 outline-none placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <LockIcon className="h-6 w-6 shrink-0 text-teal-700" />
          <input
            type={showPassword ? 'text' : 'password'}
            required
            placeholder="Lozinka (min. 6 znakova)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="flex-1 bg-transparent text-slate-800 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="text-teal-700"
            aria-label="Prikaži lozinku"
          >
            {showPassword ? (
              <EyeOffIcon className="h-6 w-6" />
            ) : (
              <EyeIcon className="h-6 w-6" />
            )}
          </button>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <LockIcon className="h-6 w-6 shrink-0 text-teal-700" />
          <input
            type={showPassword ? 'text' : 'password'}
            required
            placeholder="Ponovi lozinku"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="flex-1 bg-transparent text-slate-800 outline-none placeholder:text-slate-400"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-2xl bg-teal-800 py-4 text-lg font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
        >
          {loading ? 'Kreiranje…' : 'Kreiraj profil'}
        </button>

        <Link
          to="/prijava"
          className="text-center text-sm font-medium text-teal-700"
        >
          Već imaš nalog? Prijavi se
        </Link>

        <div className="mt-auto flex items-center justify-center gap-2 pb-6 pt-4 text-xs text-slate-400">
          <span className="font-bold text-teal-700">EPC</span>
          <span className="h-4 w-px bg-slate-300" />
          <span>Edu Pharma Community</span>
        </div>
      </form>
    </div>
  )
}
