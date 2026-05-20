#!/bin/sh
# Nie używamy set -e — chcemy kontynuować nawet jeśli prisma/seed padnie

echo "======================================="
echo " Ewidencja Przebiegu Pojazdów"
echo "======================================="
echo ""

# ---- 1. Czekaj na bazę danych ----
echo "[1/3] Oczekiwanie na bazę danych..."
MAX_RETRIES=30
RETRY=0
DB_HOST="${DATABASE_URL##*@}"
DB_HOST="${DB_HOST%%/*}"
DB_HOST_ONLY="${DB_HOST%%:*}"
DB_PORT_ONLY="${DB_HOST##*:}"

while ! pg_isready -h "$DB_HOST_ONLY" -p "$DB_PORT_ONLY" -q 2>/dev/null; do
  RETRY=$((RETRY + 1))
  if [ $RETRY -ge $MAX_RETRIES ]; then
    echo "  BLAD: Baza danych niedostepna po $MAX_RETRIES probach!"
    echo "  Sprawdz czy kontener 'db' dziala: docker-compose ps"
    echo "  Uruchamiam aplikacje bez inicjalizacji bazy..."
    break
  fi
  echo "  Czekam na baze danych... ($RETRY/$MAX_RETRIES)"
  sleep 2
done
echo "  Baza danych gotowa."
echo ""

# ---- 2. Utwórz tabele ----
echo "[2/3] Tworzenie tabel w bazie danych..."
npx prisma db push --skip-generate 2>&1
DB_PUSH_EXIT=$?
if [ $DB_PUSH_EXIT -eq 0 ]; then
  echo "  Tabele utworzone/zaktualizowane pomyslnie."
else
  echo "  UWAGA: prisma db push zakonczony kodem $DB_PUSH_EXIT"
  echo "  Probuje ponownie z --accept-data-loss..."
  npx prisma db push --skip-generate --accept-data-loss 2>&1
  if [ $? -eq 0 ]; then
    echo "  Tabele utworzone (z accept-data-loss)."
  else
    echo "  BLAD: Nie udalo sie utworzyc tabel!"
    echo "  Sprawdz DATABASE_URL w pliku .env"
  fi
fi
echo ""

# ---- 3. Seed danych początkowych ----
echo "[3/3] Inicjalizacja danych poczatkowych..."
node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  try {
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
    console.log('  Seed OK: admin=' + email);
  } catch(e) {
    console.error('  Seed error:', e.message);
  } finally {
    await prisma.\$disconnect();
  }
}
main();
" 2>&1
echo ""

# ---- Start ----
echo "======================================="
echo " Aplikacja uruchomiona: http://0.0.0.0:${PORT:-3000}"
echo "======================================="
exec node server.js
