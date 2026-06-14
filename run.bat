@echo off
title NAF PA Training Chatbot Launcher
echo ===================================================
echo   NAF CD PA Training Chatbot Launcher
echo ===================================================
echo.

:: Check for python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in your PATH.
    echo Please install Python 3.9+ from https://www.python.org/
    pause
    exit /b 1
)

echo [INFO] Python found! Installing/verifying dependencies...
python -m pip install -r "%~dp0requirements.txt"
if %errorlevel% neq 0 (
    echo [WARNING] There was an issue installing requirements. Trying standard installation...
    pip install fastapi uvicorn pypdf google-genai python-dotenv
)

echo.
echo [INFO] Starting the FastAPI server...
echo [INFO] Once started, open your web browser and go to:
echo        http://127.0.0.1:8000
echo.
echo Press Ctrl+C in this window to stop the server at any time.
echo.
echo ===================================================
echo.

python -m uvicorn api.index:app --host 127.0.0.1 --port 8000
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] The server stopped unexpectedly or failed to start.
    pause
)
