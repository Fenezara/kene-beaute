# ==============================================================================
# KÈNÈ — SCRIPT DE DÉPLOIEMENT AUTOMATISÉ EN PRODUCTION (POWERSHELL / WINDOWS)
# ==============================================================================
# Usage: .\scripts\deploy-production.ps1
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "===========================================================================" -ForegroundColor Gold
Write-Host "       🚀 DÉPLOIEMENT DE LA PLATEFORME KÈNÈ EN PRODUCTION 🚀" -ForegroundColor Gold
Write-Host "===========================================================================" -ForegroundColor Gold
Write-Host ""

# 1. Vérification du fichier .env
if (-not (Test-Path ".env")) {
    Write-Host "❌ ERREUR: Le fichier .env est introuvable." -ForegroundColor Red
    Write-Host "Copiez .env.example vers .env et renseignez vos variables :"
    Write-Host "  Copy-Item .env.example .env"
    exit 1
}
Write-Host "✅ Fichier .env détecté." -ForegroundColor Green

# 2. Vérification de Docker
try {
    $dockerVersion = docker --version
    Write-Host "✅ Docker détecté : $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ ERREUR: Docker n'est pas accessible sur cette machine." -ForegroundColor Red
    exit 1
}

# 3. Audit de conformité
Write-Host ""
Write-Host "🔍 Exécution de l'audit de préparation..." -ForegroundColor Cyan
try {
    npx tsx scripts/production-readiness-check.ts
} catch {
    Write-Host "⚠️ L'audit a remonté des points d'attention." -ForegroundColor Yellow
}

# 4. Lancement Docker Compose
Write-Host ""
Write-Host "🐳 Lancement de la pile conteneurisée..." -ForegroundColor Cyan
docker compose up -d --build

Write-Host ""
Write-Host "📊 Statut des conteneurs :" -ForegroundColor Cyan
docker compose ps

Write-Host ""
Write-Host "===========================================================================" -ForegroundColor Green
Write-Host "🎉 DÉPLOIEMENT TERMINÉ !" -ForegroundColor Green
Write-Host "===========================================================================" -ForegroundColor Green
Write-Host ""
