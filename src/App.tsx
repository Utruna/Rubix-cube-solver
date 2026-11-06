import { useEffect, useRef, useState } from 'react'
import { useTranslation } from './i18n'
import { useCubeStore } from './store/cubeStore'
import { useSolver } from './solver/useSolver'
import { Cube3D } from './components/Cube3D.tsx'
import { CubeNet } from './components/CubeNet.tsx'
import { AnimationControls } from './components/AnimationControls.tsx'
import { CubeDetector } from './components/CubeDetector.tsx'
import { DebugDetector } from './components/DebugDetector.tsx'
import { isSolved } from './cube/state'
import { formatMove, parseAlg } from './cube/notation'
import type { CubeSize, CubeState } from './cube/types'
import './styles/app.css'

const SIZES: CubeSize[] = [2, 3, 4, 5]

type View = '3d' | '2d' | 'detector' | 'debug'

function MoveChips({ moves, current }: { moves: string[]; current?: number }) {
  const ref = useRef<HTMLDivElement>(null)

  // Garde le coup en cours au centre de la liste sans faire défiler la page.
  useEffect(() => {
    const box = ref.current
    const chip = current === undefined ? undefined : box?.children[Math.min(current, moves.length - 1)]
    if (box && chip instanceof HTMLElement) {
      // Position du coup dans la liste (indépendante des éléments positionnés autour).
      const top = chip.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
      box.scrollTop = top - box.clientHeight / 2 + chip.clientHeight / 2
    }
  }, [current, moves.length])

  return (
    <div className="chips" ref={ref}>
      {moves.map((move, i) => (
        <span
          key={i}
          className={`chip${current === undefined ? '' : i < current ? ' done' : i === current ? ' current' : ''}`}
        >
          {move}
        </span>
      ))}
    </div>
  )
}

