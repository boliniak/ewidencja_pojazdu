export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [vehicleCount, entryCount, fuelPurchaseCount, invoiceCount, entries, fuels, ksefFuel] = await Promise.all([
      prisma.vehicle.count({ where: { active: true } }),
      prisma.mileageEntry.count(),
      prisma.fuelPurchase.count(),
      prisma.ksefInvoice.count(),
      prisma.mileageEntry.aggregate({ _sum: { kilometers: true } }),
      prisma.fuelPurchase.aggregate({ _sum: { liters: true } }),
      prisma.ksefInvoice.aggregate({
        where: { isFuel: true },
        _sum: { fuelLiters: true, grossAmount: true },
        _count: true,
      }),
    ]);

    const totalKm = entries?._sum?.kilometers ?? 0;
    // Litry z FuelPurchase + KSeF faktur paliwowych
    const fuelPurchaseLiters = fuels?._sum?.liters ?? 0;
    const ksefFuelLiters = ksefFuel?._sum?.fuelLiters ?? 0;
    const totalLiters = fuelPurchaseLiters + ksefFuelLiters;
    const avgConsumption = totalKm > 0 && totalLiters > 0 ? (totalLiters / totalKm) * 100 : null;

    // Zakupy paliwa = FuelPurchase + KSeF faktury paliwowe
    const totalFuelPurchases = fuelPurchaseCount + (ksefFuel?._count ?? 0);
    const totalFuelAmount = (ksefFuel?._sum?.grossAmount ?? 0);

    return NextResponse.json({
      vehicleCount, entryCount, totalKm,
      fuelPurchaseCount: totalFuelPurchases,
      invoiceCount,
      avgConsumption,
      totalFuelLiters: totalLiters > 0 ? Math.round(totalLiters * 100) / 100 : 0,
      totalFuelAmount: totalFuelAmount > 0 ? Math.round(totalFuelAmount * 100) / 100 : 0,
    });
  } catch (error: any) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Błąd' }, { status: 500 });
  }
}
