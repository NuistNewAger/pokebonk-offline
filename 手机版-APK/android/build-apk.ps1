# 构建 PokéBonk 离线版 APK（不依赖 Gradle，直接用 Android SDK 命令行工具）
#
#   powershell -ExecutionPolicy Bypass -File android\build-apk.ps1
#
# 说明：
#   * 游戏文件（web\）与兼容补丁（lib\pb-compat.css）在“电脑单机版-Windows”目录里，
#     脚本会自动查找（开发目录下就是上一级）。
#   * aapt2 / zipalign / apksigner 是原生程序，处理不了中文路径，
#     所以所有原生工具的输入输出都放在纯 ASCII 的临时目录里完成，最后把 APK 拷回来。
param(
  # 留空则自动探测：环境变量 → 常见安装位置 → 从 PATH 上的 adb/javac 反推。
  # 想显式指定就用 -Sdk / -Jdk。仓库里不写死任何本机路径。
  [string]$Sdk = '',
  [string]$Jdk = '',
  [string]$VersionName = '',
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$android = $PSScriptRoot
$appRoot = Split-Path -Parent $android

function Resolve-Tool([string[]]$candidates, [string[]]$globs, [string]$probe) {
  foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return (Resolve-Path $c).Path } }
  foreach ($g in $globs) {
    $hit = Get-ChildItem $g -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hit) { return $hit.FullName }
  }
  if ($probe) {
    $cmd = Get-Command $probe -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { return (Split-Path -Parent (Split-Path -Parent $cmd.Source)) }
  }
  return $null
}

if (-not $Sdk) {
  $Sdk = Resolve-Tool @(
    $env:ANDROID_SDK_ROOT, $env:ANDROID_HOME,
    (Join-Path $env:LOCALAPPDATA 'Android\Sdk'),
    (Join-Path $env:USERPROFILE 'android-sdk'),
    'C:\Android\Sdk'
  ) @() 'adb'
}
if (-not $Jdk) {
  $Jdk = Resolve-Tool @($env:JAVA_HOME, 'C:\develop JAVA\jdk') @(
    (Join-Path ${env:ProgramFiles} 'Java\jdk*'),
    (Join-Path ${env:ProgramFiles} 'Eclipse Adoptium\jdk*'),
    (Join-Path ${env:ProgramFiles} 'Microsoft\jdk*')
  ) 'javac'
}
if (-not $Sdk) { throw '找不到 Android SDK：请设置 ANDROID_SDK_ROOT，或用 -Sdk 指定' }
if (-not $Jdk) { throw '找不到 JDK：请设置 JAVA_HOME，或用 -Jdk 指定' }
Write-Host "Android SDK: $Sdk"
Write-Host "JDK        : $Jdk"

# 自动选用已安装的最新 build-tools（34 里的 R8 处理不了新版 javac 生成的内部类）
$bt = Get-ChildItem (Join-Path $Sdk 'build-tools') -Directory |
  Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1 -ExpandProperty FullName
$androidJar = Join-Path $Sdk 'platforms\android-34\android.jar'
$adb = Join-Path $Sdk 'platform-tools\adb.exe'
$keystore = Join-Path $android 'pokebonk.keystore'

foreach ($p in @($bt, $androidJar)) {
  if (-not (Test-Path $p)) { throw "缺少 $p，请先安装 Android SDK（platforms;android-34 / build-tools）" }
}
$env:JAVA_HOME = $Jdk

# 找游戏文件目录（含 web\index.html 的那一级）
$pcRoot = $null
$search = @($appRoot, (Split-Path -Parent $appRoot)) +
  (Get-ChildItem (Split-Path -Parent $appRoot) -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -ne $appRoot } | ForEach-Object { $_.FullName })
foreach ($cand in $search) {
  if ($cand -and (Test-Path (Join-Path $cand 'web\index.html'))) { $pcRoot = $cand; break }
}
if (-not $pcRoot) { throw '找不到游戏文件目录（需要“电脑单机版-Windows\web\index.html”）' }
$web = Join-Path $pcRoot 'web'
$compatCss = Join-Path $pcRoot 'lib\pb-compat.css'
if (-not (Test-Path $compatCss)) { $compatCss = $null }

# 版本号：优先 -VersionName，其次读游戏自带的 web\version.json（{build, version}）
if (-not $VersionName) {
  $vf = Join-Path $web 'version.json'
  if (Test-Path $vf) {
    try { $VersionName = (Get-Content $vf -Raw | ConvertFrom-Json).version } catch { }
  }
}
if (-not $VersionName) { $VersionName = '0.0.0' }
$apkName = "Pokebonk-Offline-$VersionName.apk"
$apkPath = Join-Path $appRoot $apkName

Write-Host "使用 build-tools: $(Split-Path -Leaf $bt)"
Write-Host "游戏文件来源   : $pcRoot"
Write-Host "游戏版本       : $VersionName"

