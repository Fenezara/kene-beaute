# ==============================================================================
# KÈNÈ NOTIFY SERVICE — DOCKERFILE PRODUCTION
# ==============================================================================
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3004

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

USER node
EXPOSE 3004

CMD ["node", "--experimental-strip-types", "index.ts"]
