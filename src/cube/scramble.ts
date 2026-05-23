import type { CubeSize, Face, Move } from './types'
import { FACE_ORDER } from './types'

const MODIFIERS = ['', "'", '2'] as const
const OPPOSITE: Record<Face, Face> = {
  U: 'D', D: 'U',
  R: 'L', L: 'R',
  F: 'B', B: 'F',
}

export function generateScramble(length = 25): Move[] {
  const moves: Move[] = []
  let lastFace: Face | null = null
  let secondLastFace: Face | null = null

  while (moves.length < length) {
    const face = FACE_ORDER[Math.floor(Math.random() * 6)]
    if (face === lastFace) continue
    if (secondLastFace && face === secondLastFace && OPPOSITE[face] === lastFace) continue

    const modifier = MODIFIERS[Math.floor(Math.random() * 3)]
    moves.push({ face, modifier })
    secondLastFace = lastFace
    lastFace = face
  }
  return moves
}

export function generateScrambleForSize(size: CubeSize, length = defaultScrambleLength(size)): Move[] {
  const moves: Move[] = []
  let lastFace: Face | null = null
  let secondLastFace: Face | null = null
  const maxWide = Math.floor(size / 2)
  const allowWide = size >= 4

  while (moves.length < length) {
    const face = FACE_ORDER[Math.floor(Math.random() * 6)]
    if (face === lastFace) continue
    if (secondLastFace && face === secondLastFace && OPPOSITE[face] === lastFace) continue

    const modifier = MODIFIERS[Math.floor(Math.random() * 3)]

    let width = 1
    if (allowWide && Math.random() < 0.45) {
      width = 2 + Math.floor(Math.random() * Math.max(1, maxWide - 1))
    }

    moves.push({ face, modifier, width })
    secondLastFace = lastFace
    lastFace = face
  }

  return moves
}

export function defaultScrambleLength(size: CubeSize): number {
  if (size === 2) return 11
  if (size === 3) return 25
  if (size === 4) return 40
  return 60
}
