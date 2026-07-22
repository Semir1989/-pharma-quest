import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-slate-400">
        Učitavanje…
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/prijava" replace />
  }

  return children
}
