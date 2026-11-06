import { describe, expect, it } from 'vitest'
import { applyAlg, applyMove } from '../../cube/moves'
import { parseAlg } from '../../cube/notation'
import { generateScrambleForSize } from '../../cube/scramble'
import { createSolvedState, isSolved } from '../../cube/state'
import type { CubeState } from '../../cube/types'
import { FACE_ORDER } from '../../cube/types'
import {
  InvalidCubeError, assertSolvable, fromFacelets, identityCube, inverse, isIdentity,
  MOVE_CUBES, multiply, toFacelets,
} from '../kociemba/cubie'
import {
  N_FLIP, N_PERM8, N_SLICE, N_TWIST, getFlip, getSlice, getTwist, indexToPerm, permToIndex,
} from '../kociemba/coords'
import { solve3x3 } from '../kociemba'
import { solve } from '../index'

const solved = createSolvedState(3)
const randomState = (length = 30): CubeState => applyAlg(solved, generateScrambleForSize(3, length), 3)

describe('cubies', () => {
  it('décoder le cube résolu donne l’identité, et inversement', () => {
    expect(isIdentity(fromFacelets(solved))).toBe(true)
    expect(toFacelets(identityCube())).toEqual(solved)
  })

  it('fromFacelets / toFacelets sont réciproques sur des états aléatoires', () => {
    for (let i = 0; i < 50; i++) {
      const s = randomState()
      expect(toFacelets(fromFacelets(s))).toEqual(s)
    }
  })

  it('les cubies de mouvement sont cohérents avec le moteur de stickers', () => {
    for (let i = 0; i < 30; i++) {
      const s = randomState()
      const cube = fromFacelets(s)
      for (let m = 0; m < 18; m++) {
        const face = FACE_ORDER[(m / 3) | 0]
        const modifier = (['', '2', "'"] as const)[m % 3]
        const viaStickers = fromFacelets(applyMove(s, { face, modifier }, 3))
        expect(multiply(cube, MOVE_CUBES[m])).toEqual(viaStickers)
      }
    }
  })

  it('cube * inverse = identité', () => {
    for (let i = 0; i < 20; i++) {
      const c = fromFacelets(randomState())
      expect(isIdentity(multiply(c, inverse(c)))).toBe(true)
    }
  })
})

describe('états invalides', () => {
  const swap = (s: CubeState, a: number, b: number): CubeState => {
    const copy = [...s]
    ;[copy[a], copy[b]] = [copy[b], copy[a]]
    return copy
  }

  it('longueur incorrecte', () => {
    expect(() => fromFacelets(solved.slice(1))).toThrow(InvalidCubeError)
  })

  it('mauvais nombre de couleurs', () => {
    const s = [...solved]
    s[0] = 'D'
    expect(() => fromFacelets(s)).toThrowError(/9 times/)
  })

  it('coin tourné sur place', () => {
    // échange des deux stickers non U/D du coin URF
    const s = swap(solved, 9, 20)
    expect(() => fromFacelets(s)).toThrow(InvalidCubeError)
  })

  it('arête retournée sur place', () => {
    const s = swap(solved, 5, 10)
    expect(() => fromFacelets(s)).toThrowError(/flipped/)
  })

  it('deux arêtes échangées (parité)', () => {
    const s = swap(swap(solved, 5, 7), 10, 19)
    expect(() => fromFacelets(s)).toThrowError(/swapped/)
  })

  it('assertSolvable détecte un coin twisté', () => {
    const c = identityCube()
    c.co[0] = 1
    expect(() => assertSolvable(c)).toThrowError(/twisted/)
  })

  it('solve() renvoie une erreur lisible plutôt que de planter', () => {
    const s = swap(solved, 5, 10)
    const out = solve(s, 3)
    expect(out.moves).toBeNull()
    expect(out.error).toMatch(/flipped/)
  })
})

