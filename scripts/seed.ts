import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('johndoe123', 12);
  await prisma.user.upsert({
    where: { email: 'john@doe.com' },
    update: {},
    create: {
      email: 'john@doe.com',
      name: 'Administrator',
      password: hashedPassword,
      role: 'ADMIN',
    },
  });

  // Default system settings
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

  console.log('Seed completed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
