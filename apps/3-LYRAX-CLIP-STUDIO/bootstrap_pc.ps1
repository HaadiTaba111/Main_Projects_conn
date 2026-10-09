$ErrorActionPreference = 'Stop'

$RepoUrl = if ($env:LYRAX_REPO_URL) { $env:LYRAX_REPO_URL } else { 'https://github.com/HaadiTaba111/Main_Arena_conn.git' }
$Branch = if ($env:LYRAX_BRANCH) { $env:LYRAX_BRANCH } else { 'arena/01a10c56-main-arena-conn' }
$InstallDir = if ($env:LYRAX_INSTALL_DIR) { $env:LYRAX_INSTALL_DIR } else { Join-Path $HOME 'Main_Arena_conn' }
$AppRelativePath = Join-Path 'apps' '3-LYRAX-CLIP-STUDIO'

# If this script is already inside a cloned checkout, use that copy. When run
# from the one-line web bootstrap, clone a fresh checkout into $InstallDir.
$AppDir = $null
if ($PSScriptRoot -and (Test-Path (Join-Path $PSScriptRoot 'app.py')) -and (Test-Path (Join-Path $PSScriptRoot 'requirements.txt'))) {
    $AppDir = $PSScriptRoot
} else {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is required. Install Git for Windows and retry.' }
    if (Test-Path (Join-Path $InstallDir '.git')) {
        Write-Host "Using existing checkout: $InstallDir (local changes are not overwritten)."
    } elseif (Test-Path $InstallDir) {
        throw "Refusing to overwrite $InstallDir because it is not a Git checkout. Set LYRAX_INSTALL_DIR to a new path."
    } else {
        & git clone --depth 1 --single-branch --branch $Branch $RepoUrl $InstallDir
        if ($LASTEXITCODE -ne 0) { throw "Git clone failed for branch '$Branch'. Check LYRAX_REPO_URL / LYRAX_BRANCH." }
    }
    $AppDir = Join-Path $InstallDir $AppRelativePath
}

if (-not (Test-Path (Join-Path $AppDir 'app.py')) -or -not (Test-Path (Join-Path $AppDir 'requirements.txt'))) {
    throw "Clip Studio files were not found in $AppDir. Confirm the selected Git branch contains the app."
}

$VenvPython = Join-Path $AppDir '.venv\Scripts\python.exe'
if (-not (Test-Path $VenvPython)) {
    $PythonLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($PythonLauncher) { & py -3 -m venv (Join-Path $AppDir '.venv') }
    else {
        $Python = Get-Command python -ErrorAction SilentlyContinue
        if (-not $Python) { throw 'Python 3 is required. Install Python and enable the py launcher.' }
        & python -m venv (Join-Path $AppDir '.venv')
    }
    if ($LASTEXITCODE -ne 0) { throw 'Creating the Python virtual environment failed.' }
}

& $VenvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw 'Upgrading pip failed.' }
& $VenvPython -m pip install -r (Join-Path $AppDir 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Installing requirements failed.' }

Write-Host ''
Write-Host 'LyraX Clip Studio is starting. Open http://127.0.0.1:5000 in your browser.'
Write-Host 'Keep this PowerShell window open; press Ctrl+C to stop the server.'
Push-Location $AppDir
try { & $VenvPython app.py }
finally { Pop-Location }
