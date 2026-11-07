import { CENTER_STICKERS, EDGES, MOVES, N_MOVES, WINGS, applyPerm, inverseMoveId } from './geometry'
import { OLL_PARITY, PLL_PARITY } from './parity'

/**
 * Appariement des arêtes (les deux « ailes » de chaque arête doivent se rejoindre).
 *
 * On construit une bibliothèque de commutateurs [X, Y] (et leurs conjugués) qui laissent chaque
 * centre dans sa face. À chaque étape, on joue celui qui apparie le plus d'arêtes sans défaire les
 * paires existantes. Les coins et les arêtes non appariées peuvent bouger : le solveur 3x3 s'en
 * charge ensuite.
 */

export interface Macro {
  seq: number[]
  perm: Uint8Array
  /** `perm` restreinte aux 48 stickers testés pour l'appariement (évaluation rapide). */
  checks: Uint8Array
}

const STICKER_IDENTITY: Uint8Array = Uint8Array.from({ length: 96 }, (_, i) => i)
const faceOf = (id: number): number => Math.floor(id / 3) % 6
const widthOf = (id: number): number => Math.floor(id / 18)
const inverseSeq = (seq: number[]): number[] => [...seq].reverse().map(inverseMoveId)
export const permOfSeq = (seq: number[]): Uint8Array => seq.reduce<Uint8Array>((st, id) => applyPerm(st, MOVES[id].perm), STICKER_IDENTITY)

function keepsCentersInPlace(perm: Uint8Array): boolean {
  return CENTER_STICKERS.every(s => Math.floor(perm[s] / 16) === Math.floor(s / 16) && perm[s] % 16 >= 5)
}

