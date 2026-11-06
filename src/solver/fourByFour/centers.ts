import { FACE_ORDER } from '../../cube/types'
import { CENTER_STICKERS, MOVES, applyMoveId, inverseMoveId, moveId } from './geometry'

/**
 * Résolution des 24 centres en trois étapes. À chaque étape, un masque de 24 bits résume la
 * position des stickers d'une « classe » de couleurs, et un BFS sur ce masque trouve la
 * séquence la plus courte avec les mouvements qui préservent les étapes précédentes.
 *
 * 1. U/D : les centres de couleur U ou D rejoignent les faces U et D.
 * 2. L/R : idem pour L et R (en conservant l'étape 1).
 * 3. Le reste : chaque face reçoit sa couleur (en conservant les étapes 1 et 2).
 */

const [U, R, F, D, L, B] = [0, 1, 2, 3, 4, 5]
const SLOT_OF_STICKER = new Map(CENTER_STICKERS.map((sticker, slot) => [sticker, slot]))

type Face = 0 | 1 | 2 | 3 | 4 | 5
const PAIR_OF_FACE = [0, 1, 2, 0, 1, 2] // U/D, R/L, F/B
const FIRST_COLOR_OF_PAIR = [U, L, F]
const faceOfSlot = (slot: number): Face => Math.floor(slot / 4) as Face

interface Stage {
  /** Bit du masque pour une couleur posée sur un emplacement donné. */
  bit: (color: number, slot: number) => boolean
  /** Masque de l'état résolu. */
  goal: number
  moves: number[]
}

const allMovesOf = (faces: number[], width: 1 | 2, powers: (0 | 1 | 2)[] = [0, 1, 2]): number[] =>
  faces.flatMap(face => powers.map(power => moveId(FACE_ORDER[face], width, power)))

const maskOf = (slots: (slot: number) => boolean): number =>
  CENTER_STICKERS.reduce((mask, _, slot) => (slots(slot) ? mask | (1 << slot) : mask), 0)

const STAGES: Stage[] = [
  {
    bit: color => color === U || color === D,
    goal: maskOf(slot => [U, D].includes(faceOfSlot(slot))),
    moves: [...allMovesOf([U, R, F, D, L, B], 1), ...allMovesOf([U, R, F, D, L, B], 2)],
  },
  {
    bit: color => color === L || color === R,
    goal: maskOf(slot => [L, R].includes(faceOfSlot(slot))),
    moves: [
      ...allMovesOf([R, L, F, B], 1),
      ...allMovesOf([U, D], 2),
      ...allMovesOf([R, L, F, B], 2, [1]),
    ],
  },
  {
    // Chaque paire de faces opposées a une « première » couleur : U, L, F.
    bit: (color, slot) => color === FIRST_COLOR_OF_PAIR[PAIR_OF_FACE[faceOfSlot(slot)]],
    goal: maskOf(slot => [U, L, F].includes(faceOfSlot(slot))),
    moves: [
      ...allMovesOf([U, R, F, D, L, B], 1),
      ...allMovesOf([U, R, F, D, L, B], 2, [1]),
    ],
  },
]

/** Permutation des 24 bits induite par chaque mouvement : source du bit `slot` après le mouvement. */
const SLOT_SOURCES: Int8Array[] = MOVES.map(({ perm }) =>
  Int8Array.from(CENTER_STICKERS, sticker => SLOT_OF_STICKER.get(perm[sticker]) ?? -1),
)

// Tables par octet : masque' = T[0][octet0] | T[1][octet1] | T[2][octet2]
const BYTE_TABLES: Int32Array[][] = SLOT_SOURCES.map(sources =>
  [0, 1, 2].map(byteIndex => {
    const table = new Int32Array(256)
    for (let value = 0; value < 256; value++) {
      let out = 0
      for (let slot = 0; slot < 24; slot++) {
        const src = sources[slot] - byteIndex * 8
        if (src >= 0 && src < 8 && (value >> src) & 1) out |= 1 << slot
      }
      table[value] = out
    }
    return Int32Array.from(table)
  }),
)

const permuteMask = (mask: number, moveIndex: number): number => {
  const [t0, t1, t2] = BYTE_TABLES[moveIndex]
  return t0[mask & 255] | t1[(mask >> 8) & 255] | t2[(mask >> 16) & 255]
}

const visited = new Uint8Array(1 << 24)
const queue = new Int32Array(1 << 20)

/** BFS depuis `start` jusqu'à `goal` ; renvoie les indices de mouvements, ou null si inatteignable. */
function bfs(start: number, goal: number, moves: number[]): number[] | null {
  if (start === goal) return []
  visited.fill(0)
  visited[start] = 255
  let head = 0
  let tail = 0
  queue[tail++] = start
  while (head < tail) {
    const mask = queue[head++]
    for (const m of moves) {
      const next = permuteMask(mask, m)
      if (visited[next]) continue
      visited[next] = m + 1
      if (next === goal) {
        const path: number[] = []
        let cursor = next
        while (cursor !== start) {
          const used = visited[cursor] - 1
          path.push(used)
          cursor = permuteMask(cursor, inverseMoveId(used))
        }
        return path.reverse()
      }
      queue[tail++] = next
    }
  }
  return null
}

function maskOfState(state: Uint8Array, stage: Stage): number {
  return CENTER_STICKERS.reduce((mask, sticker, slot) => (stage.bit(state[sticker], slot) ? mask | (1 << slot) : mask), 0)
}

export function centersSolved(state: Uint8Array): boolean {
  return CENTER_STICKERS.every((sticker, slot) => state[sticker] === faceOfSlot(slot))
}

/**
 * Résout les centres. Renvoie le nouvel état et les mouvements joués.
 * Si une étape est inatteignable (orbite différente), on déplace un peu les centres et on réessaie.
 */
export function solveCenters(initial: Uint8Array): { state: Uint8Array; moves: number[] } {
  let state = initial
  const played: number[] = []

  for (let stageIndex = 0; stageIndex < STAGES.length; stageIndex++) {
    const stage = STAGES[stageIndex]
    for (let attempt = 0; ; attempt++) {
      const path = bfs(maskOfState(state, stage), stage.goal, stage.moves)
      if (path) {
        for (const m of path) state = applyMoveId(state, m)
        played.push(...path)
        break
      }
      if (attempt >= 30) throw new Error(`Could not solve the 4x4 centers (stage ${stageIndex + 1}).`)
      const perturbation = stage.moves[(attempt * 7 + 3) % stage.moves.length]
      state = applyMoveId(state, perturbation)
      played.push(perturbation)
    }
  }
  return { state, moves: played }
}
