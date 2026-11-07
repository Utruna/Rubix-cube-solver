import type { CubeSize, CubeState } from '../cube/types'
import { formatAlg } from '../cube/notation'
import { solve, warmUp } from './index'

type SolveRequest = { id: string; cubeState: CubeState; cubeSize: CubeSize; scrambleAlg?: string }
type WarmUpRequest = { type: 'warmup'; size: CubeSize }

self.onmessage = (e: MessageEvent<SolveRequest | WarmUpRequest>) => {
  if ('type' in e.data) {
    warmUp(e.data.size)
    self.postMessage({ type: 'ready', size: e.data.size })
    return
  }
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
