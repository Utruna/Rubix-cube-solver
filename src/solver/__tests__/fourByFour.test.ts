import { describe, expect, it } from 'vitest'
import { applyAlg } from '../../cube/moves'
import { parseAlg } from '../../cube/notation'
import { generateScrambleForSize } from '../../cube/scramble'
import { createSolvedState, isSolved } from '../../cube/state'
import type { CubeState, Move } from '../../cube/types'
import { solve } from '../index'
import { centersSolved, solveCenters } from '../fourByFour/centers'
import { getEdgeLibrary, pairEdgesReliably, pairedEdges } from '../fourByFour/edges'
import { MOVES, N_MOVES, applyMoveId, decodeState, encodeState, inverseMoveId } from '../fourByFour/geometry'
import { reduceTo3x3, simplifyMoves, solve4x4 } from '../fourByFour'
import { OLL_PARITY, PLL_PARITY } from '../fourByFour/parity'
import { InvalidCubeError, fromFacelets } from '../kociemba/cubie'

const solved = createSolvedState(4)
const scrambled = (length = 60): CubeState => applyAlg(solved, generateScrambleForSize(4, length), 4)
const applySeq = (state: Uint8Array, seq: number[]) => seq.reduce(applyMoveId, state)

describe('géométrie 4x4', () => {
  it('définit 36 mouvements dont les inverses se compensent', () => {
    expect(MOVES).toHaveLength(N_MOVES)
    const start = encodeState(scrambled())
    for (let id = 0; id < N_MOVES; id++) {
      expect(applyMoveId(applyMoveId(start, id), inverseMoveId(id))).toEqual(start)
    }
  })

  it('encodeState / decodeState sont réciproques', () => {
    const state = scrambled()
    expect(decodeState(encodeState(state))).toEqual(state)
  })
})

describe('centres', () => {
  it('résout les 24 centres sur des mélanges aléatoires', { timeout: 60_000 }, () => {
    for (let i = 0; i < 4; i++) {
      const { state, moves } = solveCenters(encodeState(scrambled()))
      expect(centersSolved(state)).toBe(true)
      expect(moves.length).toBeLessThanOrEqual(30)
    }
  })

  it('ne fait rien sur un cube déjà résolu', () => {
    expect(solveCenters(encodeState(solved)).moves).toEqual([])
  })
})

describe('arêtes', () => {
  it('une bibliothèque de macros qui préservent les centres', { timeout: 60_000 }, () => {
    const library = getEdgeLibrary()
    expect(library.length).toBeGreaterThan(50_000)
    const start = encodeState(solved)
    for (const macro of library.slice(0, 200)) expect(centersSolved(applySeq(start, macro.seq))).toBe(true)
  })

  it('apparie les 12 arêtes sans toucher aux centres', { timeout: 120_000 }, () => {
    for (let i = 0; i < 4; i++) {
      const centers = solveCenters(encodeState(scrambled())).state
      const { state } = pairEdgesReliably(centers)
      expect(pairedEdges(state)).toBe(0xfff)
      expect(centersSolved(state)).toBe(true)
    }
  })
})

describe('corrections de parité', () => {
  const verdict = (seq: number[]) => {
    const state = applySeq(encodeState(solved), seq)
    expect(centersSolved(state)).toBe(true)
    expect(pairedEdges(state)).toBe(0xfff)
    try {
      fromFacelets(reduceTo3x3(state))
      return 'valide'
    } catch (err) {
      return err instanceof InvalidCubeError ? err.code : 'autre'
    }
  }

  it('OLL parity : laisse le cube réduit avec une arête retournée', () => {
    expect(verdict(OLL_PARITY)).toBe('flipped-edge')
  })

  it('PLL parity : laisse le cube réduit avec une permutation impaire', () => {
    expect(verdict(PLL_PARITY)).toBe('parity')
  })
})

describe('simplification des mouvements', () => {
  const alg = (text: string): Move[] => parseAlg(text)
  const format = (moves: Move[]) => moves.map(m => `${m.face}${(m.width ?? 1) > 1 ? 'w' : ''}${m.modifier}`).join(' ')

  it('fusionne les quarts de tour consécutifs', () => {
    expect(format(simplifyMoves(alg('R R U')))).toBe('R2 U')
    expect(format(simplifyMoves(alg("R R'")))).toBe('')
    expect(format(simplifyMoves(alg('R2 R2')))).toBe('')
    expect(format(simplifyMoves(alg("U' U'")))).toBe('U2')
  })

  it('ne fusionne pas une couche large avec une couche simple', () => {
    expect(format(simplifyMoves(alg('R Rw')))).toBe('R Rw')
  })
})

describe('solveur 4x4', () => {
  it('cube résolu : aucune action', () => {
    expect(solve(solved, 4)).toEqual({ moves: [], error: null })
  })

  it('résout 6 mélanges aléatoires en un nombre raisonnable de mouvements', { timeout: 300_000 }, () => {
    for (let i = 0; i < 6; i++) {
      const state = scrambled()
      const moves = solve4x4(state, { timeLimitMs: 400 })
      expect(isSolved(applyAlg(state, moves, 4), 4)).toBe(true)
      expect(moves.length).toBeLessThanOrEqual(250)
    }
  })

  it('résout un cube dont une seule arête est retournée (parité OLL)', { timeout: 120_000 }, () => {
    const state = applyAlg(solved, parseAlg("Rw' U2 Lw F2 Lw' F2 Rw2 U2 Rw U2 Rw' U2 F2 Rw2 F2"), 4)
    const moves = solve4x4(state, { timeLimitMs: 400 })
    expect(isSolved(applyAlg(state, moves, 4), 4)).toBe(true)
  })

  it('résout un cube avec parité PLL', { timeout: 120_000 }, () => {
    const state = applyAlg(solved, parseAlg('Rw2 R2 U2 Rw2 R2 Uw2 Rw2 R2 Uw2'), 4)
    const moves = solve4x4(state, { timeLimitMs: 400 })
    expect(isSolved(applyAlg(state, moves, 4), 4)).toBe(true)
  })

  it('rejette un état avec un mauvais nombre de couleurs', () => {
    const bad = [...solved]
    bad[0] = 'D'
    const out = solve(bad, 4)
    expect(out.moves).toBeNull()
    expect(out.error).toMatch(/16 times/)
  })

  it('rejette un état de coins impossible', () => {
    const bad = [...solved]
    ;[bad[0], bad[16]] = [bad[16], bad[0]] // échange de deux stickers de couleurs différentes sur des coins
    expect(solve(bad, 4).error).toBeTruthy()
  })
})
