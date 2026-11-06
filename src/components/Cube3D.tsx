import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { isSolved } from '../cube/state'
import type { CubeSize, CubeState, Face, Move } from '../cube/types'
import { FACE_COLORS } from '../cube/types'
import { faceOffset } from '../cube/state'
import { useCubeStore } from '../store/cubeStore'

interface Props {
  state: CubeState
  size: CubeSize
}

const CAMERA_POSITION: [number, number, number] = [5.9, 5.2, 5.9]
const CAMERA_FOV = 36
const MIN_POLAR = 0.25
const MAX_POLAR = Math.PI - 0.25
const MIN_RADIUS = 6
const MAX_RADIUS = 18

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

// ---- Rendu d'un cubie : corps en plastique noir + autocollants arrondis légèrement en relief ----

const BODY_COLOR = '#0c0c0e'
const CELEBRATION_MS = 1700

const BODY_MATERIAL = new THREE.MeshPhysicalMaterial({
  color: BODY_COLOR,
  roughness: 0.5,
  metalness: 0.05,
  clearcoat: 0.35,
  clearcoatRoughness: 0.35,
})
const STICKER_MATERIALS = Object.fromEntries(
  (Object.keys(FACE_COLORS) as Face[]).map(face => [
    face,
    new THREE.MeshPhysicalMaterial({
      color: FACE_COLORS[face],
      roughness: 0.5,
      metalness: 0,
      clearcoat: 0.25,
      clearcoatRoughness: 0.38,
    }),
  ]),
) as Record<Face, THREE.MeshPhysicalMaterial>

const STICKER_ROTATION: Record<Face, [number, number, number]> = {
  R: [0, Math.PI / 2, 0],
  L: [0, -Math.PI / 2, 0],
  U: [-Math.PI / 2, 0, 0],
  D: [Math.PI / 2, 0, 0],
  F: [0, 0, 0],
  B: [0, Math.PI, 0],
}

const STICKER_RELIEF = 0.014

/** Autocollant : carré arrondi avec un petit biseau, qui accroche la lumière sur ses bords. */
function roundedSticker(width: number, radius: number): THREE.ExtrudeGeometry {
  const x = -width / 2
  const y = -width / 2
  const shape = new THREE.Shape()
  shape.moveTo(x + radius, y)
  shape.lineTo(x + width - radius, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + radius)
  shape.lineTo(x + width, y + width - radius)
  shape.quadraticCurveTo(x + width, y + width, x + width - radius, y + width)
  shape.lineTo(x + radius, y + width)
  shape.quadraticCurveTo(x, y + width, x, y + width - radius)
  shape.lineTo(x, y + radius)
  shape.quadraticCurveTo(x, y, x + radius, y)
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.002,
    bevelEnabled: true,
    bevelThickness: STICKER_RELIEF,
    bevelSize: STICKER_RELIEF * 0.9,
    bevelSegments: 3,
    curveSegments: 8,
  })
}

const geometryCache = new Map<number, { body: THREE.BufferGeometry; sticker: THREE.BufferGeometry; half: number }>()

function getCubieGeometry(size: number) {
  let entry = geometryCache.get(size)
  if (!entry) {
    const spacing = 2 / Math.max(1, size - 1)
    const cubieSize = spacing * 0.96
    entry = {
      body: new RoundedBoxGeometry(cubieSize, cubieSize, cubieSize, 4, cubieSize * 0.13),
      sticker: roundedSticker(cubieSize * 0.78, cubieSize * 0.16),
      half: cubieSize / 2 - 0.004,
    }
    geometryCache.set(size, entry)
  }
  return entry
}

function Cubie({ cubie, state, size }: { cubie: CubieInfo; state: CubeState; size: CubeSize }) {
  const { body, sticker, half } = getCubieGeometry(size)
  return (
    <group position={cubie.pos}>
      <mesh geometry={body} material={BODY_MATERIAL} />
      {FACE_DIRS.map(dir => {
        const idx = getStickerIndex(cubie.ix, cubie.iy, cubie.iz, dir, size)
        if (idx === null) return null
        return (
          <mesh
            key={dir.face}
            geometry={sticker}
            material={STICKER_MATERIALS[state[idx] as Face]}
            position={[dir.normal[0] * half, dir.normal[1] * half, dir.normal[2] * half]}
            rotation={STICKER_ROTATION[dir.face]}
          />
        )
      })}
    </group>
  )
}

/** Extension d'un cube de `size` (pour ramener tous les formats à la même taille à l'écran). */
const extentOf = (size: number) => 1 + 0.96 / Math.max(1, size - 1)
const NORMALIZED_EXTENT = 1.5

/** Ombre douce sous le cube (plus légère et plus nette qu'une vraie ombre portée). */
function GroundShadow() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const ctx = canvas.getContext('2d')!
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
    gradient.addColorStop(0, 'rgba(0,0,0,0.92)')
    gradient.addColorStop(0.45, 'rgba(0,0,0,0.5)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 256, 256)
    return new THREE.CanvasTexture(canvas)
  }, [])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -NORMALIZED_EXTENT - 0.28, 0]}>
      <planeGeometry args={[8.5, 8.5]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  )
}

