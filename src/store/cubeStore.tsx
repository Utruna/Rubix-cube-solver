/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useMemo, useReducer } from 'react'
import type { CubeSize, CubeState, Move } from '../cube/types'
import { createSolvedState } from '../cube/state'
import { applyAlg, applyMove } from '../cube/moves'
import { defaultScrambleLength, generateScrambleForSize } from '../cube/scramble'
import { formatAlg } from '../cube/notation'

export type SolverStatus = 'idle' | 'solving' | 'solved' | 'error'
export type AnimationStatus = 'idle' | 'playing' | 'paused'

interface CubeStoreState {
  cubeSize: CubeSize
  cubeState: CubeState
  scrambleAlg: string
  solutionMoves: Move[]
  currentMoveIndex: number
  lastAppliedMove: { move: Move; sequence: number } | null
  solverStatus: SolverStatus
  solverError: string | null
  animStatus: AnimationStatus
  animSpeed: number
}

interface CubeStoreActions {
  setCubeSize: (size: CubeSize) => void
  reset: () => void
  scramble: () => void
  setCubeState: (state: CubeState) => void
  setSolution: (moves: Move[]) => void
  setSolverStatus: (status: SolverStatus, error?: string) => void
  stepForward: () => void
  stepBackward: () => void
  playAnimation: () => void
  pauseAnimation: () => void
  setAnimSpeed: (speed: number) => void
  setCurrentMoveIndex: (index: number) => void
}

export type CubeStore = CubeStoreState & CubeStoreActions

type Action =
  | { type: 'setCubeSize'; payload: CubeSize }
  | { type: 'reset' }
  | { type: 'scramble'; payload: { state: CubeState; scrambleAlg: string } }
  | { type: 'setCubeState'; payload: CubeState }
  | { type: 'setSolution'; payload: Move[] }
  | { type: 'setSolverStatus'; payload: { status: SolverStatus; error: string | null } }
  | { type: 'stepForward' }
  | { type: 'stepBackward' }
  | { type: 'playAnimation' }
  | { type: 'pauseAnimation' }
  | { type: 'setAnimSpeed'; payload: number }
  | { type: 'setCurrentMoveIndex'; payload: number }

const initialState: CubeStoreState = {
  cubeSize: 3,
  cubeState: createSolvedState(3),
  scrambleAlg: '',
  solutionMoves: [],
  currentMoveIndex: 0,
  lastAppliedMove: null,
  solverStatus: 'idle',
  solverError: null,
  animStatus: 'idle',
  animSpeed: 2,
}

let moveSequence = 0

function inverseMove(move: Move): Move {
  const inverseMod = move.modifier === '' ? "'" : move.modifier === "'" ? '' : '2'
  return { face: move.face, modifier: inverseMod as Move['modifier'], width: move.width }
}

function reducer(state: CubeStoreState, action: Action): CubeStoreState {
  switch (action.type) {
    case 'setCubeSize':
      return {
        ...state,
        cubeSize: action.payload,
        cubeState: createSolvedState(action.payload),
        scrambleAlg: '',
        solutionMoves: [],
        currentMoveIndex: 0,
        lastAppliedMove: null,
        solverStatus: 'idle',
        solverError: null,
        animStatus: 'idle',
      }

    case 'reset':
      return {
        ...initialState,
        cubeSize: state.cubeSize,
        cubeState: createSolvedState(state.cubeSize),
        animSpeed: state.animSpeed,
      }

    case 'scramble':
      return {
        ...state,
        cubeState: action.payload.state,
        scrambleAlg: action.payload.scrambleAlg,
        solutionMoves: [],
        currentMoveIndex: 0,
        lastAppliedMove: null,
        solverStatus: 'idle',
        solverError: null,
        animStatus: 'idle',
      }

    case 'setCubeState':
      return {
        ...state,
        cubeState: action.payload,
        lastAppliedMove: null,
      }

    case 'setSolution':
      return {
        ...state,
        solutionMoves: action.payload,
        currentMoveIndex: 0,
        lastAppliedMove: null,
        animStatus: 'idle',
      }

    case 'setSolverStatus':
      return {
        ...state,
        solverStatus: action.payload.status,
        solverError: action.payload.error,
      }

    case 'stepForward': {
      if (state.currentMoveIndex >= state.solutionMoves.length) return state
      const move = state.solutionMoves[state.currentMoveIndex]
      moveSequence += 1
      return {
        ...state,
        cubeState: applyMove(state.cubeState, move, state.cubeSize),
        currentMoveIndex: state.currentMoveIndex + 1,
        lastAppliedMove: { move, sequence: moveSequence },
      }
    }

    case 'stepBackward': {
      if (state.currentMoveIndex <= 0) return state
      const targetIndex = state.currentMoveIndex - 1
      const prevMove = state.solutionMoves[targetIndex]
      const move = inverseMove(prevMove)
      moveSequence += 1
      return {
        ...state,
        cubeState: applyMove(state.cubeState, move, state.cubeSize),
        currentMoveIndex: targetIndex,
        lastAppliedMove: { move, sequence: moveSequence },
      }
    }

    case 'playAnimation':
      return { ...state, animStatus: 'playing' }

    case 'pauseAnimation':
      return { ...state, animStatus: 'paused' }

    case 'setAnimSpeed':
      return { ...state, animSpeed: action.payload }

    case 'setCurrentMoveIndex':
      return { ...state, currentMoveIndex: action.payload }

    default:
      return state
  }
}

