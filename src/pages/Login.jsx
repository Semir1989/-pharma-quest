import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase'
import { authErrorToBosnian } from '../utils/authErrors'
import BrandHeader from '../components/BrandHeader'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
      navigate('/')
    } catch (err) {
      setError(authErrorToBosnian(err.code))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-white">
      <BrandHeader />

      <form
        onSubmit={handleSubmit}
        className="-mt-5 flex flex-1 flex-col gap-4 rounded-t-3xl bg-white px-6 pt-8"
      >
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-slate-400">✉️</span>
          <input
            type="email"
            required
            placeholder="Email adresa"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 bg-transparent text-slate-800 outline-none placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-slate-400">🔒</span>
          <input
            type={showPassword ? 'text' : 'password'}
            required
            placeholder="Lozinka"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="flex-1 bg-transparent text-slate-800 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="text-slate-400"
            aria-label="Prikaži lozinku"
          >
            {showPassword ? '🙈' : '👁️'}
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-teal-700 py-3 font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
        >
          {loading ? 'Prijavljivanje…' : 'Prijavi se'}
        </button>

        <Link
          to="/reset-lozinke"
          className="text-center text-sm font-medium text-teal-700"
        >
          Zaboravljena lozinka?
        </Link>

        <div className="flex items-center gap-3 py-2 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          ILI
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <Link
          to="/registracija"
          className="rounded-xl border border-teal-700 py-3 text-center font-semibold text-teal-700"
        >
          + Kreiraj profil
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
