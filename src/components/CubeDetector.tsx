import { useRef, useState, useCallback } from 'react'
import '../styles/CubeDetector.css'

interface DetectionResult {
  state: {
    U: string[]
    R: string[]
    F: string[]
    D: string[]
    L: string[]
    B: string[]
  }
  success: boolean
}

export function CubeDetector({
  onCubeDetected,
}: {
  onCubeDetected: (state: string[]) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFrame, setLastFrame] = useState<string | null>(null)

  const startCamera = useCallback(async () => {
    try {
      setError(null)

      // Vérifier que getUserMedia est disponible
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Votre navigateur ne supporte pas l\'accès à la caméra')
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
          videoRef.current?.play().catch(err => {
            console.error('Error playing video:', err)
            setError('Erreur lors de la lecture vidéo')
          })
        }
        setIsStreaming(true)
      }
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          setError(
            'Accès à la caméra refusé. Vérifiez les permissions dans les paramètres du navigateur.',
          )
        } else if (err.name === 'NotFoundError') {
          setError('Aucune caméra détectée sur votre appareil')
        } else if (err.name === 'NotReadableError') {
          setError('La caméra est peut-être utilisée par une autre application')
        } else {
          setError(`Erreur caméra: ${err.message}`)
        }
      } else {
        const message = err instanceof Error ? err.message : 'Erreur lors de l\'accès à la caméra'
        setError(message)
      }
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

    // Copier le frame vidéo dans le canvas
    canvasRef.current.width = videoRef.current.videoWidth
    canvasRef.current.height = videoRef.current.videoHeight
    context.drawImage(videoRef.current, 0, 0)

    // Convertir en base64
    const imageData = canvasRef.current.toDataURL('image/jpeg')
    setLastFrame(imageData)

    return imageData
  }, [])

  const detectCube = useCallback(async () => {
    try {
      setIsDetecting(true)
      setError(null)

      const frameData = await captureFrame()
      if (!frameData) {
        setError('Failed to capture frame')
        setIsDetecting(false)
        return
      }

      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      console.log('Sending request to:', `${apiUrl}/detect`)

      const response = await fetch(`${apiUrl}/detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: frameData,
        }),
      })

      console.log('Response status:', response.status)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Detection failed: ${response.statusText} - ${errorData.error || ''}`)
      }

      const result: DetectionResult = await response.json()

      if (result.success && result.state) {
        // Convertir l'état détecté au format attendu par le cube
        const cubeState: string[] = []
        const faceOrder = ['U', 'R', 'F', 'D', 'L', 'B'] as const

        for (const face of faceOrder) {
          if (result.state[face]) {
            cubeState.push(...result.state[face])
          }
        }

        console.log('Cube detected successfully:', cubeState)
        onCubeDetected(cubeState)
      } else {
        setError('Failed to detect cube state')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Detection error'
      console.error('Detection error:', message)
      setError(message)
    } finally {
      setIsDetecting(false)
    }
  }, [captureFrame, onCubeDetected])

  return (
    <div className="cube-detector">
      <div className="detector-header">
        <h2>Cube Detector</h2>
        <p>Détectez l'état de votre cube avec la caméra</p>
      </div>

      {error && (
        <div className="detector-error">
          <strong>⚠️ Erreur:</strong> {error}
          {error.includes('refusé') && (
            <div style={{ marginTop: 8, fontSize: '12px', opacity: 0.9 }}>
              <p>
                <strong>Solution:</strong> Vérifiez les permissions dans les paramètres du
                navigateur:
              </p>
              <ul style={{ marginLeft: 16 }}>
                <li>Chrome/Edge: ⚙️ → Paramètres → Confidentialité → Caméra → Autoriser</li>
                <li>Firefox: 🔒 → Autorisations → Caméra → Autoriser</li>
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="detector-content">
        <div className="video-container">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            style={{
              width: '100%',
              maxWidth: '640px',
              borderRadius: '8px',
              backgroundColor: '#000',
            }}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {lastFrame && (
            <div className="last-frame">
              <img src={lastFrame} alt="Last captured frame" />
            </div>
          )}
        </div>

        <div className="detector-controls">
          {!isStreaming ? (
            <button onClick={startCamera} className="btn btn-primary">
              Start Camera
            </button>
          ) : (
            <>
              <button
                onClick={detectCube}
                disabled={isDetecting}
                className="btn btn-success"
              >
                {isDetecting ? 'Detecting...' : 'Detect Cube'}
              </button>

              <button onClick={stopCamera} className="btn btn-secondary">
                Stop Camera
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
