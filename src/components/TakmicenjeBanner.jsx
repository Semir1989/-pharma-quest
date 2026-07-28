import { useEffect, useState } from 'react'
import {
  registracijaOtvorena,
  takmicenjeUToku,
  REG_ZATVARANJE_SAT,
  TAKMICENJE_POCETAK_SAT,
  TAKMICENJE_KRAJ_SAT,
} from '../../functions/klan-pravila.js'
import { bihParts, doSljedecegTermina, formatirajOdbrojavanje } from '../utils/bihVrijeme'

// Banner sedmičnog takmičenja klanova.
//
// Funkcije prozora se UVOZE iz functions/klan-pravila.js — istog fajla koji
// koristi Cloud Function. Da su prepisane ovdje, prije ili kasnije bi se
// razišle i dugme bi bilo aktivno kad server odbija (ili obrnuto).
//
// Prozori: prijave subotom i nedjeljom do 20:00; takmičenje pon 08:00 – pet
// 18:00, po BiH vremenu (Europe/Sarajevo).
export default function TakmicenjeBanner({ prijavljen, mozePrijaviti, naPrijavu, radi }) {
  const [sada, setSada] = useState(() => new Date())

  // Osvježavanje jednom u minuti — odbrojavanje se prikazuje u satima i
  // minutama, pa češće ne bi ništa promijenilo osim potrošnje baterije.
  useEffect(() => {
    const t = setInterval(() => setSada(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  const p = bihParts(sada)
  const otvorena = registracijaOtvorena(p)
  const uToku = takmicenjeUToku(p)

  let boja = 'bg-slate-100 text-slate-600'
  let naslov = 'Sedmično takmičenje klanova'
  let detalj = ''

  if (otvorena) {
    boja = 'bg-teal-50 text-teal-900 ring-1 ring-teal-200'
    naslov = 'Prijave su otvorene'
    detalj = `Zatvaraju se za ${formatirajOdbrojavanje(doSljedecegTermina(0, REG_ZATVARANJE_SAT, sada))} (nedjelja ${REG_ZATVARANJE_SAT}:00).`
  } else if (uToku) {
    boja = 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
    naslov = 'Takmičenje je u toku'
    detalj = `Završava za ${formatirajOdbrojavanje(doSljedecegTermina(5, TAKMICENJE_KRAJ_SAT, sada))} (petak ${TAKMICENJE_KRAJ_SAT}:00).`
  } else {
    const doPocetka = doSljedecegTermina(1, TAKMICENJE_POCETAK_SAT, sada)
    const doPrijava = doSljedecegTermina(6, 0, sada)
    detalj =
      doPocetka < doPrijava
        ? `Takmičenje počinje za ${formatirajOdbrojavanje(doPocetka)} (ponedjeljak ${TAKMICENJE_POCETAK_SAT}:00).`
        : `Prijave se otvaraju za ${formatirajOdbrojavanje(doPrijava)} (subota).`
  }

  return (
    <section className={`mx-4 mt-4 rounded-2xl p-4 ${boja}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-bold">🏆 {naslov}</h2>
          <p className="mt-0.5 text-sm opacity-90">{detalj}</p>
          {prijavljen && (
            <p className="mt-1 text-sm font-bold">✓ Klan je prijavljen za ovu sedmicu.</p>
          )}
        </div>
      </div>

      {mozePrijaviti && !prijavljen && (
        <button
          onClick={naPrijavu}
          disabled={!otvorena || radi}
          className="mt-3 w-full rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white active:bg-teal-800 disabled:bg-slate-300 disabled:text-slate-500"
        >
          {radi ? 'Prijavljujem…' : otvorena ? 'Prijavi klan' : 'Prijave su zatvorene'}
        </button>
      )}

      {!mozePrijaviti && !prijavljen && (
        <p className="mt-2 text-xs opacity-75">Klan prijavljuje osnivač ili savjetnik.</p>
      )}
    </section>
  )
}
