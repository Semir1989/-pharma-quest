import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { loadLevelConfig } from '../services/levelConfig'
import { syncGlobalEntry } from '../services/leaderboard'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true) // učitavanje auth stanja
  const [profileLoading, setProfileLoading] = useState(true) // učitavanje profila

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  // Kad se korisnik prijavi, pratimo njegov Firestore profil uživo.
  useEffect(() => {
    if (!user) {
      setProfile(null)
      setProfileLoading(false)
      return
    }
    loadLevelConfig() // učitaj XP krivu iz Firestore (jednom, poslije prijave)
    setProfileLoading(true)
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        const data = snap.exists() ? snap.data() : null
        setProfile(data)
        setProfileLoading(false)
        // Osvježi globalni leaderboard unos (ime/avatar/XP/level) — Modul 7.
        if (data) syncGlobalEntry(user.uid, data)
      },
      () => setProfileLoading(false)
    )
    return unsubscribe
  }, [user])

  return (
    <AuthContext.Provider value={{ user, profile, loading, profileLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
