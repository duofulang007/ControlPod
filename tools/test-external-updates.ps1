param([string]$StateDir="$PSScriptRoot\..\shell\test-tmp\external-contract")
$ErrorActionPreference='Stop'
$StateDir=[IO.Path]::GetFullPath($StateDir)
New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
$fixture=Join-Path $StateDir ([guid]::NewGuid().ToString('N'))
$repo=Join-Path $fixture 'Bili-Peek'
New-Item -ItemType Directory -Path "$repo\.apex","$repo\tests" -Force | Out-Null
& git -C $repo init -q
if($LASTEXITCODE -ne 0){throw '无法建立测试仓库'}
[IO.File]::WriteAllText("$repo\.apex\module.json",'{"id":"bili-peek","projectRoot":"."}')
[IO.File]::WriteAllText("$repo\app.js",'before')
[IO.File]::WriteAllText("$repo\tests\mutate.cjs","require('fs').writeFileSync('app.js', 'changed during test');")
[IO.File]::WriteAllText("$repo\tests\pass.cjs",'process.exit(0);')
[IO.File]::WriteAllText("$repo\package.json",'{"scripts":{"check":"node tests/mutate.cjs","test":"node tests/pass.cjs"}}')
$state=Join-Path $fixture 'state'
& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PSScriptRoot\update-external.ps1" -Mode update -Target Bili-Peek -ProjectsRoot $fixture -StateDir $state
if($LASTEXITCODE -ne 1){throw '测试期间源码变化未阻止更新'}
$result=Get-Content "$state\external.json" -Raw -Encoding UTF8 | ConvertFrom-Json
if($result.phase -ne 'failed' -or (Test-Path "$state\external-Bili-Peek-receipt.json")){throw '变化源码被错误记录为已更新'}
[IO.File]::WriteAllText("$repo\package.json",'{"scripts":{"check":"node tests/pass.cjs","test":"node tests/pass.cjs"}}')
& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PSScriptRoot\update-external.ps1" -Mode update -Target Bili-Peek -ProjectsRoot $fixture -StateDir $state
if($LASTEXITCODE -ne 0 -or !(Test-Path "$state\external-Bili-Peek-receipt.json")){throw '稳定源码验证更新未成功'}
$receiptHash=(Get-FileHash "$state\external-Bili-Peek-receipt.json").Hash
[IO.File]::WriteAllText("$repo\app.js",'new baseline')
[IO.File]::WriteAllText("$repo\package.json",'{"scripts":{"check":"node tests/mutate.cjs","test":"node tests/pass.cjs"}}')
& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PSScriptRoot\update-external.ps1" -Mode update -Target Bili-Peek -ProjectsRoot $fixture -StateDir $state
if($LASTEXITCODE -ne 1 -or (Get-FileHash "$state\external-Bili-Peek-receipt.json").Hash -ne $receiptHash){throw '失败验证覆盖了上次成功收据'}
& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PSScriptRoot\update-external.ps1" -Mode update -Target external -ProjectsRoot $fixture -StateDir $state
if($LASTEXITCODE -ne 1){throw '缺失项目未停止全量更新'}
$result=Get-Content "$state\external.json" -Raw -Encoding UTF8 | ConvertFrom-Json
if($result.phase -ne 'failed' -or !@($result.projects | Where-Object id -eq 'apex-launcher').Count){throw '缺失模块失败归属不正确'}
if(!@($result.projects | Where-Object id -eq 'Bili-Peek').Count){throw '单项目操作清空了其他项目的结果，卡片只能显示尚无检查结果'}
Write-Output 'EXTERNAL_CONTRACT_PASS'
