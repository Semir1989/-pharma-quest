// Prevodi Firebase Auth kodove grešaka u poruke na bosanskom.
export function authErrorToBosnian(code) {
  const map = {
    'auth/invalid-email': 'Email adresa nije ispravna.',
    'auth/user-disabled': 'Ovaj nalog je onemogućen.',
    'auth/user-not-found': 'Ne postoji nalog s ovom email adresom.',
    'auth/wrong-password': 'Pogrešna lozinka.',
    'auth/invalid-credential': 'Pogrešan email ili lozinka.',
    'auth/email-already-in-use': 'Već postoji nalog s ovom email adresom.',
    'auth/weak-password': 'Lozinka mora imati najmanje 6 znakova.',
    'auth/missing-password': 'Unesite lozinku.',
    'auth/too-many-requests': 'Previše pokušaja. Pokušajte ponovo kasnije.',
    'auth/network-request-failed': 'Greška u vezi. Provjerite internet.',
  }
  return map[code] || 'Došlo je do greške. Pokušajte ponovo.'
}
