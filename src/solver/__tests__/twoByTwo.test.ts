import { describe, expect, it } from 'vitest'
import { applyAlg } from '../../cube/moves'
import { parseAlg } from '../../cube/notation'
import { generateScrambleForSize } from '../../cube/scramble'
import { createSolvedState, isSolved } from '../../cube/state'
import type { CubeState } from '../../cube/types'
import { solve } from '../index'
import { solve2x2 } from '../twoByTwo'

const solved = createSolvedState(2)
const scrambled = (length: number): CubeState => applyAlg(solved, generateScrambleForSize(2, length), 2)

describe('solveur 2x2', () => {
  it('cube résolu : aucune action', () => {
    expect(solve(solved, 2)).toEqual({ moves: [], error: null })
  })

  it.each(['R', "U'", 'F2', 'D', 'L', "B'"])('un seul mouvement « %s » est résolu en 1 coup', alg => {
    const state = applyAlg(solved, parseAlg(alg), 2)
    const moves = solve2x2(state)
    expect(moves).toHaveLength(1)
    expect(isSolved(applyAlg(state, moves, 2), 2)).toBe(true)
  })

  it('résout 200 états aléatoires de façon optimale (≤ 11 mouvements)', () => {
    for (let i = 0; i < 200; i++) {
      const state = scrambled(25)
      const moves = solve2x2(state)
      expect(isSolved(applyAlg(state, moves, 2), 2)).toBe(true)
      expect(moves.length).toBeLessThanOrEqual(11)
    }
  })

  it('la solution n’est jamais plus longue que le mélange', () => {
    for (let i = 0; i < 100; i++) {
      const length = 1 + (i % 8)
      const alg = generateScrambleForSize(2, length)
      const state = applyAlg(solved, alg, 2)
      expect(solve2x2(state).length).toBeLessThanOrEqual(length)
    }
  })

  it('résout un cube dont l’orientation d’ensemble est arbitraire (rotation du cube entier)', () => {
    // Équivalent à une rotation complète : les couleurs ne sont pas dans la position « de référence ».
    const state = applyAlg(solved, parseAlg("R U R' U' R' F R2 U' R' U' R U R' F'"), 2)
    const rotated = applyAlg(state, parseAlg('L R\' D U\' F B\''), 2)
    const moves = solve2x2(rotated)
    expect(isSolved(applyAlg(rotated, moves, 2), 2)).toBe(true)
  })

  it('états impossibles : message clair', () => {
    const twisted = [...solved]
    ;[twisted[0], twisted[4]] = [twisted[4], twisted[0]]
    const out = solve(twisted, 2)
    expect(out.moves).toBeNull()
    expect(out.error).toBeTruthy()
    const badCount = [...solved]
    badCount[0] = 'D'
    expect(solve(badCount, 2).error).toMatch(/4 times/)
  })
})
