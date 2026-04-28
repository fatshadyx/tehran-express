@echo off
cd /d "%~dp0"

set "NODE_EXE=node"
if exist "%LOCALAPPDATA%\OpenAI\Codex\bin\node.exe" set "NODE_EXE=%LOCALAPPDATA%\OpenAI\Codex\bin\node.exe"

start "" powershell -NoProfile -Command "Start-Sleep -Seconds 1; Start-Process 'http://127.0.0.1:8000'"
"%NODE_EXE%" server.cjs
pause
