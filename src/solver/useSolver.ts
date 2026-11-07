import { useCallback, useEffect, useRef, useState } from 'react'
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

/** Tailles qui ont un solveur dédié (les autres n'ont rien à préparer). */
const PREPARED_SIZES: CubeSize[] = [2, 3, 4]

export function useSolver() {
  const workerRef = useRef<Worker | null>(null)
  const requestedRef = useRef<Set<CubeSize>>(new Set())
  const [readySizes, setReadySizes] = useState<ReadonlySet<CubeSize>>(new Set())
  // État (et non seulement la ref) : l'indicateur « préparation » doit se rafraîchir quand le worker apparaît.
  const [hasWorker, setHasWorker] = useState(false)
  const pendingRef = useRef<Map<string, Pending>>(new Map())

  useEffect(() => {
    const pending = pendingRef.current
    const requested = requestedRef.current
    let worker: Worker
    try {
      worker = new SolverWorker()
    } catch {
      return // pas de worker : `solve` retombe sur le thread principal
    }
    workerRef.current = worker
    setHasWorker(true)

    worker.onmessage = (
      e: MessageEvent<{ type: 'ready'; size: CubeSize } | { id: string; solution: string | null; error: string | null }>,
    ) => {
      if ('type' in e.data) {
        const size = e.data.size
        setReadySizes(previous => new Set(previous).add(size))
        return
      }
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
      setHasWorker(false)
      requested.clear()
      for (const [id, entry] of pending) {
        pending.delete(id)
        void solveOnMainThread(entry.request).then(entry.resolve)
      }
    }

    return () => {
      worker.terminate()
      workerRef.current = null
      setHasWorker(false)
      requested.clear()
      setReadySizes(new Set())
    }
  }, [])

  /** Demande au worker de préparer le solveur de `size` en arrière-plan (une seule fois par taille). */
  const warmUp = useCallback((size: CubeSize) => {
    const worker = workerRef.current
    if (!worker || requestedRef.current.has(size) || !PREPARED_SIZES.includes(size)) return
    requestedRef.current.add(size)
    worker.postMessage({ type: 'warmup', size })
  }, [])

  /** Vrai quand rien n'est à attendre : solveur prêt, taille sans préparation ou pas de worker. */
  const isReady = useCallback(
    (size: CubeSize) => !hasWorker || !PREPARED_SIZES.includes(size) || readySizes.has(size),
    [hasWorker, readySizes],
  )

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

  return { solve, warmUp, isReady }
}
