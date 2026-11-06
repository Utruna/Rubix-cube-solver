import type { CubeState, Move } from '../cube/types'
import { FACE_ORDER } from '../cube/types'
import { validateStateBasic } from '../cube/state'
import { InvalidCubeError, MOVE_CUBES, decodeCorners } from './kociemba/cubie'
import { cornerStickerIndex, normalizeColors } from './frame'
import { buildPruning } from './kociemba/tables'
import { indexToPerm, permToIndex } from './kociemba/coords'

/**
 * Solveur optimal du 2x2.
 *
 * Un 2x2 est un 3x3 réduit à ses 8 coins. On fige le coin DLB (le cube peut toujours être
 * tourné pour l'y amener) et on n'utilise que U, R, F : il reste 7! x 3^6 = 3 674 160 états,
 * parcourus entièrement en BFS. La solution est donc optimale (11 mouvements au plus).
 */

const FIXED_CORNER = 6 // DBL
const FREE_POSITIONS = [0, 1, 2, 3, 4, 5, 7]
const SLOT_OF = new Map(FREE_POSITIONS.map((pos, slot) => [pos, slot]))
const N_PERM = 5040
const N_TWIST = 729
const MOVES = Array.from({ length: 9 }, (_, i) => i) // U U2 U' R R2 R' F F2 F'
const MODIFIERS = ['', '2', "'"] as const

interface Tables {
  perm: Uint16Array
  twist: Uint16Array
  distance: Uint8Array
}

let cached: Tables | null = null

function getTables(): Tables {
  if (cached) return cached
  const perm = new Uint16Array(N_PERM * MOVES.length)
  for (let p = 0; p < N_PERM; p++) {
    const arr = indexToPerm(p, 7)
    for (const m of MOVES) {
      const mv = MOVE_CUBES[m]
      perm[p * MOVES.length + m] = permToIndex(FREE_POSITIONS.map(pos => arr[SLOT_OF.get(mv.cp[pos])!]))
    }
  }

  const twist = new Uint16Array(N_TWIST * MOVES.length)
  for (let t = 0; t < N_TWIST; t++) {
    const co = twistToOrientations(t)
    for (const m of MOVES) {
      const mv = MOVE_CUBES[m]
      twist[t * MOVES.length + m] = orientationsToTwist(FREE_POSITIONS.map(pos => (co[SLOT_OF.get(mv.cp[pos])!] + mv.co[pos]) % 3))
    }
  }

  cached = { perm, twist, distance: buildPruning(N_PERM, N_TWIST, MOVES.length, perm, twist) }
  return cached
}

/** Orientation des 7 coins libres ; la dernière est déterminée par les 6 autres. */
function twistToOrientations(twist: number): number[] {
  const co = new Array<number>(7)
  let sum = 0
  for (let i = 5; i >= 0; i--) {
    co[i] = twist % 3
    sum += co[i]
    twist = Math.floor(twist / 3)
  }
  co[6] = (3 - (sum % 3)) % 3
  return co
}

function orientationsToTwist(co: number[]): number {
  let t = 0
  for (let i = 0; i < 6; i++) t = t * 3 + co[i]
  return t
}

/** Solution optimale d'un 2x2 (lève `InvalidCubeError` si l'état est impossible). */
export function solve2x2(state: CubeState): Move[] {
  if (!validateStateBasic(state, 2)) {
    throw new InvalidCubeError('bad-color-count', 'Each color must appear exactly 4 times.')
  }
  const colors = normalizeColors(state, 2)
  const { cp, co } = decodeCorners(i => colors[cornerStickerIndex(i, 2)])
  if (cp[FIXED_CORNER] !== FIXED_CORNER || co[FIXED_CORNER] !== 0 || co.reduce((a, b) => a + b, 0) % 3 !== 0) {
    throw new InvalidCubeError('twisted-corner', 'A corner is twisted in place (invalid cube).')
  }

  const t = getTables()
  let perm = permToIndex(FREE_POSITIONS.map(pos => SLOT_OF.get(cp[pos])!))
  let twist = orientationsToTwist(FREE_POSITIONS.map(pos => co[pos]))
  const moves: Move[] = []
  for (let d = t.distance[perm * N_TWIST + twist]; d > 0; d--) {
    const m = MOVES.find(candidate => {
      const next = t.perm[perm * MOVES.length + candidate] * N_TWIST + t.twist[twist * MOVES.length + candidate]
      return t.distance[next] === d - 1
    })!
    perm = t.perm[perm * MOVES.length + m]
    twist = t.twist[twist * MOVES.length + m]
    moves.push({ face: FACE_ORDER[Math.floor(m / 3)], modifier: MODIFIERS[m % 3] })
  }
  return moves
}
