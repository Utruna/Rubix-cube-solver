import type { CubeSize, CubeState, Face, StickerColor } from './types'
import { FACE_ORDER } from './types'

export function faceOffset(face: Face, size = 3): number {
  return FACE_ORDER.indexOf(face) * size * size
}

export function createSolvedState(size: CubeSize = 3): CubeState {
  const state: StickerColor[] = []
  for (const face of FACE_ORDER) {
    for (let i = 0; i < size * size; i++) {
      state.push(face)
    }
  }
  return state
}

export function cloneState(state: CubeState): CubeState {
  return [...state]
}

export function isSolved(state: CubeState, size = 3): boolean {
  const faceArea = size * size
  for (let f = 0; f < 6; f++) {
    const base = f * faceArea
    const color = state[base]
    for (let i = 1; i < faceArea; i++) {
      if (state[base + i] !== color) return false
    }
  }
  return true
}

export function validateStateBasic(state: CubeState, size = 3): boolean {
  const faceArea = size * size
  if (state.length !== 6 * faceArea) return false
  const counts: Record<string, number> = {}
  for (const s of state) {
    counts[s] = (counts[s] ?? 0) + 1
  }
  for (const face of FACE_ORDER) {
    if (counts[face] !== faceArea) return false
  }
  return true
}
