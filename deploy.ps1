# Deploiement "1 seul site" sur AlwaysData : build EN LOCAL + envoi du dist/.
# (Le serveur AlwaysData n'a pas assez de RAM pour compiler -> on build ici.)
# Usage : .\deploy.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$remote = "ac-balance@ssh-ac-balance.alwaysdata.net"

Write-Host "1/3  Build du frontend..." -ForegroundColor Cyan
Push-Location frontend; npm run build; Pop-Location

Write-Host "2/3  Build du backend..." -ForegroundColor Cyan
Push-Location backend; npm run build; Pop-Location

Write-Host "3/3  Envoi des dist/ vers AlwaysData..." -ForegroundColor Cyan
scp -r frontend/dist "${remote}:www/balance/frontend/"
scp -r backend/dist  "${remote}:www/balance/backend/"

Write-Host "OK. Si le BACKEND a change, redemarre le site dans l'admin AlwaysData." -ForegroundColor Green
Write-Host "(Pour un changement frontend seul, aucun redemarrage necessaire.)" -ForegroundColor DarkGray
