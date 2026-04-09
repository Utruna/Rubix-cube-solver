import type { CubeState, Face } from '../cube/types'
import { faceOffset } from '../cube/state'

export function toCubeJsString(state: CubeState): string {
  const faces: Face[] = ['U', 'R', 'F', 'D', 'L', 'B']
  let result = ''
  for (const face of faces) {
    const offset = faceOffset(face)
    for (let i = 0; i < 9; i++) {
      result += state[offset + i]
    }
  }
  return result
}

export function fromCubeJsString(faceString: string): CubeState {
  if (faceString.length !== 54) {
    throw new Error(`Invalid cube string length: ${faceString.length}`)
  }
  return faceString.split('') as CubeState
}
