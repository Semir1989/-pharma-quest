import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/AppLayout'
import Login from './pages/Login'
import Register from './pages/Register'
import ResetLozinke from './pages/ResetLozinke'
import DovrsiProfil from './pages/DovrsiProfil'
import Home from './pages/Home'
import Kviz from './pages/Kviz'
import Questovi from './pages/Questovi'
import Klan from './pages/Klan'
import Profil from './pages/Profil'
import Leaderboard from './pages/Leaderboard'
import JavniProfil from './pages/JavniProfil'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="mx-auto min-h-svh max-w-md bg-slate-50">
          <Routes>
            {/* Javne rute (bez bottom nav) */}
            <Route path="/prijava" element={<Login />} />
            <Route path="/registracija" element={<Register />} />
            <Route path="/reset-lozinke" element={<ResetLozinke />} />

            {/* Dovršetak profila (prijavljen, bez profila — bez bottom nav) */}
            <Route
              path="/dovrsi-profil"
              element={
                <ProtectedRoute>
                  <DovrsiProfil />
                </ProtectedRoute>
              }
            />

            {/* Zaštićene rute (s bottom nav) */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Home />} />
              <Route path="/kviz" element={<Kviz />} />
              <Route path="/questovi" element={<Questovi />} />
              <Route path="/klan" element={<Klan />} />
              <Route path="/profil" element={<Profil />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/igrac/:uid" element={<JavniProfil />} />
            </Route>
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