const CubeStoreContext = createContext<CubeStore | null>(null)

export function CubeStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const setCubeSize = useCallback((size: CubeSize) => {
    dispatch({ type: 'setCubeSize', payload: size })
  }, [])

  const reset = useCallback(() => dispatch({ type: 'reset' }), [])

  const scramble = useCallback(() => {
    const moves = generateScrambleForSize(state.cubeSize, defaultScrambleLength(state.cubeSize))
    dispatch({
      type: 'scramble',
      payload: {
        state: applyAlg(createSolvedState(state.cubeSize), moves, state.cubeSize),
        scrambleAlg: formatAlg(moves),
      },
    })
  }, [state.cubeSize])

  const setCubeState = useCallback((cubeState: CubeState) => {
    dispatch({ type: 'setCubeState', payload: cubeState })
  }, [])

  const setSolution = useCallback((moves: Move[]) => {
    dispatch({ type: 'setSolution', payload: moves })
  }, [])

  const setSolverStatus = useCallback((status: SolverStatus, error?: string) => {
    dispatch({
      type: 'setSolverStatus',
      payload: { status, error: error ?? null },
    })
  }, [])

  const stepForward = useCallback(() => dispatch({ type: 'stepForward' }), [])
  const stepBackward = useCallback(() => dispatch({ type: 'stepBackward' }), [])
  const playAnimation = useCallback(() => dispatch({ type: 'playAnimation' }), [])
  const pauseAnimation = useCallback(() => dispatch({ type: 'pauseAnimation' }), [])

  const setAnimSpeed = useCallback((speed: number) => {
    dispatch({ type: 'setAnimSpeed', payload: speed })
  }, [])

  const setCurrentMoveIndex = useCallback((index: number) => {
    dispatch({ type: 'setCurrentMoveIndex', payload: index })
  }, [])

  const storeValue = useMemo<CubeStore>(() => ({
    ...state,
    setCubeSize,
    reset,
    scramble,
    setCubeState,
    setSolution,
    setSolverStatus,
    stepForward,
    stepBackward,
    playAnimation,
    pauseAnimation,
    setAnimSpeed,
    setCurrentMoveIndex,
  }), [
    pauseAnimation,
    playAnimation,
    reset,
    scramble,
    setCubeSize,
    setAnimSpeed,
    setCubeState,
    setCurrentMoveIndex,
    setSolution,
    setSolverStatus,
    state,
    stepBackward,
    stepForward,
  ])

  return (
    <CubeStoreContext.Provider value={storeValue}>
      {children}
    </CubeStoreContext.Provider>
  )
}

export function useCubeStore<T = CubeStore>(selector?: (store: CubeStore) => T): T {
  const store = useContext(CubeStoreContext)
  if (!store) {
    throw new Error('useCubeStore must be used within CubeStoreProvider')
  }
  if (!selector) return store as T
  return selector(store)
}
