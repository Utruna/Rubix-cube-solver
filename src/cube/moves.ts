import Cube from 'cubejs'
import type { CubeState, Move } from './types'
import { formatAlg, formatMove } from './notation'
import { fromCubeJsString, toCubeJsString } from '../solver/adapter'

export function applyMove(state: CubeState, move: Move): CubeState {
  const cube = Cube.fromString(toCubeJsString(state))
  cube.move(formatMove(move))
  return fromCubeJsString(cube.asString())
}

export function applyAlg(state: CubeState, moves: Move[]): CubeState {
  if (moves.length === 0) return [...state]
  const cube = Cube.fromString(toCubeJsString(state))
  cube.move(formatAlg(moves))
  return fromCubeJsString(cube.asString())
}
