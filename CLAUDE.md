# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # install dependencies
npm run dev        # dev server (also regenerates icons)
npm run build      # production build → dist/
npm run preview    # serve the production build locally
```

There are no tests. Type-checking runs as part of `npm run build` (via `tsc`).

To test on a phone during development, open the network URL that Vite prints (e.g. `http://192.168.x.x:5173`). Motion sensors require HTTPS or localhost — the Vite network URL works over HTTP only on the same LAN; for HTTPS use `vite --https` or tunnel.

## Architecture

This is a vanilla TypeScript PWA with no framework. Entry point is `src/main.ts`, which wires DOM elements to a `Game` instance and handles all UI state directly. There is no virtual DOM or component system — UI updates are imperative DOM mutations.

### Key modules

- **`src/game.ts`** — `Game` class orchestrates a full round: deck loading, countdown, timer, guess recording, and screen transitions. It owns a `TiltDetector` and a `HeadPositionMonitor` and drives them via callbacks (`GameCallbacks`).
- **`src/tilt.ts`** — `TiltDetector` listens to `deviceorientation` events, auto-calibrates a `beta` baseline when `startCalibration()` is called, then fires `"correct"` or `"pass"` when `beta` drifts past thresholds. Uses `beta` (front-back tilt) as the primary axis.
- **`src/headPosition.ts`** — `HeadPositionMonitor` uses both `beta` and `gamma` to detect when the phone is landscape + held to the forehead. Emits `HeadPositionState` on every orientation event. Auto-calibrates after 18 steady samples matching the forehead heuristic.
- **`src/decks.ts`** — fetches `/decks/index.json` manifest and individual `.txt` deck files; polls for changes every 2 s in dev.
- **`src/main.ts`** — all DOM bindings, screen switching (`showScreen`), and motion permission prompt for iOS.

### Orientation axes (DeviceOrientation API)

The game is played in **landscape** with the phone held flat against the forehead (screen facing away from the player):

- **`beta`** — front-back tilt (−180 to 180). In the forehead-landscape resting pose this is near 0 (phone roughly horizontal). Tilting the top of the phone **down** (chin direction) goes negative; tilting **up** goes positive.
- **`gamma`** — left-right tilt (−90 to 90). In landscape it reads near ±90.

`src/orientation.ts` defines the landscape-forehead pose (`gamma` ≈ ±90, `beta` ≈ 0) used by both `HeadPositionMonitor` and `TiltDetector`. Tilt baseline is sampled only in that pose; `beginPlay()` calls `recalibrate()` so the resting nod axis matches the forehead hold.

### Deck files

Add `.txt` files to `decks/` (one entry per line; lines starting with `#` are comments). The `scripts/generate-icons.mjs` script regenerates `decks/index.json` from the directory contents as part of `npm run dev` / `npm run build`.

### PWA

Configured via `vite-plugin-pwa` in `vite.config.ts`. Service worker is registered in `main.ts` via `virtual:pwa-register`. Run `npm run build && npm run preview` to test the installed PWA experience.
