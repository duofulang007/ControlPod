param([Parameter(Mandatory)][string]$Prepared, [Parameter(Mandatory)][string]$Install,
    [Parameter(Mandatory)][string]$StateDir, [int]$OwnerId)
$ErrorActionPreference = 'Stop'
function State($phase,$message) {
    $status = @{phase=$phase; message=$message; at=[DateTimeOffset]::UtcNow.ToString('O'); backup=$backup; log="$StateDir\validation.log"}
    if (Test-Path -LiteralPath "$StateDir\status.json") {
        $previous=Get-Content -LiteralPath "$StateDir\status.json" -Raw -Encoding UTF8 | ConvertFrom-Json
        $status.changes=@($previous.changes)
    }
    $status | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$StateDir\status.tmp" -Encoding UTF8
    Move-Item -LiteralPath "$StateDir\status.tmp" -Destination "$StateDir\status.json" -Force
    $status | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$StateDir\controlpod-status.tmp" -Encoding UTF8
    Move-Item -LiteralPath "$StateDir\controlpod-status.tmp" -Destination "$StateDir\controlpod-status.json" -Force
}
$backup = "$Install.previous-$(Get-Date -Format yyyyMMddHHmmss)-$([guid]::NewGuid().ToString('N'))"
$moved = $false
try {
    $Install = [IO.Path]::GetFullPath($Install).TrimEnd('\')
    $Prepared = [IO.Path]::GetFullPath($Prepared).TrimEnd('\')
    if ((Split-Path $Prepared -Parent) -ne (Split-Path $Install -Parent) -or
        !(Split-Path $Prepared -Leaf).StartsWith('.ControlPod-update-')) { throw '更新暂存目录不合法' }
    if (!(Test-Path -LiteralPath "$Prepared\ApexShell.exe")) { throw '新版程序不存在' }
    if ($OwnerId -gt 0) { Wait-Process -Id $OwnerId -ErrorAction SilentlyContinue }
    # 其他看板窗口也可能使用安装版 DLL；绝不强制关闭它们。
    $deadline = (Get-Date).AddMinutes(10)
    do {
        $users = @(Get-Process ApexShell -ErrorAction SilentlyContinue | Where-Object {
            $_.Path -and [IO.Path]::GetFullPath($_.Path).StartsWith("$Install\", [StringComparison]::OrdinalIgnoreCase)
        })
        if (!$users.Count) { break }
        if ((Get-Date) -gt $deadline) { throw '还有使用安装版的看板窗口，请关闭后重新更新' }
        Start-Sleep -Seconds 2
    } while ($true)
    Move-Item -LiteralPath $Install -Destination $backup
    $moved = $true
    Move-Item -LiteralPath $Prepared -Destination $Install
    State 'updated' '安装版已更新，上一版已保留'
    Start-Process -FilePath "$Install\ApexShell.exe" -WorkingDirectory $Install -WindowStyle Hidden
    if(Test-Path -LiteralPath "$PSScriptRoot\trim-update-artifacts.ps1"){
        $savedPreference=$ErrorActionPreference
        try {
            $ErrorActionPreference='Continue'
            & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PSScriptRoot\trim-update-artifacts.ps1" -Mode clean -SkipSource -Install $Install -StateDir $StateDir 2>&1 |
                Out-File -LiteralPath "$StateDir\cleanup.log" -Append -Encoding UTF8
        } catch { $_.Exception.Message | Out-File -LiteralPath "$StateDir\cleanup.log" -Append -Encoding UTF8 }
        finally {$ErrorActionPreference=$savedPreference}
    }
} catch {
    $reason = $_.Exception.Message
    if ($moved -and (Test-Path -LiteralPath $backup)) {
        try {
            if (Test-Path -LiteralPath $Install) { Move-Item -LiteralPath $Install -Destination $Prepared }
            Move-Item -LiteralPath $backup -Destination $Install
        } catch { $reason += '; 恢复失败：' + $_.Exception.Message }
    }
    State 'failed' $reason
    exit 1
}
exit 0
