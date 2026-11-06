import type { MoveTables } from './coords'
import {
  N_FLIP, N_MOVES, N_PERM4, N_PERM8, N_PHASE2_MOVES, N_SLICE, N_TWIST, buildMoveTables,
} from './coords'

export interface SolverTables {
  move: MoveTables
  /** Distance minimale (phase 1) en fonction de (twist, slice) / (flip, slice). */
  twistSlice: Uint8Array
  flipSlice: Uint8Array
  /** Distance minimale (phase 2) en fonction de (coins, tranche) / (arêtes UD, tranche). */
  cornerSlice: Uint8Array
  udEdgeSlice: Uint8Array
}

/**
 * Table d'élagage par BFS sur le produit de deux coordonnées A x B.
 * `table[a * nB + b]` = nombre minimal de mouvements pour ramener (a, b) à (0, 0).
 */
function buildPruning(
  nA: number, nB: number, nMoves: number,
  moveA: ArrayLike<number>, moveB: ArrayLike<number>,
): Uint8Array {
  const table = new Uint8Array(nA * nB).fill(255)
  table[0] = 0
  let filled = 1
  for (let depth = 0; filled < table.length; depth++) {
    for (let idx = 0; idx < table.length; idx++) {
      if (table[idx] !== depth) continue
      const a = Math.floor(idx / nB)
      const b = idx - a * nB
      for (let m = 0; m < nMoves; m++) {
        const next = moveA[a * nMoves + m] * nB + moveB[b * nMoves + m]
        if (table[next] === 255) {
          table[next] = depth + 1
          filled++
        }
      }
    }
  }
  return table
}

let cached: SolverTables | null = null

/** Construit (une seule fois) toutes les tables. ~1 s dans un navigateur récent. */
export function getTables(): SolverTables {
  if (cached) return cached
  const move = buildMoveTables()
  cached = {
    move,
    twistSlice: buildPruning(N_TWIST, N_SLICE, N_MOVES, move.twist, move.slice),
    flipSlice: buildPruning(N_FLIP, N_SLICE, N_MOVES, move.flip, move.slice),
    cornerSlice: buildPruning(N_PERM8, N_PERM4, N_PHASE2_MOVES, move.cornerPerm, move.slicePerm),
    udEdgeSlice: buildPruning(N_PERM8, N_PERM4, N_PHASE2_MOVES, move.udEdgePerm, move.slicePerm),
  }
  return cached
}
