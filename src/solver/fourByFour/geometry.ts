import { getPermutationWithWidth, getStickerGeometry } from '../../cube/moves'
import { parseAlg } from '../../cube/notation'
import type { Face, Move, MoveModifier } from '../../cube/types'
import { FACE_ORDER } from '../../cube/types'

/** Constantes géométriques du 4x4 (16 stickers par face, lecture ligne par ligne). */
export const SIZE = 4
export const N_STICKERS = 6 * SIZE * SIZE

const CENTER_OFFSETS = [5, 6, 9, 10]
const CORNER_OFFSETS = [0, 3, 12, 15]

/** Les 24 stickers de centre, face par face. */
export const CENTER_STICKERS: number[] = FACE_ORDER.flatMap((_, f) => CENTER_OFFSETS.map(o => f * 16 + o))

export const isCenter = (i: number): boolean => CENTER_OFFSETS.includes(i % 16)
export const isCorner = (i: number): boolean => CORNER_OFFSETS.includes(i % 16)

/** Ailes : un « aile » est une pièce d'arête à deux stickers ; 24 au total, 2 par arête. */
export interface Wing {
  stickers: [number, number]
  /** Arêtes (0..11) à laquelle appartient cette aile. */
  edge: number
}

export interface EdgeLocation {
  wings: [number, number]
  /** Les deux faces de l'arête (indices de FACE_ORDER). */
  faces: [number, number]
}

function buildWings(): { wings: Wing[]; edges: EdgeLocation[] } {
  const geometry = getStickerGeometry(SIZE)
  const byPosition = new Map<string, number[]>()
  geometry.forEach((g, i) => {
    if (isCenter(i) || isCorner(i)) return
    const key = `${g.pos.x},${g.pos.y},${g.pos.z}`
    byPosition.set(key, [...(byPosition.get(key) ?? []), i])
  })

  const faceOfNormal = (n: { x: number; y: number; z: number }): number =>
    Math.floor(
      FACE_ORDER.indexOf(
        n.x === 1 ? 'R' : n.x === -1 ? 'L' : n.y === 1 ? 'U' : n.y === -1 ? 'D' : n.z === 1 ? 'F' : 'B',
      ),
    )

  const wings: Wing[] = []
  const edgeIndex = new Map<string, number>()
  const edges: EdgeLocation[] = []
  for (const stickers of byPosition.values()) {
    const [a, b] = stickers.sort((x, y) => x - y)
    const faces = [faceOfNormal(geometry[a].normal), faceOfNormal(geometry[b].normal)].sort() as [number, number]
    const key = faces.join('-')
    if (!edgeIndex.has(key)) {
      edgeIndex.set(key, edges.length)
      edges.push({ wings: [-1, -1], faces })
    }
    const edge = edgeIndex.get(key)!
    wings.push({ stickers: [a, b], edge })
    const location = edges[edge]
    location.wings[location.wings[0] < 0 ? 0 : 1] = wings.length - 1
  }
  return { wings, edges }
}

export const { wings: WINGS, edges: EDGES } = buildWings()

// ---- Mouvements ---------------------------------------------------------------------------------

export const MODIFIERS: MoveModifier[] = ['', '2', "'"]

/** Indice d'un mouvement : (largeur - 1) * 18 + 3 * face + puissance (0 = quart de tour, 1 = demi-tour, 2 = inverse). */
export const N_MOVES = 36

export interface MoveDef {
  move: Move
  /** `nouveau[i] = ancien[perm[i]]` */
  perm: Uint8Array
}

function compose(p: ArrayLike<number>): Uint8Array {
  return Uint8Array.from({ length: p.length }, (_, i) => p[p[i]])
}

export const MOVES: MoveDef[] = (() => {
  const defs: MoveDef[] = []
  for (const width of [1, 2]) {
    for (const face of FACE_ORDER) {
      const quarter = Uint8Array.from(getPermutationWithWidth(face, SIZE, width))
      const half = compose(quarter)
      const inverse = Uint8Array.from(half, (_, i) => quarter[half[i]])
      const perms = [quarter, half, inverse]
      perms.forEach((perm, mod) => {
        defs.push({ move: { face, modifier: MODIFIERS[mod], width }, perm })
      })
    }
  }
  return defs
})()

export const moveId = (face: Face, width: 1 | 2, power: 0 | 1 | 2): number =>
  (width - 1) * 18 + FACE_ORDER.indexOf(face) * 3 + power

export const inverseMoveId = (id: number): number => id - (id % 3) + (2 - (id % 3))

export function applyPerm(state: Uint8Array, perm: ArrayLike<number>): Uint8Array {
  const next = new Uint8Array(state.length)
  for (let i = 0; i < perm.length; i++) next[i] = state[perm[i]]
  return next
}

export function applyMoveId(state: Uint8Array, id: number): Uint8Array {
  return applyPerm(state, MOVES[id].perm)
}

export function toMoves(ids: number[]): Move[] {
  return ids.map(id => MOVES[id].move)
}

/** `CubeState` (lettres) -> codes couleur 0..5 (ordre FACE_ORDER). */
export function encodeState(state: readonly string[]): Uint8Array {
  return Uint8Array.from(state, c => FACE_ORDER.indexOf(c as Face))
}

export function decodeState(state: Uint8Array): Face[] {
  return Array.from(state, c => FACE_ORDER[c])
}

/** Indices de mouvements d'une séquence en notation standard (ex. "Rw2 U'"). */
export function idsOf(alg: string): number[] {
  return parseAlg(alg).map(m => moveId(m.face, (m.width ?? 1) as 1 | 2, m.modifier === '' ? 0 : m.modifier === '2' ? 1 : 2))
}