describe('coordonnées', () => {
  it('permToIndex / indexToPerm sont réciproques', () => {
    for (let i = 0; i < N_PERM8; i += 997) {
      expect(permToIndex(indexToPerm(i, 8))).toBe(i)
    }
    expect(indexToPerm(0, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('le cube résolu a toutes ses coordonnées à 0', () => {
    const c = identityCube()
    expect([getTwist(c.co), getFlip(c.eo), getSlice(c.ep)]).toEqual([0, 0, 0])
  })

  it('les coordonnées restent dans leurs bornes', () => {
    for (let i = 0; i < 200; i++) {
      const c = fromFacelets(randomState())
      expect(getTwist(c.co)).toBeLessThan(N_TWIST)
      expect(getFlip(c.eo)).toBeLessThan(N_FLIP)
      expect(getSlice(c.ep)).toBeLessThan(N_SLICE)
    }
  })
})

describe('solveur 3x3', () => {
  const verify = (state: CubeState, moves: ReturnType<typeof solve3x3>): boolean =>
    isSolved(applyAlg(state, moves, 3), 3)

  it('cube déjà résolu : aucune action', () => {
    expect(solve(solved, 3)).toEqual({ moves: [], error: null })
  })

  it.each(["R", "U'", "F2", "R U", "R U R' U'"])('mélange court « %s » : solution courte et correcte', alg => {
    const state = applyAlg(solved, parseAlg(alg), 3)
    const moves = solve3x3(state, { timeLimitMs: 300, targetLength: 0 })
    expect(verify(state, moves)).toBe(true)
    expect(moves.length).toBeLessThanOrEqual(parseAlg(alg).length)
  })

  it('résout 12 états aléatoires en ≤ 23 mouvements (1 s chacun)', { timeout: 60_000 }, () => {
    for (let i = 0; i < 12; i++) {
      const state = randomState(40)
      const moves = solve3x3(state, { timeLimitMs: 1000, targetLength: 0 })
      expect(verify(state, moves)).toBe(true)
      expect(moves.length).toBeLessThanOrEqual(23)
    }
  })

  it('résout le superflip (20 mouvements optimaux)', { timeout: 60_000 }, () => {
    const superflip = parseAlg("U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2")
    const state = applyAlg(solved, superflip, 3)
    const moves = solve3x3(state, { timeLimitMs: 2000 })
    expect(verify(state, moves)).toBe(true)
    expect(moves.length).toBeLessThanOrEqual(24)
  })

  it('résout un état imposé non issu du bouton Scramble (mouvements les plus lourds)', () => {
    const state = applyAlg(solved, parseAlg("R U2 R' U' R U' R' L' U2 L U L' U L"), 3)
    const moves = solve3x3(state, { timeLimitMs: 500 })
    expect(verify(state, moves)).toBe(true)
  })

  it('une limite de temps plus longue ne dégrade jamais la solution', { timeout: 30_000 }, () => {
    const state = randomState(40)
    const fast = solve3x3(state, { timeLimitMs: 50, targetLength: 0 })
    const slow = solve3x3(state, { timeLimitMs: 800, targetLength: 0 })
    expect(slow.length).toBeLessThanOrEqual(fast.length)
  })

  it('solve() via le dispatcher renvoie des mouvements valides', { timeout: 30_000 }, () => {
    const state = randomState()
    const out = solve(state, 3, undefined, { timeLimitMs: 300 })
    expect(out.error).toBeNull()
    expect(verify(state, out.moves ?? [])).toBe(true)
  })
})

describe('dispatch par taille', () => {
  it('2x2 : résolu par le solveur dédié', () => {
    const size = 2
    const alg = "R U R' U' F2"
    const state = applyAlg(createSolvedState(size), parseAlg(alg), size)
    const out = solve(state, size, alg)
    expect(out.error).toBeNull()
    expect(isSolved(applyAlg(state, out.moves ?? [], size), size)).toBe(true)
  })

  it('5x5 sans mélange connu : erreur explicite', () => {
    const state = applyAlg(createSolvedState(5), parseAlg('R U'), 5)
    const out = solve(state, 5)
    expect(out.moves).toBeNull()
    expect(out.error).toMatch(/No solver/)
  })
})
