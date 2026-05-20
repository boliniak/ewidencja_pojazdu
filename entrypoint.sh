#!/bin/sh
set -e

echo "=== Ewidencja Przebiegu Pojazdów ==="
echo "Initializing database..."

# Wait for database to be ready
MAX_RETRIES=30
RETRY=0
while ! pg_isready -h db -U "${DB_USER:-ewidencja}" -q 2>/dev/null; do
  RETRY=$((RETRY + 1))
  if [ $RETRY -ge $MAX_RETRIES ]; then
    echo "ERROR: Database not ready after ${MAX_RETRIES} attempts. Starting app anyway..."
    break
  fi
  echo "Waiting for database... (attempt $RETRY/$MAX_RETRIES)"
  sleep 2
done

# Apply database schema
echo "Applying database schema..."
if npx prisma db push --skip-generate --accept-data-loss 2>&1; then
  echo "Schema applied successfully."
else
  echo "WARNING: Could not apply schema. Database might already be initialized."
fi

# Seed database (only adds missing data, uses upsert)
echo "Seeding database..."
if node -e "
  const { PrismaClient } = require('@prisma/client');
  const bcrypt = require('bcryptjs');
  const prisma = new PrismaClient();
  async function main() {
    const email = process.env.ADMIN_EMAIL || 'admin@example.com';
    const password = process.env.ADMIN_PASSWORD || 'ZmienToHaslo123!';
    const name = process.env.ADMIN_NAME || 'Administrator';
    const hashed = await bcrypt.hash(password, 12);
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, password: hashed, name, role: 'ADMIN' },
    });
    const defaults = [
      { key: 'MIN_CONSUMPTION', value: '10' },
      { key: 'MAX_CONSUMPTION', value: '14' },
      { key: 'COMPANY_NAME', value: '' },
      { key: 'COMPANY_NIP', value: '' },
    ];
    for (const s of defaults) {
      await prisma.systemSettings.upsert({
        where: { key: s.key },
        update: {},
        create: s,
      });
    }
    console.log('Seed completed: admin=' + email);
    await prisma.\$disconnect();
  }
  main().catch(e => { console.error('Seed error:', e.message); process.exit(0); });
" 2>&1; then
  echo "Seed completed."
else
  echo "WARNING: Seed script failed. You may need to create an admin user manually."
fi

echo "Starting application on port ${PORT:-3000}..."
exec node server.js
