@echo off
REM Script pour lancer le projet en développement local (Windows)

echo 🚀 Démarrage du Rubik's Cube Solver avec détection
echo.

REM Vérifier si Python est installé
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python n'est pas installé
    exit /b 1
)

REM Vérifier si Node est installé
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js n'est pas installé
    exit /b 1
)

REM Lancer le backend
echo 📦 Démarrage du backend (Python)...
cd backend
pip install -q -r requirements.txt 2>nul || pip install -r requirements.txt
start "Backend" python app.py
cd ..
echo ✅ Backend lancé

REM Attendre un peu
timeout /t 2 /nobreak

REM Lancer le frontend
echo 🎨 Démarrage du frontend (React)...
start "Frontend" cmd /k npm run dev
echo ✅ Frontend lancé

echo.
echo ================================
echo 🎲 Rubik's Cube Solver
echo ================================
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:5000
echo Health:   http://localhost:5000/health
echo.
echo Fermer les fenêtres pour arrêter
echo.

REM Attendre
pause
