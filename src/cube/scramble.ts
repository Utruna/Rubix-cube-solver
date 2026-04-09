import type { Face, Move } from './types'
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
