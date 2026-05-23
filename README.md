# Rubik's Cube Solver

Application interactive de Rubik's Cube construite avec Vite, React et TypeScript.

## Fonctionnalites

- Vue 3D interactive (drag + zoom) via Three.js et React Three Fiber
- Vue 2D (net) en SVG
- Support des tailles 2x2, 3x3, 4x4 et 5x5
- Scramble adapte a la taille du cube
	- 4x4 et 5x5: mouvements wide (Rw, Uw, etc.) pour melanger les centres
- Resolution dans un Web Worker (UI non bloquante)
- Lecture animee de la solution (pas a pas, vitesse reglable)
- Bascule de langue EN/FR

## Comportement du solver

Le solver interne fonctionne en deux etapes:

1. Strategie principale: inversion du scramble
2. Fallback borne (actif en 3x3)

Implication pratique:

- Si le cube vient du bouton Scramble de l'application, la resolution fonctionne de maniere fiable
- Pour des etats arbitraires complexes (notamment 4x4/5x5), le fallback peut ne pas trouver de solution

## Stack technique

| Couche | Technologie |
|---|---|
| Framework | React 18 + TypeScript |
| Build Tool | Vite 6 |
| 3D | Three.js + @react-three/fiber |
| Etat global | React Context + useReducer |
| i18n | Systeme interne React Context |
| Solver | Web Worker + moteur interne |

## Architecture

```text
src/
├── components/    # Cube3D, CubeNet, AnimationControls
├── cube/          # Types, etat NxN, moves, notation, scramble
├── i18n/          # Provider/hook de traduction + locales EN/FR
├── solver/        # Worker de resolution + hook useSolver
├── store/         # Store global React Context + useReducer
├── App.tsx        # UI principale
└── main.tsx       # Bootstrap React
```

## Installation

```bash
npm install
```

## Lancer le projet

```bash
npm run dev
```

Serveur local: http://localhost:5173

## Build de production

```bash
npm run build
npm run preview
```

## Scripts disponibles

| Script | Description |
|---|---|
| npm run dev | Lance le serveur de developpement |
| npm run build | Verifie TypeScript et construit la version production |
| npm run preview | Sert le dossier dist localement |
| npm run lint | Lance ESLint |
| npm run format | Formate les fichiers source avec Prettier |

## Documentation complementaire

- Librairies et dependances: docs/libraries.md
- Resume des changements: doc/change.rm
