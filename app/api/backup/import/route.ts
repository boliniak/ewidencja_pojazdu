export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any)?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Brak uprawnie\u0144' }, { status: 403 });
    }
    const body = await request.json();
    const data = body?.data;
    if (!data) return NextResponse.json({ error: 'Nieprawid\u0142owy format danych' }, { status: 400 });

    let imported = { vehicles: 0, entries: 0, fuelPurchases: 0, settings: 0 };

    // Import vehicles
    for (const v of (data?.vehicles ?? [])) {
      try {
        await prisma.vehicle.upsert({
          where: { id: v?.id ?? 'none' },
          update: { registrationNumber: v?.registrationNumber, brand: v?.brand ?? '', model: v?.model ?? '' },
          create: {
            registrationNumber: v?.registrationNumber ?? `IMPORT-${Date.now()}`,
            brand: v?.brand ?? '', model: v?.model ?? '',
            startDate: v?.startDate ? new Date(v.startDate) : new Date(),
            odometerStart: v?.odometerStart ?? 0,
          },
        });
        imported.vehicles++;
      } catch {}
    }

    // Import settings
    for (const s of (data?.settings ?? [])) {
      try {
        await prisma.systemSettings.upsert({
          where: { key: s?.key ?? '' },
          update: { value: s?.value ?? '' },
          create: { key: s?.key ?? '', value: s?.value ?? '' },
        });
        imported.settings++;
      } catch {}
    }

    await prisma.backupLog.create({ data: { type: 'IMPORT', status: 'SUCCESS', dataJson: JSON.stringify(imported) } });

    return NextResponse.json({ success: true, imported });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'B\u0142\u0105d importu' }, { status: 500 });
  }
}
