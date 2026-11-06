import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyAlg, applyMove } from '../moves'
import { formatAlg, parseAlg } from '../notation'
import { defaultScrambleLength, generateScrambleForSize, playScramble, scrambleMoveDuration } from '../scramble'
import { createSolvedState, faceOffset, isSolved, validateStateBasic } from '../state'
import type { CubeSize, Face, Move } from '../types'
import { FACE_ORDER } from '../types'

const FACES: Face[] = FACE_ORDER
const SIZES: CubeSize[] = [2, 3, 4, 5]

describe('moteur de mouvements', () => {
  it.each(SIZES)('un quart de tour répété 4 fois est l’identité (%ix%i)', size => {
    const solved = createSolvedState(size)
    for (const face of FACES) {
      const once = applyMove(solved, { face, modifier: '' }, size)
      expect(once).not.toEqual(solved)
      expect(applyAlg(solved, Array(4).fill({ face, modifier: '' }), size)).toEqual(solved)
    }
  })

  it.each(SIZES)('mouvement puis inverse = identité (%ix%i)', size => {
    const scramble = generateScrambleForSize(size, 30)
    const state = applyAlg(createSolvedState(size), scramble, size)
    for (const face of FACES) {
      const m: Move = { face, modifier: '' }
      expect(applyMove(applyMove(state, m, size), { face, modifier: "'" }, size)).toEqual(state)
      expect(applyMove(applyMove(state, { face, modifier: '2' }, size), { face, modifier: '2' }, size)).toEqual(state)
    }
  })

  it.each(SIZES)('le mélange conserve le nombre de stickers par couleur (%ix%i)', size => {
    const state = applyAlg(createSolvedState(size), generateScrambleForSize(size), size)
    expect(validateStateBasic(state, size)).toBe(true)
  })

  it('l’algorithme (R U R\' U\') × 6 est l’identité', () => {
    const alg = parseAlg("R U R' U'")
    const state = applyAlg(createSolvedState(3), Array(6).fill(alg).flat(), 3)
    expect(isSolved(state, 3)).toBe(true)
  })

  it('des mouvements sur des faces opposées commutent', () => {
    const base = applyAlg(createSolvedState(3), generateScrambleForSize(3, 20), 3)
    const ab = applyAlg(base, parseAlg('U D'), 3)
    const ba = applyAlg(base, parseAlg('D U'), 3)
    expect(ab).toEqual(ba)
  })

  it('les mouvements larges 4x4 agissent sur deux couches', () => {
    const solved = createSolvedState(4)
    const wide = applyMove(solved, { face: 'R', modifier: '', width: 2 }, 4)
    const narrow = applyMove(solved, { face: 'R', modifier: '' }, 4)
    const changed = (s: string[]) => s.filter((c, i) => c !== solved[i]).length
    expect(changed(wide)).toBeGreaterThan(changed(narrow))
  })
})

describe('sens des rotations', () => {
  // Un quart de tour horaire (vu de face) : la ligne du haut de F reçoit les stickers de R, etc.
  const row = (state: string[], face: Face, indices: number[]) => indices.map(i => state[faceOffset(face) + i])
  const quarter = (face: Face) => applyMove(createSolvedState(3), { face, modifier: '' }, 3)

  it('U : F ← R, R ← B, B ← L, L ← F (ligne du haut)', () => {
    const s = quarter('U')
    expect(row(s, 'F', [0, 1, 2])).toEqual(['R', 'R', 'R'])
    expect(row(s, 'R', [0, 1, 2])).toEqual(['B', 'B', 'B'])
    expect(row(s, 'B', [0, 1, 2])).toEqual(['L', 'L', 'L'])
    expect(row(s, 'L', [0, 1, 2])).toEqual(['F', 'F', 'F'])
  })

  it('D : F ← L (ligne du bas)', () => {
    expect(row(quarter('D'), 'F', [6, 7, 8])).toEqual(['L', 'L', 'L'])
  })

  it('R : U ← F (colonne de droite)', () => {
    expect(row(quarter('R'), 'U', [2, 5, 8])).toEqual(['F', 'F', 'F'])
  })

  it('L : U ← B (colonne de gauche)', () => {
    expect(row(quarter('L'), 'U', [0, 3, 6])).toEqual(['B', 'B', 'B'])
  })

  it('F : U ← L (ligne du bas)', () => {
    expect(row(quarter('F'), 'U', [6, 7, 8])).toEqual(['L', 'L', 'L'])
  })

  it('B : U ← R (ligne du haut)', () => {
    expect(row(quarter('B'), 'U', [0, 1, 2])).toEqual(['R', 'R', 'R'])
  })
})

describe('notation', () => {
  it('aller-retour parse/format', () => {
    const text = "R U2 F' Rw Uw2 R3w'"
    expect(formatAlg(parseAlg(text))).toBe(text)
  })

  it('ignore les jetons invalides', () => {
    expect(parseAlg('R X U')).toHaveLength(2)
  })
})

describe('scramble', () => {
  it.each(SIZES)('génère la longueur attendue sans mouvement redondant (%ix%i)', size => {
    const moves = generateScrambleForSize(size)
    for (let i = 1; i < moves.length; i++) {
      expect(moves[i].face).not.toBe(moves[i - 1].face)
    }
  })
})

describe('mélange animé', () => {
  it('durée par coup bornée, plus courte pour les longs mélanges', () => {
    expect(scrambleMoveDuration(11)).toBe(90)
    expect(scrambleMoveDuration(25)).toBe(80)
    expect(scrambleMoveDuration(60)).toBeLessThan(scrambleMoveDuration(25))
    expect(scrambleMoveDuration(500)).toBe(40)
    expect(scrambleMoveDuration(0)).toBe(90)
  })

  it.each(SIZES)('un mélange complet dure environ 2 s au plus (%ix%i)', size => {
    const count = defaultScrambleLength(size)
    expect(count * scrambleMoveDuration(count)).toBeLessThanOrEqual(2600)
  })
})

describe('pilote du mélange animé', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const run = (count: number) => {
    const moves = generateScrambleForSize(3, count)
    const played: { index: number; at: number; durationMs: number }[] = []
    let doneAt = -1
    const start = Date.now()
    const cancel = playScramble(moves, {
      step: (_m, durationMs, index) => played.push({ index, at: Date.now() - start, durationMs }),
      done: () => { doneAt = Date.now() - start },
    })
    return { moves, played, cancel, doneAt: () => doneAt }
  }

  it('joue tous les coups dans l’ordre, espacés d’au moins leur durée d’animation', () => {
    const { moves, played, doneAt } = run(25)
    vi.advanceTimersByTime(10_000)
    expect(played.map(p => p.index)).toEqual(moves.map((_, i) => i))
    for (let i = 1; i < played.length; i++) {
      expect(played[i].at - played[i - 1].at).toBeGreaterThanOrEqual(played[i].durationMs)
    }
    expect(doneAt()).toBeGreaterThan(played[played.length - 1].at)
  })

  it('un mélange de 25 coups se joue en moins de 2,7 s', () => {
    const { doneAt } = run(25)
    vi.advanceTimersByTime(2700)
    expect(doneAt()).toBeGreaterThan(0)
  })

  it('s’interrompt immédiatement (Reset, changement de taille)', () => {
    const { played, cancel, doneAt } = run(25)
    vi.advanceTimersByTime(500)
    const before = played.length
    expect(before).toBeGreaterThan(0)
    cancel()
    vi.advanceTimersByTime(10_000)
    expect(played.length).toBe(before)
    expect(doneAt()).toBe(-1)
  })
})
