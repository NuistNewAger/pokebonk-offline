@echo off
chcp 65001 >nul
title 移除 PokéBonk 自动更新
powershell -NoProfile -ExecutionPolicy Bypass -Command "Unregister-ScheduledTask -TaskName 'PokebonkOfflineSync' -Confirm:$false -ErrorAction SilentlyContinue; if ($?) { Write-Host '已移除计划任务 PokebonkOfflineSync' -ForegroundColor Green } else { Write-Host '没有找到该计划任务' }"
echo.
pause
