import type { CubeSize, CubeState, Move } from '../cube/types'
import { applyAlg } from '../cube/moves'
import { parseAlg } from '../cube/notation'
import { createSolvedState } from '../cube/state'

export function inverseMove(move: Move): Move {
  const modifier = move.modifier === '' ? "'" : move.modifier === "'" ? '' : '2'
  return { face: move.face, modifier, width: move.width }
}

export function inverseAlg(moves: Move[]): Move[] {
  return [...moves].reverse().map(inverseMove)
}

/**
 * Stratégie de repli pour les tailles sans solveur dédié (2x2, 4x4, 5x5) :
 * rejouer l'inverse du mélange connu. Renvoie `null` si cela ne résout pas le cube.
 */
export function solveByScrambleInversion(state: CubeState, size: CubeSize, scrambleAlg?: string): Move[] | null {
  if (!scrambleAlg || scrambleAlg.trim().length === 0) return null
  const candidate = inverseAlg(parseAlg(scrambleAlg))
  const after = applyAlg(state, candidate, size)
  return after.join('') === createSolvedState(size).join('') ? candidate : null
}