/** Lumière qui suit la caméra : les faces visibles restent bien éclairées sous tous les angles. */
function CameraLight() {
  const light = useRef<THREE.DirectionalLight>(null)
  useFrame(({ camera }) => {
    if (!light.current) return
    light.current.position.copy(camera.position)
    light.current.position.y += 2.5
    light.current.position.x -= 1.5
  })
  return <directionalLight ref={light} intensity={0.85} />
}

/** Reflets réalistes : une petite pièce éclairée sert d'environnement aux plastiques vernis. */
function StudioEnvironment() {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const target = pmrem.fromScene(room, 0.04)
    scene.environment = target.texture
    scene.environmentIntensity = 0.38
    return () => {
      scene.environment = null
      target.dispose()
      pmrem.dispose()
      room.dispose()
    }
  }, [gl, scene])
  return null
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
    let frame = 0
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

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

    // Rotation lente quand personne n'y touche (la vue reste libre dès qu'on glisse ou qu'on zoome).
    // Tour complet de la vue quand le cube vient d'être résolu (interrompu dès qu'on saisit le cube).
    const onCelebrate = () => {
      if (reduceMotion) return
      cancelAnimationFrame(frame)
      const from = state.theta
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / CELEBRATION_MS)
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
        state.theta = from - eased * Math.PI * 2
        updateCamera()
        if (t < 1) frame = requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
    }
    window.addEventListener('cube-solved', onCelebrate)

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      dragging = true
      cancelAnimationFrame(frame)
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
      cancelAnimationFrame(frame)
      window.removeEventListener('cube-solved', onCelebrate)
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
      flat
      dpr={[1, 2]}
      camera={{ position: CAMERA_POSITION, fov: CAMERA_FOV }}
      gl={{ antialias: true, alpha: true }}
      style={{ width: '100%', height: '100%', background: 'transparent' }}
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

  // Vrai entre le moment où l'animation « logique » change et celui où React a redistribué les cubies
  // (couches fixes / tournantes) et leurs couleurs : on ne touche pas à la rotation pendant ce temps.
  const awaitingCommitRef = useRef(false)

  const startAnimation = (anim: ActiveAnimation) => {
    activeAnimRef.current = anim
    awaitingCommitRef.current = true
    setActiveAnim(anim)
    setDisplayState(anim.fromState)
  }

  // Une fois le nouvel état affiché ET les couches redistribuées, on remet la couche à zéro et on
  // démarre le chronomètre : avant l'affichage, donc sans image intermédiaire (plus de clignotement).
  useLayoutEffect(() => {
    if (rotatingGroupRef.current) rotatingGroupRef.current.rotation.set(0, 0, 0)
    elapsedMsRef.current = 0
    accumulatorMsRef.current = 0
    awaitingCommitRef.current = false
  }, [activeAnim])

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
      // Un peu plus court que l'intervalle de lecture (1 s / vitesse) : les coups s'enchaînent sans à-coup.
      const durationMs = Math.min(700, Math.max(120, 780 / Math.max(animSpeed, 0.1)))
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

  // Petite célébration (tour de vue) quand un coup vient de résoudre le cube.
  const wasSolvedRef = useRef(isSolved(state, size))
  useEffect(() => {
    const nowSolved = isSolved(displayState, size)
    if (nowSolved && !wasSolvedRef.current && processedMoveRef.current > 0 && !activeAnimRef.current) {
      window.dispatchEvent(new Event('cube-solved'))
    }
    wasSolvedRef.current = nowSolved
  }, [displayState, size])

  useFrame((_, delta) => {
    const anim = activeAnimRef.current
    const rotatingGroup = rotatingGroupRef.current
    if (!anim || !rotatingGroup || awaitingCommitRef.current) return

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
      // La couche reste à son angle final (identique, à l'œil, au nouvel état) jusqu'à ce que React
      // ait affiché le nouvel état ; le useLayoutEffect ci-dessus la remet ensuite à zéro.
      setAxisRotation(rotatingGroup, anim.axis, anim.targetAngle)
      awaitingCommitRef.current = true
      setDisplayState(anim.toState)
      const next = animQueueRef.current.shift()
      activeAnimRef.current = next ?? null
      setActiveAnim(next ?? null)
    }
  })

  const cubiesByLayer = useMemo(() => {
    if (!activeAnim) return { rotating: [] as CubieInfo[], fixed: cubies }
    return splitCubies(cubies, activeAnim.axis, activeAnim.layer, activeAnim.width, size)
  }, [activeAnim, cubies, size])

  return (
    <>
      <StudioEnvironment />
      <hemisphereLight args={['#ffffff', '#44444c', 0.5]} />
      <directionalLight position={[3, 8, 2]} intensity={0.3} />
      <CameraLight />
      <GroundShadow />
      <group scale={NORMALIZED_EXTENT / extentOf(size)}>
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
