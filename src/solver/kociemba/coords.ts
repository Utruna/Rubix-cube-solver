import type { CubieCube } from './cubie'
import { MOVE_CUBES } from './cubie'

/**
 * Coordonnées de l'algorithme à deux phases.
 *
 * Phase 1 : amener le cube dans le sous-groupe H = <U, D, R2, L2, F2, B2>
 *           (twist = 0, flip = 0, arêtes de la tranche médiane dans la tranche).
 * Phase 2 : résoudre dans H avec uniquement les 10 mouvements de H.
 */

export const N_TWIST = 2187 // 3^7
export const N_FLIP = 2048 // 2^11
export const N_SLICE = 495 // C(12, 4)
export const N_PERM8 = 40320 // 8!
export const N_PERM4 = 24 // 4!
export const N_MOVES = 18

/** Mouvements de la phase 2 : U U2 U' D D2 D' R2 L2 F2 B2 (indices dans MOVE_CUBES). */
export const PHASE2_MOVES = [0, 1, 2, 9, 10, 11, 4, 13, 7, 16]
export const N_PHASE2_MOVES = PHASE2_MOVES.length

const FACTORIAL = [1, 1, 2, 6, 24, 120, 720, 5040]

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return Math.round(r)
}

// ---- Coordonnées d'orientation -------------------------------------------------------------

export function getTwist(co: number[]): number {
  let r = 0
  for (let i = 0; i < 7; i++) r = r * 3 + co[i]
  return r
}

function setTwist(twist: number): number[] {
  const co = new Array<number>(8).fill(0)
  let sum = 0
  for (let i = 6; i >= 0; i--) {
    co[i] = twist % 3
    sum += co[i]
    twist = Math.floor(twist / 3)
  }
  co[7] = (3 - (sum % 3)) % 3
  return co
}

export function getFlip(eo: number[]): number {
  let r = 0
  for (let i = 0; i < 11; i++) r = r * 2 + eo[i]
  return r
}

function setFlip(flip: number): number[] {
  const eo = new Array<number>(12).fill(0)
  let sum = 0
  for (let i = 10; i >= 0; i--) {
    eo[i] = flip % 2
    sum += eo[i]
    flip = Math.floor(flip / 2)
  }
  eo[11] = sum % 2
  return eo
}

// ---- Tranche médiane (position des 4 arêtes FR FL BL BR, sans leur ordre) -----------------------

export function getSlice(ep: number[]): number {
  let a = 0
  let x = 0
  for (let j = 11; j >= 0; j--) {
    if (ep[j] >= 8) {
      a += binomial(11 - j, x + 1)
      x++
    }
  }
  return a
}

/** Masque (12 bits) des positions occupées par les arêtes de la tranche pour chaque coordonnée. */
function sliceMasks(): number[] {
  const masks = new Array<number>(N_SLICE)
  for (let mask = 0; mask < 1 << 12; mask++) {
    let bits = 0
    for (let b = 0; b < 12; b++) bits += (mask >> b) & 1
    if (bits !== 4) continue
    const ep = new Array<number>(12)
    for (let j = 0; j < 12; j++) ep[j] = (mask >> j) & 1 ? 8 : 0
    masks[getSlice(ep)] = mask
  }
  return masks
}

// ---- Permutations (indice de Lehmer) ------------------------------------------------------------

export function permToIndex(perm: number[]): number {
  const n = perm.length
  let idx = 0
  for (let i = 0; i < n - 1; i++) {
    let smaller = 0
    for (let j = i + 1; j < n; j++) if (perm[j] < perm[i]) smaller++
    idx += smaller * FACTORIAL[n - 1 - i]
  }
  return idx
}

export function indexToPerm(idx: number, n: number): number[] {
  const avail = Array.from({ length: n }, (_, i) => i)
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const f = FACTORIAL[n - 1 - i]
    const digit = Math.floor(idx / f)
    idx %= f
    out[i] = avail.splice(digit, 1)[0]
  }
  return out
}

