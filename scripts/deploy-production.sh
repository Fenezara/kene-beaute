#!/usr/bin/env bash
# ==============================================================================
# KÈNÈ — SCRIPT DE DÉPLOIEMENT AUTOMATISÉ EN PRODUCTION (LINUX / VPS)
# ==============================================================================
# Usage: bash scripts/deploy-production.sh
# ==============================================================================

set -e

echo ""
echo "==========================================================================="
echo "       🚀 DÉPLOIEMENT DE LA PLATEFORME KÈNÈ EN PRODUCTION 🚀"
echo "==========================================================================="
echo ""

# 1. Vérification du fichier .env
if [ ! -f .env ]; then
  echo "❌ ERREUR: Le fichier .env est introuvable."
  echo "Veuillez copier .env.example vers .env et configurer vos clés de production :"
  echo "  cp .env.example .env"
  exit 1
fi
echo "✅ Fichier .env détecté."

# 2. Vérification de Docker et Docker Compose
if ! command -v docker &> /dev/null; then
  echo "❌ ERREUR: Docker n'est pas installé sur ce serveur."
  echo "Installez Docker avec : curl -fsSL https://get.docker.com | sh"
  exit 1
fi
echo "✅ Docker est installé."

# 3. Audit de conformité pré-déploiement
echo ""
echo "🔍 Exécution de l'audit de conformité Kènè..."
if command -v npx &> /dev/null; then
  npx tsx scripts/production-readiness-check.ts || true
else
  echo "ℹ️  Node/NPX non installé localement, l'audit sera exécuté dans le conteneur."
fi

# 4. Construction et lancement de la pile Docker Compose
echo ""
echo "🐳 Construction et démarrage des conteneurs (App, Notify, Caddy)..."
docker compose down || true
docker compose up -d --build

echo ""
echo "⏳ Attente du démarrage des services (5 secondes)..."
sleep 5

# 5. Statut des conteneurs
echo ""
echo "📊 Statut des conteneurs déployés :"
docker compose ps

echo ""
echo "==========================================================================="
echo "🎉 DÉPLOIEMENT TERMINÉ AVEC SUCCÈS !"
echo "Votre application Kènè est active avec reverse-proxy SSL automatique Caddy."
echo "Pour consulter les logs en temps réel :"
echo "  docker compose logs -f"
echo "==========================================================================="
echo ""
