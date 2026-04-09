import { useCallback, useEffect, useRef } from 'react'
import type { CubeState, Move } from '../cube/types'
import { toCubeJsString } from './adapter'
import { parseAlg } from '../cube/notation'

type SolveResult = { moves: Move[]; error: string | null }

export function useSolver() {
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef<Map<string, (result: SolveResult) => void>>(new Map())

  useEffect(() => {
    const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker

    worker.onmessage = (e: MessageEvent<{ id: string; solution: string | null; error: string | null }>) => {
      const { id, solution, error } = e.data
      const resolve = pendingRef.current.get(id)
      if (resolve) {
        pendingRef.current.delete(id)
        if (error || solution === null) {
          resolve({ moves: [], error: error ?? 'Unknown error' })
        } else {
          resolve({ moves: parseAlg(solution), error: null })
        }
      }
    }

    return () => {
      worker.terminate()
    }
  }, [])

  const solve = useCallback((state: CubeState): Promise<SolveResult> => {
    return new Promise((resolve) => {
      if (!workerRef.current) {
        resolve({ moves: [], error: 'Worker not initialized' })
        return
      }
      const id = Math.random().toString(36).slice(2)
      pendingRef.current.set(id, resolve)
      const faceString = toCubeJsString(state)
      workerRef.current.postMessage({ id, faceString })
    })
  }, [])

  return { solve }
}
