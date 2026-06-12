@echo off
chcp 65001 >nul
cd /d "C:\Users\sandy\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6a054f2412f6191505e79b9b"
echo ==========================================
echo   发票收割机 - 游戏服务端
echo ==========================================
echo.
echo 正在启动服务器...
echo.
python game_server.py
pause
