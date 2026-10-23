@echo off
chcp 65001 >nul
title 安装 PokéBonk 自动更新
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0安装定时更新.ps1"
echo.
pause
