# Librairies du projet

Ce document résume les librairies actuellement utilisées dans le projet, ainsi que celles qui ont été retirées lors de la réduction des dépendances.

## Runtime (production)

### react
- Usage: rendu UI principal (composants, hooks, contexte).
- Fichier de base: src/main.tsx.

### react-dom
- Usage: montage de l'application React dans le DOM.
- Fichier de base: src/main.tsx.

### three
- Usage: moteur 3D pour l'affichage du Rubik's Cube.
- Utilisé via React Three Fiber dans les composants de rendu 3D.

### @react-three/fiber
- Usage: pont React vers Three.js.
- Permet de declarer la scene 3D avec des composants React.
- Composant principal: src/components/Cube3D.tsx.

## Developpement (outillage)

### typescript
- Usage: typage statique du code source.

### vite + @vitejs/plugin-react
- Usage: serveur de developpement et build de production.

### eslint + @eslint/js + typescript-eslint + eslint plugins
- Usage: verification qualite et style du code.

### prettier
- Usage: formatage automatique du code.

### @types/react, @types/react-dom, @types/three
- Usage: definitions de types pour TypeScript.

## Librairies retirees

Les librairies suivantes ont ete retirees et remplacees par du code interne:

### i18next + react-i18next
- Remplacees par un systeme de traduction base sur React Context.
- Reference: src/i18n/useTranslation.tsx.

### zustand
- Remplace par un store React Context + useReducer.
- Reference: src/store/cubeStore.tsx.

### @react-three/drei
- OrbitControls remplace par des controles custom (drag + zoom) dans la vue 3D.
- Reference: src/components/Cube3D.tsx.

### cubejs
- Remplace par:
  - un moteur de mouvements interne (permutations),
  - un solver worker base sur inversion du scramble + fallback borne.
- References: src/cube/moves.ts, src/solver/solver.worker.ts.

## Pourquoi cette reduction

- Reduire la surface de dependances externes.
- Mieux maitriser le comportement des mouvements/animations multi-tailles (2x2 a 5x5).
- Faciliter la maintenance du projet et les evolutions futures.
