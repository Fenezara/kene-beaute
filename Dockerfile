# ==============================================================================
# KÈNÈ BEAUTÉ & BIEN-ÊTRE — DOCKERFILE PRODUCTION MULTI-STAGE
# ==============================================================================
# Base : Node 20 Alpine (sécurisé, minimal et optimisé pour le Cloud/VPS)

# Étape 1 : Dépendances
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci

# Étape 2 : Construction de l'application
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Génération du client Prisma pour l'environnement Linux
RUN npx prisma generate

# Build Next.js en mode standalone
RUN npm run build

# Étape 3 : Image d'exécution de production (Runner minimal)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copie des ressources statiques publiques
COPY --from=builder /app/public ./public

# Création du dossier base de données avec permissions
RUN mkdir -p ./db && chown -R nextjs:nodejs ./db

# Copie des fichiers compilés standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
