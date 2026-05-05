export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [vehicleCount, entryCount, fuelPurchaseCount, invoiceCount, entries, fuels] = await Promise.all([
      prisma.vehicle.count({ where: { active: true } }),
      prisma.mileageEntry.count(),
      prisma.fuelPurchase.count(),
      prisma.ksefInvoice.count(),
      prisma.mileageEntry.aggregate({ _sum: { kilometers: true } }),
      prisma.fuelPurchase.aggregate({ _sum: { liters: true } }),
    ]);

    const totalKm = entries?._sum?.kilometers ?? 0;
    const totalLiters = fuels?._sum?.liters ?? 0;
    const avgConsumption = totalKm > 0 && totalLiters > 0 ? (totalLiters / totalKm) * 100 : null;

    return NextResponse.json({ vehicleCount, entryCount, totalKm, fuelPurchaseCount, invoiceCount, avgConsumption });
  } catch (error: any) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Błąd' }, { status: 500 });
  }
}
