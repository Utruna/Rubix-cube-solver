# Rubik's Cube Solver

A fully interactive Rubik's Cube solver built with **Vite + React + TypeScript**.

## Features

- 🎲 **3D Cube View** — Interactive WebGL rendering via `@react-three/fiber` with drag-to-rotate
- 🗺️ **2D Net View** — Flat unfolded cube diagram using SVG
- 🔀 **Scramble** — Generates a random 25-move scramble sequence
- 🧠 **Solve** — Computes the optimal solution using `cubejs` (Kociemba algorithm) in a Web Worker so the UI stays responsive
- ▶️ **Animated Playback** — Step through the solution move-by-move, forward or backward, with adjustable speed
- 🌐 **i18n** — English / French language toggle via `i18next`

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| Build Tool | Vite 6 |
| 3D Rendering | Three.js + `@react-three/fiber` + `@react-three/drei` |
| State Management | Zustand |
| Solver | `cubejs` (Kociemba two-phase) in a Web Worker |
| i18n | `i18next` + `react-i18next` |

## Architecture

```
src/
├── cube/          # Pure cube logic (types, state, moves, notation, scramble)
├── solver/        # Web Worker wrapper + cubejs adapter
├── store/         # Zustand store (cube state, animation, solver status)
├── components/    # Cube3D, CubeNet, AnimationControls
├── i18n/          # i18next setup + locale JSON files (en, fr)
├── App.tsx        # Root component
└── main.tsx       # Entry point
```

The cube state is a flat 54-element array of face labels (`U R F D L B`), six stickers per face in row-major order. The solver runs entirely in a background Web Worker to avoid blocking the main thread.

## Getting Started

```bash
npm install
npm run dev      # development server at http://localhost:5173
npm run build    # production build → dist/
npm run preview  # preview production build
```

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | TypeScript check + Vite production build |
| `npm run preview` | Serve the `dist/` folder |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