export default function App() {
  const { t, language, changeLanguage } = useTranslation()
  const hasVision = !import.meta.env.VITE_STANDALONE
  const isDevMode =
    hasVision && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  const {
    cubeSize,
    cubeState,
    scrambleAlg,
    solutionMoves,
    currentMoveIndex,
    solverStatus,
    solverError,
    animStatus,
    scrambling,
    scrambleIndex,
    setCubeSize,
    scramble,
    reset,
    setSolution,
    setSolverStatus,
    setCubeState,
  } = useCubeStore()

  const { solve } = useSolver()
  const [activeView, setActiveView] = useState<View>(isDevMode ? 'debug' : '3d')
  const [solveSeconds, setSolveSeconds] = useState<number | null>(null)

  const solved = isSolved(cubeState, cubeSize)
  const hasSolution = solutionMoves.length > 0
  const busy = solverStatus === 'solving' || animStatus === 'playing' || scrambling

  // Le temps de calcul n'a plus de sens dès que le cube change ou est réinitialisé.
  useEffect(() => {
    if (!hasSolution) setSolveSeconds(null)
  }, [hasSolution])

  const handleSolve = async () => {
    if (solved) return
    setSolverStatus('solving')
    const startedAt = performance.now()
    const result = await solve(cubeState, cubeSize, scrambleAlg)
    if (result.error) {
      setSolverStatus('error', result.error)
    } else {
      setSolveSeconds((performance.now() - startedAt) / 1000)
      setSolution(result.moves)
      setSolverStatus('solved')
    }
  }

  const handleCubeDetected = (detectedState: string[]) => {
    setCubeState(detectedState as CubeState)
    setActiveView('3d')
  }

  const views: { id: View; label: string }[] = [
    { id: '3d', label: t('view3d') },
    { id: '2d', label: t('view2d') },
    ...(hasVision ? [{ id: 'detector' as View, label: 'Detector' }] : []),
    ...(isDevMode ? [{ id: 'debug' as View, label: 'Debug' }] : []),
  ]
  const isCubeView = activeView === '3d' || activeView === '2d'

  return (
    <>
      <header className="topbar">
        <span className="brand">{t('title')}</span>
        <span className="spacer" />
        <button className="lang" onClick={() => changeLanguage(language === 'en' ? 'fr' : 'en')}>
          {t('language')}
        </button>
      </header>

      <main className="page">
        <section className="hero">
          <h1>{t('title')}</h1>
          <p>{t('subtitle')}</p>
        </section>

        <div className="card toolbar">
          <div className="seg" role="group" aria-label={t('cubeSize')}>
            {SIZES.map(size => (
              <button
                key={size}
                className={size === cubeSize ? 'on' : ''}
                onClick={() => setCubeSize(size)}
                disabled={busy}
                aria-pressed={size === cubeSize}
              >
                {t(`size${size}`)}
              </button>
            ))}
          </div>

          <button onClick={scramble} disabled={busy}>
            {t('scramble')}
          </button>
          <button className="btn-primary" onClick={handleSolve} disabled={solved || busy}>
            {solverStatus === 'solving' ? t('solving') : t('solve')}
          </button>
          <button onClick={reset} disabled={solverStatus === 'solving'}>
            {t('reset')}
          </button>

          <span className="grow" />

          {scrambling && (
            <span className="status">
              <span className="spinner" aria-hidden /> {t('scrambling')}
            </span>
          )}
          {solverStatus === 'solving' && (
            <span className="status">
              <span className="spinner" aria-hidden /> {t('solving')}
            </span>
          )}
          {solverStatus !== 'solving' && solverStatus === 'error' && (
            <span className="status bad">
              <span className="dot" aria-hidden /> {t('error')}: {solverError}
            </span>
          )}
          {!scrambling && solverStatus !== 'solving' && solverStatus !== 'error' && solved && (
            <span className="status ok">
              <span className="dot" aria-hidden /> {t('solved')}
            </span>
          )}
          {solverStatus === 'solving' && cubeSize >= 3 && <span className="hint">{t('solvingHint')}</span>}
        </div>

        <div className="moves-col">
        <div className={`card moves-card${scrambleAlg ? '' : ' empty'}`}>
          <h4>
            {t('scrambleLabel')}
            {scrambleAlg && <small>{t('scrambleMoves', { count: parseAlg(scrambleAlg).length })}</small>}
          </h4>
          {scrambleAlg ? (
            <MoveChips moves={parseAlg(scrambleAlg).map(formatMove)} current={scrambling ? scrambleIndex - 1 : undefined} />
          ) : (
            <p className="placeholder">{t('noScramble')}</p>
          )}
        </div>

        <div className={`card moves-card${hasSolution ? '' : ' empty'}`}>
          <h4>
            {t('solutionLabel')}
            {hasSolution && (
              <small>
                {t('movesCount', { count: solutionMoves.length })}
                {solveSeconds !== null && ` · ${t('solvedIn', { seconds: solveSeconds.toFixed(1) })}`}
              </small>
            )}
          </h4>
          {hasSolution ? (
            <MoveChips moves={solutionMoves.map(formatMove)} current={currentMoveIndex} />
          ) : (
            <p className="placeholder">{t('noSolution')}</p>
          )}
        </div>
        </div>

        <div className={`stage${activeView === '2d' || !isCubeView ? ' plain' : ''}`}>
          <div className="seg" role="tablist">
            {views.map(view => (
              <button
                key={view.id}
                role="tab"
                aria-selected={activeView === view.id}
                className={activeView === view.id ? 'on' : ''}
                onClick={() => setActiveView(view.id)}
              >
                {view.label}
              </button>
            ))}
          </div>
          {activeView === '3d' && (
            <>
              <Cube3D state={cubeState} size={cubeSize} />
              <div className="tip">{t('dragHint')}</div>
            </>
          )}
          {activeView === '2d' && <CubeNet state={cubeState} size={cubeSize} />}
          {activeView === 'debug' && <DebugDetector liveMode />}
          {activeView === 'detector' && <CubeDetector onCubeDetected={handleCubeDetected} />}
        </div>

        <AnimationControls />
      </main>
    </>
  )
}
