import { useEffect, useRef } from 'react'
import { useTranslation } from '../i18n'
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
  const currentMoveIndexRef = useRef(currentMoveIndex)
  const solutionMovesRef = useRef(solutionMoves)
  const stepForwardRef = useRef(stepForward)
  const pauseAnimationRef = useRef(pauseAnimation)

  useEffect(() => {
    currentMoveIndexRef.current = currentMoveIndex
    solutionMovesRef.current = solutionMoves
    stepForwardRef.current = stepForward
    pauseAnimationRef.current = pauseAnimation
  }, [currentMoveIndex, solutionMoves, stepForward, pauseAnimation])

  useEffect(() => {
    if (animStatus === 'playing') {
      intervalRef.current = setInterval(() => {
        if (currentMoveIndexRef.current >= solutionMovesRef.current.length) {
          pauseAnimationRef.current()
          return
        }
        stepForwardRef.current()
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
    <div className="card player">
      <div className="player-row">
        <button className="icon-btn" onClick={stepBackward} disabled={isAtStart || animStatus === 'playing'} aria-label={t('stepBackward')} title={t('stepBackward')}>
          <svg viewBox="0 0 24 24"><path d="M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12z" /></svg>
        </button>
        {animStatus === 'playing' ? (
          <button className="icon-btn big" onClick={pauseAnimation} aria-label={t('pause')} title={t('pause')}>
            <svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
          </button>
        ) : (
          <button className="icon-btn big" onClick={playAnimation} disabled={isAtEnd} aria-label={t('play')} title={t('play')}>
            <svg viewBox="0 0 24 24"><path d="M8 4.5v15l12-7.5z" /></svg>
          </button>
        )}
        <button className="icon-btn" onClick={stepForward} disabled={isAtEnd || animStatus === 'playing'} aria-label={t('stepForward')} title={t('stepForward')}>
          <svg viewBox="0 0 24 24"><path d="M8.6 5.4 10 4l8 8-8 8-1.4-1.4 6.6-6.6z" /></svg>
        </button>
        <span className="progress-label">{t('moveProgress', { current: currentMoveIndex, total })}</span>
      </div>
      <div className="progress" aria-hidden>
        <div style={{ width: `${(currentMoveIndex / total) * 100}%` }} />
      </div>
      <label className="speed">
        <span>{t('speed')} {animSpeed}×</span>
        <input
          type="range"
          min={0.5}
          max={5}
          step={0.5}
          value={animSpeed}
          onChange={e => setAnimSpeed(parseFloat(e.target.value))}
        />
      </label>
    </div>
  )
}