/** Permutation des 8 coins. */
export const getCornerPerm = (c: CubieCube): number => permToIndex(c.cp)
/** Permutation des 8 arêtes U/D (valide quand la tranche médiane est en place). */
export const getUdEdgePerm = (c: CubieCube): number => permToIndex(c.ep.slice(0, 8))
/** Permutation des 4 arêtes de la tranche médiane (valide quand elles sont dans la tranche). */
export const getSlicePerm = (c: CubieCube): number => permToIndex(c.ep.slice(8, 12).map(v => v - 8))

// ---- Tables de déplacement -----------------------------------------------------------------------

export interface MoveTables {
  twist: Uint16Array // [N_TWIST * 18]
  flip: Uint16Array // [N_FLIP * 18]
  slice: Uint16Array // [N_SLICE * 18]
  cornerPerm: Uint16Array // [N_PERM8 * 10]
  udEdgePerm: Uint16Array // [N_PERM8 * 10]
  slicePerm: Uint8Array // [N_PERM4 * 10]
}

export function buildMoveTables(): MoveTables {
  const twist = new Uint16Array(N_TWIST * N_MOVES)
  for (let t = 0; t < N_TWIST; t++) {
    const co = setTwist(t)
    for (let m = 0; m < N_MOVES; m++) {
      const mv = MOVE_CUBES[m]
      const next = co.map((_, i) => (co[mv.cp[i]] + mv.co[i]) % 3)
      twist[t * N_MOVES + m] = getTwist(next)
    }
  }

  const flip = new Uint16Array(N_FLIP * N_MOVES)
  for (let f = 0; f < N_FLIP; f++) {
    const eo = setFlip(f)
    for (let m = 0; m < N_MOVES; m++) {
      const mv = MOVE_CUBES[m]
      const next = eo.map((_, i) => (eo[mv.ep[i]] + mv.eo[i]) % 2)
      flip[f * N_MOVES + m] = getFlip(next)
    }
  }

  const slice = new Uint16Array(N_SLICE * N_MOVES)
  const masks = sliceMasks()
  for (let s = 0; s < N_SLICE; s++) {
    const ep = new Array<number>(12)
    for (let j = 0; j < 12; j++) ep[j] = (masks[s] >> j) & 1 ? 8 : 0
    for (let m = 0; m < N_MOVES; m++) {
      const mv = MOVE_CUBES[m]
      slice[s * N_MOVES + m] = getSlice(ep.map((_, i) => ep[mv.ep[i]]))
    }
  }

  const cornerPerm = new Uint16Array(N_PERM8 * N_PHASE2_MOVES)
  const udEdgePerm = new Uint16Array(N_PERM8 * N_PHASE2_MOVES)
  for (let p = 0; p < N_PERM8; p++) {
    const arr = indexToPerm(p, 8)
    for (let k = 0; k < N_PHASE2_MOVES; k++) {
      const mv = MOVE_CUBES[PHASE2_MOVES[k]]
      cornerPerm[p * N_PHASE2_MOVES + k] = permToIndex(arr.map((_, i) => arr[mv.cp[i]]))
      udEdgePerm[p * N_PHASE2_MOVES + k] = permToIndex(arr.map((_, i) => arr[mv.ep[i]]))
    }
  }

  const slicePerm = new Uint8Array(N_PERM4 * N_PHASE2_MOVES)
  for (let p = 0; p < N_PERM4; p++) {
    const arr = indexToPerm(p, 4)
    for (let k = 0; k < N_PHASE2_MOVES; k++) {
      const mv = MOVE_CUBES[PHASE2_MOVES[k]]
      slicePerm[p * N_PHASE2_MOVES + k] = permToIndex(arr.map((_, i) => arr[mv.ep[i + 8] - 8]))
    }
  }

  return { twist, flip, slice, cornerPerm, udEdgePerm, slicePerm }
}
