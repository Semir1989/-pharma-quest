// Zajednički helper: podigni config/content.version.
//
// Klijent drži taskove, bedževe i XP krivu u localStorage i svježinu provjerava
// TIM jednim dokumentom (src/utils/kesSadrzaja.js). Svaka skripta koja mijenja
// taj sadržaj mora na kraju pozvati oznaciIzmjenuSadrzaja(db) — inače igrači do
// sljedećeg čišćenja keša gledaju stare questove i bedževe.

export async function oznaciIzmjenuSadrzaja(db) {
  const version = Date.now()
  await db.doc('config/content').set({ version, updatedAt: new Date() }, { merge: true })
  console.log(`✓ config/content.version = ${version} (keš igrača će se osvježiti)`)
  return version
}
