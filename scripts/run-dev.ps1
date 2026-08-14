<#
.SYNOPSIS
    Lance le serveur (Express) et le client (Vite) en mode developpement,
    chacun dans sa propre fenetre de terminal.

.DESCRIPTION
    Installe les dependances npm si necessaire (node_modules absent), puis
    ouvre deux fenetres PowerShell : une pour "server" (npm run dev), une
    pour "client" (npm run dev).

.PARAMETER SkipInstall
    Ne pas verifier/installer les dependances npm avant de lancer.

.EXAMPLE
    ./scripts/run-dev.ps1
#>

param(
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$serverPath = Join-Path $root "server"
$clientPath = Join-Path $root "client"

function Install-IfNeeded {
    param([string]$Path, [string]$Label)

    $nodeModules = Join-Path $Path "node_modules"
    if (-not (Test-Path $nodeModules)) {
        Write-Host "Installation des dependances de $Label..." -ForegroundColor Cyan
        Push-Location $Path
        try {
            npm install
        } finally {
            Pop-Location
        }
    }
}

if (-not $SkipInstall) {
    Install-IfNeeded -Path $serverPath -Label "server"
    Install-IfNeeded -Path $clientPath -Label "client"
}

Write-Host "Demarrage du serveur (http://localhost:4000)..." -ForegroundColor Green
Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location -LiteralPath '$serverPath'; npm run dev"
)

Write-Host "Demarrage du client (http://localhost:5173)..." -ForegroundColor Green
Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location -LiteralPath '$clientPath'; npm run dev"
)

Write-Host ""
Write-Host "Deux fenetres viennent de s'ouvrir (server / client)." -ForegroundColor Yellow
Write-Host "Fermez-les (ou Ctrl+C dedans) pour arreter les serveurs."
