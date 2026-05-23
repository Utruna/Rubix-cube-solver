# Cube Detection Module - Setup Guide

## Overview

This module adds **real-time cube detection** using your camera. It:
1. Captures video from your webcam
2. Detects the Rubik's cube state using contour detection & color classification
3. Converts it to the solver format
4. Applies it to the 3D visualization

## Architecture

```
Frontend (React + Three.js)
    ↓ (Canvas → Base64)
API (via nginx proxy in Docker, direct in dev)
    ↓
Backend (Python + OpenCV + Flask)
    ↓ (HSV color detection + contour detection)
Returns cube state
```

## Quick Start

### Windows
```bash
dev.bat
```
This opens two windows:
- **Backend** (Python Flask): http://localhost:5000
- **Frontend** (React): http://localhost:5173

### Linux/Mac
```bash
chmod +x dev.sh
./dev.sh
```

### Manual Start (Without Scripts)

**Terminal 1 - Backend:**
```bash
cd backend
pip install -r requirements.txt
python app.py
```
Backend runs on `http://localhost:5000`

**Terminal 2 - Frontend:**
```bash
npm install
npm run dev
```
Frontend runs on `http://localhost:5173`

## Docker Deployment

```bash
docker-compose up
```

- Frontend: `http://localhost`
- Backend: `http://localhost:5000`
- API endpoint: `/api/detect`

## Usage

1. Go to the **📷 Detector** tab
2. Click **Start Camera** to enable webcam
3. Position your Rubik's cube clearly in front of the camera
4. Click **Detect Cube**
5. The cube state appears in the 3D view → click **Solve**

## Troubleshooting

### "Failed to fetch" Error

**Step 1:** Check the backend is running
```bash
curl http://localhost:5000/health
```

Should return:
```json
{"status": "ok", "message": "Backend is running"}
```

**Step 2:** Check browser console (F12 → Console tab)
- Look for CORS errors → backend might not have CORS enabled
- Look for network errors → check API URL

**Step 3:** Verify the API endpoint works
```bash
curl -X POST http://localhost:5000/api/detect \
  -H "Content-Type: application/json" \
  -d '{"image": "data:image/jpeg;base64,..."}'
```

### Detection Not Working Well

The algorithm uses **contour detection** to find stickers, then **HSV color classification**.

**Why it might fail:**
- ❌ Lighting too dim or uneven
- ❌ Shadows on the cube
- ❌ Cube too far from camera
- ❌ Multiple cubes in frame
- ❌ Non-standard cube colors

**Solutions:**
1. **Use better lighting** - natural daylight or white LED light
2. **Get closer** - cube should fill ~50% of the frame
3. **Position properly** - cube facing camera, one face centered
4. **Clean camera lens** - remove dust/smudges
5. **Adjust color ranges** in `backend/detector.py` if using non-standard colors:

```python
# In detector.py, _classify_color_from_roi() method
# Adjust these ranges for your specific cube colors
if mean_h < 15 or mean_h > 175:  # Red
    return 'R'
```

### Backend Crashes on Startup

**Error:** `ModuleNotFoundError: No module named 'cv2'`

Solution:
```bash
pip install --upgrade opencv-python
```

**Error:** `Address already in use port 5000`

Solution - Kill the process:
```bash
# Linux/Mac
lsof -i :5000 | grep LISTEN | awk '{print $2}' | xargs kill

# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

### Image Processing is Slow

Slow detection usually means:
1. Backend is processing large images
2. OpenCV operations taking too long

Solutions:
- Reduce image size before sending (modify CubeDetector.tsx)
- Use GPU acceleration (requires CUDA/cuDNN setup)
- Optimize the contour detection algorithm

## API Endpoint

**POST** `/api/detect`

Request:
```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}
```

Response (Success):
```json
{
  "state": {
    "U": ["U", "U", "U", "U", "U", "U", "U", "U", "U"],
    "R": ["R", "R", "R", "R", "R", "R", "R", "R", "R"],
    "F": ["F", "F", "F", "F", "F", "F", "F", "F", "F"],
    "D": ["D", "D", "D", "D", "D", "D", "D", "D", "D"],
    "L": ["L", "L", "L", "L", "L", "L", "L", "L", "L"],
    "B": ["B", "B", "B", "B", "B", "B", "B", "B", "B"]
  },
  "success": true
}
```

Response (Error):
```json
{
  "error": "Failed to process image"
}
```

## Color Mapping

```
U = White (Uppercase)
D = Yellow (Down)
F = Green (Front)
R = Red (Right)
L = Orange (Left)
B = Blue (Back)
```

## Next Steps

- [x] Basic camera capture
- [x] Contour-based sticker detection
- [x] Color classification
- [ ] Multi-face detection (detect all 6 faces from one image)
- [ ] Real-time preview with detected stickers highlighted
- [ ] Calibration UI for custom cube colors
- [ ] Performance optimization (GPU acceleration)
- [ ] Mobile support

