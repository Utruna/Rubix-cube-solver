export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B'
export type StickerColor = 'U' | 'R' | 'F' | 'D' | 'L' | 'B'

export type MoveModifier = '' | "'" | '2'
export interface Move {
  face: Face
  modifier: MoveModifier
}

export type CubeState = StickerColor[]

export const FACE_ORDER: Face[] = ['U', 'R', 'F', 'D', 'L', 'B']

export const FACE_COLORS: Record<Face, string> = {
  U: '#ffffff',
  R: '#ff4500',
  F: '#00aa00',
  D: '#ffdd00',
  L: '#ff6600',
  B: '#0044ff',
}
