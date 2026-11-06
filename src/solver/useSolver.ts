import { useCallback, useEffect, useRef } from 'react'
import type { CubeSize, CubeState, Move } from '../cube/types'
import { parseAlg } from '../cube/notation'
import { solve as solveSync } from './index'
import SolverWorker from './solver.worker?worker&inline'

type SolveResult = { moves: Move[]; error: string | null }
type Request = { state: CubeState; cubeSize: CubeSize; scrambleAlg?: string }
type Pending = { resolve: (result: SolveResult) => void; request: Request }

/** Repli sans worker (ex. page ouverte en file:// où Chromium refuse les workers blob). */
function solveOnMainThread({ state, cubeSize, scrambleAlg }: Request): Promise<SolveResult> {
  // setTimeout laisse le navigateur afficher « Solving… » avant de bloquer le thread.
  return new Promise(resolve => setTimeout(() => {
    try {
      const out = solveSync(state, cubeSize, scrambleAlg)
      resolve(out.error === null ? { moves: out.moves, error: null } : { moves: [], error: out.error })
    } catch (err) {
      resolve({ moves: [], error: String(err) })
    }
  }, 50))
}

export function useSolver() {
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef<Map<string, Pending>>(new Map())

  useEffect(() => {
    const pending = pendingRef.current
    let worker: Worker
    try {
      worker = new SolverWorker()
    } catch {
      return // pas de worker : `solve` retombe sur le thread principal
    }
    workerRef.current = worker

    worker.onmessage = (e: MessageEvent<{ id: string; solution: string | null; error: string | null }>) => {
      const { id, solution, error } = e.data
      const entry = pending.get(id)
      if (!entry) return
      pending.delete(id)
      entry.resolve(error || solution === null
        ? { moves: [], error: error ?? 'Unknown error' }
        : { moves: parseAlg(solution), error: null })
    }

    worker.onerror = (e) => {
      e.preventDefault()
      workerRef.current = null
      for (const [id, entry] of pending) {
        pending.delete(id)
        void solveOnMainThread(entry.request).then(entry.resolve)
      }
    }

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const solve = useCallback((state: CubeState, cubeSize: CubeSize, scrambleAlg?: string): Promise<SolveResult> => {
    const request = { state, cubeSize, scrambleAlg }
    const worker = workerRef.current
    if (!worker) return solveOnMainThread(request)
    return new Promise(resolve => {
      const id = crypto.randomUUID()
      pendingRef.current.set(id, { resolve, request })
      worker.postMessage({ id, cubeState: state, cubeSize, scrambleAlg })
    })
  }, [])

  return { solve }
}
