import { useEffect, useState } from 'react'

// Trenutno vrijeme koje se samo osvježava — za žive odbrojavače i za faze
// eventa (prijave otvorene → zatvorene → igra počela) koje se moraju
// prebaciti bez reloada stranice.
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
