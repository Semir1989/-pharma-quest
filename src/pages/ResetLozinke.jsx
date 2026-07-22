import { useState } from 'react'
import { Link } from 'react-router-dom'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../firebase'
import { authErrorToBosnian } from '../utils/authErrors'
import BrandHeader from '../components/BrandHeader'
import { MailIcon } from '../components/icons'

export default function ResetLozinke() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await sendPasswordResetEmail(auth, email.trim())
      setSent(true)
    } catch (err) {
      setError(authErrorToBosnian(err.code))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-white">
      <BrandHeader subtitle="Reset lozinke" />

      <form
        onSubmit={handleSubmit}
        className="-mt-5 flex flex-1 flex-col gap-4 rounded-t-3xl bg-white px-6 pt-8"
      >
        {sent ? (
          <div className="rounded-xl bg-teal-50 p-4 text-sm text-teal-800">
            Poslali smo link za reset lozinke na <b>{email}</b>. Provjeri i spam
            folder.
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500">
              Unesi email adresu i poslaćemo ti link za postavljanje nove
              lozinke.
            </p>
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

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-teal-800 py-4 text-lg font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
            >
              {loading ? 'Slanje…' : 'Pošalji link'}
            </button>
          </>
        )}

        <Link
          to="/prijava"
          className="text-center text-sm font-medium text-teal-700"
        >
          ← Nazad na prijavu
        </Link>
      </form>
    </div>
  )
}
