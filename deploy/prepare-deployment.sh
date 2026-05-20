#!/bin/bash
# ============================================================
# Skrypt przygotowania paczki do wdrożenia na własnym serwerze
# Ewidencja Przebiegu Pojazdów
# ============================================================

set -e

# All paths relative to the project root (nextjs_space directory)
# Run this script from the project root: bash deploy/prepare-deployment.sh
DEPLOY_DIR="deploy"
OUTPUT_DIR="${DEPLOY_DIR}/output"
APP_DIR="${OUTPUT_DIR}/ewidencja-przebiegu"
PROJECT_DIR="."

echo "=================================================="
echo " Przygotowanie paczki wdrożeniowej"
echo " Ewidencja Przebiegu Pojazdów"
echo "=================================================="
echo ""

# Clean output
rm -rf "$OUTPUT_DIR"
mkdir -p "$APP_DIR"

echo "[1/7] Kopiowanie kodu źródłowego..."
# Copy project files excluding platform-specific and unnecessary files
rsync -a \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.build' \
  --exclude='deploy' \
  --exclude='.env' \
  --exclude='yarn.lock' \
  --exclude='package.json' \
  --exclude='.DS_Store' \
  --exclude='*.log' \
  --exclude='.git' \
  "$PROJECT_DIR/" "$APP_DIR/"

echo "[2/7] Podmiana modułów platformowych na lokalne..."

# Replace S3 storage with local storage
cp "${DEPLOY_DIR}/lib/local-storage.ts" "$APP_DIR/lib/local-storage.ts"
cp "${DEPLOY_DIR}/lib/pdf-generator.ts" "$APP_DIR/lib/pdf-generator.ts"
cp "${DEPLOY_DIR}/lib/llm-client.ts" "$APP_DIR/lib/llm-client.ts"

# Replace bank upload route
cp "${DEPLOY_DIR}/api-overrides/bank-upload-route.ts" "$APP_DIR/app/api/bank/upload/route.ts"

# Replace PDF report route
cp "${DEPLOY_DIR}/api-overrides/reports-generate-pdf-route.ts" "$APP_DIR/app/api/reports/generate-pdf/route.ts"

# Remove AWS/S3 dependencies (not needed in standalone)
rm -f "$APP_DIR/lib/s3.ts"
rm -f "$APP_DIR/lib/aws-config.ts"

echo "[3/7] Modyfikacja Prisma schema..."
# Fix Prisma schema - remove platform-specific output path and binary targets
sed -i '/output.*=.*"\/home\//d' "$APP_DIR/prisma/schema.prisma"
sed -i 's|binaryTargets.*=.*\[.*\]|binaryTargets = ["native", "linux-musl-openssl-3.0.x", "debian-openssl-3.0.x"]|g' "$APP_DIR/prisma/schema.prisma"

