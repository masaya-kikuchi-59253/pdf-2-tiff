@echo off
echo Building Frontend for Production...
cd frontend
call npm run build
cd ..

echo Starting Application...
cd backend
node index.js
pause
