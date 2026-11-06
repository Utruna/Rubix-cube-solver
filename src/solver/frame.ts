import type { CubeSize, CubeState, Face } from '../cube/types'
import { CORNER_FACELETS, InvalidCubeError } from './kociemba/cubie'

/** Indice d'un sticker de coin dans la disposition 3x3 -> indice dans un cube de taille `size`. */
export function cornerStickerIndex(index3x3: number, size: CubeSize): number {
  const face = Math.floor(index3x3 / 9)
  const row = Math.floor((index3x3 % 9) / 3) / 2
  const col = (index3x3 % 3) / 2
  return face * size * size + row * (size - 1) * size + col * (size - 1)
}

/**
 * Les cubes 2x2 et 4x4 n'ont pas de centres fixes : on renomme les couleurs pour que le coin DLB
 * lise (D, B, L). Les trois autres couleurs sont les opposées, déduites des coins voisins.
 * Le cube peut ensuite être résolu vers l'état canonique (une face = une couleur du même nom)
 * sans jamais déplacer ce coin.
 */
export function normalizeColors(state: CubeState, size: CubeSize): CubeState {
  const corners = CORNER_FACELETS.map(f => f.map(i => state[cornerStickerIndex(i, size)]))
  const [d, b, l] = corners[6]
  const thirdColor = (x: Face, y: Face, z: Face): Face | undefined =>
    corners.find(c => c.includes(x) && c.includes(y) && !c.includes(z))?.find(c => c !== x && c !== y)

  const rename = new Map<Face, Face>([[d, 'D'], [b, 'B'], [l, 'L']])
  const oppositeOfL = thirdColor(d, b, l)
  const oppositeOfB = thirdColor(d, l, b)
  const oppositeOfD = thirdColor(b, l, d)
  if (oppositeOfL) rename.set(oppositeOfL, 'R')
  if (oppositeOfB) rename.set(oppositeOfB, 'F')
  if (oppositeOfD) rename.set(oppositeOfD, 'U')
  if (rename.size !== 6) {
    throw new InvalidCubeError('bad-corner', 'The colors are inconsistent (invalid cube).')
  }
  return state.map(c => rename.get(c)!)
}
