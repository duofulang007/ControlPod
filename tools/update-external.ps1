param([ValidateSet('check','test','update','selftest')][string]$Mode='check',
    [ValidateSet('external','apex-launcher','dou-link','run-analytics','Bili-Peek')][string]$Target='external',
    [string]$ProjectsRoot='D:\Projects', [string]$StateDir="$env:LOCALAPPDATA\ControlPod\updates")
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$OutputEncoding=[Console]::OutputEncoding
$ProjectsRoot=[IO.Path]::GetFullPath($ProjectsRoot).TrimEnd('\')
$StateDir=[IO.Path]::GetFullPath($StateDir)
New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
$results=@()
$previousResults=@()
if(Test-Path -LiteralPath "$StateDir\external.json"){
    $previousResults=@((Get-Content -LiteralPath "$StateDir\external.json" -Raw -Encoding UTF8 | ConvertFrom-Json).projects)
}
$mutex=[Threading.Mutex]::new($false,'Local\ControlPod.ExternalUpdates')
$locked=$false
try {$locked=$mutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$locked=$true}
if(!$locked){$mutex.Dispose(); [Console]::Error.WriteLine('另一个外部项目验证或更新正在进行'); exit 1}
function SaveStatus($phase,$message) {
    $currentIds=@($results | ForEach-Object {$_.id})
    $combined=@($results)+@($previousResults | Where-Object {$_.id -notin $currentIds})
    @{phase=$phase; message=$message; mode=$Mode; target=$Target; projects=$combined; at=[DateTimeOffset]::UtcNow.ToString('O'); log="$StateDir\external-validation.log"} |
        ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "$StateDir\external.tmp" -Encoding UTF8
    Move-Item -LiteralPath "$StateDir\external.tmp" -Destination "$StateDir\external.json" -Force
}
function Same($a,$b) {
    if($a.Count -ne $b.Count){return $false}
    foreach($key in $a.Keys){if(!$b.ContainsKey($key) -or $a[$key] -ne $b[$key]){return $false}}
    return $true
}
function FileHashes($root,$files) {
    $map=@{}
    if((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint){throw '不支持链接仓库'}
    foreach($file in $files){
        $path=[IO.Path]::GetFullPath((Join-Path $root $file))
        if(!$path.StartsWith($root.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw '外部源码路径越界'}
        $part=Get-Item -LiteralPath $path -ErrorAction SilentlyContinue
        if(!$part){continue}
        for($parent=$part; $parent -and $parent.FullName -ne $root; $parent=$parent.Parent){
            if($parent.Attributes -band [IO.FileAttributes]::ReparsePoint){throw "不支持链接：$file"}
            if($parent -is [IO.FileInfo]){$parent=$parent.Directory; if($parent.Attributes -band [IO.FileAttributes]::ReparsePoint){throw "不支持链接：$file"}}
        }
        $map[$file]=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
    }
    return $map
}
function SourceHashes($root) {
    $files=@(& git -C $root -c core.quotepath=false ls-files --cached --others --exclude-standard)
    if($LASTEXITCODE -ne 0){throw "无法读取 Git 仓库：$root"}
    # 只验证业务源码和测试；工具元数据、依赖、缓存和个人数据不进入收据。
    $files=@($files | Sort-Object -Unique | Where-Object {
        $_ -notmatch '(^|/)(bin|obj|node_modules|__pycache__|\.venv|\.tools|\.local|local|data|publish|\.workbuddy|\.pytest_cache|\.pytest_tmp|\.test-tmp-baseline)(/|$)' -and
        $_ -notmatch '^(data(\.prev)?\.js$|\.git/)' -and
        ($_ -match '^(\.apex/|apex_launcher/|tests/|tools/|src/|helper/|obsidian-plugin/|web/)' -or $_ -match '^[^/]+\.(py|js|cjs|json|ps1|cmd|html|css|toml|txt|md|Config)$')
    })
    return FileHashes $root $files
}
function UpdateAvailable($name,$root,$changes,$hashes) {
    # 源码验证收据不是安装版本；直接运行源码的项目无需再次安装。
    if($name -in @('apex-launcher','run-analytics')){return $false}
    if($name -eq 'Bili-Peek'){
        $runtimePath=Join-Path $root '.local/runtime.json'
        if(!(Test-Path -LiteralPath $runtimePath)){return $true}
        $runtime=Get-Content -LiteralPath $runtimePath -Raw -Encoding UTF8 | ConvertFrom-Json
        return !$hashes['Bili-Peek.user.js'] -or $runtime.sha256 -ne $hashes['Bili-Peek.user.js']
    }
    return @($changes | Where-Object {$_ -notmatch '\.md$|^tests/'}).Count -gt 0
}
function Run($program,$arguments,$label='') {
    if(!$program -or !(Test-Path -LiteralPath $program -PathType Leaf)){throw "测试程序不存在：$program"}
    if(!$label){$label=$arguments -join ' '}
    $step=@{name=$label; phase='running'; summary='正在执行'; seconds=0}
    if($item){$item.checks+=@($step); SaveStatus 'testing' "正在验证 $name · $label"}
    $watch=[Diagnostics.Stopwatch]::StartNew()
    $savedPreference=$ErrorActionPreference
    try { $ErrorActionPreference='Continue'; $global:LASTEXITCODE=$null; $output=@(& $program @arguments 2>&1); $code=$global:LASTEXITCODE }
    finally { $ErrorActionPreference=$savedPreference }
    $output | ForEach-Object {"$_"} | Out-File -LiteralPath "$StateDir\external-validation.log" -Append -Encoding UTF8
    if($item){$output | ForEach-Object {"$_"} | Out-File -LiteralPath $item.log -Append -Encoding UTF8}
    $step.seconds=[Math]::Round($watch.Elapsed.TotalSeconds,1)
    $step.phase=if($null -eq $code -or $code -ne 0){'failed'}else{'passed'}
    $lines=@($output | ForEach-Object {"$_"} | Where-Object {$_ -match 'passed|Ran \d+ tests|ℹ (tests|pass|fail)|ALL_PASS|SELFTEST PASS|0 个错误'})
    $step.summary=if($step.phase -eq 'failed'){"退出码 $code"}elseif($lines.Count){($lines | Select-Object -Last 4) -join ' · '}else{'退出码 0'}
    $report=($output | ForEach-Object {"$_"}) -join "`n"
    $step.output=if($report.Length -gt 6000){$report.Substring($report.Length-6000)}else{$report}
    if($item){SaveStatus 'testing' "$name · $label $($step.phase)"}
    if($step.phase -eq 'failed'){throw "测试失败（退出码 $code）：$label；详见 $StateDir\external-validation.log"}
}
function RuntimeProcesses($root) {
    # 查询失败即停止；不能把权限拒绝解释为没有运行实例。
    $processes=@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
        ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)) -or
        ($_.CommandLine -and $_.CommandLine.IndexOf($root+'\',[StringComparison]::OrdinalIgnoreCase) -ge 0)
    })
    if((Split-Path $root -Leaf) -eq 'apex-launcher'){
        $probe=[Net.Sockets.TcpClient]::new()
        try { $task=$probe.ConnectAsync('127.0.0.1',8766); if($task.Wait(500) -and $probe.Connected){$processes+=@{unknownOrRunningWorker=$true}} } catch {} finally {$probe.Dispose()}
    }
    return $processes
}
function AssertStopped($root) {
    if(@(RuntimeProcesses $root).Count){throw '项目仍在运行，请先在项目卡片关闭，完成后再更新；未关闭任何进程'}
}
function ReplacePublish($prepared,$destination,$expected=@{}) {
    $parent=[IO.Path]::GetFullPath((Split-Path $destination -Parent))
    foreach($path in @($prepared,$destination)){
        if([IO.Path]::GetFullPath((Split-Path $path -Parent)) -ne $parent){throw '发布目录越界'}
        if((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw '不能替换链接发布目录'}
    }
    $backup=$destination+'.previous-'+[guid]::NewGuid().ToString('N')
    $moved=$false
    try {
        if(Test-Path -LiteralPath $destination){Move-Item -LiteralPath $destination -Destination $backup; $moved=$true}
        Move-Item -LiteralPath $prepared -Destination $destination
        if($expected.Count -and !(Same $expected (FileHashes $destination @($expected.Keys)))){throw '发布载荷校验失败'}
    } catch {
        if(Test-Path -LiteralPath $destination){Move-Item -LiteralPath $destination -Destination $prepared}
        if($moved){Move-Item -LiteralPath $backup -Destination $destination}
        throw
    }
    return $backup
}
try {
    if($Mode -eq 'selftest'){
        $fixture=Join-Path $StateDir ('fixture-'+[guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $fixture | Out-Null
        if(UpdateAvailable 'apex-launcher' $fixture @('app.py') @{}){throw '直接使用源码却提示更新'}
        if(UpdateAvailable 'dou-link' $fixture @('README.md','tests/check.py') @{}){throw '文档测试变化却提示安装更新'}
        if(!(UpdateAvailable 'dou-link' $fixture @('安装副本：publish') @{})){throw '安装副本变化未提示'}
        New-Item -ItemType Directory "$fixture\.local" | Out-Null
        [IO.File]::WriteAllText("$fixture\.local\runtime.json",'{"sha256":"abc"}')
        if(UpdateAvailable 'Bili-Peek' $fixture @('README.md') @{'Bili-Peek.user.js'='ABC'}){throw '已发布源码仍提示更新'}
        if(!(UpdateAvailable 'Bili-Peek' $fixture @() @{'Bili-Peek.user.js'='DEF'})){throw '发布版本落后未提示更新'}
        Set-Content "$fixture\a.txt" 'old'
        $before=FileHashes $fixture @('a.txt')
        if(!(Same $before (FileHashes $fixture @('a.txt')))){throw '未变化比较失败'}
        Set-Content "$fixture\a.txt" 'new'
        if(Same $before (FileHashes $fixture @('a.txt'))){throw '变化未检出'}
        if(Same $before (FileHashes $fixture @())){throw '删除未检出'}
        $rejected=$false
        try{FileHashes $fixture @('../outside.txt') | Out-Null}catch{$rejected=$true}
        if(!$rejected){throw '越界未拒绝'}
        New-Item -ItemType Directory "$fixture\publish" | Out-Null
        Set-Content "$fixture\publish\old.txt" 'keep'
        $rejected=$false
        try{ReplacePublish "$fixture\missing" "$fixture\publish" | Out-Null}catch{$rejected=$true}
        if(!$rejected -or !(Test-Path "$fixture\publish\old.txt")){throw '替换失败没有回退'}
        New-Item -ItemType Directory "$fixture\prepared" | Out-Null
        Set-Content "$fixture\prepared\new.txt" 'bad payload'
        $rejected=$false
        try{ReplacePublish "$fixture\prepared" "$fixture\publish" @{'new.txt'='wrong hash'} | Out-Null}catch{$rejected=$true}
        if(!$rejected -or !(Test-Path "$fixture\publish\old.txt")){throw '载荷校验失败没有回退'}
        $rejected=$false
        try{Run "$fixture\missing.exe" @()}catch{$rejected=$true}
        if(!$rejected){throw '缺少测试程序没有停止'}
        Write-Output 'EXTERNAL_SELFTEST_PASS'; exit 0
    }
    Set-Content -LiteralPath "$StateDir\external-validation.log" -Value '' -Encoding UTF8
    $node=(Get-Command node.exe -ErrorAction SilentlyContinue).Source
    if(!$node){$node="$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"}
    $dotnet="$env:USERPROFILE\.dotnet\dotnet.exe"
    if(!(Test-Path $dotnet)){$dotnet=(Get-Command dotnet -ErrorAction Stop).Source}
    $names=if($Target -eq 'external'){@('apex-launcher','dou-link','run-analytics','Bili-Peek')}else{@($Target)}
    $expected=@{'apex-launcher'='apex-launcher'; 'dou-link'='dou-link'; 'run-analytics'='runner-lab'; 'Bili-Peek'='bili-peek'}
    # 先核对全部所选项目，缺失时不开始任何测试或部署。
    $jobs=@(foreach($name in $names){
        $root=Join-Path $ProjectsRoot $name
        $manifest=Get-Content -LiteralPath "$root\.apex\module.json" -Raw -Encoding UTF8 | ConvertFrom-Json
        if($manifest.id -ne $expected[$name] -or $manifest.projectRoot -ne '.'){throw "模块身份或源码位置不匹配：$name"}
        $hashes=SourceHashes $root
        $receiptPath=Join-Path $StateDir ("external-$name-receipt.json")
        $prior=@{}
        $payload=@{}
        if(Test-Path $receiptPath){
            $receipt=Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
            foreach($p in $receipt.files.PSObject.Properties){$prior[$p.Name]=$p.Value}
            foreach($p in $receipt.payload.PSObject.Properties){$payload[$p.Name]=$p.Value}
        }
        $changes=@(@($hashes.Keys)+@($prior.Keys) | Sort-Object -Unique | Where-Object { !$hashes.ContainsKey($_) -or !$prior.ContainsKey($_) -or $hashes[$_] -ne $prior[$_] })
        if($name -eq 'dou-link'){
            $installed=@{}
            if(Test-Path "$root\publish"){$installed=FileHashes "$root\publish" @(Get-ChildItem "$root\publish" -File -Recurse | ForEach-Object {$_.FullName.Substring(("$root\publish").Length+1)})}
            if(!$payload.Count -or !(Same $payload $installed)){$changes+= '安装副本：publish'}
        }
        $active=@(RuntimeProcesses $root).Count -gt 0
        $item=@{id=$name; phase='checked'; changes=@($changes); message=if($changes.Count){"发现 $($changes.Count) 项变化，尚未验证"}else{'源码与上次验证记录一致'}; restartRequired=$active; checks=@(); at=[DateTimeOffset]::UtcNow.ToString('O');
            log=Join-Path $StateDir ("external-$name-"+[guid]::NewGuid().ToString('N')+'.log'); mode=$Mode; sourceVersion=[string]$manifest.version; delivery='source'}
        if($name -eq 'dou-link'){$item.delivery='publish'}
        if($name -eq 'Bili-Peek'){
            $package=Get-Content -LiteralPath "$root\package.json" -Raw -Encoding UTF8 | ConvertFrom-Json
            $item.sourceVersion=[string]$package.version; $item.delivery='browser-install-required'
        }
        $item.updateAvailable=UpdateAvailable $name $root $changes $hashes
        if($active){$item.message+='；存在运行实例，本次检查未确认实例版本'}
        if($name -eq 'Bili-Peek'){$item.message+='；浏览器脚本和 Obsidian 插件副本需分别安装'}
        $results+=$item
        @{name=$name; root=$root; hashes=$hashes; item=$item; receipt=$receiptPath; payload=$payload}
    })
    SaveStatus 'checked' '外部项目检查完成'
    if($Mode -eq 'check'){exit 0}
    foreach($job in $jobs){
        $name=$job.name; $root=$job.root; $item=$job.item
        if($Mode -eq 'update' -and !$item.changes.Count -and !$item.updateAvailable){
            $item.phase='unchanged'; $item.message='未发现新的源码变化，本次没有替换文件；可单独运行检查与测试'
            if($name -eq 'Bili-Peek'){$item.phase='action-required'; $item.message='源码与已验证记录一致；浏览器脚本仍需在油猴中安装，CPod 无法据此确认浏览器已更新'}
            elseif($item.restartRequired){$item.phase='restart-required'; $item.message+='；运行实例版本未确认，需重启后生效'}
            continue
        }
        $item.phase='testing'; $item.message='正在运行项目自己的检查和测试'
        SaveStatus 'testing' "正在验证 $name"
        Push-Location $root
        try {
            $python=Join-Path $root '.venv\Scripts\python.exe'
            switch($name){
                'apex-launcher' {Run $python @('-m','pytest','tests','-q','--basetemp',(Join-Path $env:TEMP ('cpod-pytest-'+[guid]::NewGuid().ToString('N')))) '离线启动逻辑测试'}
                'dou-link' {Run $dotnet @('build','src\DouLink.csproj','-c','Release',"-p:RestoreConfigFile=$root\NuGet.Config") 'Release 编译检查'}
                'run-analytics' {
                    Run $node @('tools/check.js') '页面逻辑检查'; Run $node @('tools/test_radar_ui.js') '雷达交互检查'
                    foreach($script in @('metrics','serve','tasks')){Run $python @("tools/$script.py",'--selftest') "$script 自测"}
                    Run $python @('-m','unittest','discover','-s','tools','-p','test_*.py') '数据与工具单元测试'
                }
                'Bili-Peek' {
                    # 以本仓库 package.json 为准，不把 run/stop 当作测试。
                    $package=Get-Content -LiteralPath 'package.json' -Raw -Encoding UTF8 | ConvertFrom-Json
                    foreach($script in $(if($Mode -eq 'update'){@($package.scripts.check)}else{@($package.scripts.check,$package.scripts.test)})){
                        if(!$script){throw 'package.json 缺少检查或测试脚本'}
                        foreach($command in ($script -split '\s*&&\s*')){
                            if($command -notmatch '^node\s+[-a-zA-Z0-9_./\s]+$'){throw '仅支持 package.json 中的直接 Node 检查；脚本已变化，请维护更新配方'}
                            Run $node @(($command -replace '^node\s+','') -split '\s+') $(if($command -match '--test'){'用户脚本与助手回归测试'}else{'语法检查：'+($command -replace '^node\s+--check\s+','')})
                        }
                    }
                }
            }
        } finally {Pop-Location}
        if(!(Same $job.hashes (SourceHashes $root))){throw "$name 测试期间源码发生变化，未更新验证记录或安装副本"}
        $item.phase='tested'; $item.message=if($Mode -eq 'update' -and $name -eq 'Bili-Peek'){'快速检查通过；尚未发布'}else{'检查和测试通过；未执行更新'}
    }
    # 全部测试通过才开始更新。部署前再次确认全部源码，失败停止后续步骤。
    if($Mode -eq 'update'){
        foreach($job in $jobs){if(!(Same $job.hashes (SourceHashes $job.root))){throw "$($job.name) 源码变化，请重新验证"}}
        foreach($job in $jobs){
            $name=$job.name; $root=$job.root; $item=$job.item
            if(!$item.changes.Count){continue}
            if($name -eq 'dou-link'){
                AssertStopped $root
                $prepared=Join-Path $root ('.cpod-publish-'+[guid]::NewGuid().ToString('N'))
                Push-Location $root
                try{Run $dotnet @('publish','src\DouLink.csproj','-c','Release','-o',$prepared,'-p:PublishSingleFile=false','-p:SelfContained=false','-p:DebugType=None',"-p:RestoreConfigFile=$root\NuGet.Config")}finally{Pop-Location}
                if(!(Test-Path "$prepared\DouLink.exe")){throw 'dou-link 发布缺少程序'}
                $payload=FileHashes $prepared @(Get-ChildItem $prepared -File -Recurse | ForEach-Object {$_.FullName.Substring($prepared.Length+1)})
                if(!(Same $job.hashes (SourceHashes $root))){throw '发布期间源码变化，安装副本未替换'}
                AssertStopped $root
                $item.backup=ReplacePublish $prepared "$root\publish" $payload
                $installed=FileHashes "$root\publish" @($payload.Keys)
                if(!(Same $payload $installed)){throw 'dou-link 发布载荷校验失败'}
                $job.payload=$payload; $item.phase='updated'; $item.message='publish 已替换并校验，上一版已保留；下次运行使用新版'
            } else {
                $item.restartRequired=@(RuntimeProcesses $root).Count -gt 0
                $item.phase=if($item.restartRequired){'restart-required'}else{'ready'}
                $item.message=if($item.restartRequired){'源码验证通过；现有实例仍需重启，运行版本未更新'}else{'源码验证通过；本项目直接使用仓库，下次运行使用已验证源码'}
                if($name -eq 'Bili-Peek'){$item.phase='action-required'; $item.message+='；浏览器脚本和 Obsidian 插件仍待分别安装，未宣称安装副本已更新'}
            }
            if($name -eq 'Bili-Peek'){continue}
            @{files=$job.hashes; payload=$job.payload; at=[DateTimeOffset]::UtcNow.ToString('O')} | ConvertTo-Json -Depth 6 |
                Set-Content -LiteralPath ($job.receipt+'.tmp') -Encoding UTF8
            Move-Item -LiteralPath ($job.receipt+'.tmp') -Destination $job.receipt -Force
            SaveStatus 'updating' "$name 更新结果已记录"
        }
    }
    if($Mode -eq 'update'){
        foreach($job in @($jobs | Where-Object {$_.name -eq 'Bili-Peek'})){
            $name=$job.name; $root=$job.root; $item=$job.item
            if(!(Same $job.hashes (SourceHashes $root))){throw '源码变化，未切换浏览器版本'}
            $restartHelper=@($item.changes | Where-Object {$_ -match '^(helper/|\.apex/)'}).Count -gt 0
            $applyArgs=@('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'helper/apply-runtime.ps1'),'-ExpectedHash',([string]$job.hashes['Bili-Peek.user.js']).ToLowerInvariant())
            if($restartHelper){$applyArgs+= '-RestartHelper'}
            Run (Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe') $applyArgs '发布当前版本并核验加载器服务'
            $item.phase='updated'; $item.delivery='fixed-loader'
            $item.message='已发布当前版本，刷新 B 站页面即可生效。首次需安装固定加载器；Obsidian 插件安装副本另行更新。'
            @{files=$job.hashes; payload=$job.payload; at=[DateTimeOffset]::UtcNow.ToString('O')} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath ($job.receipt+'.tmp') -Encoding UTF8
            Move-Item -LiteralPath ($job.receipt+'.tmp') -Destination $job.receipt -Force
        }
    }
    $waiting=@($results | Where-Object {$_.phase -in @('restart-required','action-required')}).Count
    SaveStatus $(if($Mode -eq 'test'){'tested'}elseif($waiting){'action-required'}else{'completed'}) $(if($waiting){"验证已结束；$waiting 个项目仍有待生效步骤"}else{'所选项目处理完成'})
} catch {
    if($name -and (!$item -or $item.id -ne $name)){$item=@{id=$name; phase='failed'; changes=@(); message=''}; $results+=$item}
    if($item){$item.phase='failed'; $item.message=$_.Exception.Message}
    SaveStatus 'failed' $_.Exception.Message
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
} finally {if($locked){$mutex.ReleaseMutex()}; $mutex.Dispose()}
