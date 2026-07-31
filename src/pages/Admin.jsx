import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminObjava from '../components/AdminObjava'
import AdminVanjskiZadaci from '../components/AdminVanjskiZadaci'
import { useAuth } from '../context/AuthContext'
import { getAllQuestions, getQuestionSecret, saveQuestion, createQuestion } from '../services/admin'
import {
  adminResetSurvival,
  adminSetXp,
  adminSetHidden,
  adminGrantAllCosmetics,
  adminClearCosmetics,
} from '../services/quizApi'
import { COSMETICS } from '../data/cosmetics'
import { levelFromXp } from '../utils/levels'
import EventKontrola from '../components/admin/EventKontrola'
import RatKontrola from '../components/admin/RatKontrola'
import {
  normalizeCategory,
  categoryLabel,
  similarCategories,
  categoriesFromQuestions,
} from '../utils/kategorije'

const BLANK = {
  question: { id: null, text: '', options: ['', '', '', ''], category: '', difficulty: 2, points: 10, active: true },
  secret: { correctIndex: 0, explanation: '' },
  isNew: true,
}

// Admin panel (Etapa 8) — pregled i ispravka banke pitanja.
// Pristup samo za admina (custom claim). Editor mijenja i tačan odgovor
// (questionSecrets) da se brzo isprave žalbe testera.
export default function Admin() {
  const { isAdmin, profile } = useAuth()
  const [questions, setQuestions] = useState(null)
  const [term, setTerm] = useState('')
  const [editing, setEditing] = useState(null) // { question, secret } ili null

  useEffect(() => {
    if (!isAdmin) return
    getAllQuestions().then(setQuestions).catch(() => setQuestions([]))
  }, [isAdmin])

  // Postojeće kategorije iz banke — editor iz njih nudi izbor umjesto da se
  // kategorija svaki put kuca napamet.
  const categories = useMemo(() => categoriesFromQuestions(questions), [questions])

  const filtered = useMemo(() => {
    if (!questions) return []
    const t = term.trim().toLowerCase()
    if (!t) return questions
    return questions.filter(
      (q) =>
        q.text?.toLowerCase().includes(t) ||
        q.category?.toLowerCase().includes(t) ||
        (q.options || []).some((o) => o.toLowerCase().includes(t))
    )
  }, [questions, term])

  if (!isAdmin) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center p-6 text-center">
        <span className="text-5xl">🔒</span>
        <h1 className="mt-4 font-title text-2xl font-extrabold text-slate-900">Pristup samo za administratore</h1>
        <p className="mt-2 text-slate-500">Ovaj dio je zaključan.</p>
        <Link to="/" className="mt-6 font-bold text-teal-700">← Nazad na početnu</Link>
      </div>
    )
  }

  async function openEditor(q) {
    const secret = await getQuestionSecret(q.id)
    setEditing({ question: q, secret })
  }

  function onSaved(updated, isNew) {
    setQuestions((list) => (isNew ? [updated, ...list] : list.map((q) => (q.id === updated.id ? updated : q))))
    setEditing(null)
  }

  if (editing) {
    return (
      <QuestionEditor
        entry={editing}
        categories={categories}
        onCancel={() => setEditing(null)}
        onSaved={onSaved}
      />
    )
  }

  return (
    <div className="min-h-svh bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <h1 className="font-title text-2xl font-extrabold text-slate-900">🛠️ Admin panel</h1>
        <Link to="/profil" className="text-sm font-bold text-teal-700">Zatvori</Link>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Prijavljen kao <b>{profile?.displayName || 'admin'}</b> · {questions?.length ?? '…'} pitanja
      </p>

      <EventKontrola />

      <RatKontrola />

      <AdminObjava />

      <AdminVanjskiZadaci />

      <TestAlati profile={profile} />

      <h2 className="mt-6 font-title text-lg font-extrabold text-slate-800">Banka pitanja</h2>

      <button
        onClick={() => setEditing(BLANK)}
        className="mt-2 w-full rounded-2xl bg-teal-700 py-3 font-title font-extrabold text-white active:bg-teal-800"
      >
        + Dodaj pitanje
      </button>

      <input
        type="text"
        placeholder="Pretraži po tekstu, kategoriji ili opciji…"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-800 outline-none focus:border-teal-500"
      />

      {questions === null ? (
        <p className="mt-8 text-center text-slate-400">Učitavam pitanja…</p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {filtered.map((q) => (
            <button
              key={q.id}
              onClick={() => openEditor(q)}
              className="rounded-2xl bg-white p-3 text-left shadow-sm active:bg-slate-50"
            >
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-700">
                  {q.category}
                </span>
                {!q.active && (
                  <span className="rounded-lg bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">
                    neaktivno
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-800">{q.text}</p>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="mt-8 text-center text-slate-400">Nema rezultata za „{term}".</p>
          )}
        </div>
      )}
    </div>
  )
}

// Alati za testiranje — rade ISKLJUČIVO nad vlastitim nalogom (server to
// provjerava). Namjerno nisu alat za mijenjanje tuđih rezultata: admin panel
// služi da se event provjeri i da se ugasi požar, ne da se popravlja poredak.
function TestAlati({ profile }) {
  const [poruka, setPoruka] = useState('')
  const [radi, setRadi] = useState('')
  const [xpUnos, setXpUnos] = useState('')

  const skriven = profile?.hideFromBoards === true
  const okvira = (profile?.cosmetics?.owned || []).length

  async function pokreni(kljuc, fn, uspjeh) {
    if (radi) return
    setRadi(kljuc)
    setPoruka('')
    try {
      await fn()
      setPoruka(uspjeh)
    } catch (e) {
      setPoruka('Greška: ' + (e?.message || 'pokušaj ponovo'))
    } finally {
      setRadi('')
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="font-title text-lg font-extrabold text-amber-900">🧪 Alati za testiranje</h2>
      <p className="mt-0.5 text-xs text-amber-700">
        Sve djeluje samo na tvoj nalog · Level {levelFromXp(profile?.xp)} · {profile?.xp || 0} XP
      </p>

      <div className="mt-3 flex flex-col gap-2">
        <Alat
          naslov="Restartuj Preživljavanje"
          opis="Briše sedmični pokušaj, niz i kovčege — možeš odmah ponovo ući."
          dugme="Restartuj"
          radi={radi === 'survival'}
          onClick={() =>
            pokreni('survival', adminResetSurvival, 'Preživljavanje resetovano — možeš ponovo igrati.')
          }
        />

        <div className="rounded-xl bg-white p-3">
          <p className="text-sm font-bold text-slate-800">Postavi svoj XP</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Za provjeru svega što ovisi o levelu (istaknuti bedževi na 10/20/30, rangovi).
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              min={0}
              value={xpUnos}
              onChange={(e) => setXpUnos(e.target.value)}
              placeholder="npr. 5000"
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-teal-500"
            />
            <button
              onClick={() =>
                pokreni('xp', () => adminSetXp(Number(xpUnos)), `XP postavljen na ${Number(xpUnos)}.`)
              }
              disabled={!!radi || xpUnos === ''}
              className="rounded-xl bg-teal-700 px-4 py-2 font-bold text-white active:bg-teal-800 disabled:opacity-50"
            >
              {radi === 'xp' ? '…' : 'Postavi'}
            </button>
          </div>
        </div>

        <Alat
          naslov={skriven ? 'Skriven s ljestvica ✓' : 'Vidljiv na ljestvicama'}
          opis={
            skriven
              ? 'Ne pojavljuješ se ni na jednoj ljestvici. XP ti se i dalje normalno sabira.'
              : 'Uključi da tvoji rezultati ne ulaze u poredak igračima.'
          }
          dugme={skriven ? 'Prikaži me' : 'Sakrij me'}
          radi={radi === 'hidden'}
          onClick={() =>
            pokreni(
              'hidden',
              () => adminSetHidden(!skriven),
              skriven ? 'Ponovo si na ljestvicama.' : 'Skriven si sa svih ljestvica.'
            )
          }
        />

        <Alat
          naslov={`Ukrasi avatara (${okvira}/${COSMETICS.length})`}
          opis="Dodijeli sve okvire, pozadine i aure sebi, bez čekanja eventa."
          dugme="Daj mi sve"
          radi={radi === 'frames'}
          onClick={() =>
            pokreni(
              'frames',
              () => adminGrantAllCosmetics(COSMETICS.map((c) => c.id)),
              'Svi okviri dodijeljeni — pogledaj /okviri.'
            )
          }
          sporedno={{
            tekst: 'Obriši sve',
            onClick: () =>
              pokreni('frames', adminClearCosmetics, 'Okviri obrisani.'),
          }}
        />
      </div>

      {poruka && (
        <p
          className={`mt-3 text-sm font-medium ${
            poruka.startsWith('Greška') ? 'text-red-600' : 'text-emerald-700'
          }`}
        >
          {poruka}
        </p>
      )}
    </section>
  )
}

function Alat({ naslov, opis, dugme, radi, onClick, sporedno }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="text-sm font-bold text-slate-800">{naslov}</p>
      <p className="mt-0.5 text-xs text-slate-500">{opis}</p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={onClick}
          disabled={radi}
          className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white active:bg-teal-800 disabled:opacity-50"
        >
          {radi ? '…' : dugme}
        </button>
        {sporedno && (
          <button
            onClick={sporedno.onClick}
            disabled={radi}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-500 active:bg-slate-50 disabled:opacity-50"
          >
            {sporedno.tekst}
          </button>
        )}
      </div>
    </div>
  )
}

const LETTERS = ['A', 'B', 'C', 'D']
const NOVA = '__nova__'

// Birač kategorije: padajuća lista postojećih (s brojem pitanja) ili unos nove.
// Nova se odmah normalizuje u slug, a ako liči na postojeću — upozori, da se
// banka ne rascjepka na 'antibiotici' / 'antibiotik' / 'Antibiotici'.
function CategoryPicker({ categories, value, onChange, problem }) {
  const imena = categories.map((c) => c.name)
  const [rezimNova, setRezimNova] = useState(false)
  const [unos, setUnos] = useState('')

  const slug = normalizeCategory(unos)
  const vecPostoji = rezimNova && slug.length >= 3 && imena.includes(slug)
  const slicne = rezimNova && !vecPostoji ? similarCategories(slug, imena) : []

  function izaberi(v) {
    if (v === NOVA) {
      setRezimNova(true)
      setUnos('')
      onChange('')
    } else {
      setRezimNova(false)
      onChange(v)
    }
  }

  return (
    <>
      <label className="mt-4 block text-sm font-bold text-slate-600">Kategorija</label>
      <select
        value={rezimNova ? NOVA : value || ''}
        onChange={(e) => izaberi(e.target.value)}
        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-800 outline-none focus:border-teal-500"
      >
        <option value="" disabled>
          — odaberi kategoriju —
        </option>
        {categories.map((c) => (
          <option key={c.name} value={c.name}>
            {categoryLabel(c.name)} ({c.count})
          </option>
        ))}
        <option value={NOVA}>➕ Nova kategorija…</option>
      </select>

      {rezimNova && (
        <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-3">
          <input
            value={unos}
            onChange={(e) => {
              setUnos(e.target.value)
              onChange(normalizeCategory(e.target.value))
            }}
            autoFocus
            placeholder="npr. Klinička farmacija"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-teal-500"
          />
          {slug && (
            <p className="mt-2 text-xs text-slate-500">
              Sprema se kao: <code className="font-bold text-slate-700">{slug}</code>
            </p>
          )}
          {vecPostoji && (
            <p className="mt-2 text-sm font-medium text-amber-600">
              Ova kategorija već postoji — pitanje će joj se pridružiti.
            </p>
          )}
          {slicne.length > 0 && (
            <div className="mt-2 rounded-xl bg-amber-50 p-2.5">
              <p className="text-sm font-medium text-amber-700">
                Slično već postoji — možda si mislio/la na:
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {slicne.map((k) => (
                  <button
                    key={k}
                    onClick={() => izaberi(k)}
                    className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-teal-700 shadow-sm active:bg-teal-50"
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {problem && !rezimNova && !value && (
        <p className="mt-1.5 text-xs text-slate-400">
          Postojećih kategorija: {categories.length}. Novu dodaj samo ako nijedna ne odgovara.
        </p>
      )}
    </>
  )
}

function QuestionEditor({ entry, categories, onCancel, onSaved }) {
  const q = entry.question
  const isNew = !!entry.isNew
  const [text, setText] = useState(q.text || '')
  const [options, setOptions] = useState(() => [0, 1, 2, 3].map((i) => q.options?.[i] || ''))
  const [correctIndex, setCorrectIndex] = useState(entry.secret.correctIndex ?? 0)
  const [explanation, setExplanation] = useState(entry.secret.explanation || '')
  const [category, setCategory] = useState(normalizeCategory(q.category))
  const [difficulty, setDifficulty] = useState(q.difficulty || 2)
  const [points, setPoints] = useState(q.points || 10)
  const [active, setActive] = useState(q.active !== false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Kategorija se čuva kao normalizovan slug — provjeravamo samo da nije
  // prazna ili besmislena; poklapanje s postojećom je poželjno, ne greška.
  const categoryProblem = useMemo(() => {
    if (!category) return 'Odaberi kategoriju iz liste ili dodaj novu.'
    if (category.length < 3) return 'Naziv kategorije je prekratak.'
    return ''
  }, [category])

  function setOption(i, val) {
    setOptions((o) => o.map((x, idx) => (idx === i ? val : x)))
  }

  async function save() {
    setError('')
    if (text.trim().length < 10) return setError('Tekst pitanja je prekratak.')
    if (options.some((o) => !o.trim())) return setError('Sve 4 opcije moraju biti popunjene.')
    if (!explanation.trim()) return setError('Objašnjenje ne smije biti prazno.')
    if (categoryProblem) return setError(categoryProblem)
    setSaving(true)
    try {
      const pub = {
        text: text.trim(),
        options: options.map((o) => o.trim()),
        category: normalizeCategory(category),
        difficulty: Number(difficulty) || 2,
        points: Number(points) || 10,
        active,
      }
      const secret = { correctIndex, explanation: explanation.trim() }
      if (isNew) {
        const id = await createQuestion(pub, secret)
        onSaved({ id, ...pub }, true)
      } else {
        await saveQuestion(q.id, pub, secret)
        onSaved({ ...q, ...pub }, false)
      }
    } catch (e) {
      setError('Greška pri spremanju: ' + (e?.message || 'pokušaj ponovo'))
      setSaving(false)
    }
  }

  return (
    <div className="min-h-svh bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <button onClick={onCancel} className="text-sm font-bold text-slate-500">← Nazad</button>
        <span className="text-xs text-slate-400">{q.id || 'novo'}</span>
      </div>
      <h1 className="mt-2 font-title text-xl font-extrabold text-slate-900">
        {isNew ? 'Novo pitanje' : 'Uredi pitanje'}
      </h1>

      <label className="mt-4 block text-sm font-bold text-slate-600">Tekst pitanja</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-800 outline-none focus:border-teal-500"
      />

      <label className="mt-4 block text-sm font-bold text-slate-600">
        Opcije <span className="font-normal text-slate-400">(označi tačnu)</span>
      </label>
      <div className="mt-1 flex flex-col gap-2">
        {options.map((opt, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 rounded-2xl border-2 bg-white p-2 ${
              correctIndex === i ? 'border-emerald-500' : 'border-slate-200'
            }`}
          >
            <button
              onClick={() => setCorrectIndex(i)}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 font-bold ${
                correctIndex === i ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 text-slate-400'
              }`}
              aria-label={`Označi ${LETTERS[i]} kao tačan`}
            >
              {correctIndex === i ? '✓' : LETTERS[i]}
            </button>
            <input
              value={opt}
              onChange={(e) => setOption(i, e.target.value)}
              className="flex-1 bg-transparent text-slate-800 outline-none"
            />
          </div>
        ))}
      </div>

      <label className="mt-4 block text-sm font-bold text-slate-600">Objašnjenje</label>
      <textarea
        value={explanation}
        onChange={(e) => setExplanation(e.target.value)}
        rows={4}
        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-800 outline-none focus:border-teal-500"
      />

      <CategoryPicker
        categories={categories}
        value={category}
        onChange={setCategory}
        problem={categoryProblem}
      />

      <div className="mt-4 flex items-center gap-3">
        <div className="flex-1">
          <label className="block text-sm font-bold text-slate-600">Težina</label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-800 outline-none focus:border-teal-500"
          >
            <option value={1}>1 — lako</option>
            <option value={2}>2 — srednje</option>
            <option value={3}>3 — teško</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-bold text-slate-600">Bodovi (XP)</label>
          <input
            type="number"
            min={1}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-800 outline-none focus:border-teal-500"
          />
        </div>
        <label className="mt-6 flex items-center gap-2 text-sm font-bold text-slate-600">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-5" />
          Aktivno
        </label>
      </div>

      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

      <button
        onClick={save}
        disabled={saving}
        className="mt-5 w-full rounded-2xl bg-teal-700 py-4 font-title text-lg font-extrabold text-white shadow-md active:bg-teal-800 disabled:opacity-60"
      >
        {saving ? 'Spremam…' : isNew ? 'Kreiraj pitanje' : 'Spremi izmjene'}
      </button>
    </div>
  )
}
