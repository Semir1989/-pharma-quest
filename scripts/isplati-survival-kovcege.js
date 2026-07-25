// Jednokratna isplata zaostalih kovčega na ljestvici Preživljavanja.
//
// Bonus za svaki 10. korak niza (10 → +100 XP, 20 → +200 …) uveden je nakon
// što su neki igrači te pragove već prešli — server ih plaća tek u trenutku
// prelaska, pa im retroaktivno ne bi došlo ništa. Ova skripta prolazi
// survivalRuns tekuće sedmice i doplaćuje razliku.
//
// Idempotentna: u survivalRuns/{uid}.chestPaid pamti najviši isplaćeni prag,
// pa ponovno pokretanje ne plaća dvaput.
//
// Pokretanje:  node scripts/isplati-survival-kovcege.js [--stvarno]
// Bez --stvarno samo ispiše šta bi uradila (suhi hod).

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const serviceAccount = require('./serviceAccountKey.json')
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

const CHEST_STEP = 10
const MAX_STEP = 100
const stvarno = process.argv.includes('--stvarno')

// Doslovna kopija survivalWeekKey iz functions/index.js — sedmica počinje
// SRIJEDOM, UTC-bazirano (da klijent i server uvijek dobiju isti ključ).
function survivalWeekKey(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const diff = (date.getUTCDay() - 3 + 7) % 7 // srijeda = 3
  date.setUTCDate(date.getUTCDate() - diff)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

// Zbir svih kovčega do datog niza: 100 + 200 + … za svaki pređeni prag.
function ukupnoZaNiz(streak) {
  let sum = 0
  for (let s = CHEST_STEP; s <= Math.min(streak, MAX_STEP); s += CHEST_STEP) {
    sum += (s / CHEST_STEP) * 100
  }
  return sum
}

const week = survivalWeekKey()
console.log(`Sedmica: ${week}${stvarno ? '' : '  (SUHI HOD — ništa se ne upisuje)'}\n`)

const runs = await db.collection('survivalRuns').get()
let ukupno = 0
let pogodjenih = 0

for (const doc of runs.docs) {
  const run = doc.data()
  if (run.week !== week) continue
  const streak = run.streak || 0
  const vecPlaceno = run.chestPaid || 0
  if (streak < CHEST_STEP) continue

  const duguje = ukupnoZaNiz(streak) - ukupnoZaNiz(vecPlaceno)
  if (duguje <= 0) continue

  const noviPrag = Math.min(Math.floor(streak / CHEST_STEP) * CHEST_STEP, MAX_STEP)
  const user = await db.doc(`users/${doc.id}`).get()
  const ime = user.exists ? user.data().displayName : '(nepoznat)'
  console.log(`${ime}: niz ${streak} → +${duguje} XP (pragovi do ${noviPrag})`)
  ukupno += duguje
  pogodjenih++

  if (!stvarno) continue

  await db.runTransaction(async (tx) => {
    const us = await tx.get(db.doc(`users/${doc.id}`))
    if (!us.exists) return
    tx.update(db.doc(`users/${doc.id}`), { xp: (us.data().xp || 0) + duguje })
  })
  await doc.ref.update({ chestPaid: noviPrag })
}

console.log(`\nUkupno: ${ukupno} XP na ${pogodjenih} nalog(a).`)
if (!stvarno) console.log('Za pravu isplatu: node scripts/isplati-survival-kovcege.js --stvarno')
process.exit(0)
