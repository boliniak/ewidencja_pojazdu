export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [vehicles, entries, fuelPurchases, invoices, settings, users] = await Promise.all([
      prisma.vehicle.findMany(),
      prisma.mileageEntry.findMany({ include: { user: { select: { name: true, email: true } } } }),
      prisma.fuelPurchase.findMany(),
      prisma.ksefInvoice.findMany(),
      prisma.systemSettings.findMany(),
      prisma.user.findMany({ select: { id: true, name: true, email: true, role: true } }),
    ]);

    const backup = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      data: { vehicles, entries, fuelPurchases, invoices, settings, users },
    };

    // Log backup
    await prisma.backupLog.create({ data: { type: 'MANUAL', status: 'SUCCESS' } });

    return NextResponse.json(backup);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'Błąd eksportu' }, { status: 500 });
  }
}
