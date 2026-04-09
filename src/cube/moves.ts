import type { CubeState, Face, Move } from './types'
import { cloneState, faceOffset } from './state'

function rotateFaceCW(state: CubeState, face: Face): void {
  const o = faceOffset(face)
  const [a, b, c, d, e, f, g, h, i] = [
    state[o], state[o+1], state[o+2],
    state[o+3], state[o+4], state[o+5],
    state[o+6], state[o+7], state[o+8],
  ]
  state[o]   = g; state[o+1] = d; state[o+2] = a
  state[o+3] = h; state[o+4] = e; state[o+5] = b
  state[o+6] = i; state[o+7] = f; state[o+8] = c
}

function cycle4(state: CubeState, positions: [number, number, number, number]): void {
  const tmp = state[positions[3]]
  state[positions[3]] = state[positions[2]]
  state[positions[2]] = state[positions[1]]
  state[positions[1]] = state[positions[0]]
  state[positions[0]] = tmp
}

type Ring = [number, number, number, number][]

const U_RINGS: Ring = [
  [faceOffset('F'), faceOffset('R'), faceOffset('B'), faceOffset('L')],
  [faceOffset('F')+1, faceOffset('R')+1, faceOffset('B')+1, faceOffset('L')+1],
  [faceOffset('F')+2, faceOffset('R')+2, faceOffset('B')+2, faceOffset('L')+2],
]

const D_RINGS: Ring = [
  [faceOffset('F')+6, faceOffset('L')+6, faceOffset('B')+6, faceOffset('R')+6],
  [faceOffset('F')+7, faceOffset('L')+7, faceOffset('B')+7, faceOffset('R')+7],
  [faceOffset('F')+8, faceOffset('L')+8, faceOffset('B')+8, faceOffset('R')+8],
]

const R_RINGS: Ring = [
  [faceOffset('U')+2, faceOffset('B')+6, faceOffset('D')+2, faceOffset('F')+2],
  [faceOffset('U')+5, faceOffset('B')+3, faceOffset('D')+5, faceOffset('F')+5],
  [faceOffset('U')+8, faceOffset('B')+0, faceOffset('D')+8, faceOffset('F')+8],
]

const L_RINGS: Ring = [
  [faceOffset('U')+0, faceOffset('F')+0, faceOffset('D')+0, faceOffset('B')+8],
  [faceOffset('U')+3, faceOffset('F')+3, faceOffset('D')+3, faceOffset('B')+5],
  [faceOffset('U')+6, faceOffset('F')+6, faceOffset('D')+6, faceOffset('B')+2],
]

const F_RINGS: Ring = [
  [faceOffset('U')+6, faceOffset('R')+0, faceOffset('D')+2, faceOffset('L')+8],
  [faceOffset('U')+7, faceOffset('R')+3, faceOffset('D')+1, faceOffset('L')+5],
  [faceOffset('U')+8, faceOffset('R')+6, faceOffset('D')+0, faceOffset('L')+2],
]

const B_RINGS: Ring = [
  [faceOffset('U')+2, faceOffset('L')+0, faceOffset('D')+6, faceOffset('R')+8],
  [faceOffset('U')+1, faceOffset('L')+3, faceOffset('D')+7, faceOffset('R')+5],
  [faceOffset('U')+0, faceOffset('L')+6, faceOffset('D')+8, faceOffset('R')+2],
]

const RINGS: Record<Face, Ring> = {
  U: U_RINGS,
  D: D_RINGS,
  R: R_RINGS,
  L: L_RINGS,
  F: F_RINGS,
  B: B_RINGS,
}

function applyMoveCW(state: CubeState, face: Face): void {
  rotateFaceCW(state, face)
  for (const ring of RINGS[face]) {
    cycle4(state, ring)
  }
}

export function applyMove(state: CubeState, move: Move): CubeState {
  const s = cloneState(state)
  const { face, modifier } = move
  if (modifier === '') {
    applyMoveCW(s, face)
  } else if (modifier === "'") {
    applyMoveCW(s, face)
    applyMoveCW(s, face)
    applyMoveCW(s, face)
  } else {
    applyMoveCW(s, face)
    applyMoveCW(s, face)
  }
  return s
}

export function applyAlg(state: CubeState, moves: Move[]): CubeState {
  let s = state
  for (const m of moves) {
    s = applyMove(s, m)
  }
  return s
}
