import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getAllQuestions, getQuestionSecret, saveQuestion } from '../services/admin'

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

  function onSaved(updated) {
    setQuestions((list) => list.map((q) => (q.id === updated.id ? updated : q)))
    setEditing(null)
  }

  if (editing) {
    return <QuestionEditor entry={editing} onCancel={() => setEditing(null)} onSaved={onSaved} />
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

      <input
        type="text"
        placeholder="Pretraži po tekstu, kategoriji ili opciji…"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-800 outline-none focus:border-teal-500"
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

const LETTERS = ['A', 'B', 'C', 'D']

function QuestionEditor({ entry, onCancel, onSaved }) {
  const q = entry.question
  const [text, setText] = useState(q.text || '')
  const [options, setOptions] = useState(() => [0, 1, 2, 3].map((i) => q.options?.[i] || ''))
  const [correctIndex, setCorrectIndex] = useState(entry.secret.correctIndex ?? 0)
  const [explanation, setExplanation] = useState(entry.secret.explanation || '')
  const [category, setCategory] = useState(q.category || '')
  const [active, setActive] = useState(q.active !== false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function setOption(i, val) {
    setOptions((o) => o.map((x, idx) => (idx === i ? val : x)))
  }

  async function save() {
    setError('')
    if (text.trim().length < 10) return setError('Tekst pitanja je prekratak.')
    if (options.some((o) => !o.trim())) return setError('Sve 4 opcije moraju biti popunjene.')
    if (!explanation.trim()) return setError('Objašnjenje ne smije biti prazno.')
    setSaving(true)
    try {
      const pub = {
        text: text.trim(),
        options: options.map((o) => o.trim()),
        category: category.trim().toLowerCase(),
        active,
      }
      const secret = { correctIndex, explanation: explanation.trim() }
      await saveQuestion(q.id, pub, secret)
      onSaved({ ...q, ...pub })
    } catch (e) {
      setError('Greška pri spremanju: ' + (e?.message || 'pokušaj ponovo'))
      setSaving(false)
    }
  }

  return (
    <div className="min-h-svh bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <button onClick={onCancel} className="text-sm font-bold text-slate-500">← Nazad</button>
        <span className="text-xs text-slate-400">{q.id}</span>
      </div>
      <h1 className="mt-2 font-title text-xl font-extrabold text-slate-900">Uredi pitanje</h1>

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

      <div className="mt-4 flex items-center gap-3">
        <div className="flex-1">
          <label className="block text-sm font-bold text-slate-600">Kategorija</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
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
        {saving ? 'Spremam…' : 'Spremi izmjene'}
      </button>
    </div>
  )
}
