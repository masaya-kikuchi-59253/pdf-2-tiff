@echo off
echo Starting PDF to TIFF Converter in Development Mode...

REM Start Backend in background
echo Starting Backend...
start /b node backend/index.js

echo Starting Frontend in new window (Ctrl+C to stop)...
cd frontend
call npm run dev
