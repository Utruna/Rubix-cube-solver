import { idsOf } from './geometry'

/**
 * Corrections de parité du 4x4 réduit (algorithmes classiques de la méthode par réduction).
 * Vérifiées par les tests : elles laissent centres et arêtes appariées en place et rendent
 * respectivement une arête retournée / une permutation impaire au cube réduit.
 */

/** « OLL parity » : retourne une arête appariée (et déplace quelques coins, sans importance ici). */
export const OLL_PARITY = idsOf("Rw' U2 Lw F2 Lw' F2 Rw2 U2 Rw U2 Rw' U2 F2 Rw2 F2")

/** « PLL parity » : 2R2 U2 2R2 Uw2 2R2 Uw2, où 2R2 est la tranche intérieure seule (Rw2 R2). */
export const PLL_PARITY = idsOf('Rw2 R2 U2 Rw2 R2 Uw2 Rw2 R2 Uw2')

/** Correction à appliquer selon l'erreur renvoyée par la validation du 3x3 réduit. */
export const PARITY_FIXES: Record<string, number[] | undefined> = {
  'flipped-edge': OLL_PARITY,
  parity: PLL_PARITY,
}
