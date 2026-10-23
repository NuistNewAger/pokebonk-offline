# 安装“每 6 小时自动检查更新”的 Windows 计划任务
$ErrorActionPreference = 'Stop'

$base = $PSScriptRoot
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  Write-Host '找不到 node.exe，请先安装 Node.js：https://nodejs.org' -ForegroundColor Red
  exit 1
}

$taskName = 'PokebonkOfflineSync'
$taskArgs = "`"$base\sync.mjs`" --update --quiet --list-file `"$base\state\asset-list.txt`""

$action = New-ScheduledTaskAction -Execute $node -Argument $taskArgs -WorkingDirectory $base
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(3) `
  -RepetitionInterval (New-TimeSpan -Hours 6) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

Write-Host ''
Write-Host '已安装计划任务：PokebonkOfflineSync' -ForegroundColor Green
Write-Host ("  Node: " + $node)
Write-Host ("  脚本: " + $base + "\sync.mjs")
Write-Host '  频率: 每 6 小时（错过计划会在开机后补跑）'
Write-Host ("  日志: " + $base + "\state\sync.log")
Write-Host ''
Write-Host '想立即试跑一次：任务计划程序里右键该任务 → 运行；或双击“检查更新.cmd”。'
