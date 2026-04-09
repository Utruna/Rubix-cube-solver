import React, { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { CubeState, Face } from '../cube/types'
import { FACE_COLORS } from '../cube/types'
import { faceOffset } from '../cube/state'

interface Props {
  state: CubeState
}

const CAMERA_POSITION: [number, number, number] = [3.5, 3, 3.5]
const CAMERA_FOV = 45

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

  if (face === 'U') { col = px + 1; row = 1 - pz }
  else if (face === 'D') { col = px + 1; row = pz + 1 }
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
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} castShadow />
      <directionalLight position={[-5, -5, -5]} intensity={0.2} />
      <group>
        {POSITIONS.map((pos, i) => (
          <Cubie key={i} pos={pos} state={state} />
        ))}
      </group>
      <OrbitControls enableDamping dampingFactor={0.1} />
    </Canvas>
  )
}
