import { BrowserRouter, Routes, Route } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import Home from './pages/Home'
import Kviz from './pages/Kviz'
import Questovi from './pages/Questovi'
import Klan from './pages/Klan'
import Profil from './pages/Profil'

function App() {
  return (
    <BrowserRouter>
      <div className="mx-auto flex min-h-svh max-w-md flex-col bg-slate-50">
        <main className="flex-1 overflow-y-auto pb-20">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/kviz" element={<Kviz />} />
            <Route path="/questovi" element={<Questovi />} />
            <Route path="/klan" element={<Klan />} />
            <Route path="/profil" element={<Profil />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </BrowserRouter>
  )
}

export default App
