import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import { NavProvider, useNavVidljivost } from '../context/NavContext'

// Okvir za prijavljene korisnike: sadržaj stranice + donja navigacija.
//
// Traka je zalijepljena za dno (fixed) i stoji IZNAD sadržaja stranice — vidi
// z-index u BottomNav. Sklanja se samo dok igrač igra; pravilo i razlozi su u
// context/NavContext.jsx.
export default function AppLayout() {
  return (
    <NavProvider>
      <Okvir />
    </NavProvider>
  )
}

function Okvir() {
  const { skrivena } = useNavVidljivost()

  return (
    <div className="flex min-h-svh flex-col">
      {/* Donji razmak ide uz traku: kad nje nema, ekran s pitanjem ne smije
          imati 5rem praznine ispod odgovora. */}
      <main className={`flex-1 overflow-y-auto ${skrivena ? '' : 'pb-20'}`}>
        <Outlet />
      </main>
      {!skrivena && <BottomNav />}
    </div>
  )
}
