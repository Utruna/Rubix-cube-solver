import type { CubeSize, CubeState, Face, Move } from './types'
import { faceOffset } from './state'

type Axis = 'x' | 'y' | 'z'
type Layer = 'min' | 'max'
type Vec3 = { x: number; y: number; z: number }
type Sticker = { pos: Vec3; normal: Vec3 }
type Rotation = { axis: Axis; layer: Layer; rotate: (v: Vec3) => Vec3 }

const FACE_ORDER: Face[] = ['U', 'R', 'F', 'D', 'L', 'B']

const MOVE_ROTATIONS: Record<Face, Rotation> = {
  U: { axis: 'y', layer: 'max', rotate: (v) => ({ x: v.z, y: v.y, z: -v.x }) },
  D: { axis: 'y', layer: 'min', rotate: (v) => ({ x: -v.z, y: v.y, z: v.x }) },
  R: { axis: 'x', layer: 'max', rotate: (v) => ({ x: v.x, y: v.z, z: -v.y }) },
  L: { axis: 'x', layer: 'min', rotate: (v) => ({ x: v.x, y: -v.z, z: v.y }) },
  F: { axis: 'z', layer: 'max', rotate: (v) => ({ x: v.y, y: -v.x, z: v.z }) },
  B: { axis: 'z', layer: 'min', rotate: (v) => ({ x: -v.y, y: v.x, z: v.z }) },
}

function faceToNormal(face: Face): Vec3 {
  if (face === 'U') return { x: 0, y: 1, z: 0 }
  if (face === 'D') return { x: 0, y: -1, z: 0 }
  if (face === 'R') return { x: 1, y: 0, z: 0 }
  if (face === 'L') return { x: -1, y: 0, z: 0 }
  if (face === 'F') return { x: 0, y: 0, z: 1 }
  return { x: 0, y: 0, z: -1 }
}

function normalToFace(normal: Vec3): Face {
  if (normal.x === 1) return 'R'
  if (normal.x === -1) return 'L'
  if (normal.y === 1) return 'U'
  if (normal.y === -1) return 'D'
  if (normal.z === 1) return 'F'
  return 'B'
}

function coordValues(size: number): number[] {
  const min = -(size - 1)
  return Array.from({ length: size }, (_, i) => min + i * 2)
}

function coordToIndex(coord: number, size: number): number {
  const min = -(size - 1)
  return (coord - min) / 2
}

function rowColToSticker(face: Face, row: number, col: number, size: number): Sticker {
  const values = coordValues(size)
  const min = values[0]
  const max = values[size - 1]

  if (face === 'U') return { pos: { x: values[col], y: max, z: values[row] }, normal: faceToNormal(face) }
  if (face === 'D') return { pos: { x: values[col], y: min, z: values[size - 1 - row] }, normal: faceToNormal(face) }
  if (face === 'R') return { pos: { x: max, y: values[size - 1 - row], z: values[size - 1 - col] }, normal: faceToNormal(face) }
  if (face === 'L') return { pos: { x: min, y: values[size - 1 - row], z: values[col] }, normal: faceToNormal(face) }
  if (face === 'F') return { pos: { x: values[col], y: values[size - 1 - row], z: max }, normal: faceToNormal(face) }
  return { pos: { x: values[size - 1 - col], y: values[size - 1 - row], z: min }, normal: faceToNormal(face) }
}

function stickerToIndex(sticker: Sticker, size: number): number {
  const face = normalToFace(sticker.normal)
  const { x, y, z } = sticker.pos

  let row = 0
  let col = 0

  if (face === 'U') {
    row = coordToIndex(z, size)
    col = coordToIndex(x, size)
  } else if (face === 'D') {
    row = size - 1 - coordToIndex(z, size)
    col = coordToIndex(x, size)
  } else if (face === 'R') {
    row = size - 1 - coordToIndex(y, size)
    col = size - 1 - coordToIndex(z, size)
  } else if (face === 'L') {
    row = size - 1 - coordToIndex(y, size)
    col = coordToIndex(z, size)
  } else if (face === 'F') {
    row = size - 1 - coordToIndex(y, size)
    col = coordToIndex(x, size)
  } else {
    row = size - 1 - coordToIndex(y, size)
    col = size - 1 - coordToIndex(x, size)
  }

  return faceOffset(face, size) + row * size + col
}

function isInLayerBand(pos: Vec3, axis: Axis, layer: Layer, width: number, size: number): boolean {
  const min = -(size - 1)
  const max = size - 1

  const lower = layer === 'max' ? max - (width - 1) * 2 : min
  const upper = layer === 'max' ? max : min + (width - 1) * 2

  if (axis === 'x') return pos.x >= lower && pos.x <= upper
  if (axis === 'y') return pos.y >= lower && pos.y <= upper
  return pos.z >= lower && pos.z <= upper
}

function buildBaseStickers(size: number): Sticker[] {
  const result: Sticker[] = []
  for (const face of FACE_ORDER) {
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        result.push(rowColToSticker(face, row, col, size))
      }
    }
  }
  return result
}

function buildPermutation(face: Face, size: number, width: number): number[] {
  const baseStickers = buildBaseStickers(size)
  const rotation = MOVE_ROTATIONS[face]
  const total = 6 * size * size
  const perm = new Array<number>(total)

  for (let oldIndex = 0; oldIndex < total; oldIndex++) {
    const source = baseStickers[oldIndex]
    const shouldRotate = isInLayerBand(source.pos, rotation.axis, rotation.layer, width, size)
    const transformed: Sticker = shouldRotate
      ? { pos: rotation.rotate(source.pos), normal: rotation.rotate(source.normal) }
      : source

    const newIndex = stickerToIndex(transformed, size)
    perm[newIndex] = oldIndex
  }

  return perm
}

const permutationCache = new Map<string, number[]>()

function getPermutationWithWidth(face: Face, size: number, width: number): number[] {
  const key = `${face}:${size}:${width}`
  const existing = permutationCache.get(key)
  if (existing) return existing
  const built = buildPermutation(face, size, width)
  permutationCache.set(key, built)
  return built
}

function applyPermutation(state: CubeState, perm: number[]): CubeState {
  const next = new Array<string>(state.length)
  for (let i = 0; i < perm.length; i++) {
    next[i] = state[perm[i]]
  }
  return next as CubeState
}

export function applyMove(state: CubeState, move: Move, size: CubeSize = 3): CubeState {
  const turns = move.modifier === '2' ? 2 : move.modifier === "'" ? 3 : 1
  const width = Math.max(1, Math.min(move.width ?? 1, Math.floor(size / 2)))
  const perm = getPermutationWithWidth(move.face, size, width)
  let next = [...state]
  for (let i = 0; i < turns; i++) {
    next = applyPermutation(next, perm)
  }
  return next
}

export function applyAlg(state: CubeState, moves: Move[], size: CubeSize = 3): CubeState {
  let next = [...state]
  for (const move of moves) {
    next = applyMove(next, move, size)
  }
  return next
}
