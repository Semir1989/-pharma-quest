# CLAUDE.md

Ovaj fajl daje Claude Code kontekst za rad na projektu.

## Šta je Pharma Quest

PWA edukativna igra za farmaceute (Edu Pharma Community). Korisnici rješavaju
kvizove iz stručne farmaceutske literature, sakupljaju XP, prelaze levele,
prate dnevne/sedmične/mjesečne taskove (questove) i takmiče se na leaderboardu.

## Stack

- React + Vite + Tailwind CSS v4 (`@tailwindcss/vite`)
- Firebase: Authentication (Email/Password), Firestore (profili, pitanja,
  taskovi), Realtime Database (live leaderboard), Cloud Functions (bodovanje,
  planirano u kasnijoj etapi)
- react-router-dom (routing), framer-motion (animacije)
- vite-plugin-pwa (instalabilna aplikacija, planirano kasnije)

## Dizajn

- Boje: teal `#0F766E` (primarna), zlatna `#D97706` (akcenti/XP/nagrade)
- Mobile-first, referentni frame iPhone 14 (390×844)
- Bottom navigacija, 5 tabova: Home, Kviz, Questovi, Klan, Profil
- Dizajn reference (screenshotovi) čuvaju se u `Desktop/EPC igrica/`

## Struktura foldera

```
src/
  components/   deljene komponente (BottomNav, itd.)
  pages/        po jedna stranica po ruti (Home, Kviz, Questovi, Klan, Profil)
  firebase.js   Firebase inicijalizacija (čita ključeve iz .env)
```

## Pravila rada

1. Jedan mali korak odjednom — jedan modul/ekran po zahtjevu, ne cijela igra.
2. Poslije svakog koraka koji radi: test u browseru pa git commit.
3. Bodovanje i tačni odgovori nikad ne smiju biti vidljivi na klijentu prije
   nego korisnik odgovori (server-side provjera dolazi u kasnijoj etapi).
4. Firestore Security Rules: korisnik čita/piše samo svoje dokumente; pitanja
   su read-only; XP polja mijenja samo server. Nikad `allow all`.
5. Firebase ključevi idu u `.env` (vidi `.env.example`), nikad hardkodovani.
