import { describe, expect, it } from 'vitest'
import { applyAlg } from '../../cube/moves'
import { generateScrambleForSize } from '../../cube/scramble'
import { createSolvedState, isSolved } from '../../cube/state'
import { solve, warmUp } from '../index'

describe('préparation du solveur', () => {
  it('warmUp(3) construit les tables : la résolution qui suit est rapide', { timeout: 60_000 }, () => {
    const state = applyAlg(createSolvedState(3), generateScrambleForSize(3, 25), 3)

    const t0 = performance.now()
    warmUp(3)
    const warmMs = performance.now() - t0
    // Deuxième appel : tout est déjà en mémoire, rien à refaire.
    const t1 = performance.now()
    warmUp(3)
    const again = performance.now() - t1

    const t2 = performance.now()
    const out = solve(state, 3, undefined, { timeLimitMs: 300, targetLength: 0 })
    const solveMs = performance.now() - t2

    expect(out.error).toBeNull()
    expect(isSolved(applyAlg(state, out.moves ?? [], 3), 3)).toBe(true)
    expect(warmMs).toBeGreaterThan(500) // la préparation a un vrai coût…
    expect(again).toBeLessThan(5) // …payé une seule fois
    expect(solveMs).toBeLessThan(1500) // résolution sans reconstruction des tables
  })

  it('warmUp(2) et warmUp(4) ne lèvent pas d’erreur et sont idempotents', { timeout: 120_000 }, () => {
    warmUp(2)
    warmUp(4)
    const t = performance.now()
    warmUp(2)
    warmUp(4)
    expect(performance.now() - t).toBeLessThan(20)
  })

  it('warmUp(5) ne fait rien (pas de solveur dédié)', () => {
    const t = performance.now()
    warmUp(5)
    expect(performance.now() - t).toBeLessThan(5)
  })
})