# 纯 ASCII 临时工作目录（关键：绕开原生工具的中文路径问题）
$work = Join-Path $env:TEMP ('pb-apk-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $work | Out-Null
Write-Host "临时工作目录   : $work"

try {
  Write-Host '== 1/7 准备构建目录 ==' -ForegroundColor Cyan
  Copy-Item (Join-Path $android 'res') $work -Recurse
  Copy-Item (Join-Path $android 'AndroidManifest.xml') $work
  Copy-Item (Join-Path $android 'java') $work -Recurse
  New-Item -ItemType Directory -Force -Path "$work\gen", "$work\classes", "$work\dex" | Out-Null

  Write-Host '== 2/7 编译资源 ==' -ForegroundColor Cyan
  & "$bt\aapt2.exe" compile --dir "$work\res" -o "$work\res.zip"
  if ($LASTEXITCODE -ne 0) { throw 'aapt2 compile 失败' }

  Write-Host '== 3/7 链接资源与清单 ==' -ForegroundColor Cyan
  & "$bt\aapt2.exe" link -o "$work\base.apk" -I $androidJar `
    --manifest "$work\AndroidManifest.xml" `
    -R "$work\res.zip" --auto-add-overlay --java "$work\gen" `
    --min-sdk-version 24 --target-sdk-version 31 `
    --version-code 1 --version-name $VersionName --no-version-vectors
  if ($LASTEXITCODE -ne 0) { throw 'aapt2 link 失败' }

  Write-Host '== 4/7 编译 Java ==' -ForegroundColor Cyan
  $sources = @(
    (Join-Path $work 'gen\com\pokebonk\offline\R.java'),
    (Join-Path $work 'java\com\pokebonk\offline\MainActivity.java')
  )
  & "$Jdk\bin\javac.exe" -encoding UTF-8 --release 11 -nowarn `
    -cp $androidJar -d "$work\classes" $sources
  if ($LASTEXITCODE -ne 0) { throw 'javac 失败' }

  Write-Host '== 5/7 生成 classes.dex ==' -ForegroundColor Cyan
  $classFiles = Get-ChildItem "$work\classes" -Recurse -Filter *.class | ForEach-Object { $_.FullName }
  & "$bt\d8.bat" --lib $androidJar --min-api 24 --output "$work\dex" $classFiles
  if ($LASTEXITCODE -ne 0) { throw 'd8 失败' }

  Write-Host '== 6/7 写入 assets 与 dex（约 6700 个游戏文件）==' -ForegroundColor Cyan
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::Open("$work\base.apk", 'Update')
  $webFiles = Get-ChildItem $web -Recurse -File
  foreach ($f in $webFiles) {
    $rel = $f.FullName.Substring($web.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip, $f.FullName, "assets/web/$rel", [System.IO.Compression.CompressionLevel]::Fastest) | Out-Null
  }
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
    $zip, (Join-Path $android 'assets-extra\pb-api-shim.js'), 'assets/pb-api-shim.js',
    [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  if ($compatCss) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip, $compatCss, 'assets/pb-compat.css',
      [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
    $zip, "$work\dex\classes.dex", 'classes.dex',
    [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  $zip.Dispose()
  Write-Host "   已写入 $($webFiles.Count) 个游戏文件"

  Write-Host '== 7/7 对齐与签名 ==' -ForegroundColor Cyan
  & "$bt\zipalign.exe" -f -p 4 "$work\base.apk" "$work\aligned.apk"
  if ($LASTEXITCODE -ne 0) { throw 'zipalign 失败' }
  if (-not (Test-Path $keystore)) {
    & "$Jdk\bin\keytool.exe" -genkeypair -keystore $keystore -alias pokebonk -keyalg RSA -keysize 2048 `
      -validity 10000 -storepass pokebonk -keypass pokebonk `
      -dname "CN=Pokebonk Offline, O=Local Build, C=CN" | Out-Null
  }
  & "$bt\apksigner.bat" sign --ks $keystore --ks-pass pass:pokebonk --key-pass pass:pokebonk `
    --v1-signing-enabled true --v2-signing-enabled true --out "$work\signed.apk" "$work\aligned.apk"
  if ($LASTEXITCODE -ne 0) { throw 'apksigner 失败' }

  Copy-Item "$work\signed.apk" $apkPath -Force
  $size = [math]::Round((Get-Item $apkPath).Length / 1MB, 1)
  Write-Host "`n完成：$apkPath（$size MB）" -ForegroundColor Green
}
finally {
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}

if (-not $SkipInstall -and (Test-Path $adb)) {
  $devices = & $adb devices | Select-String -Pattern '\tdevice$'
  if ($devices) {
    Write-Host '检测到设备，正在安装…' -ForegroundColor Cyan
    & $adb install -r -d $apkPath
  } else {
    Write-Host '未检测到设备，跳过安装' -ForegroundColor Yellow
  }
}
exit 0