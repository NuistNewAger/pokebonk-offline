@echo off
chcp 65001 >nul
title 检查 PokéBonk 更新
cd /d "%~dp0"
echo 正在从 pokebonk.com 检查并同步最新游戏文件...
echo 首次运行需要下载全部资源，可能需要几分钟；之后只下载有变化的部分。
echo.
node "%~dp0sync.mjs" --update --list-file "%~dp0state\asset-list.txt"
echo.
echo 完成。按任意键关闭。
pause >nul
