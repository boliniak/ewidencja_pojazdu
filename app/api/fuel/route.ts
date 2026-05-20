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
    const where: any = {};
    if (vehicleId) where.vehicleId = vehicleId;
    const purchases = await prisma.fuelPurchase.findMany({ where, include: { vehicle: true }, orderBy: { date: 'desc' } });
    return NextResponse.json(purchases ?? []);
  } catch { return NextResponse.json({ error: 'Błąd' }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const purchase = await prisma.fuelPurchase.create({
      data: {
        date: new Date(body?.date ?? new Date()),
        amount: parseFloat(body?.amount ?? '0') || 0,
        liters: body?.liters ? parseFloat(body.liters) : null,
        pricePerLiter: body?.pricePerLiter ? parseFloat(body.pricePerLiter) : null,
        stationName: body?.stationName ?? '',
        source: body?.source ?? 'MANUAL',
        sourceId: body?.sourceId ?? null,
        vehicleId: body?.vehicleId ?? null,
      },
    });
    return NextResponse.json(purchase);
  } catch { return NextResponse.json({ error: 'Błąd' }, { status: 500 }); }
}
