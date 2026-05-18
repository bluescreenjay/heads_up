# Heads Up! (PWA)

A party-game clone of **Heads Up!** — hold the phone to your forehead, get clues from friends, and **tilt down** for a correct guess or **tilt up** to pass.

## Quick start

```bash
npm install
npm run dev
```

Open the URL on your **phone** (same Wi‑Fi). Motion sensors require HTTPS or localhost; use the network URL Vite prints.

Install to home screen for the full PWA experience.

## Custom decks

Add `.txt` files to the [`decks/`](decks/) folder — **one word or phrase per line**. Lines starting with `#` are ignored.

Example: `decks/movies.txt` → shows up as **Movies** in the app.

While `npm run dev` is running, new or edited deck files are picked up automatically (the app polls the deck index every few seconds). After `npm run build`, deck files are copied into `dist/decks/`.

## Controls

| Action | Gesture |
|--------|---------|
| Correct | Tilt phone **down** (chin toward chest) |
| Pass | Tilt phone **up** |

On iOS, tap **Enable motion** when prompted — Safari requires permission for orientation events.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build to `dist/`
- `npm run preview` — serve the production build locally
