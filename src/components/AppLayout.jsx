import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'

// Okvir za prijavljene korisnike: sadržaj stranice + donja navigacija.
export default function AppLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
