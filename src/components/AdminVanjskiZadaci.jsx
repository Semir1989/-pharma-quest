import { useState } from 'react'
import {
  adminListPlayers,
  adminQuestStanje,
  adminSetQuestProgress,
} from '../services/quizApi'

// Ručna potvrda VANJSKIH (EPC) zadataka — admin panel.
//
// Igrica ne vidi šta se dešava na Circle platformi: komentare, lajkove, postove
// i razgovore vidi samo admin. Zato se ovdje upisuje napredak umjesto da ga
// mjeri server.
//
// VAŽNO — ovaj alat NE ISPLAĆUJE nagradu. Upisuje samo brojku (npr. 10/10
// komentara), a XP, žetone i zelene bodove igrač preuzima sam u Questovima,
// kao i kod svakog drugog questa. Time se ne zaobilazi nijedna provjera i
// nemoguće je slučajno isplatiti dvaput.
//
// Ovo je, uz AdminObjava, jedini alat u panelu koji dira TUĐI profil.

const OZNAKA_TIPA = { daily: 'Dnevni', weekly: 'Sedmični', monthly: 'Mjesečni' }

export default function AdminVanjskiZadaci() {
  const [igraci, setIgraci] = useState(null) // null = popis još nije tražen
  const [uid, setUid] = useState('')
  const [stanje, setStanje] = useState(null) // { ime, zadaci: [...] }
  const [unos, setUnos] = useState({}) // taskId → string u polju
  const [radi, setRadi] = useState('')
  const [poruka, setPoruka] = useState(null) // { ok, tekst }

  // Izabrani igrač iz popisa — mail se ponavlja ispod izbornika jer se u
  // zatvorenom <select>u dugačak red skrati i baš mail nestane prvi.
  const izabrani = (igraci || []).find((i) => i.uid === uid) || null

  // Popis se čita tek na zahtjev — to je čitanje cijele kolekcije users.
  async function ucitajIgrace() {
    if (igraci || radi) return
    setRadi('popis')
    try {
      const r = await adminListPlayers()
      setIgraci(r.igraci || [])
    } catch (e) {
      setPoruka({ ok: false, tekst: 'Popis igrača nije učitan: ' + (e?.message || '') })
    } finally {
      setRadi('')
    }
  }

  async function izaberi(noviUid) {
    setUid(noviUid)
    setStanje(null)
    setUnos({})
    setPoruka(null)
    if (!noviUid) return
    setRadi('stanje')
    try {
      const r = await adminQuestStanje(noviUid)
      setStanje(r)
      setUnos(Object.fromEntries((r.zadaci || []).map((z) => [z.id, String(z.vrijednost)])))
    } catch (e) {
      setPoruka({ ok: false, tekst: 'Stanje nije učitano: ' + (e?.message || '') })
    } finally {
      setRadi('')
    }
  }

  async function snimi(zadatak, vrijednost) {
    if (radi) return
    setRadi(zadatak.id)
    setPoruka(null)
    try {
      await adminSetQuestProgress(uid, zadatak.id, vrijednost)
      // Stanje se čita ponovo: server je mjerodavan za period i oznaku preuzimanja.
      const r = await adminQuestStanje(uid)
      setStanje(r)
      setUnos(Object.fromEntries((r.zadaci || []).map((z) => [z.id, String(z.vrijednost)])))
      const gotov = vrijednost >= zadatak.goal
      setPoruka({
        ok: true,
        tekst: gotov
          ? `${zadatak.title}: ispunjeno (${vrijednost}/${zadatak.goal}). Igrač sad može preuzeti nagradu.`
          : `${zadatak.title}: upisano ${vrijednost}/${zadatak.goal}.`,
      })
    } catch (e) {
      setPoruka({ ok: false, tekst: 'Nije upisano: ' + (e?.message || '') })
    } finally {
      setRadi('')
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-title text-base font-extrabold text-slate-800">Vanjski zadaci (EPC)</h2>
      <p className="mt-1 text-xs text-slate-500">
        Komentari, lajkovi, postovi i razgovori na EPC platformi. Upisuje se samo napredak —
        nagradu igrač preuzima sam u Questovima.
      </p>

      <div className="mt-3">
        <label className="text-xs font-bold text-slate-600">Igrač</label>
        <select
          value={uid}
          onFocus={ucitajIgrace}
          onChange={(e) => izaberi(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">{igraci ? '— izaberi igrača —' : 'Klikni da učitaš popis…'}</option>
          {/* Email stoji uz ime jer se napredak upisuje na osnovu onoga što je
              admin vidio na Circle platformi — a tamo je igrač nalog s mailom,
              ne ime iz igrice. Dva igrača s istim imenom se bez toga ne mogu
              razlikovati i napredak lako ode pogrešnom. */}
          {(igraci || []).map((i) => (
            <option key={i.uid} value={i.uid}>
              {i.ime}
              {i.email ? ` — ${i.email}` : ''}
            </option>
          ))}
        </select>
        {izabrani && (
          <p className="mt-1 truncate text-[11px] text-slate-500">
            ✉️ {izabrani.email || 'nema mail adrese'}
            {izabrani.drzava ? ` · ${izabrani.drzava}` : ''}
          </p>
        )}
      </div>

      {radi === 'stanje' && <p className="mt-3 text-sm text-slate-500">Učitavam…</p>}

      {stanje && (
        <div className="mt-4 flex flex-col gap-3">
          {/* Potvrda čijem se profilu upisuje — dolazi sa servera, pa se vidi i
              ako je popis u međuvremenu zastario. */}
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
            Upisujem za: <b className="text-slate-800">{stanje.ime}</b>
            {stanje.email ? ` · ${stanje.email}` : ''}
          </p>

          {stanje.zadaci.length === 0 && (
            <p className="text-sm text-slate-500">Nema vanjskih zadataka u bazenu.</p>
          )}

          {stanje.zadaci.map((z) => {
            const trenutni = Number(unos[z.id] ?? z.vrijednost) || 0
            const ispunjen = z.vrijednost >= z.goal
            const nagrade = [
              `+${z.reward} XP`,
              ...Object.entries(z.tokens || {}).map(([k, n]) =>
                k === 'quizRefill'
                  ? `+${n} žetona za kviz`
                  : k === 'survivalRevive'
                    ? `+${n} oživljavanje`
                    : `+${n} ${k}`
              ),
              z.clanGold ? `+${z.clanGold} zelenih` : null,
            ].filter(Boolean)

            return (
              <div key={z.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{z.title}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {OZNAKA_TIPA[z.type] || z.type} · period {z.period} · {nagrade.join(', ')}
                    </p>
                  </div>
                  {z.preuzeto ? (
                    <span className="shrink-0 rounded-lg bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700">
                      preuzeto
                    </span>
                  ) : ispunjen ? (
                    <span className="shrink-0 rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-700">
                      čeka preuzimanje
                    </span>
                  ) : null}
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={unos[z.id] ?? ''}
                    onChange={(e) => setUnos((u) => ({ ...u, [z.id]: e.target.value }))}
                    className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <span className="text-sm text-slate-500">/ {z.goal}</span>

                  <button
                    onClick={() => snimi(z, trenutni)}
                    disabled={!!radi || trenutni === z.vrijednost}
                    className="ml-auto rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-bold text-white active:bg-teal-800 disabled:opacity-40"
                  >
                    {radi === z.id ? 'Snimam…' : 'Snimi'}
                  </button>
                  {/* Prečica za najčešći slučaj: zadatak je urađen u cijelosti. */}
                  <button
                    onClick={() => snimi(z, z.goal)}
                    disabled={!!radi || z.vrijednost >= z.goal}
                    className="rounded-lg border border-teal-700 px-3 py-1.5 text-xs font-bold text-teal-700 active:bg-teal-50 disabled:opacity-40"
                  >
                    Ispunjeno
                  </button>
                </div>

                {z.preuzeto && trenutni < z.vrijednost && (
                  <p className="mt-1.5 text-[11px] font-medium text-amber-700">
                    Nagrada je već preuzeta — smanjenje broja ne vraća XP ni žetone.
                  </p>
                )}
              </div>
            )
          })}
        </div>
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
