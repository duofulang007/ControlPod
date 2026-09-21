param(
    [string]$Python = ""
)

$ErrorActionPreference = "Stop"

$backend = $PSScriptRoot
$venv = Join-Path $backend ".venv"
$venvPython = Join-Path $venv "Scripts\python.exe"
$requirements = Join-Path $backend "requirements.txt"

function Assert-NativeSuccess([string]$Step) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE"
    }
}

if (-not $Python) {
    $launcher = Get-Command py -ErrorAction SilentlyContinue
    if ($launcher) {
        $candidate = & $launcher.Source -3.12 -c "import sys; print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0 -and $candidate) {
            $Python = $candidate.Trim()
        }
    }
}

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Python 3.12 was not found. Install Python 3.12 or pass its executable with -Python."
}

if (-not (Test-Path -LiteralPath $venvPython)) {
    & $Python -m venv $venv
    Assert-NativeSuccess "Creating the Python virtual environment"
}

& $venvPython -m pip install --disable-pip-version-check -r $requirements
Assert-NativeSuccess "Installing backend dependencies"

Write-Host "Backend environment is ready. Run backend\start.ps1 to start Apex Console."
