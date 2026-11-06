import type { CubeSize, CubeState } from '../cube/types'
import { formatAlg } from '../cube/notation'
import { solve } from './index'

self.onmessage = (e: MessageEvent<{ id: string; cubeState: CubeState; cubeSize: CubeSize; scrambleAlg?: string }>) => {
  const { id, cubeState, cubeSize, scrambleAlg } = e.data
  try {
    const result = solve(cubeState, cubeSize, scrambleAlg)
    self.postMessage(
      result.error === null
        ? { id, solution: formatAlg(result.moves), error: null }
        : { id, solution: null, error: result.error },
    )
  } catch (err) {
    self.postMessage({ id, solution: null, error: String(err) })
  }
}

export {}
