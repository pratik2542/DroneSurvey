@echo off
title DroneSurvey — Local GIS Server ^& Auto Tunnel
color 0A

echo =======================================================================
echo          🛰  DroneSurvey Local GIS Server ^& Auto Tunnel
echo =======================================================================
echo.

:: 1. Check Python packages
echo [1/2] Checking dependencies...
python -c "import flask, rasterio, PIL" >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing missing Python packages...
    python -m pip install flask rasterio pillow google-auth requests
)

:: 2. Launch Local Server in background window
echo [2/2] Starting Local Tile Server on http://localhost:8000 ...
start "DroneSurvey Local Backend" /min cmd /c "python server.py"

:: Wait 2 seconds for Flask to boot
timeout /t 2 /nobreak >nul

:: 3. Launch tunnel & auto-format exact tile URL
python run_tunnel.py
