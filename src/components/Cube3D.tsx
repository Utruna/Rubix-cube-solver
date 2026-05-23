import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { CubeSize, CubeState, Face, Move } from '../cube/types'
import { FACE_COLORS } from '../cube/types'
import { faceOffset } from '../cube/state'
import { useCubeStore } from '../store/cubeStore'

interface Props {
  state: CubeState
  size: CubeSize
}

const CAMERA_POSITION: [number, number, number] = [3.8, 3.3, 3.8]
const CAMERA_FOV = 47
const MIN_POLAR = 0.25
const MAX_POLAR = Math.PI - 0.25
const MIN_RADIUS = 3
const MAX_RADIUS = 12

type Axis = 'x' | 'y' | 'z'
type Layer = 'min' | 'max'
type FaceDir = { face: Face; normal: [number, number, number] }
type CubieInfo = { ix: number; iy: number; iz: number; pos: [number, number, number] }
type SignedMove = { axis: Axis; layer: Layer; quarterTurns: number }

type ActiveAnimation = {
  axis: Axis
  layer: Layer
  width: number
  targetAngle: number
  fromState: CubeState
  toState: CubeState
  durationMs: number
}

const FACE_DIRS: FaceDir[] = [
  { face: 'R', normal: [1, 0, 0] },
  { face: 'L', normal: [-1, 0, 0] },
  { face: 'U', normal: [0, 1, 0] },
  { face: 'D', normal: [0, -1, 0] },
  { face: 'F', normal: [0, 0, 1] },
  { face: 'B', normal: [0, 0, -1] },
]

const FACE_AXIS: Record<Face, { axis: Axis; layer: Layer; sign: 1 | -1 }> = {
  U: { axis: 'y', layer: 'max', sign: -1 },
  D: { axis: 'y', layer: 'min', sign: 1 },
  R: { axis: 'x', layer: 'max', sign: -1 },
  L: { axis: 'x', layer: 'min', sign: 1 },
  F: { axis: 'z', layer: 'max', sign: -1 },
  B: { axis: 'z', layer: 'min', sign: 1 },
}

const FIXED_FPS = 60
const FIXED_STEP_MS = 1000 / FIXED_FPS
const MAX_CATCHUP_STEPS = 5

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function faceStickerIndex(face: Face, row: number, col: number, size: number): number {
  return faceOffset(face, size) + row * size + col
}

function getStickerIndex(ix: number, iy: number, iz: number, dir: FaceDir, size: number): number | null {
  if (dir.face === 'U') {
    if (iy !== size - 1) return null
    return faceStickerIndex('U', iz, ix, size)
  }
  if (dir.face === 'D') {
    if (iy !== 0) return null
    return faceStickerIndex('D', size - 1 - iz, ix, size)
  }
  if (dir.face === 'R') {
    if (ix !== size - 1) return null
    return faceStickerIndex('R', size - 1 - iy, size - 1 - iz, size)
  }
  if (dir.face === 'L') {
    if (ix !== 0) return null
    return faceStickerIndex('L', size - 1 - iy, iz, size)
  }
  if (dir.face === 'F') {
    if (iz !== size - 1) return null
    return faceStickerIndex('F', size - 1 - iy, ix, size)
  }
  if (iz !== 0) return null
  return faceStickerIndex('B', size - 1 - iy, size - 1 - ix, size)
}

