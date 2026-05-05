#!/bin/sh
set -e

echo "=== Ewidencja Przebiegu Pojazdów ==="
echo "Initializing database..."

# Wait for database
until pg_isready -h db -U "${DB_USER:-ewidencja}" 2>/dev/null; do
  echo "Waiting for database..."
  sleep 2
done

# Run Prisma migrations
echo "Applying database schema..."
npx prisma db push --skip-generate 2>/dev/null || true

# Run seed if needed
echo "Seeding database..."
npx tsx scripts/seed.ts 2>/dev/null || true

echo "Starting application..."
exec node server.js
