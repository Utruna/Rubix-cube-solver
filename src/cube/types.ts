export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B'
export type StickerColor = 'U' | 'R' | 'F' | 'D' | 'L' | 'B'
export type CubeSize = 2 | 3 | 4 | 5

export type MoveModifier = '' | "'" | '2'
export interface Move {
  face: Face
  modifier: MoveModifier
  width?: number
}

export type CubeState = StickerColor[]

export const FACE_ORDER: Face[] = ['U', 'R', 'F', 'D', 'L', 'B']

/** Couleurs des autocollants (palette système sombre : vives sans être criardes). */
export const FACE_COLORS: Record<Face, string> = {
  U: '#f5f5f7',
  R: '#ff3b30',
  F: '#34c759',
  D: '#ffcc00',
  L: '#ff9500',
  B: '#0a7aff',
}
