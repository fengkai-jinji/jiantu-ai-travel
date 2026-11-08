@echo off
chcp 936 >nul
cd /d %~dp0
title Install Dependencies
echo ============================================================
echo   Install Python dependencies (internet needed, once only)
echo ============================================================
echo.
where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python not found in PATH.
    echo Please install Python 3.10+ and tick "Add Python to PATH".
    echo Download: https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)
echo Installing: ultralytics flask opencv-python pillow pyttsx3
echo This may take several minutes (PyTorch is large).
echo.
python -m pip install --upgrade pip
python -m pip install ultralytics flask opencv-python pillow pyttsx3
echo.
if errorlevel 1 (
    echo [FAILED] Try again, or check your network / pip index.
) else (
    echo [OK] Dependencies installed. Now double-click the demo launcher.
)
echo.
pause
