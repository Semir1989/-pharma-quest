import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { user, profile, loading, profileLoading } = useAuth()
  const location = useLocation()

  if (loading || (user && profileLoading)) {
    return (
      <div className="flex min-h-svh items-center justify-center text-slate-400">
        Učitavanje…
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/prijava" replace />
  }

  // Prijavljen, ali još nema profil → dovrši profil (osim ako je već tamo).
  if (!profile && location.pathname !== '/dovrsi-profil') {
    return <Navigate to="/dovrsi-profil" replace />
  }

  return children
}
