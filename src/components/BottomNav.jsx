import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/kviz', label: 'Kviz', icon: '❓' },
  { to: '/questovi', label: 'Questovi', icon: '📋' },
  { to: '/klan', label: 'Klan', icon: '👥' },
  { to: '/profil', label: 'Profil', icon: '👤' },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-1/2 flex w-full max-w-md -translate-x-1/2 justify-around border-t border-slate-200 bg-white py-2">
      {TABS.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 px-2 text-xs ${
              isActive ? 'text-teal-700' : 'text-slate-400'
            }`
          }
        >
          <span className="text-xl">{icon}</span>
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
