import { useState } from 'react'
import { adminBroadcast, adminListPlayers } from '../services/quizApi'

// Slanje objave (push notifikacije) svim igračima — admin panel.
//
// Ovaj alat je drukčiji od ostalih u panelu: oni diraju samo admin nalog, ovaj
// ide SVIMA i ne može se povući. Zato UI namjerno usporava ruku:
//   - živi pregled kako će poruka izgledati na telefonu
//   - "Pošalji sebi" prije nego se pošalje svima
//   - potvrda u dva koraka za pravo slanje
//   - crvena, ne teal — da se ne pomiješa s bezopasnim dugmadima

const MAX_NASLOV = 60
const MAX_TEKST = 160

const RUTE = [
  ['/', 'Početna'],
  ['/kviz', 'Kviz'],
  ['/questovi', 'Questovi'],
  ['/prezivljavanje', 'Preživljavanje'],
  ['/turnir', 'Turnir'],
  ['/leaderboard', 'Ljestvica'],
]

export default function AdminObjava() {
  const [naslov, setNaslov] = useState('')
  const [tekst, setTekst] = useState('')
  const [url, setUrl] = useState('/')
  const [radi, setRadi] = useState('')
  const [poruka, setPoruka] = useState(null) // { ok, tekst }
  const [potvrda, setPotvrda] = useState(false)
  const [igraci, setIgraci] = useState(null) // null = popis još nije tražen
  const [komu, setKomu] = useState('') // '' = svi igrači

  const spremno = naslov.trim().length >= 3 && tekst.trim().length >= 3
  const predugo = naslov.length > MAX_NASLOV || tekst.length > MAX_TEKST
  const izabrani = igraci?.find((i) => i.uid === komu) || null

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

  async function posalji(test) {
    if (radi) return
    setRadi(test ? 'test' : komu ? 'igracu' : 'svima')
    setPoruka(null)
    try {
      const r = await adminBroadcast({ naslov, tekst, url, test, komu: test ? null : komu || null })
      if (!test && komu) {
        setPoruka(
          r.poslano
            ? { ok: true, tekst: `Poslano igraču ${r.ime} (${r.uredjaja} uređaj/a).` }
            : { ok: false, tekst: `FCM je odbio sve uređaje igrača ${r.ime}.` }
        )
        setPotvrda(false)
        return // radi se gasi u finally
      }
      if (test) {
        // r.poslano === false znači da je FCM odbio SVE tokene. Bez ovoga bi
        // ekran javio uspjeh dok na telefon ne stiže ništa — a upravo to je
        // slučaj koji se testom traži.
        setPoruka(
          r.poslano
            ? { ok: true, tekst: `Poslano na tvoje uređaje (${r.uredjaja}). Provjeri telefon.` }
            : {
                ok: false,
                tekst: `FCM je odbio sve tokene (${r.uredjaja}). Isključi pa ponovo uključi notifikacije na Profilu.`,
              }
        )
      } else {
        setPoruka({
          ok: true,
          tekst:
            `Objava poslana: ${r.primalaca} igrača / ${r.uredjaja} uređaja.` +
            (r.odjavljenih ? ` ${r.odjavljenih} je isključilo objave.` : ''),
        })
        setNaslov('')
        setTekst('')
      }
      setPotvrda(false)
    } catch (e) {
      setPoruka({ ok: false, tekst: 'Greška: ' + (e?.message || 'pokušaj ponovo') })
    } finally {
      setRadi('')
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
      <h2 className="font-title text-lg font-extrabold text-red-900">📣 Objava igračima</h2>
      <p className="mt-0.5 text-xs text-red-700">
        Stiže kao push notifikacija na telefon. <b>Ne može se povući.</b> Ide svima
        ili jednom izabranom igraču.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        <div className="rounded-xl bg-white p-3">
          <label className="text-xs font-bold text-slate-500">Naslov</label>
          <input
            type="text"
            value={naslov}
            onChange={(e) => setNaslov(e.target.value)}
            placeholder="npr. Nova pitanja iz farmakologije 📚"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-teal-500"
          />
          <p
            className={`mt-1 text-right text-[11px] ${
              naslov.length > MAX_NASLOV ? 'font-bold text-red-600' : 'text-slate-400'
            }`}
          >
            {naslov.length}/{MAX_NASLOV}
          </p>

          <label className="text-xs font-bold text-slate-500">Tekst</label>
          <textarea
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            rows={3}
            placeholder="npr. Dodano je 145 novih pitanja. Provjeri koliko znaš!"
            className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-teal-500"
          />
          <p
            className={`mt-1 text-right text-[11px] ${
              tekst.length > MAX_TEKST ? 'font-bold text-red-600' : 'text-slate-400'
            }`}
          >
            {tekst.length}/{MAX_TEKST}
          </p>

          {/* Primalac. Popis se dovlači tek kad admin otvori izbor — čitanje
              cijele kolekcije users ne treba trošiti pri svakom otvaranju
              panela. */}
          <label className="text-xs font-bold text-slate-500">Kome</label>
          {igraci === null ? (
            <button
              onClick={ucitajIgrace}
              disabled={!!radi}
              className="mt-1 mb-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-slate-800 disabled:opacity-50"
            >
              {radi === 'popis' ? 'Učitavam igrače…' : 'Svi igrači — dodirni za izbor igrača'}
            </button>
          ) : (
            <div className="mb-3">
              <select
                value={komu}
                onChange={(e) => {
                  setKomu(e.target.value)
                  setPotvrda(false)
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 outline-none focus:border-teal-500"
              >
                <option value="">Svi igrači ({igraci.length})</option>
                {igraci.map((i) => (
                  <option key={i.uid} value={i.uid} disabled={!i.notifOn || i.uredjaja === 0}>
                    {i.ime}
                    {i.uredjaja === 0 || !i.notifOn
                      ? ' — bez notifikacija'
                      : i.najaveUgasene
                        ? ' — ugasio objave'
                        : ` — ${i.uredjaja} uređaj/a`}
                  </option>
                ))}
              </select>
              {izabrani?.najaveUgasene && (
                <p className="mt-1 text-[11px] font-medium text-red-600">
                  {izabrani.ime} je isključio objave — server će odbiti slanje.
                </p>
              )}
            </div>
          )}

          <label className="text-xs font-bold text-slate-500">Klik vodi na</label>
          <select
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 outline-none focus:border-teal-500"
          >
            {RUTE.map(([ruta, ime]) => (
              <option key={ruta} value={ruta}>
                {ime}
              </option>
            ))}
          </select>
        </div>

        {/* Pregled — ovako će izgledati na zaključanom ekranu */}
        {spremno && (
          <div className="rounded-xl bg-slate-800 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Pregled</p>
            <div className="mt-2 flex gap-2.5 rounded-xl bg-slate-700 p-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-700 text-sm">
                💊
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">{naslov}</p>
                <p className="line-clamp-2 text-xs text-slate-300">{tekst}</p>
              </div>
            </div>
          </div>
        )}

        {poruka && (
          <p
            className={`rounded-xl p-3 text-sm font-medium ${
              poruka.ok ? 'bg-teal-50 text-teal-800' : 'bg-red-100 text-red-700'
            }`}
          >
            {poruka.tekst}
          </p>
        )}

        <button
          onClick={() => posalji(true)}
          disabled={!spremno || predugo || !!radi}
          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 font-bold text-slate-700 active:bg-slate-100 disabled:opacity-50"
        >
          {radi === 'test' ? 'Šaljem…' : 'Pošalji sebi (test)'}
        </button>

        {/* Slanje jednom igraču ne traži crvenu dugmad ni potvrdu u dva koraka:
            te brane postoje zbog nepovratne poruke SVIMA, a ovdje je primalac
            jedan i namjerno izabran. */}
        {izabrani ? (
          <button
            onClick={() => posalji(false)}
            disabled={!spremno || predugo || !!radi}
            className="w-full rounded-xl bg-teal-700 py-3 font-title font-extrabold text-white active:bg-teal-800 disabled:opacity-50"
          >
            {radi === 'igracu' ? 'Šaljem…' : `Pošalji igraču: ${izabrani.ime}`}
          </button>
        ) : !potvrda ? (
          <button
            onClick={() => setPotvrda(true)}
            disabled={!spremno || predugo || !!radi}
            className="w-full rounded-xl bg-red-600 py-3 font-title font-extrabold text-white active:bg-red-700 disabled:opacity-50"
          >
            Pošalji SVIMA
          </button>
        ) : (
          <div className="rounded-xl border border-red-300 bg-white p-3">
            <p className="text-sm font-bold text-red-800">Sigurno? Ovo ide svim igračima odmah.</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setPotvrda(false)}
                disabled={!!radi}
                className="flex-1 rounded-xl border border-slate-300 py-2.5 font-bold text-slate-600 disabled:opacity-50"
              >
                Odustani
              </button>
              <button
                onClick={() => posalji(false)}
                disabled={!!radi}
                className="flex-1 rounded-xl bg-red-600 py-2.5 font-extrabold text-white active:bg-red-700 disabled:opacity-50"
              >
                {radi === 'svima' ? 'Šaljem…' : 'Da, pošalji'}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
