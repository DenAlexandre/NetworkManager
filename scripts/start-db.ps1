<#
.SYNOPSIS
    Demarre (ou cree) le conteneur Docker PostgreSQL utilise par le projet Cuisine.

.DESCRIPTION
    Idempotent : si le conteneur existe deja, il est simplement (re)demarre.
    Sinon, il est cree avec un volume persistant pour ne pas perdre les donnees
    entre deux redemarrages.

.PARAMETER ContainerName
    Nom du conteneur Docker.

.PARAMETER Port
    Port local expose (doit correspondre a DATABASE_URL dans server/.env).

.PARAMETER Password
    Mot de passe PostgreSQL (utilisateur "postgres").

.PARAMETER Database
    Nom de la base creee au premier demarrage.

.EXAMPLE
    ./start-db.ps1
#>

param(
    [string]$ContainerName = "cuisine-db",
    [int]$Port = 5432,
    [string]$Password = "postgres",
    [string]$Database = "cuisine"
)

$ErrorActionPreference = "Stop"

function Test-DockerAvailable {
    try {
        docker version --format '{{.Server.Version}}' | Out-Null
        return $true
    } catch {
        return $false
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

$existing = docker ps -a --filter "name=^/$ContainerName$" --format "{{.Names}}"

if ($existing -eq $ContainerName) {
    $running = docker ps --filter "name=^/$ContainerName$" --format "{{.Names}}"
    if ($running -eq $ContainerName) {
        Write-Host "Le conteneur '$ContainerName' tourne deja." -ForegroundColor Yellow
    } else {
        Write-Host "Redemarrage du conteneur existant '$ContainerName'..." -ForegroundColor Cyan
        docker start $ContainerName | Out-Null
    }
} else {
    Write-Host "Creation du conteneur '$ContainerName' (postgres:16-alpine)..." -ForegroundColor Cyan
    docker run -d `
        --name $ContainerName `
        -e POSTGRES_USER=postgres `
        -e POSTGRES_PASSWORD=$Password `
        -e POSTGRES_DB=$Database `
        -p "${Port}:5432" `
        -v "${ContainerName}-data:/var/lib/postgresql/data" `
        postgres:16-alpine | Out-Null
}

Write-Host "Attente de la disponibilite de PostgreSQL..." -NoNewline
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    docker exec $ContainerName pg_isready -U postgres 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Write-Host "." -NoNewline
    Start-Sleep -Seconds 1
}
Write-Host ""

if (-not $ready) {
    Write-Error "PostgreSQL n'a pas repondu a temps. Consultez les logs avec: docker logs $ContainerName"
    exit 1
}

Write-Host "PostgreSQL est pret sur le port $Port." -ForegroundColor Green
Write-Host "DATABASE_URL=postgres://postgres:$Password@localhost:$Port/$Database"
Write-Host ""
Write-Host "Pensez a lancer les migrations si c'est la premiere fois :" -ForegroundColor DarkGray
Write-Host "  cd server; npm run migrate; npm run seed" -ForegroundColor DarkGray
