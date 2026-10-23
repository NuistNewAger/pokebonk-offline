# 把两个版本打成一个压缩包，结构：
#
#   Pokebonk-Offline-<版本>/
#   ├─ README.md              总体说明
#   ├─ LICENSE / NOTICE.md    授权与署名（顶层一份，两个版本目录里各一份）
#   ├─ 电脑单机版-Windows/    双击 启动游戏.vbs 即玩
#   └─ 手机版-APK/            安装 APK 即玩（含安卓源码与构建脚本）
#
# 用法: powershell -ExecutionPolicy Bypass -File 打包发布.ps1
param([string]$Version = '0.8.28')

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$dist = Join-Path $root 'dist'
$zipPath = Join-Path $dist "Pokebonk-Offline-$Version-完整包.zip"
$prefix = "Pokebonk-Offline-$Version"
$pcDir = "$prefix/电脑单机版-Windows"
$apkDir = "$prefix/手机版-APK"
$tpl = Join-Path $root '发布模板'

New-Item -ItemType Directory -Force -Path $dist | Out-Null
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

# 不进包：个人存档、运行状态、构建中间产物、打包工具自身
$skipDirs = @('browser', 'data', 'dist', 'node_modules', 'android\build', '发布模板')
$skipFiles = @('打包发布.ps1', '发布说明.md', '.gitignore', 'README.md', 'LICENSE', 'NOTICE.md')

function Get-Target([string]$rel) {
  if ($rel -like 'android\*') { return $apkDir }
  if ($rel -eq "Pokebonk-Offline-$Version.apk") { return $apkDir }
  if ($rel -like '预览-平板*') { return $apkDir }
  if ($rel -like 'lib\*' -or $rel -like 'web\*') { return $pcDir }
  if ($rel -eq 'state\asset-list.txt') { return $pcDir }
  if ($rel -like '预览*') { return $pcDir }
  if ($skipFiles -contains $rel) { return $null }
  if ($rel -match '\.(mjs|vbs|cmd|ps1)$' -or $rel -like '*.txt') { return $pcDir }
  return $null
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
$count = 0; $bytes = 0

function Add-Entry([string]$file, [string]$entry, $level) {
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file, $entry, $level) | Out-Null
  $script:count++
  $script:bytes += (Get-Item $file).Length
}

# ── 顶层与两个版本目录的说明 / 授权文件 ──
$docs = @(
  @{ src = (Join-Path $tpl 'README-总体.md');       entry = "$prefix/README.md" },
  @{ src = (Join-Path $root 'LICENSE');             entry = "$prefix/LICENSE" },
  @{ src = (Join-Path $root 'NOTICE.md');           entry = "$prefix/NOTICE.md" },
  @{ src = (Join-Path $tpl 'README-电脑单机版.md'); entry = "$pcDir/README.md" },
  @{ src = (Join-Path $root 'LICENSE');             entry = "$pcDir/LICENSE" },
  @{ src = (Join-Path $root 'NOTICE.md');           entry = "$pcDir/NOTICE.md" },
  @{ src = (Join-Path $tpl 'README-手机版.md');     entry = "$apkDir/README.md" },
  @{ src = (Join-Path $root 'LICENSE');             entry = "$apkDir/LICENSE" },
  @{ src = (Join-Path $root 'NOTICE.md');           entry = "$apkDir/NOTICE.md" }
)
foreach ($d in $docs) {
  if (-not (Test-Path $d.src)) { throw "缺少文件: $($d.src)" }
  Add-Entry $d.src $d.entry ([System.IO.Compression.CompressionLevel]::Optimal)
}

# ── 游戏文件与脚本 ──
$files = Get-ChildItem $root -Recurse -File | Sort-Object FullName
Write-Host "扫描到 $($files.Count) 个文件…" -ForegroundColor Cyan
foreach ($f in $files) {
  $rel = $f.FullName.Substring($root.Length + 1)
  $skip = $false
  foreach ($d in $skipDirs) { if ($rel -like "$d\*" -or $rel -eq $d) { $skip = $true; break } }
  if ($skip) { continue }
  if ($rel -like 'state\*' -and $rel -ne 'state\asset-list.txt') { continue }
  if ($rel -match '\.(zip|out|idsig)$') { continue }
  $target = Get-Target $rel
  if (-not $target) { continue }
  $entry = "$target/" + $rel.Replace('\', '/')
  $level = if ($f.Extension -in @('.apk', '.png', '.jpg', '.ogg', '.mp3', '.woff', '.woff2', '.glb')) {
    [System.IO.Compression.CompressionLevel]::NoCompression
  } else {
    [System.IO.Compression.CompressionLevel]::Optimal
  }
  Add-Entry $f.FullName $entry $level
  if ($count % 1500 -eq 0) { Write-Host ("  已加入 {0} 个文件（{1:N0} MB）" -f $count, ($bytes / 1MB)) }
}
$zip.Dispose()

$size = (Get-Item $zipPath).Length
Write-Host ''
Write-Host "完成：$zipPath" -ForegroundColor Green
Write-Host ("  共 {0} 个文件，原始 {1:N1} MB，压缩后 {2:N1} MB" -f $count, ($bytes / 1MB), ($size / 1MB))
Write-Host ''
Write-Host '结构：'
Write-Host "  $prefix/README.md  LICENSE  NOTICE.md"
Write-Host "  $prefix/电脑单机版-Windows/    …"
Write-Host "  $prefix/手机版-APK/            …"
Write-Host ''
Write-Host '提示：APK 单文件 106.7 MB 超过 GitHub 的 100 MB 上限，请作为 Release 附件上传。' -ForegroundColor Yellow