# Deploiement manuel "1 seul site" sur AlwaysData : build EN LOCAL + envoi du dist/.
# (Le serveur AlwaysData n'a pas assez de RAM pour compiler -> on build ici.)
#
# Le chemin de deploiement de reference est la CI (.github/workflows/deploy.yml, sur
# push vers main). Ce script en est l'equivalent manuel : memes etapes, meme
# redemarrage par pkill, meme verification /healthz.
#
# Usage : .\deploy.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$remote  = "ac-balance@ssh-ac-balance.alwaysdata.net"
$dir     = "www/balance"
$siteUrl = "https://ac-balance.alwaysdata.net"

Write-Host "1/5  Tests..." -ForegroundColor Cyan
Push-Location frontend; npm test; Pop-Location
Push-Location backend;  npm test; Pop-Location

Write-Host "2/5  Build du frontend..." -ForegroundColor Cyan
Push-Location frontend; npm run build; Pop-Location

Write-Host "3/5  Build du backend..." -ForegroundColor Cyan
Push-Location backend; npm run build; Pop-Location

Write-Host "4/5  Envoi vers AlwaysData..." -ForegroundColor Cyan
ssh $remote "mkdir -p '$dir/frontend/dist/assets' '$dir/backend'"

# Backend : on repart d'un dist/ propre pour ne pas laisser d'anciens .js orphelins,
# et on envoie package.json + lock pour pouvoir installer les deps runtime.
ssh $remote "rm -rf '$dir/backend/dist'"
scp -r backend/dist "${remote}:$dir/backend/"
scp backend/package.json backend/package-lock.json "${remote}:$dir/backend/"

# Frontend : on purge tout SAUF assets/. Les chunks hashes restent en place pour les
# onglets deja ouverts (meme strategie additive que la CI), le reste est remplace.
ssh $remote "find '$dir/frontend/dist' -mindepth 1 -maxdepth 1 ! -name assets -exec rm -rf {} +"
$frontendFiles = Get-ChildItem frontend/dist | ForEach-Object { $_.FullName }
scp -r $frontendFiles "${remote}:$dir/frontend/dist/"

Write-Host "5/5  Dependances runtime + redemarrage..." -ForegroundColor Cyan
# AlwaysData respawn automatiquement le process tue : pas besoin de l'admin web.
# Le motif [d]ist evite que pkill se matche lui-meme.
ssh $remote "cd '$dir/backend' && npm install --omit=dev --no-audit --no-fund && (pkill -f '[d]ist/server.js' || true)"

Start-Sleep -Seconds 3
curl.exe -fsS --retry 6 --retry-delay 3 "$siteUrl/healthz"
Write-Host ""
Write-Host "OK. Deploiement termine et /healthz repond." -ForegroundColor Green
