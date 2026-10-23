@echo off
chcp 65001 >nul
title PokéBonk 离线版（调试模式）
cd /d "%~dp0"
echo 正在启动本地服务器... 关闭此窗口即停止服务器。
echo.
node "%~dp0server.mjs"
echo.
echo 服务器已停止。
pause
