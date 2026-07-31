import { Link } from 'react-router-dom'
import { progressForType, taskValue, izabrani } from '../services/tasks'

// Banner napretka questova na početnoj — dnevni, sedmični i mjesečni na jednom
// mjestu, npr. "Dnevni 1/5". Igrač do sada nije imao uvid u sedmične i mjesečne
// bez ulaska u Questove.
//
// Kad negdje ima nepreuzeti XP, taj red SVIJETLI (amber pozadina + pulsirajuća
// tačkica) — isti jezik kao signal na Areni: tačkica nosi informaciju i kad je
// animacija ugašena.
//
// SVA TRI reda moraju brojati IGRAČEV IZBOR, ne cijeli bazen. Dnevni je to
// radio (prima gotovu listu), a sedmični i mjesečni su do 31.07.2026. brojali
// `tasks.weekly` / `tasks.monthly` — pa je početna javljala 0/7 i 0/6, a u
// Questovima ih je stajalo 6 i 7. Ovdje uvijek ide kroz `izabrani()`.
//
// props: tasks ({ daily, weekly, monthly }), daily (današnji izbor), profile
export default function QuestProgress({ tasks, daily, profile }) {
  if (!tasks) return null

  const redovi = [
    { tip: 'daily', naziv: 'Dnevni', lista: daily || [] },
    { tip: 'weekly', naziv: 'Sedmični', lista: izabrani(profile, tasks.weekly, 'weekly') },
    { tip: 'monthly', naziv: 'Mjesečni', lista: izabrani(profile, tasks.monthly, 'monthly') },
  ].map((r) => {
    const progress = progressForType(profile, r.tip)
    let gotovo = 0
    let zaPreuzeti = 0
    for (const task of r.lista) {
      const done = taskValue(progress, task) >= task.goal
      if (done) gotovo++
      if (done && !progress.claimed[task.id]) zaPreuzeti += task.reward || 0
    }
    return { ...r, gotovo, ukupno: r.lista.length, zaPreuzeti }
  })

  const vidljivi = redovi.filter((r) => r.ukupno > 0)
  if (vidljivi.length === 0) return null

  return (
    <Link
      to="/questovi"
      className="mt-3 block rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-500">Napredak questova</h2>
        <span className="text-xs font-bold text-teal-700">Otvori →</span>
      </div>

      <div className="mt-2 flex flex-col gap-1.5">
        {vidljivi.map((r) => (
          <Red key={r.tip} {...r} />
        ))}
      </div>
    </Link>
  )
}

function Red({ naziv, gotovo, ukupno, zaPreuzeti }) {
  const svePozavrseno = gotovo === ukupno
  const postotak = ukupno > 0 ? Math.round((gotovo / ukupno) * 100) : 0

  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-2.5 py-2 ${
        zaPreuzeti > 0 ? 'bg-amber-50 ring-1 ring-amber-300' : ''
      }`}
    >
      <span className="w-20 shrink-0 text-xs font-bold text-slate-700">{naziv}</span>

      <div className="h-2 flex-1 rounded-full bg-slate-100">
        <div
          className={`h-2 rounded-full ${svePozavrseno ? 'bg-emerald-500' : 'bg-teal-600'}`}
          style={{ width: `${postotak}%` }}
        />
      </div>

      <span className="w-9 shrink-0 text-right text-xs font-bold tabular-nums text-slate-600">
        {gotovo}/{ukupno}
      </span>

      {zaPreuzeti > 0 ? (
        // Pulsira SAMA pilula, ne tačkica u njoj: halo je amber, pa bi na
        // amber podlozi bio nevidljiv. Boja i tekst nose informaciju i kad je
        // animacija ugašena (prefers-reduced-motion).
        <span className="arena-halo shrink-0 rounded-lg bg-amber-500 px-2 py-0.5 text-[11px] font-extrabold text-white">
          +{zaPreuzeti} XP
        </span>
      ) : (
        <span className="w-[68px] shrink-0" />
      )}
    </div>
  )
}
