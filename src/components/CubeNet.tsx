import type { CubeSize, CubeState, Face } from '../cube/types'
import { FACE_COLORS } from '../cube/types'
import { faceOffset } from '../cube/state'

interface Props {
  state: CubeState
  size: CubeSize
}

// Pixel dimensions for each sticker cell and gap between cells
const CELL = 30
const GAP = 3

export function CubeNet({ state, size }: Props) {
  const faceSize = CELL * size + GAP * (size - 1)
  const padding = 18

  const positions: Array<{ face: Face; row: number; col: number }> = [
    { face: 'U', row: 0, col: 1 },
    { face: 'L', row: 1, col: 0 },
    { face: 'F', row: 1, col: 1 },
    { face: 'R', row: 1, col: 2 },
    { face: 'B', row: 1, col: 3 },
    { face: 'D', row: 2, col: 1 },
  ]

  const totalW = 4 * (faceSize + padding) + padding
  const totalH = 3 * (faceSize + padding) + padding + 8

  return (
    <div className="net-wrap">
      <svg className="net" viewBox={`0 0 ${totalW} ${totalH}`} preserveAspectRatio="xMidYMid meet">
        {positions.map(({ face, row, col }) => {
          const x = padding + col * (faceSize + padding)
          const y = padding + 6 + row * (faceSize + padding)
          return (
            <g key={face} transform={`translate(${x},${y})`}>
              <rect x={-5} y={-5} width={faceSize + 10} height={faceSize + 10} rx={10} fill="#0c0c0e" />
              <text x={faceSize / 2} y={-11} textAnchor="middle" fill="#86868b" fontSize={11} fontWeight={600}>{face}</text>
              {Array.from({ length: size * size }, (_, i) => {
                const r = Math.floor(i / size)
                const c = i % size
                const color = FACE_COLORS[state[faceOffset(face, size) + i] as Face]
                return (
                  <rect
                    key={i}
                    x={c * (CELL + GAP)}
                    y={r * (CELL + GAP)}
                    width={CELL}
                    height={CELL}
                    fill={color}
                    rx={6}
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
