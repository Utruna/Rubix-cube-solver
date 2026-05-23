import { useState } from 'react'
import { useTranslation } from './i18n'
import { useCubeStore } from './store/cubeStore'
import { useSolver } from './solver/useSolver'
import { Cube3D } from './components/Cube3D.tsx'
import { CubeNet } from './components/CubeNet.tsx'
import { AnimationControls } from './components/AnimationControls.tsx'
import { isSolved } from './cube/state'
import { formatAlg } from './cube/notation'

function LanguageToggle() {
  const { t, language, changeLanguage } = useTranslation()
  return (
    <button
      onClick={() => changeLanguage(language === 'en' ? 'fr' : 'en')}
      style={{ marginLeft: 'auto' }}
    >
      {t('language')}
    </button>
  )
}

export default function App() {
  const { t } = useTranslation()
  const {
    cubeSize,
    cubeState,
    scrambleAlg,
    solutionMoves,
    solverStatus,
    solverError,
    animStatus,
    setCubeSize,
    scramble,
    reset,
    setSolution,
    setSolverStatus,
  } = useCubeStore()

  const { solve } = useSolver()
  const [activeView, setActiveView] = useState<'3d' | '2d'>('3d')

  const solved = isSolved(cubeState, cubeSize)
  const hasSolution = solutionMoves.length > 0

  const handleSolve = async () => {
    if (solved) return
    setSolverStatus('solving')
    const result = await solve(cubeState, cubeSize, scrambleAlg)
    if (result.error) {
      setSolverStatus('error', result.error)
    } else {
      setSolution(result.moves)
      setSolverStatus('solved')
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        padding: '12px 24px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent)' }}>
          🎲 {t('title')}
        </h1>
        <LanguageToggle />
      </header>

      <main style={{ flex: 1, padding: 24, maxWidth: 960, margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{t('cubeSize')}</span>
            <select
              value={cubeSize}
              onChange={(e) => setCubeSize(Number(e.target.value) as 2 | 3 | 4 | 5)}
              disabled={solverStatus === 'solving' || animStatus === 'playing'}
            >
              <option value={2}>2x2</option>
              <option value={3}>3x3</option>
              <option value={4}>4x4</option>
              <option value={5}>5x5</option>
            </select>
          </label>
          <button onClick={scramble}>{t('scramble')}</button>
          <button
            onClick={handleSolve}
            disabled={solved || solverStatus === 'solving'}
            style={{ background: solved ? '#2d5a2d' : undefined }}
          >
            {solverStatus === 'solving' ? t('solving') : t('solve')}
          </button>
          <button onClick={reset}>{t('reset')}</button>
          {solved && (
            <span style={{ color: '#4caf50', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
              ✅ {t('solved')}
            </span>
          )}
          {solverStatus === 'error' && (
            <span style={{ color: '#f44336', fontSize: '0.85rem' }}>
              ❌ {t('error')}: {solverError}
            </span>
          )}
        </div>

        {scrambleAlg && (
          <div style={{
            marginBottom: 12,
            padding: '8px 12px',
            background: 'var(--surface)',
            borderRadius: 6,
            border: '1px solid var(--border)',
            fontSize: '0.85rem',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>{t('scrambleLabel')}: </span>
            <code style={{ color: '#ffd700' }}>{scrambleAlg}</code>
          </div>
        )}

        {hasSolution && (
          <div style={{
            marginBottom: 12,
            padding: '8px 12px',
            background: 'var(--surface)',
            borderRadius: 6,
            border: '1px solid var(--border)',
            fontSize: '0.85rem',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>{t('solutionLabel')}: </span>
            <code style={{ color: '#90caf9' }}>{formatAlg(solutionMoves)}</code>
            <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
              ({t('movesCount', { count: solutionMoves.length })})
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          <button
            onClick={() => setActiveView('3d')}
            style={{ background: activeView === '3d' ? 'var(--accent)' : undefined }}
          >
            {t('view3d')}
          </button>
          <button
            onClick={() => setActiveView('2d')}
            style={{ background: activeView === '2d' ? 'var(--accent)' : undefined }}
          >
            {t('view2d')}
          </button>
        </div>

        <div style={{
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid var(--border)',
          marginBottom: 16,
        }}>
          {activeView === '3d' ? (
            <Cube3D state={cubeState} size={cubeSize} />
          ) : (
            <div style={{ padding: 24, background: 'var(--surface)' }}>
              <CubeNet state={cubeState} size={cubeSize} />
            </div>
          )}
        </div>

        <AnimationControls />
      </main>
    </div>
  )
}
