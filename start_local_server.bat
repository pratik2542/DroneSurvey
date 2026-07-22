@echo off
title DroneSurvey — Local GIS Server ^& Tunnel App
color 0A

echo =======================================================================
echo          🛰  DroneSurvey Local GIS Server ^& Tunnel App Launcher
echo =======================================================================
echo.

:: 1. Check Python packages
echo [1/2] Checking dependencies...
python -c "import flask, rasterio, PIL" >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing missing Python packages...
    python -m pip install flask rasterio pillow google-auth requests
)

:: 2. Launch Local Server Desktop App
echo [2/2] Launching DroneSurvey Server Desktop App GUI...
python server_app.py
