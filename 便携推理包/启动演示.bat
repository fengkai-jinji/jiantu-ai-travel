@echo off
chcp 936 >nul
cd /d %~dp0
title Blind Guide Demo Launcher
where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python not found. Run the install-dependencies bat first.
    pause
    exit /b 1
)
echo ============================================================
echo          Blind Guide Obstacle Perception Demo
echo ============================================================
echo    1. Camera real-time demo (recommended)
echo    2. Play built-in test video
echo    3. Play my own video (drag file here, then Enter)
echo    4. Detect an image (drag image here, then Enter)
echo ============================================================
set /p src=Enter number and press Enter (default 1):
if "%src%"=="2" goto video_test
if "%src%"=="3" goto video_my
if "%src%"=="4" goto image_my

python demo\web_demo.py --source 0
goto end

:video_test
python demo\web_demo.py --source "demo\test_media\test_walk.mp4"
goto end

:video_my
set /p vid=Drag video file into this window, then Enter:
python demo\web_demo.py --source %vid%
goto end

:image_my
set /p img=Drag image file into this window, then Enter:
python demo\web_demo.py --source %img%

:end
echo.
echo Demo stopped. You can close this window.
pause >nul
