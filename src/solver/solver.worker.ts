import type { CubeSize, CubeState, Face, Move } from '../cube/types'
import { applyAlg, applyMove } from '../cube/moves.ts'
import { formatAlg, parseAlg } from '../cube/notation'
import { createSolvedState, isSolved } from '../cube/state'

const FACES: Face[] = ['U', 'R', 'F', 'D', 'L', 'B']
const MODIFIERS: Move['modifier'][] = ['', "'", '2']
const MAX_FALLBACK_DEPTH = 8

const ALL_MOVES: Move[] = FACES.flatMap(face =>
  MODIFIERS.map(modifier => ({ face, modifier })),
)

function inverseMove(move: Move): Move {
  if (move.modifier === '') return { face: move.face, modifier: "'", width: move.width }
  if (move.modifier === "'") return { face: move.face, modifier: '', width: move.width }
  return { face: move.face, modifier: '2', width: move.width }
}

function inverseAlg(moves: Move[]): Move[] {
  return [...moves].reverse().map(inverseMove)
}

function solvedHeuristic(state: CubeState, size: CubeSize): number {
  const faceArea = size * size
  const solved = createSolvedState(size)
  let mismatches = 0
  for (let i = 0; i < state.length; i++) {
    if (state[i] !== solved[i]) mismatches += 1
  }
  return Math.ceil(mismatches / Math.max(8, faceArea / 2))
}

function boundedDepthSearch(state: CubeState, size: CubeSize, depth: number, lastFace: Face | null, path: Move[]): boolean {
  if (isSolved(state, size)) return true
  if (depth <= 0) return false
  if (solvedHeuristic(state, size) > depth) return false

  for (const move of ALL_MOVES) {
    if (lastFace === move.face) continue
    const next = applyMove(state, move, size)
    path.push(move)
    if (boundedDepthSearch(next, size, depth - 1, move.face, path)) {
      return true
    }
    path.pop()
  }

  return false
}

function tryFallbackSolve(initial: CubeState, size: CubeSize): Move[] | null {
  if (size !== 3) return null
  if (isSolved(initial, size)) return []

  for (let depth = 1; depth <= MAX_FALLBACK_DEPTH; depth++) {
    const path: Move[] = []
    if (boundedDepthSearch(initial, size, depth, null, path)) {
      return path
    }
  }

  return null
}

self.onmessage = async (e: MessageEvent<{ id: string; cubeState: CubeState; cubeSize: CubeSize; scrambleAlg?: string }>) => {
  const { id, cubeState, cubeSize, scrambleAlg } = e.data

  try {
    if (cubeState.length !== 6 * cubeSize * cubeSize) {
      throw new Error('Invalid cube state length')
    }

    const solvedState = createSolvedState(cubeSize)
    if (isSolved(cubeState, cubeSize)) {
      self.postMessage({ id, solution: '', error: null })
      return
    }

    if (scrambleAlg && scrambleAlg.trim().length > 0) {
      const scrambleMoves = parseAlg(scrambleAlg)
      const candidate = inverseAlg(scrambleMoves)
      const after = applyAlg(cubeState, candidate, cubeSize)
      if (after.join('') === solvedState.join('')) {
        self.postMessage({ id, solution: formatAlg(candidate), error: null })
        return
      }
    }

    const fallback = tryFallbackSolve(cubeState, cubeSize)
    if (fallback) {
      self.postMessage({ id, solution: formatAlg(fallback), error: null })
      return
    }

    self.postMessage({
      id,
      solution: null,
      error: 'No solution found with internal solver (fallback depth exceeded).',
    })
  } catch (err) {
    self.postMessage({ id, solution: null, error: String(err) })
  }
}

export {}
