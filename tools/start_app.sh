#!/usr/bin/env bash
# Lance le serveur (FastAPI, port 8000) et l'application (Vite, port 5173) avec le Python
# du projet (.venv), quel que soit le PATH (ex. PlatformIO qui fournit un autre uvicorn).
# Usage : tools/start_app.sh   puis ouvrir http://localhost:5173   (Ctrl+C arrête les deux)
set -euo pipefail
cd "$(dirname "$0")/.."
[ -x .venv/bin/uvicorn ] || { echo "Environnement .venv absent : voir README (installation)"; exit 1; }
if ! command -v npm >/dev/null && [ -s "$HOME/.nvm/nvm.sh" ]; then source "$HOME/.nvm/nvm.sh"; fi
[ -d app/node_modules ] || npm --prefix app install
.venv/bin/uvicorn server.app:app --port 8000 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
npm --prefix app run dev
