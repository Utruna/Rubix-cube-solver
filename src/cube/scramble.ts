import type { CubeSize, Face, Move } from './types'
import { FACE_ORDER } from './types'

const MODIFIERS = ['', "'", '2'] as const
const OPPOSITE: Record<Face, Face> = {
  U: 'D', D: 'U',
  R: 'L', L: 'R',
  F: 'B', B: 'F',
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

/** Durée totale visée pour un mélange animé (ms) : vif, quelle que soit la taille du cube. */
const SCRAMBLE_TARGET_MS = 2000
const SCRAMBLE_MOVE_MIN_MS = 40
const SCRAMBLE_MOVE_MAX_MS = 90

/** Durée de l'animation d'un coup quand on joue un mélange de `moveCount` coups. */
export function scrambleMoveDuration(moveCount: number): number {
  const perMove = SCRAMBLE_TARGET_MS / Math.max(1, moveCount)
  return Math.round(Math.min(SCRAMBLE_MOVE_MAX_MS, Math.max(SCRAMBLE_MOVE_MIN_MS, perMove)))
}

export interface ScrambleHandlers {
  /** Joue le coup `index` (0-based) ; `durationMs` est la durée d'animation à lui donner. */
  step: (move: Move, durationMs: number, index: number) => void
  /** Appelé une fois le dernier coup terminé. */
  done: () => void
}

/**
 * Joue un mélange coup par coup : un coup toutes les `durationMs` (+ un léger battement), le temps que
 * le cube termine son animation avant la suivante. Renvoie une fonction qui interrompt le mélange.
 */
export function playScramble(
  moves: Move[],
  handlers: ScrambleHandlers,
  startDelayMs = 80,
): () => void {
  const durationMs = scrambleMoveDuration(moves.length)
  let timer: ReturnType<typeof setTimeout> | null = null
  let index = 0

  const tick = () => {
    handlers.step(moves[index], durationMs, index)
    index += 1
    timer = index < moves.length
      ? setTimeout(tick, durationMs + 12)
      : setTimeout(handlers.done, durationMs + 60)
  }
  timer = setTimeout(tick, startDelayMs)

  return () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
}
