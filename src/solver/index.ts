import type { CubeSize, CubeState, Move } from '../cube/types'
import { isSolved } from '../cube/state'
import { InvalidCubeError, solve3x3 } from './kociemba'
import type { Solve3x3Options } from './kociemba'
import { solveByScrambleInversion } from './scrambleInversion'
import { solve2x2, warmUp2x2 } from './twoByTwo'
import { solve4x4 } from './fourByFour'
import { warmUpEdges } from './fourByFour/edges'
import { getTables } from './kociemba/tables'

export type SolveOutcome = { moves: Move[]; error: null } | { moves: null; error: string }

/**
 * Point d'entrée unique du solveur (utilisé par le worker et par les tests).
 * - 2x2 : optimal (BFS complet), état quelconque.
 * - 3x3 : Kociemba à deux phases (solution quasi optimale, état quelconque).
 * - 4x4 : méthode par réduction (centres, arêtes, puis solveur 3x3).
 * - 5x5 : inversion du mélange connu (pas encore de solveur dédié).
 */
export function solve(
  state: CubeState,
  size: CubeSize,
  scrambleAlg?: string,
  options?: Solve3x3Options,
): SolveOutcome {
  if (state.length !== 6 * size * size) return { moves: null, error: 'Invalid cube state length' }
  if (isSolved(state, size)) return { moves: [], error: null }

  if (size === 2 || size === 3 || size === 4) {
    try {
      const moves = size === 2 ? solve2x2(state) : size === 3 ? solve3x3(state, options) : solve4x4(state, options)
      return { moves, error: null }
    } catch (err) {
      if (err instanceof InvalidCubeError) return { moves: null, error: err.message }
      throw err
    }
  }

  const moves = solveByScrambleInversion(state, size, scrambleAlg)
  if (moves) return { moves, error: null }
  return {
    moves: null,
    error: `No solver available yet for arbitrary ${size}x${size} states (only the app scramble can be undone).`,
  }
}

/**
 * Construit à l'avance les tables dont le solveur de `size` a besoin (quelques secondes), pour que la
 * première résolution soit immédiate. Sans effet pour les tailles sans solveur dédié.
 */
export function warmUp(size: CubeSize): void {
  if (size === 2) warmUp2x2()
  if (size === 3 || size === 4) getTables() // le 4x4 termine avec le solveur 3x3
  if (size === 4) warmUpEdges()
}
