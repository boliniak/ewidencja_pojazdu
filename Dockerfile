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

RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Dummy values for build time only
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV NEXTAUTH_SECRET="build-time-secret-not-used"
ENV NEXTAUTH_URL="http://localhost:3000"

RUN yarn build

# ========================
# Stage 3: Runner
# ========================
FROM node:18-alpine AS runner
RUN apk add --no-cache libc6-compat openssl curl postgresql-client

# Zainstaluj Chromium do generowania PDF (opcjonalne)
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont \
    && echo "Chromium installed for PDF generation"

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs

# Zainstaluj puppeteer-core do generowania PDF (lekka wersja bez bundlowanego Chromium)
RUN yarn add puppeteer-core@22.15.0 --ignore-scripts 2>/dev/null || true

COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Create directories
RUN mkdir -p /app/uploads /app/backups \
    && chown -R nextjs:nodejs /app/uploads /app/backups

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["./entrypoint.sh"]