function makeCubies(size: CubeSize): CubieInfo[] {
  const center = (size - 1) / 2
  const spacing = 2 / Math.max(1, size - 1)
  const cubies: CubieInfo[] = []

  for (let ix = 0; ix < size; ix++) {
    for (let iy = 0; iy < size; iy++) {
      for (let iz = 0; iz < size; iz++) {
        cubies.push({
          ix,
          iy,
          iz,
          pos: [(ix - center) * spacing, (iy - center) * spacing, (iz - center) * spacing],
        })
      }
    }
  }

  return cubies
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

function isInLayerBand(cubie: CubieInfo, axis: Axis, layer: Layer, width: number, size: CubeSize): boolean {
  const min = 0
  const max = size - 1
  const lower = layer === 'max' ? Math.max(min, max - width + 1) : min
  const upper = layer === 'max' ? max : Math.min(max, min + width - 1)

  if (axis === 'x') return cubie.ix >= lower && cubie.ix <= upper
  if (axis === 'y') return cubie.iy >= lower && cubie.iy <= upper
  return cubie.iz >= lower && cubie.iz <= upper
}

function splitCubies(cubies: CubieInfo[], axis: Axis, layer: Layer, width: number, size: CubeSize) {
  const rotating: CubieInfo[] = []
  const fixed: CubieInfo[] = []
  for (const cubie of cubies) {
    if (isInLayerBand(cubie, axis, layer, width, size)) rotating.push(cubie)
    else fixed.push(cubie)
  }
  return { rotating, fixed }
}

function setAxisRotation(group: THREE.Group, axis: Axis, angle: number): void {
  group.rotation.set(0, 0, 0)
  group.rotation[axis] = angle
}

function keyFromCubie(cubie: CubieInfo) {
  return `${cubie.ix},${cubie.iy},${cubie.iz}`
}

function Cubie({ cubie, state, size }: { cubie: CubieInfo; state: CubeState; size: CubeSize }) {
  const spacing = 2 / Math.max(1, size - 1)
  const cubieSize = spacing * 0.92

  const materials = useMemo(() => {
    return FACE_DIRS.map(dir => {
      const idx = getStickerIndex(cubie.ix, cubie.iy, cubie.iz, dir, size)
      const color = idx !== null ? FACE_COLORS[state[idx] as Face] : '#1a1a1a'
      return new THREE.MeshStandardMaterial({ color })
    })
  }, [cubie.ix, cubie.iy, cubie.iz, size, state])

  return (
    <mesh position={cubie.pos} castShadow>
      <boxGeometry args={[cubieSize, cubieSize, cubieSize]} />
      {materials.map((mat, i) => (
        <primitive key={i} object={mat} attach={`material-${i}`} />
      ))}
    </mesh>
  )
}

function SimpleOrbitControls() {
  const { camera, gl } = useThree()

  useEffect(() => {
    const dom = gl.domElement
    dom.style.touchAction = 'none'

    const target = new THREE.Vector3(0, 0, 0)
    const radius = Math.sqrt(
      camera.position.x * camera.position.x +
      camera.position.y * camera.position.y +
      camera.position.z * camera.position.z,
    )

    const state = {
      radius,
      theta: Math.atan2(camera.position.x, camera.position.z),
      phi: Math.acos(clamp(camera.position.y / radius, -1, 1)),
    }

    let dragging = false
    let lastX = 0
    let lastY = 0

    const updateCamera = () => {
      const sinPhi = Math.sin(state.phi)
      camera.position.set(
        state.radius * sinPhi * Math.sin(state.theta),
        state.radius * Math.cos(state.phi),
        state.radius * sinPhi * Math.cos(state.theta),
      )
      camera.lookAt(target)
    }

    updateCamera()

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      dragging = true
      lastX = event.clientX
      lastY = event.clientY
      dom.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return
      const dx = event.clientX - lastX
      const dy = event.clientY - lastY
      lastX = event.clientX
      lastY = event.clientY

      state.theta -= dx * 0.01
      state.phi = clamp(state.phi + dy * 0.01, MIN_POLAR, MAX_POLAR)
      updateCamera()
    }

    const onPointerUp = (event: PointerEvent) => {
      dragging = false
      if (dom.hasPointerCapture(event.pointerId)) {
        dom.releasePointerCapture(event.pointerId)
      }
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      state.radius = clamp(state.radius + event.deltaY * 0.005, MIN_RADIUS, MAX_RADIUS)
      updateCamera()
    }

    dom.addEventListener('pointerdown', onPointerDown)
    dom.addEventListener('pointermove', onPointerMove)
    dom.addEventListener('pointerup', onPointerUp)
    dom.addEventListener('pointerleave', onPointerUp)
    dom.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      dom.removeEventListener('pointerdown', onPointerDown)
      dom.removeEventListener('pointermove', onPointerMove)
      dom.removeEventListener('pointerup', onPointerUp)
      dom.removeEventListener('pointerleave', onPointerUp)
      dom.removeEventListener('wheel', onWheel)
    }
  }, [camera, gl])

  return null
}

export function Cube3D({ state, size }: Props) {
  return (
    <Canvas
      camera={{ position: CAMERA_POSITION, fov: CAMERA_FOV }}
      style={{ width: '100%', height: '420px', background: '#1a1a2e' }}
      shadows
    >
      <CubeScene state={state} size={size} />
    </Canvas>
  )
}

function CubeScene({ state, size }: Props) {
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

  const cubies = useMemo(() => makeCubies(size), [size])

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
      const width = Math.max(1, Math.min(lastAppliedMove.move.width ?? 1, Math.floor(size / 2)))
      const durationMs = Math.max(90, 260 / Math.max(animSpeed, 0.1))
      const anim: ActiveAnimation = {
        axis: signed.axis,
        layer: signed.layer,
        width,
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
  }, [state, lastAppliedMove, animSpeed, size])

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

  const cubiesByLayer = useMemo(() => {
    if (!activeAnim) return { rotating: [] as CubieInfo[], fixed: cubies }
    return splitCubies(cubies, activeAnim.axis, activeAnim.layer, activeAnim.width, size)
  }, [activeAnim, cubies, size])

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} castShadow />
      <directionalLight position={[-5, -5, -5]} intensity={0.2} />
      <group>
        {cubiesByLayer.fixed.map(cubie => (
          <Cubie key={`fixed-${keyFromCubie(cubie)}`} cubie={cubie} state={displayState} size={size} />
        ))}
        <group ref={rotatingGroupRef}>
          {cubiesByLayer.rotating.map(cubie => (
            <Cubie key={`rot-${keyFromCubie(cubie)}`} cubie={cubie} state={displayState} size={size} />
          ))}
        </group>
      </group>
      <SimpleOrbitControls />
    </>
  )
}
