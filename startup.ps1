<#
.SYNOPSIS
    Point d'entree a la racine du projet pour lancer le front et le back en dev.

.DESCRIPTION
    Delegue a scripts/run-dev.ps1 (installe les dependances npm si besoin, puis ouvre
    server (http://localhost:4000) et client (http://localhost:5173) dans deux fenetres).

.PARAMETER SkipInstall
    Ne pas verifier/installer les dependances npm avant de lancer.

.EXAMPLE
    ./startup.ps1
#>

param(
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

& (Join-Path $PSScriptRoot "scripts/run-dev.ps1") -SkipInstall:$SkipInstall
