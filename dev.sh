#!/bin/bash

# Script pour lancer le projet en développement local

echo "🚀 Démarrage du Rubik's Cube Solver avec détection"
echo ""

# Vérifier si Python est installé
if ! command -v python &> /dev/null; then
    echo "❌ Python n'est pas installé"
    exit 1
fi

# Vérifier si Node est installé
if ! command -v node &> /dev/null; then
    echo "❌ Node.js n'est pas installé"
    exit 1
fi

# Lancer le backend en arrière-plan
echo "📦 Démarrage du backend (Python)..."
cd backend
pip install -q -r requirements.txt 2>/dev/null || pip install -r requirements.txt
python app.py &
BACKEND_PID=$!
echo "✅ Backend lancé (PID: $BACKEND_PID)"
cd ..

# Attendre que le backend soit prêt
sleep 2

# Lancer le frontend
echo "🎨 Démarrage du frontend (React)..."
npm run dev &
FRONTEND_PID=$!
echo "✅ Frontend lancé (PID: $FRONTEND_PID)"

echo ""
echo "================================"
echo "🎲 Rubik's Cube Solver"
echo "================================"
echo "Frontend: http://localhost:5173"
echo "Backend:  http://localhost:5000"
echo "Health:   http://localhost:5000/health"
echo ""
echo "Pour arrêter, appuyez sur CTRL+C"
echo ""

# Attendre les deux processus
wait $BACKEND_PID $FRONTEND_PID
