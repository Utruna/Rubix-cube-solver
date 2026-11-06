import type { CubeState, Move } from '../../cube/types'
import { validateStateBasic } from '../../cube/state'
import { InvalidCubeError, fromFacelets } from '../kociemba/cubie'
import { solve3x3 } from '../kociemba'
import type { Solve3x3Options } from '../kociemba'
import { normalizeColors } from '../frame'
import { centersSolved, solveCenters } from './centers'
import { pairEdges } from './edges'
import { applyMoveId, decodeState, encodeState, moveId, toMoves } from './geometry'
import { PARITY_FIXES } from './parity'
import { FACE_ORDER } from '../../cube/types'

/** Les 54 stickers du 3x3 « réduit » (centres et arêtes lus sur une des deux ailes de chaque arête). */
export function reduceTo3x3(state: Uint8Array): CubeState {
  const to4 = (x: number) => (x === 0 ? 0 : x === 1 ? 1 : 3)
  const out: CubeState = []
  for (let f = 0; f < 6; f++) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        out.push(FACE_ORDER[state[f * 16 + to4(r) * 4 + to4(c)]])
      }
    }
  }
  return out
}

/** Fusionne les mouvements consécutifs sur la même couche (R R -> R2, R R' -> rien). */
export function simplifyMoves(moves: Move[]): Move[] {
  const turns = (m: Move) => (m.modifier === '2' ? 2 : m.modifier === "'" ? 3 : 1)
  const out: { face: Move['face']; width: number; turns: number }[] = []
  for (const m of moves) {
    const width = m.width ?? 1
    const last = out[out.length - 1]
    if (last && last.face === m.face && last.width === width) {
      last.turns = (last.turns + turns(m)) % 4
      if (last.turns === 0) out.pop()
    } else {
      out.push({ face: m.face, width, turns: turns(m) })
    }
  }
  return out.map(({ face, width, turns: t }) => ({
    face,
    width,
    modifier: t === 1 ? '' : t === 2 ? '2' : "'",
  }))
}

/**
 * Solveur 4x4 par réduction :
 * 1. centres (3 étapes, BFS sur un masque de 24 bits)
 * 2. appariement des arêtes (bibliothèque de commutateurs)
 * 3. résolution du cube réduit avec le solveur 3x3, en corrigeant les parités si besoin
 */
export function solve4x4(state: CubeState, options?: Solve3x3Options): Move[] {
  if (!validateStateBasic(state, 4)) {
    throw new InvalidCubeError('bad-color-count', 'Each color must appear exactly 16 times.')
  }
  let current = encodeState(normalizeColors(state, 4))
  const ids: number[] = []
  const play = (seq: number[]) => {
    for (const id of seq) current = applyMoveId(current, id)
    ids.push(...seq)
  }

  const centers = solveCenters(current)
  current = centers.state
  ids.push(...centers.moves)
  const pairs = pairEdges(current)
  current = pairs.state
  ids.push(...pairs.moves)
  if (!centersSolved(current)) throw new Error('Internal error: centers were disturbed.')

  for (let attempt = 0; ; attempt++) {
    const reduced = reduceTo3x3(current)
    try {
      fromFacelets(reduced)
    } catch (err) {
      const fix = err instanceof InvalidCubeError ? PARITY_FIXES[err.code] : undefined
      if (!fix || attempt >= 2) throw err
      play(fix)
      continue
    }
    const finish = solve3x3(reduced, options)
    play(finish.map(m => moveId(m.face, 1, m.modifier === '' ? 0 : m.modifier === '2' ? 1 : 2)))
    break
  }

  const solved = decodeState(current).every((c, i) => c === FACE_ORDER[Math.floor(i / 16)])
  if (!solved) throw new Error('Internal error: the 4x4 was not solved.')
  return simplifyMoves(toMoves(ids))
}
