import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from 'react'

// Vidljivost donje navigacije (01.08.2026).
//
// Pravilo: traka je ZALIJEPLJENA i stoji preko svega — osim dok igrač stvarno
// igra. Tokom pitanja je svaki tab pored prsta način da se slučajno izađe iz
// kviza usred odbrojavanja, a kod duela to znači i izgubljen meč, jer sat
// nastavlja teći i van aplikacije.
//
// Ekrani koji se skrivaju: dnevni kviz, Preživljavanje i 1v1 duel (uključujući
// kvalifikaciju). Klanski rat NEMA svoj ekran s pitanjima — bodovi u njemu
// dolaze iz kviza i duela, pa je i on pokriven time što se ta dva skrivaju.
//
// Zašto BROJAČ a ne boolean: dva ekrana mogu biti montirana u istom trenutku
// (odjava jednog dok se drugi montira pri promjeni rute). S booleanom bi
// odjava starijeg ugasila skrivanje koje je noviji upravo tražio, i traka bi
// iskočila usred pitanja. Skup ključeva to rješava bez obzira na redoslijed.
const NavCtx = createContext(null)

export function NavProvider({ children }) {
  const [skrivaci, setSkrivaci] = useState(() => new Set())

  // prijavi/odjavi MORAJU imati stabilan identitet: stoje u zavisnostima
  // efekta u useSakrijNav, a da se mijenjaju sa svakim upisom u skup, efekat bi
  // se odjavljivao i prijavljivao u krug (beskonačna petlja renderovanja).
  const prijavi = useCallback((kljuc) => {
    setSkrivaci((s) => {
      if (s.has(kljuc)) return s
      const n = new Set(s)
      n.add(kljuc)
      return n
    })
  }, [])

  const odjavi = useCallback((kljuc) => {
    setSkrivaci((s) => {
      if (!s.has(kljuc)) return s
      const n = new Set(s)
      n.delete(kljuc)
      return n
    })
  }, [])

  const vrijednost = useMemo(
    () => ({ skrivena: skrivaci.size > 0, prijavi, odjavi }),
    [skrivaci, prijavi, odjavi]
  )

  return <NavCtx.Provider value={vrijednost}>{children}</NavCtx.Provider>
}

export function useNavVidljivost() {
  return useContext(NavCtx) || { skrivena: false, prijavi: () => {}, odjavi: () => {} }
}

/**
 * Sakrij donju navigaciju dok je `aktivno` tačno.
 *
 * Koristi se na ekranima igre: `useSakrijNav(phase === 'playing')`. Odjava ide
 * kroz cleanup, pa se traka vraća i kad korisnik ode nazad dugmetom pregledača
 * ili kad komponenta padne.
 */
export function useSakrijNav(aktivno) {
  const { prijavi, odjavi } = useNavVidljivost()
  const kljuc = useId()

  useEffect(() => {
    if (!aktivno) return
    prijavi(kljuc)
    return () => odjavi(kljuc)
  }, [aktivno, kljuc, prijavi, odjavi])
}
