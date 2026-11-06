import type { CubieCube } from './cubie'
import { MOVE_CUBES, multiply } from './cubie'
import {
  N_MOVES, N_PERM4, N_PHASE2_MOVES, N_SLICE, PHASE2_MOVES,
  getCornerPerm, getFlip, getSlicePerm, getTwist, getUdEdgePerm, getSlice,
} from './coords'
import { getTables } from './tables'

export interface SearchOptions {
  /** Longueur maximale acceptée pour une solution (exclue : on cherche strictement plus court). */
  upperBound: number
  /** On s'arrête dès qu'une solution de cette longueur (ou moins) est trouvée. */
  targetLength: number
  /** Instant (performance.now()) au-delà duquel on rend la meilleure solution trouvée. */
  deadline: number
  /** Si vrai, le délai n'est respecté qu'une fois une première solution trouvée. */
  requireSolution: boolean
}

const MAX_PHASE2_DEPTH = 18
const TIME_CHECK_MASK = 0x3fff

const isPhase2Move = new Array<boolean>(N_MOVES).fill(false)
for (const m of PHASE2_MOVES) isPhase2Move[m] = true

/** Un mouvement est redondant après `last` s'il est sur la même face, ou sur l'axe opposé dans le « mauvais » ordre. */
function skipMove(move: number, last: number): boolean {
  if (last < 0) return false
  const face = (move / 3) | 0
  const lastFace = (last / 3) | 0
  return face % 3 === lastFace % 3 && face <= lastFace
}

/**
 * Recherche IDA* à deux phases sur un cube déjà validé.
 * Renvoie la plus courte solution trouvée (indices de mouvements) strictement plus courte que
 * `upperBound`, ou `null` si aucune n'a été trouvée dans le temps imparti.
 */
export function twoPhaseSearch(start: CubieCube, options: SearchOptions): number[] | null {
  const t = getTables()
  const mt = t.move
  const startTwist = getTwist(start.co)
  const startFlip = getFlip(start.eo)
  const startSlice = getSlice(start.ep)

  const path: number[] = []
  let best: number[] | null = null
  let bound = options.upperBound
  let nodes = 0
  let stop = false

  const timedOut = (): boolean => {
    if ((++nodes & TIME_CHECK_MASK) === 0 && (best !== null || !options.requireSolution) && performance.now() > options.deadline) {
      stop = true
    }
    return stop
  }

  /** Phase 2 : IDA* dans le sous-groupe, depuis le cube obtenu après la phase 1. */
  const phase2 = (cp: number, ud: number, sp: number, remaining: number, last: number): boolean => {
    if (cp === 0 && ud === 0 && sp === 0) return true
    if (remaining === 0 || timedOut()) return false
    if (t.cornerSlice[cp * N_PERM4 + sp] > remaining || t.udEdgeSlice[ud * N_PERM4 + sp] > remaining) return false
    for (let k = 0; k < N_PHASE2_MOVES; k++) {
      const move = PHASE2_MOVES[k]
      if (skipMove(move, last)) continue
      path.push(move)
      if (phase2(
        mt.cornerPerm[cp * N_PHASE2_MOVES + k],
        mt.udEdgePerm[ud * N_PHASE2_MOVES + k],
        mt.slicePerm[sp * N_PHASE2_MOVES + k],
        remaining - 1, move,
      )) return true
      path.pop()
      if (stop) return false
    }
    return false
  }

  const startPhase2 = (depth1: number, last: number): void => {
    let cube = start
    for (const m of path) cube = multiply(cube, MOVE_CUBES[m])
    const cp = getCornerPerm(cube)
    const ud = getUdEdgePerm(cube)
    const sp = getSlicePerm(cube)
    const maxDepth2 = Math.min(MAX_PHASE2_DEPTH, bound - 1 - depth1)
    for (let d2 = 0; d2 <= maxDepth2; d2++) {
      const base = path.length
      if (phase2(cp, ud, sp, d2, last)) {
        best = path.slice()
        bound = best.length
        path.length = base
        return
      }
      path.length = base
      if (stop) return
    }
  }

  /** Phase 1 : IDA* vers le sous-groupe H. */
  const phase1 = (twist: number, flip: number, slice: number, remaining: number, last: number): void => {
    if (remaining === 0) {
      if (twist === 0 && flip === 0 && slice === 0 && (last < 0 || !isPhase2Move[last])) {
        startPhase2(path.length, last)
      }
      return
    }
    if (timedOut()) return
    if (t.twistSlice[twist * N_SLICE + slice] > remaining || t.flipSlice[flip * N_SLICE + slice] > remaining) return
    for (let m = 0; m < N_MOVES; m++) {
      if (skipMove(m, last)) continue
      path.push(m)
      phase1(
        mt.twist[twist * N_MOVES + m],
        mt.flip[flip * N_MOVES + m],
        mt.slice[slice * N_MOVES + m],
        remaining - 1, m,
      )
      path.pop()
      if (stop) return
    }
  }

  for (let depth1 = 0; depth1 < bound && !stop; depth1++) {
    phase1(startTwist, startFlip, startSlice, depth1, -1)
    const found: number[] | null = best
    if (found !== null && (found as number[]).length <= options.targetLength) break
    if ((best !== null || !options.requireSolution) && performance.now() > options.deadline) break
  }
  return best
}
