import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'

// Servis za banku pitanja (Modul 3). Koristi ga kviz engine (Modul 4).
// NAPOMENA: dokumenti sadrže correctIndex — UI ga ne smije koristiti/prikazati
// prije nego korisnik odgovori (server-side provjera dolazi u Etapi 6).

// Sva aktivna pitanja (opciono filtrirana po kategoriji).
export async function getQuestions(category = null) {
  const col = collection(db, 'questions')
  const constraints = [where('active', '==', true)]
  if (category) constraints.push(where('category', '==', category))
  const snap = await getDocs(query(col, ...constraints))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

// Nasumičnih `count` pitanja (Fisher-Yates shuffle).
export async function getRandomQuestions(count = 10, category = null) {
  const all = await getQuestions(category)
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[all[i], all[j]] = [all[j], all[i]]
  }
  return all.slice(0, count)
}
