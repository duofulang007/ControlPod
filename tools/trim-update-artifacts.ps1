param([ValidateSet('preview','clean')][string]$Mode='preview',
    [string]$Source='D:\Projects\ControlPod', [string]$Install='D:\Apps\ControlPod',
    [string]$StateDir="$env:LOCALAPPDATA\ControlPod\updates", [switch]$SkipSource)
$ErrorActionPreference='Stop'
$Source=[IO.Path]::GetFullPath($Source).TrimEnd('\')
$Install=[IO.Path]::GetFullPath($Install).TrimEnd('\')
$StateDir=[IO.Path]::GetFullPath($StateDir).TrimEnd('\')
$candidates=@()
function Candidate($path,$root,$kind){
    if((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint){throw '清理根目录不能是链接'}
    $full=[IO.Path]::GetFullPath($path).TrimEnd('\')
    if(!$full.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)){throw '清理范围越界'}
    if(!(Test-Path -LiteralPath $full -PathType Container)){return}
    $item=Get-Item -LiteralPath $full
    for($part=$item; $part -and $part.FullName -ne $root; $part=$part.Parent){
        if($part.Attributes -band [IO.FileAttributes]::ReparsePoint){throw '清理目录包含链接'}
    }
    $items=@(Get-ChildItem -LiteralPath $full -Recurse -Force -ErrorAction Stop)
    if(@($items | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw '清理内容包含链接'}
    [pscustomobject]@{path=$full; root=$root; kind=$kind; bytes=($items | Where-Object {!$_.PSIsContainer} | Measure-Object Length -Sum).Sum}
}
if(!$SkipSource){foreach($relative in @('shell\bin','shell\obj')){$candidates+=@(Candidate (Join-Path $Source $relative) $Source '源码构建缓存')}}
foreach($job in Get-ChildItem -LiteralPath $StateDir -Directory -ErrorAction SilentlyContinue | Where-Object {$_.Name -match '^[0-9a-f]{32}$'}){
    # 原始源码快照、日志和安装替换工具都保留，只去掉可以再次构建的产物。
    foreach($relative in @('source\shell\bin','source\shell\obj','publish')){$candidates+=@(Candidate (Join-Path $job.FullName $relative) $StateDir '验证构建产物')}
}
$parent=Split-Path $Install -Parent
$prefix=(Split-Path $Install -Leaf)+'.previous-'
$backups=@(Get-ChildItem -LiteralPath $parent -Directory | Where-Object {$_.Name -match ('^'+[regex]::Escape($prefix)+'\d{14}-[0-9a-f]{32}$')} | Sort-Object Name -Descending)
foreach($backup in $backups | Select-Object -Skip 1){
    if(!(Test-Path -LiteralPath (Join-Path $backup.FullName 'ApexShell.exe')) -or !(Test-Path -LiteralPath (Join-Path $backup.FullName 'wwwroot\index.html'))){throw "不是可确认的安装回退副本，保留：$($backup.FullName)"}
    if(@(Get-ChildItem -LiteralPath $backup.FullName -File -Recurse | Where-Object {$_.Name -match '\.(db|sqlite|sqlite3)(-|$)'}).Count){throw '回退副本包含数据库，不能作为发布产物删除'}
    $candidates+=@(Candidate $backup.FullName $parent '旧回退副本')
}
# 更新暂存目录：替换成功后会被 Move 成安装目录而消失，留下的都是替换失败或被后一次更新顶掉的孤儿。
# pending.json 引用的那个正在等用户退出后替换，必须保留。
$keep=@()
$pendingFile=Join-Path $StateDir 'pending.json'
if(Test-Path -LiteralPath $pendingFile -PathType Leaf){
    try{
        $pending=Get-Content -LiteralPath $pendingFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if($pending.prepared){$keep+=[IO.Path]::GetFullPath([string]$pending.prepared).TrimEnd('\')}
    }catch{}
}
$staged=@(Get-ChildItem -LiteralPath $parent -Directory -Force -ErrorAction SilentlyContinue |
    Where-Object {$_.Name -match '^\.ControlPod-update-[0-9a-f]{32}$'} |
    Where-Object {$keep -notcontains $_.FullName} | Sort-Object Name -Descending)
foreach($stale in $staged){
    if(!(Test-Path -LiteralPath (Join-Path $stale.FullName 'ApexShell.exe'))){throw "不是可确认的更新暂存目录，保留：$($stale.FullName)"}
    $candidates+=@(Candidate $stale.FullName $parent '中断的更新暂存')
}
$candidates | ForEach-Object {Write-Output "$($_.kind) | $($_.path) | $([Math]::Round($_.bytes/1MB,1)) MB"}
if($Mode -eq 'preview'){exit 0}
$processes=@(Get-Process ApexShell -ErrorAction SilentlyContinue)
foreach($entry in $candidates){
    if(@($processes | Where-Object {$_.Path -and $_.Path.StartsWith($entry.path+'\',[StringComparison]::OrdinalIgnoreCase)}).Count){throw "目录仍被运行中的 CPod 使用，未清理：$($entry.path)"}
    # 每个删除目标均来自上面的固定候选和绝对路径检查。
    Remove-Item -LiteralPath $entry.path -Recurse -Force -ErrorAction Stop
}
Write-Output 'ARTIFACT_CLEAN_PASS'
