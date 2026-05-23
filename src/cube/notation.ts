import type { Face, Move, MoveModifier } from './types'
import { FACE_ORDER } from './types'

const FACES = new Set<string>(FACE_ORDER)

export function parseMove(token: string): Move | null {
  if (!token) return null
  const match = token.match(/^([URFDLB])(?:(\d*)w)?([2']?)$/)
  if (!match) return null

  const face = match[1] as Face
  if (!FACES.has(face)) return null
  const widthDigits = match[2] ?? ''
  const modifier = (match[3] ?? '') as MoveModifier
  if (modifier !== '' && modifier !== "'" && modifier !== '2') return null

  const width = widthDigits ? Number(widthDigits) : match[0].includes('w') ? 2 : 1
  if (!Number.isInteger(width) || width < 1) return null

  return { face, modifier, width }
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
  const width = move.width ?? 1
  if (width <= 1) return move.face + move.modifier
  const wide = width === 2 ? 'w' : `${width}w`
  return `${move.face}${wide}${move.modifier}`
}

export function formatAlg(moves: Move[]): string {
  return moves.map(formatMove).join(' ')
}
