import { collection, getDocs, doc, getDoc, updateDoc, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../firebase'

// Indeks banke (bank/index) je ono iz čega server bira pitanja. Svaka izmjena
// pitanja mora ga obnoviti, inače nova pitanja ne uđu u kviz. Gradi ga server.
const rebuildBankIndexFn = httpsCallable(functions, 'adminRebuildBankIndex')
export async function rebuildBankIndex() {
  const res = await rebuildBankIndexFn()
  return res.data?.count ?? 0
}

// Admin servis (Etapa 8) — puni pristup banci pitanja za administratore.
// Pravila (firestore.rules) dozvoljavaju write na questions/questionSecrets samo
// korisniku s custom claimom admin:true.

// Sva pitanja (javni dio), sortirana po kategoriji pa tekstu.
export async function getAllQuestions() {
  const snap = await getDocs(collection(db, 'questions'))
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.text || '').localeCompare(b.text || ''))
}

// Tajni dio jednog pitanja (tačan odgovor + objašnjenje).
export async function getQuestionSecret(id) {
  const s = await getDoc(doc(db, 'questionSecrets', id))
  return s.exists() ? s.data() : { correctIndex: 0, explanation: '' }
}

// Spremi izmjene: javni dio u questions/{id}, tajni u questionSecrets/{id},
// pa obnovi indeks. Greška u obnovi se NE guta — bolje da admin ponovi
// snimanje (idempotentno je) nego da izmjena tiho ostane van izbora pitanja.
export async function saveQuestion(id, pub, secret) {
  await updateDoc(doc(db, 'questions', id), { ...pub, updatedAt: new Date() })
  await setDoc(doc(db, 'questionSecrets', id), secret, { merge: true })
  await rebuildBankIndex()
}

// ID pitanja = hash teksta (isto kao import skripta) → isti tekst = isti dokument
// (nema duplikata, ponovni unos ažurira).
async function sha1Id(text) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text.trim().toLowerCase()))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 20)
}

// Kreiraj novo pitanje (javni + tajni dio). Vraća id novog dokumenta.
export async function createQuestion(pub, secret) {
  const id = await sha1Id(pub.text)
  await setDoc(doc(db, 'questions', id), { ...pub, active: pub.active !== false, updatedAt: new Date() })
  await setDoc(doc(db, 'questionSecrets', id), secret)
  await rebuildBankIndex()
  return id
}
