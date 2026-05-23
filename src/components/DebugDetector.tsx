import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import '../styles/DebugDetector.css'

interface StickerInfo {
  index: number
  color: string
  position: { x: number; y: number; w: number; h: number }
  hsv_mean: { h: number; s: number; v: number }
  confidence?: number
  notes?: string
}

interface DebugResult {
  success: boolean
  provider?: string
  model?: string
  contours_found: number
  stickers: StickerInfo[]
  debug_image: string
  warnings?: string[]
  face_hint?: string
  raw_response?: string
  error?: string
}

export function DebugDetector({ liveMode = false }: { liveMode?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [debugResult, setDebugResult] = useState<DebugResult | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null)
  const [tickCount, setTickCount] = useState(0)
  const isDetectingRef = useRef(false)

  const stickerConfidence = useCallback((sticker: StickerInfo) => {
    if (typeof sticker.confidence === 'number' && Number.isFinite(sticker.confidence)) {
      return Math.max(0, Math.min(100, Math.round(sticker.confidence)))
    }

    const { color, hsv_mean } = sticker
    const { h, s, v } = hsv_mean

    let score = 25

    if (v < 35) score -= 15
    else if (v < 70) score += 5
    else score += 15

    if (s < 25) score -= 18
    else if (s < 60) score += 6
    else score += 16

    const hueScore = (() => {
      switch (color) {
        case 'U':
          return Math.max(20, 100 - Math.abs(v - 85))
        case 'R':
          return Math.max(0, 100 - Math.min(Math.abs(h), Math.abs(180 - h)) * 2)
        case 'D':
          return Math.max(0, 100 - Math.abs(h - 25) * 4)
        case 'F':
          return Math.max(0, 100 - Math.abs(h - 55) * 3)
        case 'B':
          return Math.max(0, 100 - Math.abs(h - 115) * 2)
        case 'L':
          return Math.max(0, 100 - Math.abs(h - 18) * 3)
        default:
          return 45
      }
    })()

    const mixed = Math.round(score * 0.45 + hueScore * 0.55)
    return Math.max(0, Math.min(100, mixed))
  }, [])

  const debugSummary = useMemo(() => {
    if (!debugResult?.stickers?.length) {
      return null
    }

    const values = debugResult.stickers.map(stickerConfidence)
    const averageConfidence = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)

    return {
      averageConfidence,
      unstableCount: values.filter((value) => value < 55).length,
      values,
    }
  }, [debugResult, stickerConfidence])

  const lastUpdateLabel = useMemo(() => {
    if (!lastUpdatedAt) {
      return '—'
    }

    return new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(lastUpdatedAt))
  }, [lastUpdatedAt])

  const startCamera = useCallback(async () => {
    try {
      setError(null)

      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera not supported')
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play()
        }
        setIsStreaming(true)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Camera error'
      setError(message)
      console.error('Camera error:', err)
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
      tracks.forEach((track) => track.stop())
      setIsStreaming(false)
    }
  }, [])

  const captureFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) {
      return
    }

    const context = canvasRef.current.getContext('2d')
    if (!context) {
      return
    }

    canvasRef.current.width = videoRef.current.videoWidth
    canvasRef.current.height = videoRef.current.videoHeight
    context.drawImage(videoRef.current, 0, 0)

    return canvasRef.current.toDataURL('image/jpeg')
  }, [])

  const debugDetect = useCallback(async () => {
    if (isDetectingRef.current) {
      return
    }

    try {
      isDetectingRef.current = true
      setIsDetecting(true)
      setError(null)
      const startedAt = performance.now()

      const frameData = await captureFrame()
      if (!frameData) {
        setError('Failed to capture frame')
        setIsDetecting(false)
        return
      }

      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      console.log('Sending debug request to:', `${apiUrl}/debug-detect`)

      const response = await fetch(`${apiUrl}/debug-detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: frameData,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Debug failed: ${response.statusText} - ${errorData.error || ''}`)
      }

      const result: DebugResult = await response.json()
      setDebugResult(result)
      setLastUpdatedAt(Date.now())
      setLastDurationMs(Math.round(performance.now() - startedAt))
      setTickCount((value) => value + 1)
      console.log('Debug result:', result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Debug error'
      console.error('Debug error:', message)
      setError(message)
    } finally {
      isDetectingRef.current = false
      setIsDetecting(false)
    }
  }, [captureFrame])

  useEffect(() => {
    if (!liveMode) {
      return
    }

    void startCamera()

    return () => {
      stopCamera()
    }
  }, [liveMode, startCamera, stopCamera])

  useEffect(() => {
    if (!liveMode || !isStreaming) {
      return
    }

    const intervalId = window.setInterval(() => {
      void debugDetect()
    }, 700)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [liveMode, isStreaming, debugDetect])

  return (
    <div className="debug-detector">
      <div className="debug-header">
        <div className="debug-title-row">
          <div>
            <h2>🔍 Debug Detector</h2>
            <p>
              {liveMode
                ? 'Analyse en temps réel de ce que le script détecte'
                : 'Visualise ce que le script détecte'}
            </p>
          </div>
          <div className="debug-badge debug-badge-live">{liveMode ? 'LIVE' : 'MANUEL'}</div>
        </div>
      </div>

      {debugResult?.provider && (
        <div className="debug-provider-line">
          <strong>Provider:</strong> {debugResult.provider}
          {debugResult.model && <span> · Model: {debugResult.model}</span>}
          {debugResult.face_hint && <span> · Face: {debugResult.face_hint}</span>}
        </div>
      )}

      {debugResult?.warnings && debugResult.warnings.length > 0 && (
        <div className="debug-warnings">
          <strong>Avertissements:</strong>
          <ul>
            {debugResult.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="debug-error">
          <strong>⚠️ Erreur:</strong> {error}
        </div>
      )}

      <div className="debug-overview">
        <div className="debug-overview-card">
          <span className="overview-label">Flux</span>
          <strong>{isStreaming ? 'Caméra active' : 'Caméra arrêtée'}</strong>
          <small>{liveMode ? 'Rafraîchissement automatique' : 'Rafraîchissement manuel'}</small>
        </div>
        <div className="debug-overview-card">
          <span className="overview-label">Analyse</span>
          <strong>{isDetecting ? 'En cours' : 'Prête'}</strong>
          <small>{tickCount} passes effectuées</small>
        </div>
        <div className="debug-overview-card">
          <span className="overview-label">Dernier résultat</span>
          <strong>{lastUpdateLabel}</strong>
          <small>{lastDurationMs !== null ? `${lastDurationMs} ms` : 'Aucune mesure'}</small>
        </div>
        <div className="debug-overview-card">
          <span className="overview-label">Contours</span>
          <strong>{debugResult ? `${debugResult.contours_found}` : '—'}</strong>
          <small>{debugResult ? `${debugResult.stickers.length} stickers listés` : 'En attente'}</small>
        </div>
      </div>

      <div className="debug-layout">
        <div className="debug-left">
          <h3>Capture</h3>
          <div className="debug-video-shell">
            <video ref={videoRef} autoPlay playsInline className="debug-video" />
            <div className="debug-video-overlay">
              <span>{isStreaming ? '● Caméra' : '○ Caméra'}</span>
              <span>{isDetecting ? 'Analyse...' : 'Prêt'}</span>
            </div>
          </div>
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          <div className="debug-controls">
            {!isStreaming ? (
              <button onClick={startCamera} className="debug-btn debug-btn-primary">
                {liveMode ? 'Start Live Camera' : 'Start Camera'}
              </button>
            ) : (
              <>
                <button
                  onClick={debugDetect}
                  disabled={isDetecting}
                  className="debug-btn debug-btn-success"
                >
                  {isDetecting ? 'Analyzing...' : liveMode ? 'Refresh Now' : '🔍 Debug Detect'}
                </button>

                <button onClick={stopCamera} className="debug-btn debug-btn-secondary">
                  Stop Camera
                </button>
              </>
            )}
          </div>
        </div>

        <div className="debug-right">
          <h3>Résultats</h3>
          {debugResult ? (
            <>
              <div className="debug-stats">
                <p>
                  <strong>Contours trouvés:</strong>{' '}
                  <span className={debugResult.contours_found >= 9 ? 'success' : 'warning'}>
                    {debugResult.contours_found} / 9
                  </span>
                </p>
                <p>
                  <strong>Stickers analysés:</strong>{' '}
                  <span className={debugResult.stickers.length >= 9 ? 'success' : 'warning'}>
                    {debugResult.stickers.length}
                  </span>
                </p>
                {debugSummary && (
                  <>
                    <p>
                      <strong>Confiance moyenne:</strong>{' '}
                      <span className={debugSummary.averageConfidence >= 60 ? 'success' : 'warning'}>
                        {debugSummary.averageConfidence}%
                      </span>
                    </p>
                    <p>
                      <strong>Zones instables:</strong>{' '}
                      <span className={debugSummary.unstableCount > 0 ? 'warning' : 'success'}>
                        {debugSummary.unstableCount}
                      </span>
                    </p>
                  </>
                )}

                {debugResult.stickers && debugResult.stickers.length > 0 && (
                  <div className="stickers-grid">
                    {debugResult.stickers.map((sticker, idx) => (
                      <div key={idx} className="sticker-card">
                        <div className="sticker-card-top">
                          <div className="sticker-color" data-color={sticker.color} />
                          <div className="sticker-info">
                            <p>
                              <strong>#{sticker.index + 1}</strong> {sticker.color}
                            </p>
                            {sticker.notes && <small>{sticker.notes}</small>}
                            <small>
                              H: {sticker.hsv_mean.h} | S: {sticker.hsv_mean.s} | V:{' '}
                              {sticker.hsv_mean.v}
                            </small>
                          </div>
                          <div className="sticker-confidence">{stickerConfidence(sticker)}%</div>
                        </div>
                        <div className="confidence-bar" aria-hidden="true">
                          <span
                            className="confidence-fill"
                            style={{ width: `${stickerConfidence(sticker)}%` }}
                          />
                        </div>
                        <div className="sticker-foot">
                          <small>
                            x:{sticker.position.x} y:{sticker.position.y} w:{sticker.position.w} h:{sticker.position.h}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {debugResult.debug_image && (
                <div className="debug-image">
                  <p style={{ margin: '0 0 8px 0', fontSize: '12px', opacity: 0.8 }}>
                    Image annotée:
                  </p>
                  <img src={debugResult.debug_image} alt="Debug output" className="debug-image-preview" />
                </div>
              )}

              {debugResult.raw_response && (
                <details className="debug-raw-response">
                  <summary>Réponse brute du modèle</summary>
                  <pre>{debugResult.raw_response}</pre>
                </details>
              )}
            </>
          ) : (
            <p style={{ opacity: 0.6, textAlign: 'center', padding: '32px' }}>
              Les résultats apparaîtront ici
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
