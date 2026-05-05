export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    
    const url = new URL(request.url);
    const vehicleId = url.searchParams.get('vehicleId');
    const month = url.searchParams.get('month');
    const year = url.searchParams.get('year');
    
    // Get settings
    const minSetting = await prisma.systemSettings.findUnique({ where: { key: 'MIN_CONSUMPTION' } });
    const maxSetting = await prisma.systemSettings.findUnique({ where: { key: 'MAX_CONSUMPTION' } });
    const minConsumption = parseFloat(minSetting?.value ?? '10') || 10;
    const maxConsumption = parseFloat(maxSetting?.value ?? '14') || 14;

    // Get vehicles
    const vehicles = await prisma.vehicle.findMany({ where: { active: true } });
    const results: any[] = [];

    for (const vehicle of vehicles) {
      if (vehicleId && vehicle.id !== vehicleId) continue;
      
      const entryWhere: any = { vehicleId: vehicle.id };
      const fuelWhere: any = { vehicleId: vehicle.id };
      if (month && year) {
        const m = parseInt(month);
        const y = parseInt(year);
        const dateFilter = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
        entryWhere.date = dateFilter;
        fuelWhere.date = dateFilter;
      } else if (year) {
        const y = parseInt(year);
        const dateFilter = { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) };
        entryWhere.date = dateFilter;
        fuelWhere.date = dateFilter;
      }

      const [entriesAgg, fuelsAgg, entryCount, fuelCount] = await Promise.all([
        prisma.mileageEntry.aggregate({ where: entryWhere, _sum: { kilometers: true } }),
        prisma.fuelPurchase.aggregate({ where: fuelWhere, _sum: { liters: true, amount: true } }),
        prisma.mileageEntry.count({ where: entryWhere }),
        prisma.fuelPurchase.count({ where: fuelWhere }),
      ]);

      const totalKm = entriesAgg?._sum?.kilometers ?? 0;
      const totalLiters = fuelsAgg?._sum?.liters ?? 0;
      const totalFuelCost = fuelsAgg?._sum?.amount ?? 0;
      const avgConsumption = totalKm > 0 && totalLiters > 0 ? (totalLiters / totalKm) * 100 : null;
      const status = avgConsumption === null ? 'BRAK_DANYCH' :
        avgConsumption < minConsumption ? 'ZA_NISKIE' :
        avgConsumption > maxConsumption ? 'ZA_WYSOKIE' : 'OK';

      results.push({
        vehicle: { id: vehicle.id, registrationNumber: vehicle.registrationNumber, brand: vehicle.brand, model: vehicle.model },
        totalKm,
        totalLiters,
        totalFuelCost,
        avgConsumption,
        entryCount,
        fuelCount,
        status,
        minConsumption,
        maxConsumption,
      });
    }

    return NextResponse.json(results);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'B\u0142\u0105d' }, { status: 500 });
  }
}
