import React from 'react'
import type { CubeState, Face } from '../cube/types'
import { FACE_COLORS } from '../cube/types'
import { faceOffset } from '../cube/state'

interface Props {
  state: CubeState
}

const CELL = 28
const GAP = 2

export function CubeNet({ state }: Props) {
  const faceSize = CELL * 3 + GAP * 2
  const padding = 4

  const positions: Array<{ face: Face; row: number; col: number }> = [
    { face: 'U', row: 0, col: 1 },
    { face: 'L', row: 1, col: 0 },
    { face: 'F', row: 1, col: 1 },
    { face: 'R', row: 1, col: 2 },
    { face: 'B', row: 1, col: 3 },
    { face: 'D', row: 2, col: 1 },
  ]

  const totalW = 4 * (faceSize + padding) + padding
  const totalH = 3 * (faceSize + padding) + padding

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={totalW} height={totalH} style={{ display: 'block', margin: '0 auto' }}>
        {positions.map(({ face, row, col }) => {
          const x = padding + col * (faceSize + padding)
          const y = padding + row * (faceSize + padding)
          return (
            <g key={face} transform={`translate(${x},${y})`}>
              <text x={faceSize / 2} y={-4} textAnchor="middle" fill="#aaa" fontSize={10}>{face}</text>
              {Array.from({ length: 9 }, (_, i) => {
                const r = Math.floor(i / 3)
                const c = i % 3
                const color = FACE_COLORS[state[faceOffset(face) + i] as Face]
                return (
                  <rect
                    key={i}
                    x={c * (CELL + GAP)}
                    y={r * (CELL + GAP)}
                    width={CELL}
                    height={CELL}
                    fill={color}
                    stroke="#333"
                    strokeWidth={1}
                    rx={3}
                  />
                )
              })}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
