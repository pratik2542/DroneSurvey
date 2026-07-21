@echo off
echo Installing DroneSurvey COG Converter dependencies...
pip install rasterio Pillow numpy google-api-python-client google-auth
echo.
echo Done! You can now run the converter by double-clicking run.bat
pause