echo "[4/7] Tworzenie package.json..."
cat > "$APP_DIR/package.json" << 'PACKAGE_EOF'
{
  "name": "ewidencja-przebiegu",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:seed": "tsx scripts/seed.ts",
    "db:studio": "prisma studio",
    "db:migrate": "prisma migrate dev",
    "setup": "yarn install && yarn db:generate && yarn db:push && yarn db:seed && echo 'Setup complete!'"
  },
  "prisma": {
    "seed": "tsx scripts/seed.ts"
  },
  "dependencies": {
    "@hookform/resolvers": "3.9.0",
    "@next-auth/prisma-adapter": "1.0.7",
    "@prisma/client": "6.7.0",
    "@radix-ui/react-accordion": "1.2.0",
    "@radix-ui/react-alert-dialog": "1.1.1",
    "@radix-ui/react-aspect-ratio": "1.1.0",
    "@radix-ui/react-avatar": "1.1.0",
    "@radix-ui/react-checkbox": "1.1.1",
    "@radix-ui/react-collapsible": "1.1.0",
    "@radix-ui/react-context-menu": "2.2.1",
    "@radix-ui/react-dialog": "1.1.1",
    "@radix-ui/react-dropdown-menu": "2.1.1",
    "@radix-ui/react-hover-card": "1.1.1",
    "@radix-ui/react-label": "2.1.0",
    "@radix-ui/react-menubar": "1.1.1",
    "@radix-ui/react-navigation-menu": "1.2.0",
    "@radix-ui/react-popover": "1.1.1",
    "@radix-ui/react-progress": "1.1.0",
    "@radix-ui/react-radio-group": "1.2.0",
    "@radix-ui/react-scroll-area": "1.1.0",
    "@radix-ui/react-select": "2.1.1",
    "@radix-ui/react-separator": "1.1.0",
    "@radix-ui/react-slider": "1.2.0",
    "@radix-ui/react-slot": "1.1.0",
    "@radix-ui/react-switch": "1.1.0",
    "@radix-ui/react-tabs": "1.1.0",
    "@radix-ui/react-toast": "1.2.1",
    "@radix-ui/react-toggle": "1.1.0",
    "@radix-ui/react-toggle-group": "1.1.0",
    "@radix-ui/react-tooltip": "1.1.2",
    "bcryptjs": "2.4.3",
    "class-variance-authority": "0.7.0",
    "clsx": "2.0.0",
    "cmdk": "0.2.0",
    "date-fns": "2.30.0",
    "framer-motion": "10.16.4",
    "lucide-react": "0.446.0",
    "next": "14.2.22",
    "next-auth": "4.24.11",
    "next-themes": "0.2.1",
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "react-hook-form": "7.53.0",
    "embla-carousel-react": "8.3.0",
    "input-otp": "1.2.4",
    "react-day-picker": "8.10.1",
    "react-resizable-panels": "2.1.3",
    "sonner": "1.5.0",
    "vaul": "0.9.9",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/bcryptjs": "2.4.6",
    "@types/node": "20.6.2",
    "@types/react": "18.2.22",
    "@types/react-dom": "18.2.7",
    "autoprefixer": "10.4.15",
    "postcss": "8.4.30",
    "prisma": "6.7.0",
    "tailwind-merge": "2.5.2",
    "tailwindcss": "3.3.3",
    "tailwindcss-animate": "1.0.7",
    "tsx": "4.20.3",
    "typescript": "5.2.2"
  },
  "optionalDependencies": {
    "puppeteer": "^22.0.0"
  }
}
PACKAGE_EOF

echo "[5/7] Modyfikacja next.config.js..."
cat > "$APP_DIR/next.config.js" << 'NEXTCONFIG_EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: { unoptimized: true },
};

module.exports = nextConfig;
NEXTCONFIG_EOF

echo "[6/7] Usuwanie zależności platformowych z layout..."
# Remove abacus script from layout
sed -i '/<script.*appllm-lib.js.*<\/script>/d' "$APP_DIR/app/layout.tsx"

echo "[7/7] Kopiowanie plików Docker i konfiguracji..."
cp "${DEPLOY_DIR}/Dockerfile" "$APP_DIR/Dockerfile"
cp "${DEPLOY_DIR}/docker-compose.yml" "$APP_DIR/docker-compose.yml"
cp "${DEPLOY_DIR}/.env.example" "$APP_DIR/.env.example"
cp "${DEPLOY_DIR}/entrypoint.sh" "$APP_DIR/entrypoint.sh"
cp "${DEPLOY_DIR}/README_DEPLOY.md" "$APP_DIR/README.md"
chmod +x "$APP_DIR/entrypoint.sh"

# Create .dockerignore
cat > "$APP_DIR/.dockerignore" << 'DOCKERIGNORE_EOF'
node_modules
.next
.build
.git
*.log
.env
.env.local
uploads
backups
DOCKERIGNORE_EOF

echo ""
echo "=================================================="
echo " Paczka gotowa!"
echo "=================================================="
echo ""
echo " Lokalizacja: $APP_DIR"
echo ""
echo " Następne kroki:"
echo "  1. cd $APP_DIR"
echo "  2. cp .env.example .env"
echo "  3. Edytuj .env (hasło DB, NEXTAUTH_SECRET, itp.)"
echo "  4. docker-compose up -d --build"
echo "  5. docker-compose exec app npx prisma db push"
echo "  6. docker-compose exec app npx tsx scripts/seed.ts"
echo ""
echo " Lub użyj: docker-compose exec app yarn setup"
echo "=================================================="

# Create tar.gz archive
cd "$OUTPUT_DIR"
tar -czf ewidencja-przebiegu.tar.gz ewidencja-przebiegu/
echo ""
echo " Archiwum: ${OUTPUT_DIR}/ewidencja-przebiegu.tar.gz"
echo " Rozmiar: $(du -h ewidencja-przebiegu.tar.gz | cut -f1)"
