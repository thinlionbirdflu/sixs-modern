#Requires -Version 5.1
<#
.SYNOPSIS
Starts the database, backend, frontend, and browser for local testing.
.EXAMPLE
.\Start-Testing.ps1
.EXAMPLE
.\Start-Testing.ps1 -RunChecks -NoBrowser
#>
[CmdletBinding()]
param(
    [switch]$RunChecks,
    [switch]$SkipInstall,
    [switch]$NoBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot

function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Program $($Arguments -join ' ') failed (exit $LASTEXITCODE)."
    }
}

function Assert-PortAvailable {
    param([int]$Port)
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    try { $listener.Start() }
    catch { throw "Port $Port is in use. Stop the existing app before running this launcher." }
    finally { $listener.Stop() }
}

function Wait-ForApp {
    param([string]$Url, [System.Diagnostics.Process]$Process)
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($Process.HasExited) { throw "The app terminal closed before $Url became ready." }
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { return }
        } catch {
            # The dev server may still be starting.
        }
        Start-Sleep -Milliseconds 500
    }
    throw "Timed out waiting for $Url. Check the app terminal for errors."
}

function Start-AppTerminal {
    param([string]$Title, [string]$Command)
    # Encode the command so paths containing spaces or quotes survive Start-Process.
    $quotedRoot = $projectRoot.Replace("'", "''")
    $quotedNpm = $npmPath.Replace("'", "''")
    $script = @"
`$Host.UI.RawUI.WindowTitle = '$Title'
Set-Location -LiteralPath '$quotedRoot'
`$env:API_URL = '$backendUrl'
& '$quotedNpm' $Command
if (`$LASTEXITCODE -ne 0) { Write-Error 'The app stopped with an error. Check the output above.' }
"@
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
    # These are interactive terminals: logs stay visible and Ctrl+C stops each app.
    Start-Process -FilePath $shellPath -WorkingDirectory $projectRoot -ArgumentList @(
        '-NoLogo', '-NoProfile', '-NoExit', '-EncodedCommand', $encoded
    ) -PassThru
}

Push-Location -LiteralPath $projectRoot
try {
    foreach ($program in @('node.exe', 'npm.cmd', 'docker.exe')) {
        if (-not (Get-Command $program -ErrorAction SilentlyContinue)) {
            throw "$program is missing from PATH. Install Node.js 24+ and Docker Desktop, then reopen PowerShell."
        }
    }
    $npmPath = (Get-Command npm.cmd).Source
    $shellPath = (Get-Process -Id $PID).Path
    $nodeVersion = & node.exe --version
    if ($LASTEXITCODE -ne 0 -or [int]$nodeVersion.TrimStart('v').Split('.')[0] -lt 24) {
        throw 'Node.js 24 or newer is required.'
    }
    Invoke-Checked docker.exe @('info', '--format', '{{.ServerVersion}}')
    Invoke-Checked docker.exe @('compose', 'version')

    foreach ($envFile in @('.env', 'backend/.env', 'frontend/.env')) {
        if (-not (Test-Path -LiteralPath $envFile)) {
            Copy-Item -LiteralPath "$envFile.example" -Destination $envFile
            Write-Host "Created $envFile from its example."
        }
    }

    # Use Node's own .env parser; only non-secret connection settings are returned.
    $settingsScript = "console.log(JSON.stringify({host:process.env.HOST||'127.0.0.1',port:Number(process.env.PORT||3001)}))"
    $settingsJson = $settingsScript | & node.exe --env-file=backend/.env -
    if ($LASTEXITCODE -ne 0) { throw 'Unable to read backend/.env.' }
    $settings = $settingsJson | ConvertFrom-Json
    if ($settings.host -notin @('127.0.0.1', 'localhost', '::1')) {
        throw 'Local testing requires HOST=127.0.0.1, localhost, or ::1 in backend/.env.'
    }
    $backendPort = [int]$settings.port
    if ($backendPort -lt 1 -or $backendPort -gt 65535 -or $backendPort -eq 5173) {
        throw 'Set a valid backend PORT other than 5173 in backend/.env.'
    }
    $backendUrl = [UriBuilder]::new('http', [string]$settings.host, $backendPort).Uri.GetLeftPart([UriPartial]::Authority)
    $frontendUrl = 'http://127.0.0.1:5173'
    Assert-PortAvailable $backendPort
    Assert-PortAvailable 5173

    if (-not $SkipInstall) {
        Write-Host 'Installing dependencies from package-lock.json...'
        Invoke-Checked $npmPath @('ci')
    }
    Write-Host 'Starting PostgreSQL and waiting for it to become healthy...'
    Invoke-Checked docker.exe @('compose', 'up', '-d', '--wait', '--wait-timeout', '120')
    Invoke-Checked $npmPath @('run', 'db:migrate')
    if ($RunChecks) {
        Invoke-Checked $npmPath @('test')
        Invoke-Checked $npmPath @('run', 'build')
    }

    Write-Host 'Starting backend...'
    $backendProcess = Start-AppTerminal 'SIXS Backend' 'run dev:backend'
    Wait-ForApp "$backendUrl/health" $backendProcess
    Write-Host 'Starting frontend...'
    $frontendProcess = Start-AppTerminal 'SIXS Frontend' 'run dev:frontend'
    Wait-ForApp $frontendUrl $frontendProcess
    if (-not $NoBrowser) { Start-Process $frontendUrl }

    Write-Host "Ready: $frontendUrl"
    Write-Host "Backend health: $backendUrl/health"
    Write-Host 'Stop each app with Ctrl+C in its terminal. Stop PostgreSQL with: docker compose stop'
} finally {
    Pop-Location
}
