import { useCallback, useEffect, useState } from 'react'
import {
  stanje as citajStanje,
  ukljuci,
  iskljuci,
  sinhronizuj,
} from '../services/notifikacije'

// Stanje push notifikacija za OVAJ uređaj, na jednom mjestu.
//
// Postoji kao hook jer isti prekidač stoji na dva mjesta na Profilu — zvono uz
// avatar i sekcija s vrstama poruka. Da svaki od njih sam čita stanje, svaki bi
// pri otvaranju ekrana zvao getToken() i oba bi znala različitu istinu dok se
// upis ne vrati iz Firestorea.
export default function useNotifikacije(uid, profile) {
  const [stanje, setStanje] = useState(null)
  const [radi, setRadi] = useState(false)
  const [greska, setGreska] = useState('')

  // Ovisnost izvedena iz sadržaja, ne iz objekta profila — profile stiže iz
  // Firestore snapshota i mijenja identitet pri svakoj promjeni XP-a.
  const potpisPretplate = `${profile?.notifOn}|${(profile?.fcmTokens || []).join(',')}`

  useEffect(() => {
    let ziv = true
    ;(async () => {
      // Prvo tiha popravka (token je mogao ispasti iz baze), pa čitanje stanja —
      // inače bi ekran načas pokazao "isključeno" na ispravnom uređaju.
      await sinhronizuj(uid, profile).catch(() => {})
      const s = await citajStanje(profile).catch(() => 'iskljuceno')
      if (ziv) setStanje(s)
    })()
    return () => {
      ziv = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, potpisPretplate])

  const prebaci = useCallback(async () => {
    if (radi) return
    setGreska('')
    setRadi(true)
    try {
      if (stanje === 'ukljuceno') {
        await iskljuci(uid)
        setStanje('iskljuceno')
      } else {
        const ok = await ukljuci(uid)
        // Stanje se ne čita ponovo iz citajStanje(profile): profile je props i
        // još drži staru listu tokena, pa bi svjež token ispao kao "nije
        // povezan". Rezultat ukljuci() je mjerodavan.
        setStanje(ok ? 'ukljuceno' : 'iskljuceno')
        if (!ok) setGreska('Dozvola nije data. Provjeri postavke browsera.')
      }
    } catch {
      setGreska('Nešto nije prošlo. Pokušaj ponovo.')
    } finally {
      setRadi(false)
    }
  }, [radi, stanje, uid])

  return {
    stanje,
    radi,
    greska,
    ukljuceno: stanje === 'ukljuceno',
    // Prekidač ima smisla nuditi samo kad uređaj stvarno može primati poruke.
    // Kod 'blokirano', 'nepodrzano' i 'ios-nije-instalirana' dodir ne bi uradio
    // ništa — tu treba objašnjenje, a ono stoji u sekciji na Profilu.
    prekidacRadi: stanje === 'ukljuceno' || stanje === 'iskljuceno',
    prebaci,
  }
}
