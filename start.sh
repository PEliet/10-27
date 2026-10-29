#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js was not found. Install Node.js 20 or newer, then try again."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] npm was not found. Reinstall Node.js with npm included."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[INFO] First run: installing dependencies..."
  npm install
fi

echo "[INFO] Starting the local web page at http://127.0.0.1:5173"
echo "[INFO] This service only serves front-end files and does not proxy API requests."
npm run dev
