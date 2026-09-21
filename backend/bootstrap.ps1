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
    $projectWord = [string]::Concat([char]0x9879, [char]0x76EE)
    $Python = "D:\Py$projectWord\APEX\backend\.venv\Scripts\python.exe"
}

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Python 3.12 was not found: $Python"
}

if (-not (Test-Path -LiteralPath $venvPython)) {
    & $Python -m venv $venv
    Assert-NativeSuccess "Creating the Python virtual environment"
}

& $venvPython -m pip install --disable-pip-version-check -r $requirements
Assert-NativeSuccess "Installing backend dependencies"

Write-Host "Backend environment is ready. Run backend\start.ps1 to start Apex Console."
