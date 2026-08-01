import { useMemo, useState } from 'react'
import { adminListPlayers, adminSetDisplayName } from '../../services/quizApi'

// Igrači — pregled i izmjena imena (01.08.2026).
//
// Zašto uopšte postoji: igrači se prijavljuju s "asdf", nadimkom ili pogrešno
// otkucanim prezimenom, a to ime stoji na ljestvici, u bracketu turnira i u
// klanu. Sam ga igrač MOŽE promijeniti na Profilu, ali kad zatraži ispravku
// preko poruke, admin do sada nije imao nijedan način da to uradi.
//
// Uz ime stoji i EMAIL — bez njega se dva igrača s istim imenom ne razlikuju,
// a upravo se po mailu nalog u igrici spaja s nalogom na Circle platformi.
//
// Popis se čita tek na zahtjev: to je čitanje cijele kolekcije users.
export default function AdminIgraci() {
  const [igraci, setIgraci] = useState(null) // null = još nije traženo
  const [term, setTerm] = useState('')
  const [radi, setRadi] = useState('')
  const [poruka, setPoruka] = useState(null) // { ok, tekst }
  const [uredjujem, setUredjujem] = useState(null) // uid
  const [novoIme, setNovoIme] = useState('')

  async function ucitaj() {
    if (radi) return
    setRadi('popis')
    setPoruka(null)
    try {
      const r = await adminListPlayers()
      setIgraci(r.igraci || [])
    } catch (e) {
      setPoruka({ ok: false, tekst: 'Popis nije učitan: ' + (e?.message || '') })
    } finally {
      setRadi('')
    }
  }

  // Pretraga ide i po mailu: kad neko piše "promijenite mi ime", javlja se s
  // mail adrese, a ne s imenom pod kojim je u igrici.
  const filtrirani = useMemo(() => {
    if (!igraci) return []
    const t = term.trim().toLowerCase()
    if (!t) return igraci
    return igraci.filter(
      (i) =>
        i.ime?.toLowerCase().includes(t) ||
        i.email?.toLowerCase().includes(t) ||
        i.telefon?.toLowerCase().includes(t)
    )
  }, [igraci, term])

  function pocniIzmjenu(i) {
    setUredjujem(i.uid)
    setNovoIme(i.ime === '(bez imena)' ? '' : i.ime)
    setPoruka(null)
  }

  async function snimi(i) {
    const ime = novoIme.replace(/\s+/g, ' ').trim()
    if (ime.length < 2 || ime.length > 24) {
      setPoruka({ ok: false, tekst: 'Ime mora imati 2–24 znaka.' })
      return
    }
    setRadi(i.uid)
    setPoruka(null)
    try {
      const r = await adminSetDisplayName(i.uid, ime)
      // Lokalna lista se ispravlja umjesto ponovnog čitanja cijele kolekcije.
      setIgraci((lista) => lista.map((x) => (x.uid === i.uid ? { ...x, ime: r.ime } : x)))
      setUredjujem(null)
      setPoruka({
        ok: true,
        tekst: r.promijenjeno
          ? `Ime promijenjeno: „${r.staro}" → „${r.ime}". Ljestvica se osvježava sama.`
          : 'Ime je već bilo takvo — ništa nije mijenjano.',
      })
    } catch (e) {
      setPoruka({ ok: false, tekst: 'Nije upisano: ' + (e?.message || '') })
    } finally {
      setRadi('')
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-title text-base font-extrabold text-slate-800">Igrači</h2>
      <p className="mt-1 text-xs text-slate-500">
        Email, telefon i država iz registracije. Ime se može ispraviti — mijenja se svugdje
        (ljestvica, bracket, klan).
      </p>

      {igraci === null ? (
        <button
          onClick={ucitaj}
          disabled={!!radi}
          className="mt-3 w-full rounded-xl bg-teal-700 py-2.5 text-sm font-bold text-white active:bg-teal-800 disabled:opacity-50"
        >
          {radi === 'popis' ? 'Učitavam…' : 'Učitaj popis igrača'}
        </button>
      ) : (
        <>
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Traži po imenu, mailu ili telefonu…"
            className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="mt-2 text-[11px] font-semibold text-slate-400">
            {filtrirani.length} od {igraci.length} igrača
          </p>

          <div className="mt-2 flex max-h-96 flex-col gap-2 overflow-y-auto">
            {filtrirani.map((i) => (
              <div key={i.uid} className="rounded-xl border border-slate-200 p-3">
                {uredjujem === i.uid ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={novoIme}
                      maxLength={24}
                      onChange={(e) => setNovoIme(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-teal-500 px-2 py-1.5 text-sm"
                    />
                    <button
                      onClick={() => snimi(i)}
                      disabled={!!radi}
                      className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-bold text-white active:bg-teal-800 disabled:opacity-40"
                    >
                      {radi === i.uid ? 'Snimam…' : 'Snimi'}
                    </button>
                    <button
                      onClick={() => setUredjujem(null)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600"
                    >
                      Odustani
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800">{i.ime}</p>
                      <p className="truncate text-[11px] text-slate-500">
                        {i.email || 'bez maila'}
                      </p>
                      {(i.telefon || i.drzava) && (
                        <p className="truncate text-[11px] text-slate-400">
                          {[i.telefon, i.drzava].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => pocniIzmjenu(i)}
                      className="shrink-0 rounded-lg border border-teal-700 px-3 py-1.5 text-xs font-bold text-teal-700 active:bg-teal-50"
                    >
                      Izmijeni ime
                    </button>
                  </div>
                )}
              </div>
            ))}
            {filtrirani.length === 0 && (
              <p className="text-sm text-slate-500">Nema pogodaka.</p>
            )}
          </div>
        </>
      )}

      {poruka && (
        <p
          className={`mt-3 text-xs font-medium ${poruka.ok ? 'text-emerald-700' : 'text-red-600'}`}
        >
          {poruka.tekst}
        </p>
      )}
    </section>
  )
}