/** Hachage 53 bits (cyrb53) d'une permutation, pour dédoublonner la bibliothèque. */
function hashPerm(perm: Uint8Array): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (const v of perm) {
    h1 = Math.imul(h1 ^ v, 2654435761)
    h2 = Math.imul(h2 ^ v, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

let library: Macro[] | null = null
/** Les `checks` de toutes les macros, bout à bout (48 octets chacune) : parcours séquentiel rapide. */
let flatChecks: Uint8Array | null = null

export function getEdgeLibrary(): Macro[] {
  if (library) return library
  const singles: number[][] = Array.from({ length: N_MOVES }, (_, i) => [i])
  const setups: number[][] = [...singles]
  for (const a of singles) {
    for (const b of singles) {
      if (faceOf(a[0]) !== faceOf(b[0]) || widthOf(a[0]) !== widthOf(b[0])) setups.push([a[0], b[0]])
    }
  }

  const byPerm = new Map<number, Macro>()
  const add = (seq: number[]) => {
    const perm = permOfSeq(seq)
    if (!keepsCentersInPlace(perm)) return
    const key = hashPerm(perm)
    const existing = byPerm.get(key)
    if (!existing || existing.seq.length > seq.length) byPerm.set(key, makeMacro(seq, perm))
  }
  for (const x of setups) {
    for (const y of singles) {
      const commutator = [...x, ...y, ...inverseSeq(x), ...inverseSeq(y)]
      add(commutator)
      add(inverseSeq(commutator))
    }
  }
  // Conjugaisons A C A' : la même idée appliquée à d'autres arêtes.
  for (const { seq } of [...byPerm.values()]) {
    for (let a = 0; a < N_MOVES; a++) {
      if (faceOf(a) === faceOf(seq[0]) && widthOf(a) === widthOf(seq[0])) continue
      add([a, ...seq, inverseMoveId(a)])
    }
  }
  const identityKey = hashPerm(STICKER_IDENTITY)
  byPerm.delete(identityKey)
  library = [...byPerm.values()].sort((x, y) => x.seq.length - y.seq.length)
  flatChecks = new Uint8Array(library.length * 48)
  library.forEach((macro, i) => flatChecks!.set(macro.checks, i * 48))
  return library
}

// Pour chaque arête : (aile 1, face A), (aile 2, face A), (aile 1, face B), (aile 2, face B).
const EDGE_CHECKS = Int16Array.from(
  EDGES.flatMap(edge => {
    const stickerOn = (wing: number, face: number) => WINGS[wing].stickers.find(s => Math.floor(s / 16) === face)!
    const [w1, w2] = edge.wings
    const [fa, fb] = edge.faces
    return [stickerOn(w1, fa), stickerOn(w2, fa), stickerOn(w1, fb), stickerOn(w2, fb)]
  }),
)

const EDGE_CHECKS_IDENTITY = Uint8Array.from(EDGE_CHECKS)

const makeMacro = (seq: number[], perm: Uint8Array = permOfSeq(seq)): Macro => ({
  seq,
  perm,
  checks: Uint8Array.from(EDGE_CHECKS, i => perm[i]),
})

/** Arêtes appariées de `state` une fois la macro jouée. */
function pairedAfter(state: Uint8Array, checks: Uint8Array): number {
  let mask = 0
  for (let e = 0, k = 0; e < 12; e++, k += 4) {
    if (state[checks[k]] === state[checks[k + 1]] && state[checks[k + 2]] === state[checks[k + 3]]) mask |= 1 << e
  }
  return mask
}

/** Construit à l'avance la bibliothèque de macros et les corrections de parité courantes. */
export function warmUpEdges(): void {
  getEdgeLibrary()
  getParityCandidates(2)
}

/** Bit e du masque = l'arête e est appariée, pour `state` vu à travers `perm` (ou tel quel). */
export function pairedEdges(state: Uint8Array, perm?: Uint8Array): number {
  let mask = 0
  for (let e = 0; e < 12; e++) {
    const k = e * 4
    const at = (i: number) => state[perm ? perm[EDGE_CHECKS[i]] : EDGE_CHECKS[i]]
    if (at(k) === at(k + 1) && at(k + 2) === at(k + 3)) mask |= 1 << e
  }
  return mask
}

const popcount = (x: number): number => {
  let n = 0
  for (; x; x &= x - 1) n++
  return n
}


/** La macro la plus courte parmi celles qui apparient le plus d'arêtes sans défaire les paires. */
function findImproving(state: Uint8Array, paired: number, firstOnly = false): Macro | null {
  const lib = getEdgeLibrary()
  const flat = flatChecks!
  const pairedCount = popcount(paired)
  // Les arêtes déjà appariées sont testées d'abord : presque toutes les macros échouent là.
  const required: number[] = []
  for (let e = 0; e < 12; e++) if ((paired >> e) & 1) required.push(e * 4)
  const nRequired = required.length
  let best: Macro | null = null
  let bestGain = 0
  for (let i = 0, base = 0; i < lib.length; i++, base += 48) {
    let ok = true
    for (let r = 0; r < nRequired; r++) {
      const k = base + required[r]
      if (state[flat[k]] !== state[flat[k + 1]] || state[flat[k + 2]] !== state[flat[k + 3]]) {
        ok = false
        break
      }
    }
    if (!ok) continue
    const gain = popcount(pairedAfter(state, lib[i].checks)) - pairedCount
    if (gain > bestGain) {
      best = lib[i]
      bestGain = gain
      if (firstOnly) return best
    }
  }
  return best
}

const parityCandidates = new Map<number, Macro[]>()

/** Corrections de parité conjuguées par 0 à `depth` mouvements de faces extérieures (les centres restent en place). */
function getParityCandidates(depth: number): Macro[] {
  const cached = parityCandidates.get(depth)
  if (cached) return cached
  const faceMoves = Array.from({ length: N_MOVES / 2 }, (_, i) => i)
  let setups: number[][] = [[]]
  let layer: number[][] = [[]]
  for (let d = 0; d < depth; d++) {
    layer = layer.flatMap(prefix => faceMoves
      .filter(m => prefix.length === 0 || faceOf(m) !== faceOf(prefix[prefix.length - 1]))
      .map(m => [...prefix, m]))
    setups = setups.concat(layer)
  }
  const candidates = [OLL_PARITY, PLL_PARITY].flatMap(fix =>
    setups.map(setup => makeMacro([...setup, ...fix, ...inverseSeq(setup)])),
  )
  parityCandidates.set(depth, candidates)
  return candidates
}

/** Apparie les 12 arêtes (les centres doivent déjà être résolus). */
export class PairingGaveUp extends Error {}

/** Au-delà de ce nombre de corrections de parité, on préfère repartir d'une autre configuration. */
const MAX_PARITY_FIXES = 3

export function pairEdges(
  initial: Uint8Array,
  trace?: (message: string) => void,
): { state: Uint8Array; moves: number[] } {
  let parityFixes = 0
  let state = initial
  let paired = pairedEdges(state)
  const played: number[] = []
  const visited = new Set<string>()
  const play = (macro: Macro) => {
    visited.add(state.join(','))
    state = applyPerm(state, macro.perm)
    paired = pairedEdges(state)
    played.push(...macro.seq)
  }

  for (let step = 0; popcount(paired) < 12; step++) {
    if (step > 60) throw new Error('Could not pair the 4x4 edges.')
    const improving = findImproving(state, paired)
    if (improving) {
      play(improving)
      trace?.(`step ${step}: improving macro (${improving.seq.length} moves) -> ${popcount(paired)} pairs`)
      continue
    }
    // Bloqué : c'est une parité. On joue une correction (préparée par quelques mouvements de faces
    // pour viser d'autres arêtes) après laquelle l'appariement progresse de nouveau, sans revenir en arrière.
    let unlocking: Macro | null = null
    let fallback: Macro | null = null
    const stuckStart = performance.now()
    for (const depth of [2, 3]) {
      trace?.(`  tier ${depth} start +${Math.round(performance.now() - stuckStart)}ms`)
      const scored = getParityCandidates(depth)
        .map(candidate => ({ candidate, next: applyPerm(state, candidate.perm) }))
        .filter(({ next }) => !visited.has(next.join(',')))
        .map(entry => ({ ...entry, mask: pairedAfter(entry.next, EDGE_CHECKS_IDENTITY) }))
        .sort((x, y) => popcount(y.mask) - popcount(x.mask) || x.candidate.seq.length - y.candidate.seq.length)
      trace?.(`  tier ${depth} scored ${scored.length} +${Math.round(performance.now() - stuckStart)}ms`)
      fallback ??= scored[0]?.candidate ?? null
      // Les meilleurs d'abord, puis un échantillon varié du reste (déterministe).
      const rest = scored.slice(20)
      const sample = [...scored.slice(0, 20), ...Array.from({ length: Math.min(40, rest.length) }, (_, i) =>
        rest[(i * 7919 + step * 31) % rest.length])]
      const found = sample.find(({ next, mask }) => findImproving(next, mask, true))
      if (found) {
        unlocking = found.candidate
        break
      }
    }
    const chosen = unlocking ?? fallback
    if (!chosen || ++parityFixes > MAX_PARITY_FIXES) throw new PairingGaveUp('Edge pairing is stuck.')
    play(chosen)
    trace?.(`step ${step}: STUCK, played parity fix -> ${popcount(paired)} pairs`)
  }
  return { state, moves: played }
}

const MAX_PAIRING_ATTEMPTS = 8

/**
 * Apparie les arêtes de façon fiable : si une tentative s'enlise (trop de corrections de parité),
 * on tourne quelques faces (les centres restent résolus) et on repart d'une autre configuration.
 */
export function pairEdgesReliably(initial: Uint8Array): { state: Uint8Array; moves: number[] } {
  let state = initial
  const prefix: number[] = []
  for (let attempt = 0; ; attempt++) {
    try {
      const paired = pairEdges(state)
      return { state: paired.state, moves: [...prefix, ...paired.moves] }
    } catch (err) {
      if (!(err instanceof PairingGaveUp) || attempt >= MAX_PAIRING_ATTEMPTS) throw err
      // Deux mouvements de faces extérieures, différents à chaque tentative.
      const shuffle = [(attempt * 5 + 1) % 18, 3 * ((attempt + 2) % 6) + ((attempt + 1) % 3)]
      for (const id of shuffle) state = applyPerm(state, MOVES[id].perm)
      prefix.push(...shuffle)
    }
  }
}
