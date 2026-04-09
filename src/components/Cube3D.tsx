import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { CubeState, Face, Move } from '../cube/types'
import { FACE_COLORS } from '../cube/types'
import { faceOffset } from '../cube/state'
import { useCubeStore } from '../store/cubeStore'

interface Props {
  state: CubeState
}

const CAMERA_POSITION: [number, number, number] = [3.5, 3, 3.5]
const CAMERA_FOV = 47

type FaceDir = { face: Face; normal: [number, number, number] }

const FACE_DIRS: FaceDir[] = [
  { face: 'R', normal: [1, 0, 0] },
  { face: 'L', normal: [-1, 0, 0] },
  { face: 'U', normal: [0, 1, 0] },
  { face: 'D', normal: [0, -1, 0] },
  { face: 'F', normal: [0, 0, 1] },
  { face: 'B', normal: [0, 0, -1] },
]

function getStickerIndex(pos: [number, number, number], dir: FaceDir): number | null {
  const [px, py, pz] = pos
  const [nx, ny, nz] = dir.normal
  const face = dir.face

  if (nx === 1 && px !== 1) return null
  if (nx === -1 && px !== -1) return null
  if (ny === 1 && py !== 1) return null
  if (ny === -1 && py !== -1) return null
  if (nz === 1 && pz !== 1) return null
  if (nz === -1 && pz !== -1) return null

  const offset = faceOffset(face)
  let row = 0, col = 0

  if (face === 'U') { col = px + 1; row = pz + 1 }
  else if (face === 'D') { col = px + 1; row = 1 - pz }
  else if (face === 'R') { col = 1 - pz; row = 1 - py }
  else if (face === 'L') { col = pz + 1; row = 1 - py }
  else if (face === 'F') { col = px + 1; row = 1 - py }
  else { col = 1 - px; row = 1 - py }

  return offset + row * 3 + col
}

function Cubie({ pos, state }: { pos: [number, number, number]; state: CubeState }) {
  const CUBIE_SIZE = 0.92

  const materials = useMemo(() => {
    return FACE_DIRS.map(dir => {
      const idx = getStickerIndex(pos, dir)
      const color = idx !== null ? FACE_COLORS[state[idx] as Face] : '#1a1a1a'
      return new THREE.MeshStandardMaterial({ color })
    })
  }, [pos, state])

  return (
    <mesh position={pos} castShadow>
      <boxGeometry args={[CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE]} />
      {materials.map((mat, i) => (
        <primitive key={i} object={mat} attach={`material-${i}`} />
      ))}
    </mesh>
  )
}

type Axis = 'x' | 'y' | 'z'
type SignedMove = { axis: Axis; layer: -1 | 1; quarterTurns: number }

const FACE_AXIS: Record<Face, { axis: Axis; layer: -1 | 1; sign: 1 | -1 }> = {
  U: { axis: 'y', layer: 1, sign: -1 },
  D: { axis: 'y', layer: -1, sign: 1 },
  R: { axis: 'x', layer: 1, sign: -1 },
  L: { axis: 'x', layer: -1, sign: 1 },
  F: { axis: 'z', layer: 1, sign: -1 },
  B: { axis: 'z', layer: -1, sign: 1 },
}

function moveToSigned(move: Move): SignedMove {
  const base = FACE_AXIS[move.face]
  const turns = move.modifier === '2' ? 2 : 1
  const dir = move.modifier === "'" ? -1 : 1
  return {
    axis: base.axis,
    layer: base.layer,
    quarterTurns: base.sign * dir * turns,
  }
}

function isInLayer(pos: [number, number, number], axis: Axis, layer: -1 | 1): boolean {
  if (axis === 'x') return pos[0] === layer
  if (axis === 'y') return pos[1] === layer
  return pos[2] === layer
}

function splitPositions(positions: [number, number, number][], axis: Axis, layer: -1 | 1) {
  const rotating: [number, number, number][] = []
  const fixed: [number, number, number][] = []
  for (const pos of positions) {
    if (isInLayer(pos, axis, layer)) rotating.push(pos)
    else fixed.push(pos)
  }
  return { rotating, fixed }
}

function keyFromPos([x, y, z]: [number, number, number]) {
  return `${x},${y},${z}`
}

function setAxisRotation(group: THREE.Group, axis: Axis, angle: number): void {
  group.rotation.set(0, 0, 0)
  group.rotation[axis] = angle
}

type ActiveAnimation = {
  axis: Axis
  layer: -1 | 1
  targetAngle: number
  fromState: CubeState
  toState: CubeState
  durationMs: number
}

const FIXED_FPS = 60
const FIXED_STEP_MS = 1000 / FIXED_FPS
const MAX_CATCHUP_STEPS = 5

