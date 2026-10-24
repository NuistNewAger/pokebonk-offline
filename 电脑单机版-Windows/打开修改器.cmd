@echo off
chcp 65001 >nul
title PokéBonk 修改器
cd /d "%~dp0"

echo.
echo   PokéBonk 离线版 · 修改器
echo   ----------------------------------------
echo   存档修改（星尘 / 研究所 / 道具 / 图鉴）：本窗口会打开网页版修改器
echo   对局内修改（宝可币 / 重随 / 跳过 / 放逐 …）：在游戏里按 F8
echo.

rem 服务器没在跑就先拉起来
powershell -NoProfile -Command "try { $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',8787); $c.Close(); exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo   正在启动本地服务器...
  start "" /min cmd /c "node "%~dp0server.mjs""
  timeout /t 4 /nobreak >nul
)

start "" "http://127.0.0.1:8787/__pb/trainer"
echo   已打开修改器页面。改完回游戏按 F5 刷新即可生效。
timeout /t 3 /nobreak >nul
exit