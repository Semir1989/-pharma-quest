import { collection, getDocs, doc, getDoc, updateDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

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

// Spremi izmjene: javni dio u questions/{id}, tajni u questionSecrets/{id}.
export async function saveQuestion(id, pub, secret) {
  await updateDoc(doc(db, 'questions', id), { ...pub, updatedAt: new Date() })
  await setDoc(doc(db, 'questionSecrets', id), secret, { merge: true })
}
