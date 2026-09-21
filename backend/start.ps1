$ErrorActionPreference = "Stop"

$backend = $PSScriptRoot
$python = Join-Path $backend ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $python)) {
    throw "Missing backend\.venv. Run backend\bootstrap.ps1 first."
}

Push-Location $backend
try {
    & $python -m uvicorn app.main:app --host 127.0.0.1 --port 8765
    if ($LASTEXITCODE -ne 0) {
        throw "Apex Console backend exited with code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}
