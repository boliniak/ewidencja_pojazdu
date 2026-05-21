# ========================
# Stage 1: Dependencies
# ========================
FROM node:18-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json ./
COPY prisma ./prisma/

RUN yarn install --frozen-lockfile 2>/dev/null || yarn install

# ========================
# Stage 2: Builder
# ========================
FROM node:18-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# === Podmiana modułów platformowych na lokalne ===
# Use RUN cp (not COPY) to avoid Docker layer caching issues with overrides
RUN cp deploy/lib/local-storage.ts lib/local-storage.ts && \
    cp deploy/lib/pdf-generator.ts lib/pdf-generator.ts && \
    cp deploy/lib/llm-client.ts lib/llm-client.ts && \
    cp deploy/api-overrides/bank-upload-route.ts app/api/bank/upload/route.ts && \
    cp deploy/api-overrides/reports-generate-pdf-route.ts app/api/reports/generate-pdf/route.ts && \
    rm -f lib/s3.ts lib/aws-config.ts && \
    sed -i '/<script.*appllm-lib.js.*<\/script>/d' app/layout.tsx && \
    sed -i 's/"exclude": \["node_modules"\]/"exclude": ["node_modules", "deploy"]/' tsconfig.json 2>/dev/null || true
# Verify overrides applied correctly
RUN echo "=== Verifying overrides ===" && \
    grep -q 'local-storage' app/api/bank/upload/route.ts && echo "✓ bank-upload override OK" || (echo "✗ bank-upload override FAILED" && exit 1) && \
    grep -q 'pdf-generator' app/api/reports/generate-pdf/route.ts && echo "✓ reports-pdf override OK" || (echo "✗ reports-pdf override FAILED" && exit 1) && \
    test ! -f lib/s3.ts && echo "✓ s3.ts removed OK" || (echo "✗ s3.ts still exists" && exit 1)

RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV NEXTAUTH_SECRET="build-time-secret-not-used"
ENV NEXTAUTH_URL="http://localhost:3000"

RUN yarn build

# ========================
# Stage 3: Runner
# ========================
FROM node:18-alpine AS runner
RUN apk add --no-cache libc6-compat openssl curl postgresql-client

# Chromium do generowania PDF
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built Next.js app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy Prisma schema for db push
COPY --from=builder /app/prisma ./prisma

# Copy FULL node_modules from builder (needed for prisma db push + seed + puppeteer)
# standalone output only includes minimal deps, but we need prisma CLI + engines
COPY --from=builder /app/node_modules ./node_modules

# Copy seed script
COPY --from=builder /app/scripts ./scripts

COPY deploy/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Create directories and fix permissions
RUN mkdir -p /app/uploads /app/backups \
    && chown -R nextjs:nodejs /app/uploads /app/backups

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["./entrypoint.sh"]
