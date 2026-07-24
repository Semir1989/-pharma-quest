import { NavLink } from 'react-router-dom'
import { HomeIcon, QuizIcon, TrophyIcon, ClanIcon, PersonIcon } from './icons'

// Donja navigacija — linijske ikonice usklađene s dizajnom (počeni ekran.png).
const TABS = [
  { to: '/', label: 'Home', Icon: HomeIcon },
  { to: '/kviz', label: 'Kviz', Icon: QuizIcon },
  { to: '/questovi', label: 'Questovi', Icon: TrophyIcon },
  { to: '/klan', label: 'Klan', Icon: ClanIcon },
  { to: '/profil', label: 'Profil', Icon: PersonIcon },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-1/2 flex w-full max-w-md -translate-x-1/2 justify-around border-t border-slate-200 bg-white pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-1">
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `relative flex flex-col items-center gap-1 px-2 pt-2 text-xs font-medium ${
              isActive ? 'text-teal-700' : 'text-slate-400'
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span className="absolute top-0 h-1 w-8 rounded-full bg-teal-600" />
              )}
              <Icon className="h-6 w-6" />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