function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2
}

const POSITIONS: [number, number, number][] = []
for (let x = -1; x <= 1; x++)
  for (let y = -1; y <= 1; y++)
    for (let z = -1; z <= 1; z++)
      POSITIONS.push([x, y, z])

export function Cube3D({ state }: Props) {
  return (
    <Canvas
      camera={{ position: CAMERA_POSITION, fov: CAMERA_FOV }}
      style={{ width: '100%', height: '400px', background: '#1a1a2e' }}
      shadows
    >
      <CubeScene state={state} />
    </Canvas>
  )
}

function CubeScene({ state }: Props) {
  const animSpeed = useCubeStore(s => s.animSpeed)
  const lastAppliedMove = useCubeStore(s => s.lastAppliedMove)

  const [displayState, setDisplayState] = useState<CubeState>(state)
  const [activeAnim, setActiveAnim] = useState<ActiveAnimation | null>(null)

  const rotatingGroupRef = useRef<THREE.Group | null>(null)
  const prevStateRef = useRef<CubeState>(state)
  const processedMoveRef = useRef<number>(0)
  const activeAnimRef = useRef<ActiveAnimation | null>(null)
  const animQueueRef = useRef<ActiveAnimation[]>([])
  const elapsedMsRef = useRef<number>(0)
  const accumulatorMsRef = useRef<number>(0)

  const startAnimation = (anim: ActiveAnimation) => {
    activeAnimRef.current = anim
    setActiveAnim(anim)
    setDisplayState(anim.fromState)
    elapsedMsRef.current = 0
    accumulatorMsRef.current = 0
    if (rotatingGroupRef.current) {
      setAxisRotation(rotatingGroupRef.current, anim.axis, 0)
    }
  }

  useEffect(() => {
    const prevState = prevStateRef.current
    if (
      lastAppliedMove &&
      lastAppliedMove.sequence > processedMoveRef.current &&
      prevState !== state
    ) {
      processedMoveRef.current = lastAppliedMove.sequence
      const signed = moveToSigned(lastAppliedMove.move)
      const durationMs = Math.max(90, 260 / Math.max(animSpeed, 0.1))
      const anim: ActiveAnimation = {
        axis: signed.axis,
        layer: signed.layer,
        targetAngle: signed.quarterTurns * (Math.PI / 2),
        fromState: prevState,
        toState: state,
        durationMs,
      }
      if (activeAnimRef.current) {
        animQueueRef.current.push(anim)
      } else {
        startAnimation(anim)
      }
    } else {
      animQueueRef.current = []
      activeAnimRef.current = null
      setActiveAnim(null)
      setDisplayState(state)
      elapsedMsRef.current = 0
      accumulatorMsRef.current = 0
    }
    prevStateRef.current = state
  }, [state, lastAppliedMove, animSpeed])

  useFrame((_, delta) => {
    const anim = activeAnimRef.current
    const rotatingGroup = rotatingGroupRef.current
    if (!anim || !rotatingGroup) return

    accumulatorMsRef.current += delta * 1000
    let steps = 0
    while (accumulatorMsRef.current >= FIXED_STEP_MS && steps < MAX_CATCHUP_STEPS) {
      accumulatorMsRef.current -= FIXED_STEP_MS
      elapsedMsRef.current += FIXED_STEP_MS
      steps += 1
    }

    const progress = Math.min(1, elapsedMsRef.current / anim.durationMs)
    const eased = easeInOutCubic(progress)
    setAxisRotation(rotatingGroup, anim.axis, anim.targetAngle * eased)

    if (progress >= 1) {
      setDisplayState(anim.toState)
      const next = animQueueRef.current.shift()
      if (next) {
        startAnimation(next)
      } else {
        setAxisRotation(rotatingGroup, anim.axis, 0)
        activeAnimRef.current = null
        setActiveAnim(null)
      }
    }
  })

  const positionsByLayer = useMemo(() => {
    if (!activeAnim) return { rotating: [] as [number, number, number][], fixed: POSITIONS }
    return splitPositions(POSITIONS, activeAnim.axis, activeAnim.layer)
  }, [activeAnim])

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} castShadow />
      <directionalLight position={[-5, -5, -5]} intensity={0.2} />
      <group>
        {positionsByLayer.fixed.map(pos => (
          <Cubie key={`fixed-${keyFromPos(pos)}`} pos={pos} state={displayState} />
        ))}
        <group ref={rotatingGroupRef}>
          {positionsByLayer.rotating.map(pos => (
            <Cubie key={`rot-${keyFromPos(pos)}`} pos={pos} state={displayState} />
          ))}
        </group>
      </group>
      <OrbitControls enableDamping dampingFactor={0.1} />
    </>
  )
}
