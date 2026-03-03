@echo off
echo Starting PDF to TIFF Converter in Development Mode...

echo Starting Backend...
start cmd /k "cd backend && node index.js"

echo Starting Frontend...
start cmd /k "cd frontend && npm run dev"

echo Done. Open http://localhost:5173 to access the app.
