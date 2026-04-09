import type { CubeState, Face, StickerColor } from './types'
import { FACE_ORDER } from './types'

export function faceOffset(face: Face): number {
  return FACE_ORDER.indexOf(face) * 9
}

export function createSolvedState(): CubeState {
  const state: StickerColor[] = []
  for (const face of FACE_ORDER) {
    for (let i = 0; i < 9; i++) {
      state.push(face)
    }
  }
  return state
}

export function cloneState(state: CubeState): CubeState {
  return [...state]
}

export function isSolved(state: CubeState): boolean {
  for (let f = 0; f < 6; f++) {
    const base = f * 9
    const color = state[base]
    for (let i = 1; i < 9; i++) {
      if (state[base + i] !== color) return false
    }
  }
  return true
}

export function validateStateBasic(state: CubeState): boolean {
  if (state.length !== 54) return false
  const counts: Record<string, number> = {}
  for (const s of state) {
    counts[s] = (counts[s] ?? 0) + 1
  }
  for (const face of FACE_ORDER) {
    if (counts[face] !== 9) return false
  }
  return true
}
