import { create } from 'zustand'
import type { CubeState, Move } from '../cube/types'
import { createSolvedState } from '../cube/state'
import { applyAlg, applyMove } from '../cube/moves'
import { generateScramble } from '../cube/scramble'
import { formatAlg } from '../cube/notation'

export type SolverStatus = 'idle' | 'solving' | 'solved' | 'error'
export type AnimationStatus = 'idle' | 'playing' | 'paused'

interface CubeStore {
  cubeState: CubeState
  scrambleAlg: string
  solutionMoves: Move[]
  currentMoveIndex: number
  solverStatus: SolverStatus
  solverError: string | null
  animStatus: AnimationStatus
  animSpeed: number
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

export const useCubeStore = create<CubeStore>((set, get) => ({
  cubeState: createSolvedState(),
  scrambleAlg: '',
  solutionMoves: [],
  currentMoveIndex: 0,
  solverStatus: 'idle',
  solverError: null,
  animStatus: 'idle',
  animSpeed: 2,

  reset: () => set({
    cubeState: createSolvedState(),
    scrambleAlg: '',
    solutionMoves: [],
    currentMoveIndex: 0,
    solverStatus: 'idle',
    solverError: null,
    animStatus: 'idle',
  }),

  scramble: () => {
    const moves = generateScramble(25)
    const state = applyAlg(createSolvedState(), moves)
    set({
      cubeState: state,
      scrambleAlg: formatAlg(moves),
      solutionMoves: [],
      currentMoveIndex: 0,
      solverStatus: 'idle',
      solverError: null,
      animStatus: 'idle',
    })
  },

  setCubeState: (state) => set({ cubeState: state }),

  setSolution: (moves) => set({
    solutionMoves: moves,
    currentMoveIndex: 0,
    animStatus: 'idle',
  }),

  setSolverStatus: (status, error) => set({
    solverStatus: status,
    solverError: error ?? null,
  }),

  stepForward: () => {
    const { cubeState, solutionMoves, currentMoveIndex } = get()
    if (currentMoveIndex >= solutionMoves.length) return
    const move = solutionMoves[currentMoveIndex]
    const newState = applyMove(cubeState, move)
    set({ cubeState: newState, currentMoveIndex: currentMoveIndex + 1 })
  },

  stepBackward: () => {
    const { cubeState, solutionMoves, currentMoveIndex } = get()
    if (currentMoveIndex <= 0) return
    const targetIndex = currentMoveIndex - 1
    const prevMove = solutionMoves[targetIndex]
    const inverseMod = prevMove.modifier === '' ? "'" : prevMove.modifier === "'" ? '' : '2'
    const inverseMove = { face: prevMove.face, modifier: inverseMod as Move['modifier'] }
    const newState = applyMove(cubeState, inverseMove)
    set({ cubeState: newState, currentMoveIndex: targetIndex })
  },

  playAnimation: () => set({ animStatus: 'playing' }),
  pauseAnimation: () => set({ animStatus: 'paused' }),
  setAnimSpeed: (speed) => set({ animSpeed: speed }),
  setCurrentMoveIndex: (index) => set({ currentMoveIndex: index }),
}))
