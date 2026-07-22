import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth } from '../context/AuthContext'

export default function Profil() {
  const { user } = useAuth()

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-slate-900">Profil</h1>
      <p className="mt-1 text-slate-500">
        Prijavljen kao: <b className="text-slate-700">{user?.email}</b>
      </p>
      <p className="mt-4 text-sm text-slate-400">
        Avatar, level, bedževi, statistika — dolazi u Modulu 2.
      </p>

      <button
        onClick={() => signOut(auth)}
        className="mt-6 rounded-xl border border-red-300 px-4 py-2 font-medium text-red-600"
      >
        Odjavi se
      </button>
    </div>
  )
}
