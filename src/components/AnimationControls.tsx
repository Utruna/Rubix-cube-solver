import React, { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useCubeStore } from '../store/cubeStore'

export function AnimationControls() {
  const { t } = useTranslation()
  const {
    solutionMoves,
    currentMoveIndex,
    animStatus,
    animSpeed,
    stepForward,
    stepBackward,
    playAnimation,
    pauseAnimation,
    setAnimSpeed,
  } = useCubeStore()

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (animStatus === 'playing') {
      intervalRef.current = setInterval(() => {
        const { currentMoveIndex, solutionMoves, stepForward, pauseAnimation } = useCubeStore.getState()
        if (currentMoveIndex >= solutionMoves.length) {
          pauseAnimation()
          return
        }
        stepForward()
      }, 1000 / animSpeed)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [animStatus, animSpeed])

  if (solutionMoves.length === 0) return null

  const total = solutionMoves.length
  const isAtEnd = currentMoveIndex >= total
  const isAtStart = currentMoveIndex <= 0

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      padding: '12px 16px',
      background: 'var(--surface)',
      borderRadius: 8,
      border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={stepBackward} disabled={isAtStart || animStatus === 'playing'}>
          {t('stepBackward')}
        </button>
        {animStatus === 'playing' ? (
          <button onClick={pauseAnimation}>{t('pause')}</button>
        ) : (
          <button onClick={playAnimation} disabled={isAtEnd}>{t('play')}</button>
        )}
        <button onClick={stepForward} disabled={isAtEnd || animStatus === 'playing'}>
          {t('stepForward')}
        </button>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {t('moveProgress', { current: currentMoveIndex, total })}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {t('speed')}: {animSpeed}x
        </label>
        <input
          type="range"
          min={0.5}
          max={5}
          step={0.5}
          value={animSpeed}
          onChange={e => setAnimSpeed(parseFloat(e.target.value))}
          style={{ flex: 1 }}
        />
      </div>
    </div>
  )
}
