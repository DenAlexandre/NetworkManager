<#
.SYNOPSIS
    Construit et (re)lance le conteneur tout-en-un (client + serveur + PostgreSQL)
    defini par docker-compose.yml / docker/allinone/.

.DESCRIPTION
    N'affecte pas le workflow de dev habituel (scripts/start-db.ps1, run-dev.ps1,
    conteneur "networkmanager-db") : ce script pilote un conteneur separe,
    "networkmanager-allinone".

    Copie .env.example vers .env au premier lancement si besoin.

.PARAMETER Recreate
    Force la recreation du conteneur (docker compose up --force-recreate), utile
    apres un changement de code pour etre sur de repartir d'une image fraiche.

.PARAMETER Down
    Arrete et supprime le conteneur au lieu de le demarrer.

.PARAMETER Wipe
    Utilise avec -Down : supprime aussi les volumes (donnees Postgres + uploads
    perdues). Ignore sans -Down.

.EXAMPLE
    ./run-allinone.ps1                # build + up -d
.EXAMPLE
    ./run-allinone.ps1 -Recreate      # rebuild l'image et recree le conteneur
.EXAMPLE
    ./run-allinone.ps1 -Down          # arrete le conteneur (garde les donnees)
.EXAMPLE
    ./run-allinone.ps1 -Down -Wipe    # arrete et efface aussi les donnees
#>

param(
    [switch]$Recreate,
    [switch]$Down,
    [switch]$Wipe
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ComposeFile = Join-Path $RepoRoot "docker-compose.yml"
$EnvFile = Join-Path $RepoRoot ".env"
$EnvExample = Join-Path $RepoRoot ".env.example"

function Test-DockerAvailable {
    try {
        docker version --format '{{.Server.Version}}' 2>$null | Out-Null
        return $true
    } catch {
        return $false
    }
}

# docker/docker compose write normal progress output to stderr. Under
# $ErrorActionPreference = "Stop", PowerShell 5.1 turns each stderr line into a
# terminating NativeCommandError (even on exit code 0), which would otherwise
# abort this script mid-build. Run native docker calls with a relaxed
# preference and check $LASTEXITCODE ourselves instead.
function Invoke-Docker {
    param([string[]]$DockerArgs)

    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & docker @DockerArgs
    } finally {
        $ErrorActionPreference = $previous
    }

    if ($LASTEXITCODE -ne 0) {
        throw "docker $($DockerArgs -join ' ') a echoue (code $LASTEXITCODE)."
    }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker n'est pas installe ou n'est pas dans le PATH."
    exit 1
}

if (-not (Test-DockerAvailable)) {
    Write-Error "Docker ne repond pas. Verifiez que Docker Desktop est bien lance."
    exit 1
}

Push-Location $RepoRoot
try {
    if ($Down) {
        if ($Wipe) {
            Write-Host "Arret du conteneur et suppression des volumes (donnees perdues)..." -ForegroundColor Yellow
            Invoke-Docker @("compose", "-f", $ComposeFile, "down", "-v")
        } else {
            Write-Host "Arret du conteneur (donnees conservees)..." -ForegroundColor Cyan
            Invoke-Docker @("compose", "-f", $ComposeFile, "down")
        }
        return
    }

    if (-not (Test-Path $EnvFile)) {
        Write-Host "Aucun .env trouve, copie de .env.example -> .env" -ForegroundColor Cyan
        Copy-Item $EnvExample $EnvFile
        Write-Host "Pensez a editer .env (JWT_SECRET, SEED_ADMIN_PASSWORD, ...) avant un usage reel." -ForegroundColor Yellow
    }

    $upArgs = @("compose", "-f", $ComposeFile, "up", "-d", "--build")
    if ($Recreate) {
        $upArgs += "--force-recreate"
    }

    Write-Host "Construction et demarrage du conteneur tout-en-un..." -ForegroundColor Cyan
    Invoke-Docker $upArgs

    $appPort = "8080"
    $envAppPort = (Get-Content $EnvFile | Where-Object { $_ -match '^APP_PORT=' })
    if ($envAppPort) {
        $appPort = ($envAppPort -split '=', 2)[1].Trim()
    }

    Write-Host ""
    Write-Host "Conteneur 'networkmanager-allinone' demarre." -ForegroundColor Green
    Write-Host "Application disponible sur http://localhost:$appPort (le demarrage initial peut prendre quelques secondes : postgres s'initialise puis les migrations/seed tournent)."
    Write-Host "Logs : docker logs -f networkmanager-allinone" -ForegroundColor DarkGray
} finally {
    Pop-Location
}
