param([ValidateSet('check','test','update','selftest')][string]$Mode='check',
    [ValidateSet('all','controlpod','external','apex-launcher','dou-link','run-analytics','Bili-Peek')][string]$Target='all',
    [string]$Source='D:\Projects\ControlPod', [string]$Install='D:\Apps\ControlPod',
    [string]$StateDir="$env:LOCALAPPDATA\ControlPod\updates", [int]$OwnerId=0)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$script:UpdateProgress = 0
$Source = [IO.Path]::GetFullPath($Source)
$Install = [IO.Path]::GetFullPath($Install).TrimEnd('\')
$StateDir = [IO.Path]::GetFullPath($StateDir)
New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
$mutex=[Threading.Mutex]::new($false,'Local\ControlPod.LocalUpdates')
$locked=$false
try {$locked=$mutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$locked=$true}
if(!$locked){$mutex.Dispose(); [Console]::Error.WriteLine('另一个平台验证或更新正在进行'); exit 1}
function State($phase, $message, $changes=@(), $progress=$null) {
    # progress 是**真实完成度**（0~100），不是按阶段编的假数字：
    #   - 耗时最长的两个复制循环（源码快照、安装载荷）按「已复制文件 / 总文件」连续上报；
    #   - 三次外部子进程（前端测试 / dotnet publish / 壳自测）各自只算**一整步**，
    #     因为外部程序不吐进度，中间不编造 40%→90% 这种假爬升；
    #   - 未显式给值时沿用上一次的值，终态由调用点显式给 100。
    if ($null -ne $progress) { $script:UpdateProgress = [Math]::Max(0, [Math]::Min(100, [int]$progress)) }
    $data = @{phase=$phase; message=$message; at=[DateTimeOffset]::UtcNow.ToString('O'); changes=@($changes); log="$StateDir\validation.log"
        progress=if ($null -eq $script:UpdateProgress) { 0 } else { [int]$script:UpdateProgress }}
    $data.target=$Target; $data.mode=$Mode
    $temp = "$StateDir\status.tmp"
    $data | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $temp -Encoding UTF8
    Move-Item -LiteralPath $temp -Destination "$StateDir\status.json" -Force
    if($Target -in @('all','controlpod')){
        $data | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath "$StateDir\controlpod-status.tmp" -Encoding UTF8
        Move-Item -LiteralPath "$StateDir\controlpod-status.tmp" -Destination "$StateDir\controlpod-status.json" -Force
    }
}
function Run($program, $arguments, $marker='') {
    if (!$program -or !(Test-Path -LiteralPath $program -PathType Leaf)) { throw "测试程序不存在：$program" }
    $savedPreference=$ErrorActionPreference
    try { $ErrorActionPreference='Continue'; $global:LASTEXITCODE=$null; $result = @(& $program @arguments 2>&1); $code = $global:LASTEXITCODE }
    finally { $ErrorActionPreference=$savedPreference }
    $result | ForEach-Object {"$_"} | Out-File -LiteralPath "$StateDir\validation.log" -Append -Encoding UTF8
    if ($null -eq $code -or $code -ne 0) { throw "$program 失败（退出码 $code），请查看测试日志：$StateDir\validation.log" }
    $output = $result -join "`n"
    if ($marker -and $output -notmatch $marker) { throw "$program 未返回要求的测试通过标记" }
    return $output
}
function SourceFiles {
    $files = @(& git -C $Source -c core.quotepath=false ls-files --cached --others --exclude-standard)
    if ($LASTEXITCODE -ne 0) { throw '无法读取本地 Git 仓库文件列表' }
    return @($files | Sort-Object -Unique | Where-Object {
        $_ -match '^(shell/|web/|tools/|docs/|\.gitattributes$|\.gitignore$|index\.html$|app\.js$|styles\.css$|smoke-test\.js$|README\.md$|AGENTS\.md$)' -and
        $_ -notmatch '^shell/(bin|obj|\.vs)/' -and $_ -notmatch '\.user$'
    })
}
function Hashes($root, $files) {
    $map = @{}
    foreach ($file in $files) {
        $full = [IO.Path]::GetFullPath((Join-Path $root $file))
        if (!$full.StartsWith($root.TrimEnd('\')+'\', [StringComparison]::OrdinalIgnoreCase)) { throw '源码路径越界' }
        if (Test-Path -LiteralPath $full -PathType Leaf) {
            if ((Get-Item -LiteralPath $full).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "不支持链接文件：$file" }
            $map[$file] = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash
        }
    }
    return $map
}
function Same($a, $b) {
    if ($a.Count -ne $b.Count) { return $false }
    foreach ($key in $a.Keys) { if (!$b.ContainsKey($key) -or $a[$key] -ne $b[$key]) { return $false } }
    return $true
}
function Receipt($hashes, $target) {
    $payload=@{}
    foreach ($file in Get-ChildItem -LiteralPath $target -File -Recurse) {
        $relative=$file.FullName.Substring($target.Length+1).Replace('\','/')
        if ($relative -eq 'update-receipt.json' -or $relative -match '^(wwwroot\.previous-|\.wwwroot-update-)') { continue }
        $payload[$relative]=(Get-FileHash -LiteralPath $file.FullName).Hash
    }
    @{files=$hashes; payload=$payload; at=[DateTimeOffset]::UtcNow.ToString('O')} | ConvertTo-Json -Depth 5 |
        Set-Content -LiteralPath "$target\update-receipt.json" -Encoding UTF8
}
try {
    if ($Mode -eq 'selftest') {
        $root = Join-Path $StateDir ([guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $root | Out-Null
        Set-Content -LiteralPath "$root\a.txt" -Value 'old'
        $before = Hashes $root @('a.txt')
        if (!(Same $before (Hashes $root @('a.txt')))) { throw '未改动文件不应报告变化' }
        Set-Content -LiteralPath "$root\a.txt" -Value 'new'
        if (Same $before (Hashes $root @('a.txt'))) { throw '未检出内容变化' }
        if (Same $before (Hashes $root @())) { throw '未检出文件删除' }
        $rejected = $false
        try { Hashes $root @('../outside.txt') | Out-Null } catch { $rejected=$true }
        if (!$rejected) { throw '路径越界没有被拒绝' }
        Write-Output 'UPDATE_SELFTEST_PASS'; exit 0
    }
    if ($Target -ne 'controlpod') {
        State 'running' '正在处理外部项目'
        & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$Source\tools\update-external.ps1" -Mode $Mode -Target $(if($Target -eq 'all'){'external'}else{$Target}) -ProjectsRoot (Split-Path $Source -Parent) -StateDir $StateDir
        if ($LASTEXITCODE -ne 0) { throw "外部项目处理失败，后续平台更新已停止；详见 $StateDir\external.json" }
        if ($Target -ne 'all') {
            $external=Get-Content -LiteralPath "$StateDir\external.json" -Raw -Encoding UTF8 | ConvertFrom-Json
            State $external.phase $external.message
            exit 0
        }
    }
    if (!(Test-Path -LiteralPath "$Install\ApexShell.exe")) { throw '找不到现有安装版，请先安装 CPod' }
    if ((Get-Item -LiteralPath $Install).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '不支持更新链接目录' }
    $files = SourceFiles
    $hashes = Hashes $Source $files
    $prior = @{}
    $payloadChanges=@()
    if (Test-Path -LiteralPath "$Install\update-receipt.json") {
        $receipt = Get-Content -LiteralPath "$Install\update-receipt.json" -Raw | ConvertFrom-Json
        foreach ($p in $receipt.files.PSObject.Properties) { $prior[$p.Name]=$p.Value }
        foreach ($p in $receipt.payload.PSObject.Properties) {
            $path=Join-Path $Install $p.Name
            if (!(Test-Path -LiteralPath $path -PathType Leaf) -or (Get-FileHash -LiteralPath $path).Hash -ne $p.Value) {
                $payloadChanges += '安装版：'+$p.Name
            }
        }
    }
    $changes = @(@($hashes.Keys)+@($prior.Keys) | Sort-Object -Unique | Where-Object {
        !$hashes.ContainsKey($_) -or !$prior.ContainsKey($_) -or $hashes[$_] -ne $prior[$_]
    })
    $changes += $payloadChanges
    if ($Mode -eq 'check') {
        State 'checked' $(if ($changes.Count) { "发现 $($changes.Count) 个文件与上次安装记录不同" } else { '本地源码与上次安装记录一致' }) $changes
        exit 0
    }
    if ($Mode -eq 'update' -and !$changes.Count) { State 'checked' '本地源码与上次安装记录一致'; exit 0 }
    $job = Join-Path $StateDir ([guid]::NewGuid().ToString('N'))
    $snapshot = Join-Path $job 'source'
    New-Item -ItemType Directory -Path $snapshot -Force | Out-Null
    # 进度配比（真实工作量口径，不是平均分）：
    #   复制源码快照 3~40（按文件数连续上报）· 前端测试 40~50（一整步）
    #   构建 publish 50~70 · 壳自测 70~80 · 安装载荷复制 80~98（按文件数）· 收尾 100
    $snapshotFiles = @($hashes.Keys)
    $copied = 0
    foreach ($file in $snapshotFiles) {
        $dest = Join-Path $snapshot $file
        New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $Source $file) -Destination $dest
        $copied++
        $pct = 3 + [Math]::Floor(37 * $copied / [Math]::Max(1, $snapshotFiles.Count))
        State 'testing' ("正在复制源码快照（$copied/$($snapshotFiles.Count)）") $changes $pct
    }
    if (!(Same $hashes (Hashes $snapshot $files))) { throw '复制源码期间文件发生变化，请重试' }
    Set-Content -LiteralPath "$StateDir\validation.log" -Value '' -Encoding UTF8
    State 'testing' '正在跑前端检查' $changes 42
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (!$node) { $node="$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" }
    if (!(Test-Path -LiteralPath $node)) { throw '找不到 Node.js，无法运行前端测试' }
    Push-Location $snapshot
    try { Run $node @('smoke-test.js') '(?m)^ALL_PASS\s*$' | Out-Null } finally { Pop-Location }
    $shellChanged = !$prior.Count -or @($changes | Where-Object { $_ -like 'shell/*' -or $_ -like 'tools/*' -or ($_ -like '安装版：*' -and $_ -notlike '安装版：wwwroot/*') }).Count -gt 0
    if ($Mode -eq 'test' -or $shellChanged) {
        State 'building' '前端检查通过，正在构建桌面程序' $changes 52
        $dotnet = "$env:USERPROFILE\.dotnet\dotnet.exe"
        if (!(Test-Path -LiteralPath $dotnet)) { $dotnet=(Get-Command dotnet -ErrorAction Stop).Source }
        $published = Join-Path $job 'publish'
        Run $dotnet @('publish', "$snapshot\shell\ApexShell.csproj", '-c','Release','-p:Platform=x64','-p:RuntimeIdentifier=win-x64','-o',$published) | Out-Null
        State 'building' '构建完成，正在跑桌面自测' $changes 72
        # 自测必须同时检查进程退出码和报告，不能只认一行控制台文案。
        $report = Join-Path $job 'selftest.log'
        $process = Start-Process -FilePath "$published\ApexShell.exe" -ArgumentList @('--selftest', ('"'+$report+'"')) -PassThru -WindowStyle Hidden
        if (!$process.WaitForExit(300000)) { $process.Kill(); throw '桌面自测超过 5 分钟' }
        if ($process.ExitCode -ne 0 -or !(Test-Path -LiteralPath $report) -or
            (Get-Content -LiteralPath $report -Raw) -notmatch '=== SELFTEST PASS:') { throw "桌面自测失败，请查看 $report" }
        Get-Content -LiteralPath $report -Encoding UTF8 | Out-File -LiteralPath "$StateDir\validation.log" -Append -Encoding UTF8
    }
    if (!(Same $hashes (Hashes $Source (SourceFiles)))) { throw '测试期间源码又有改动，安装版未更新，请重新验证' }
    if ($Mode -eq 'test') { State 'tested' '前端、桌面构建和壳自测通过；安装版未替换' $changes 100; exit 0 }
    if (!$shellChanged) {
        State 'installing' '测试通过，正在同步界面文件' $changes 80
        $preparedWeb = Join-Path $Install ('.wwwroot-update-'+[guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path "$preparedWeb\web" -Force | Out-Null
        $webFiles = @($hashes.Keys | Where-Object { $_ -in @('index.html','app.js','styles.css') -or $_ -like 'web/*.js' })
        $webDone = 0
        foreach ($file in $webFiles) {
            $dest=Join-Path $preparedWeb $file
            New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
            Copy-Item -LiteralPath (Join-Path $snapshot $file) -Destination $dest
            if ((Get-FileHash -LiteralPath $dest).Hash -ne $hashes[$file]) { throw '界面复制校验失败' }
            $webDone++
            State 'installing' "正在同步界面文件（$webDone/$($webFiles.Count)）" $changes (80 + [Math]::Floor(18 * $webDone / [Math]::Max(1, $webFiles.Count)))
        }
        $oldWeb=Join-Path $Install ('wwwroot.previous-'+[guid]::NewGuid().ToString('N'))
        Move-Item -LiteralPath "$Install\wwwroot" -Destination $oldWeb
        try { Move-Item -LiteralPath $preparedWeb -Destination "$Install\wwwroot"; Receipt $hashes $Install }
        catch {
            if (Test-Path -LiteralPath "$Install\wwwroot") { Move-Item -LiteralPath "$Install\wwwroot" -Destination $preparedWeb }
            Move-Item -LiteralPath $oldWeb -Destination "$Install\wwwroot"
            throw
        }
        State 'updated' '界面已同步，重启 CPod 后使用新版；上一版界面已保留' $changes 100
    } else {
        $prepared=Join-Path (Split-Path $Install -Parent) ('.ControlPod-update-'+[guid]::NewGuid().ToString('N'))
        # 安装载荷复制是最后一段大工作量：按文件数连续上报 80~96
        $payloadFiles = @(Get-ChildItem -LiteralPath $published -File -Recurse)
        $payloadDone = 0
        foreach ($item in $payloadFiles) {
            $relative = $item.FullName.Substring($published.Length+1)
            # ⚠️ 局部变量**不能叫 $target**：PowerShell 变量名不区分大小写，$target 就是
            # 脚本参数 $Target（带 ValidateSet 约束），给它赋一个路径会直接抛
            # 「无法验证此变量，因为值 … 不是变量 Target 的有效值」——整个更新随之失败。
            $payloadDest = Join-Path $prepared $relative
            New-Item -ItemType Directory -Path (Split-Path $payloadDest -Parent) -Force | Out-Null
            Copy-Item -LiteralPath $item.FullName -Destination $payloadDest
            $payloadDone++
            State 'installing' "正在准备新版文件（$payloadDone/$($payloadFiles.Count)）" $changes (80 + [Math]::Floor(16 * $payloadDone / [Math]::Max(1, $payloadFiles.Count)))
        }
        foreach ($file in $payloadFiles) {
            $relative=$file.FullName.Substring($published.Length+1)
            if ((Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath (Join-Path $prepared $relative)).Hash) { throw '新版复制校验失败' }
        }
        State 'installing' '新版文件校验通过，正在登记安装记录' $changes 97
        Receipt $hashes $prepared
        $helper=Join-Path $job 'apply-update.ps1'
        Copy-Item -LiteralPath "$snapshot\tools\apply-update.ps1" -Destination $helper
        Copy-Item -LiteralPath "$snapshot\tools\trim-update-artifacts.ps1" -Destination "$job\trim-update-artifacts.ps1"
        @{prepared=$prepared; helper=$helper} | ConvertTo-Json | Set-Content -LiteralPath "$StateDir\pending.json" -Encoding UTF8
        $args=@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',('"'+$helper+'"'),'-Prepared',('"'+$prepared+'"'),'-Install',('"'+$Install+'"'),'-StateDir',('"'+$StateDir+'"'),'-OwnerId',$OwnerId)
        State 'pending' '测试通过，新版已准备好；重启 CPod 后自动完成替换并重新打开。请先关闭使用 CPod 的看板窗口。' $changes 100
        # 正常窗口在用户选择退出时启动替换工具；pending.json 支持准备后关机、下次继续。
        if ($OwnerId -eq 0) {
            try { Start-Process powershell.exe -ArgumentList $args -WindowStyle Hidden -ErrorAction Stop | Out-Null }
            catch { State 'failed' ('无法启动替换工具：'+$_.Exception.Message) $changes; throw }
        }
    }
} catch {
    State 'failed' $_.Exception.Message
    Write-Error $_.Exception.Message
    exit 1
} finally {
    if($job -and (Test-Path -LiteralPath "$Source\tools\trim-update-artifacts.ps1")){
        try { & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$Source\tools\trim-update-artifacts.ps1" -Mode clean -SkipSource -Source $Source -Install $Install -StateDir $StateDir |
            Out-File -LiteralPath "$StateDir\cleanup.log" -Append -Encoding UTF8 }
        catch { $_.Exception.Message | Out-File -LiteralPath "$StateDir\cleanup.log" -Append -Encoding UTF8 }
    }
    if($locked){$mutex.ReleaseMutex()}; $mutex.Dispose()
}
