import type { Face, Move, MoveModifier } from './types'
import { FACE_ORDER } from './types'

const FACES = new Set<string>(FACE_ORDER)

export function parseMove(token: string): Move | null {
  if (!token) return null
  const face = token[0] as Face
  if (!FACES.has(face)) return null
  const modifier = (token[1] ?? '') as MoveModifier
  if (modifier !== '' && modifier !== "'" && modifier !== '2') return null
  return { face, modifier }
}

export function parseAlg(str: string): Move[] {
  const tokens = str.trim().split(/\s+/).filter(Boolean)
  const moves: Move[] = []
  for (const t of tokens) {
    const m = parseMove(t)
    if (m) moves.push(m)
  }
  return moves
}

export function formatMove(move: Move): string {
  return move.face + move.modifier
}

export function formatAlg(moves: Move[]): string {
  return moves.map(formatMove).join(' ')
}
