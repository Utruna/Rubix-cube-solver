import type { CubeState, Face, Move } from '../../cube/types'
import { FACE_ORDER } from '../../cube/types'
import { axisCycleIndexMap } from '../../cube/moves'
import { fromFacelets, inverse } from './cubie'
import { twoPhaseSearch } from './search'
import { getTables } from './tables'

export { InvalidCubeError } from './cubie'

export interface Solve3x3Options {
  /** Temps de recherche (ms) réparti à parts égales entre les 6 « vues » du cube (la première solution est toujours trouvée). */
  timeLimitMs?: number
  /** Arrêt anticipé dès qu'une solution de cette longueur (ou moins) est trouvée. */
  targetLength?: number
}

export const DEFAULT_TIME_LIMIT_MS = 1500
export const DEFAULT_TARGET_LENGTH = 20

const MODIFIERS = ['', '2', "'"] as const
const AXIS_CYCLE = axisCycleIndexMap(3)
/** Face qui prend la place de `FACE_ORDER[f]` après une rotation du cube entier. */
const FACE_AFTER_CYCLE: Face[] = FACE_ORDER.map((_, f) => FACE_ORDER[(AXIS_CYCLE[f * 9 + 4] / 9) | 0])
const FACE_BEFORE_CYCLE = new Map<Face, Face>(FACE_AFTER_CYCLE.map((after, f) => [after, FACE_ORDER[f]]))

/** Le même cube vu après `turns` rotations du cube entier (couleurs renommées en conséquence). */
function rotateState(state: CubeState, turns: number): CubeState {
  let current = state
  for (let t = 0; t < turns; t++) {
    const next = new Array<Face>(54)
    for (let i = 0; i < 54; i++) next[AXIS_CYCLE[i]] = FACE_AFTER_CYCLE[FACE_ORDER.indexOf(current[i])]
    current = next
  }
  return current
}

/** Ramène un mouvement trouvé dans la vue tournée de `turns` rotations vers le cube d'origine. */
function unrotateFace(face: Face, turns: number): Face {
  for (let t = 0; t < turns; t++) face = FACE_BEFORE_CYCLE.get(face)!
  return face
}

/** Inverse une séquence d'indices de mouvements (ordre inversé, chaque mouvement inversé). */
function invertSequence(ids: number[]): number[] {
  return ids.map(id => id - (id % 3) + (2 - (id % 3))).reverse()
}

function toMoves(ids: number[], turns: number): Move[] {
  return ids.map(id => ({
    face: unrotateFace(FACE_ORDER[(id / 3) | 0], turns),
    modifier: MODIFIERS[id % 3],
  }))
}

/**
 * Résout un 3x3 avec l'algorithme de Kociemba (deux phases).
 *
 * Le même état est cherché sous 6 angles : 3 orientations du cube × (cube, cube inverse).
 * Chaque angle explore des solutions différentes ; on garde la plus courte et la longueur
 * trouvée sert de borne aux angles suivants. Lève `InvalidCubeError` si l'état est impossible.
 */
export function solve3x3(state: CubeState, options: Solve3x3Options = {}): Move[] {
  const { timeLimitMs = DEFAULT_TIME_LIMIT_MS, targetLength = DEFAULT_TARGET_LENGTH } = options
  fromFacelets(state) // valide l'état avant d'investir dans les tables
  getTables()

  const views = 6
  const slice = timeLimitMs / views
  let best: Move[] | null = null

  for (let view = 0; view < views; view++) {
    const turns = view % 3
    const inverted = view >= 3
    const cube = fromFacelets(rotateState(state, turns))
    const found = twoPhaseSearch(inverted ? inverse(cube) : cube, {
      upperBound: best ? best.length : 31,
      targetLength,
      deadline: performance.now() + slice,
      requireSolution: best === null,
    })
    if (found) {
      best = toMoves(inverted ? invertSequence(found) : found, turns)
      if (best.length <= targetLength) break
    }
  }
  return best ?? []
}
