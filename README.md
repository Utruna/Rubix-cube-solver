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

### Detection avancee en mode debug

Le mode `Debug live` peut utiliser un modele vision local via Ollama pour mieux suivre les couleurs ternies et les cas ambigus.

Variables d'environnement utiles:

- `DETECTOR_PROVIDER=auto` ou `classic`
- `OLLAMA_BASE_URL=http://localhost:11434` en local, ou `http://host.docker.internal:11434` si le backend tourne dans Docker Desktop
- `OLLAMA_VISION_MODEL=qwen2.5vl:7b` ou un autre modele vision disponible localement
- `OLLAMA_TIMEOUT_SECONDS=12` pour eviter d'attendre une minute avant fallback si Ollama ne repond pas

Pour un mode modele optimise (moins de faux positifs qu'un fallback classique seul):

- `DETECTOR_PROVIDER=auto`
- `OLLAMA_VISION_MODEL=qwen2.5vl:7b`
- `OLLAMA_BASE_URL=http://host.docker.internal:11434` (backend Docker sur Windows)

Installer le modele:

ollama pull qwen2.5vl:7b

Si Ollama n'est pas disponible, le backend retombe automatiquement sur la detection classique.

Si tu lances le backend dans Docker sur Windows, Ollama doit etre joignable depuis le conteneur via `http://host.docker.internal:11434`.

Si tu lances le backend Docker depuis `backend/`, utilise bien le port Flask et un tag d'image explicite:

```bash
docker build -t rubix-cube-solver-backend ./backend
docker run --name rubix-cube-solver-backend -p 5000:5000 rubix-cube-solver-backend

# Pour un retour visuel instantane en debug (sans attente Ollama)
docker run --name rubix-cube-solver-backend -e DETECTOR_PROVIDER=classic -p 5000:5000 rubix-cube-solver-backend

# Pour forcer le mode modele vision optimise (Ollama)
docker run --name rubix-cube-solver-backend -e DETECTOR_PROVIDER=auto -e OLLAMA_BASE_URL=http://host.docker.internal:11434 -e OLLAMA_VISION_MODEL=qwen2.5vl:7b -e OLLAMA_TIMEOUT_SECONDS=10 -p 5000:5000 rubix-cube-solver-backend
```

## Build de production

```bash
npm run build
npm run preview
```

## Docker (mode production)

Le projet est dockerise avec un build multi-stage:

- stage 1: build Vite avec Node.js
- stage 2: service statique avec Nginx

Prerequis: Docker Desktop (ou Docker Engine) doit etre installe et lance.

### Construire l'image

```bash
docker build -t rubix-cube-solver .
```

### Lancer le conteneur

```bash
docker run --name rubix-cube-solver -p 8080:80 rubix-cube-solver
```

Cette commande concerne le conteneur frontend Nginx, pas le backend Flask.

Application disponible sur:

http://localhost:8080

### Arreter et supprimer le conteneur

```bash
docker stop rubix-cube-solver
docker rm rubix-cube-solver
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
