import type { CubeState, Face } from '../../cube/types'
import { FACE_ORDER } from '../../cube/types'
import { applyMove } from '../../cube/moves'
import { createSolvedState, validateStateBasic } from '../../cube/state'

/**
 * Représentation « cubies » d'un 3x3 (positions + orientations des 8 coins et 12 arêtes).
 *
 * Coins  : URF UFL ULB UBR DFR DLF DBL DRB   (0..7)
 * Arêtes : UR UF UL UB DR DF DL DB FR FL BL BR (0..11)
 *
 * `cp[i]` / `ep[i]` : pièce présente à la position i.
 * `co[i]` / `eo[i]` : orientation de la pièce à la position i.
 */
export interface CubieCube {
  cp: number[]
  co: number[]
  ep: number[]
  eo: number[]
}

export type InvalidCubeCode =
  | 'bad-length'
  | 'bad-color-count'
  | 'bad-corner'
  | 'bad-edge'
  | 'twisted-corner'
  | 'flipped-edge'
  | 'parity'

export class InvalidCubeError extends Error {
  readonly code: InvalidCubeCode
  constructor(code: InvalidCubeCode, message: string) {
    super(message)
    this.name = 'InvalidCubeError'
    this.code = code
  }
}

// Indices des stickers (ordre U R F D L B, 9 par face, lecture ligne par ligne :
// c'est exactement la disposition de `CubeState`).
const CORNER_FACELETS: number[][] = [
  [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
  [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51],
]
const EDGE_FACELETS: number[][] = [
  [5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25],
  [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14],
]
const CORNER_COLORS: Face[][] = [
  ['U', 'R', 'F'], ['U', 'F', 'L'], ['U', 'L', 'B'], ['U', 'B', 'R'],
  ['D', 'F', 'R'], ['D', 'L', 'F'], ['D', 'B', 'L'], ['D', 'R', 'B'],
]
const EDGE_COLORS: Face[][] = [
  ['U', 'R'], ['U', 'F'], ['U', 'L'], ['U', 'B'], ['D', 'R'], ['D', 'F'],
  ['D', 'L'], ['D', 'B'], ['F', 'R'], ['F', 'L'], ['B', 'L'], ['B', 'R'],
]

export function identityCube(): CubieCube {
  return {
    cp: [0, 1, 2, 3, 4, 5, 6, 7],
    co: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  }
}

/** Composition : `multiply(a, b)` = état obtenu en appliquant `a` puis `b`. */
export function multiply(a: CubieCube, b: CubieCube): CubieCube {
  const out = identityCube()
  for (let i = 0; i < 8; i++) {
    out.cp[i] = a.cp[b.cp[i]]
    out.co[i] = (a.co[b.cp[i]] + b.co[i]) % 3
  }
  for (let i = 0; i < 12; i++) {
    out.ep[i] = a.ep[b.ep[i]]
    out.eo[i] = (a.eo[b.ep[i]] + b.eo[i]) % 2
  }
  return out
}

export function inverse(c: CubieCube): CubieCube {
  const out = identityCube()
  for (let i = 0; i < 8; i++) {
    out.cp[c.cp[i]] = i
    out.co[c.cp[i]] = (3 - c.co[i]) % 3
  }
  for (let i = 0; i < 12; i++) {
    out.ep[c.ep[i]] = i
    out.eo[c.ep[i]] = c.eo[i]
  }
  return out
}

export function permutationParity(perm: number[]): number {
  let inversions = 0
  for (let i = 0; i < perm.length; i++) {
    for (let j = i + 1; j < perm.length; j++) {
      if (perm[i] > perm[j]) inversions++
    }
  }
  return inversions & 1
}

/** Vérifie qu'un cube est atteignable par des mouvements légaux (sinon lève une `InvalidCubeError`). */
export function assertSolvable(c: CubieCube): void {
  if (c.co.reduce((a, b) => a + b, 0) % 3 !== 0) {
    throw new InvalidCubeError('twisted-corner', 'One corner is twisted in place (invalid cube).')
  }
  if (c.eo.reduce((a, b) => a + b, 0) % 2 !== 0) {
    throw new InvalidCubeError('flipped-edge', 'One edge is flipped in place (invalid cube).')
  }
  if (permutationParity(c.cp) !== permutationParity(c.ep)) {
    throw new InvalidCubeError('parity', 'Two pieces are swapped (invalid cube).')
  }
}

/** Décode les 54 stickers en cubies. Lève une `InvalidCubeError` si l'état est incohérent. */
export function fromFacelets(state: CubeState): CubieCube {
  if (state.length !== 54) throw new InvalidCubeError('bad-length', 'A 3x3 cube needs 54 stickers.')
  if (!validateStateBasic(state, 3)) {
    throw new InvalidCubeError('bad-color-count', 'Each color must appear exactly 9 times.')
  }

  const cube = identityCube()
  const seenCorners = new Set<number>()
  const seenEdges = new Set<number>()

  for (let pos = 0; pos < 8; pos++) {
    const f = CORNER_FACELETS[pos]
    let ori = 0
    while (ori < 3 && state[f[ori]] !== 'U' && state[f[ori]] !== 'D') ori++
    if (ori === 3) throw new InvalidCubeError('bad-corner', `Invalid corner at position ${pos}.`)
    const c1 = state[f[(ori + 1) % 3]]
    const c2 = state[f[(ori + 2) % 3]]
    const piece = CORNER_COLORS.findIndex(col => col[1] === c1 && col[2] === c2 && col[0] === state[f[ori]])
    if (piece < 0 || seenCorners.has(piece)) {
      throw new InvalidCubeError('bad-corner', `Invalid corner at position ${pos}.`)
    }
    seenCorners.add(piece)
    cube.cp[pos] = piece
    cube.co[pos] = ori
  }

  for (let pos = 0; pos < 12; pos++) {
    const [a, b] = EDGE_FACELETS[pos].map(i => state[i])
    let found = false
    for (let piece = 0; piece < 12 && !found; piece++) {
      const [x, y] = EDGE_COLORS[piece]
      if (a === x && b === y) { cube.ep[pos] = piece; cube.eo[pos] = 0; found = true }
      else if (a === y && b === x) { cube.ep[pos] = piece; cube.eo[pos] = 1; found = true }
    }
    if (!found || seenEdges.has(cube.ep[pos])) {
      throw new InvalidCubeError('bad-edge', `Invalid edge at position ${pos}.`)
    }
    seenEdges.add(cube.ep[pos])
  }

  assertSolvable(cube)
  return cube
}

/** Reconstruit les 54 stickers à partir des cubies (utile pour les tests et le debug). */
export function toFacelets(cube: CubieCube): CubeState {
  const out: Face[] = new Array(54)
  FACE_ORDER.forEach((face, f) => { out[f * 9 + 4] = face })
  for (let pos = 0; pos < 8; pos++) {
    for (let k = 0; k < 3; k++) {
      out[CORNER_FACELETS[pos][(k + cube.co[pos]) % 3]] = CORNER_COLORS[cube.cp[pos]][k]
    }
  }
  for (let pos = 0; pos < 12; pos++) {
    for (let k = 0; k < 2; k++) {
      out[EDGE_FACELETS[pos][(k + cube.eo[pos]) % 2]] = EDGE_COLORS[cube.ep[pos]][k]
    }
  }
  return out
}

/**
 * Les 18 mouvements (U U2 U' R R2 R' F … L … B …), indice = 3 * face + puissance
 * avec face dans l'ordre U R F D L B et puissance 0 = quart de tour, 1 = demi-tour, 2 = inverse.
 *
 * Ils sont dérivés du moteur de mouvements de l'application (`applyMove`) :
 * le solveur parle donc toujours exactement la même convention que l'animation.
 */
export const MOVE_CUBES: CubieCube[] = (() => {
  const solved = createSolvedState(3)
  const cubes: CubieCube[] = []
  for (const face of FACE_ORDER) {
    const quarter = fromFacelets(applyMove(solved, { face, modifier: '' }, 3))
    const half = multiply(quarter, quarter)
    cubes.push(quarter, half, multiply(half, quarter))
  }
  return cubes
})()

export function isIdentity(c: CubieCube): boolean {
  const id = identityCube()
  return c.cp.every((v, i) => v === id.cp[i]) && c.co.every(v => v === 0) &&
    c.ep.every((v, i) => v === id.ep[i]) && c.eo.every(v => v === 0)
}
