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
    const where: any = {};
    if (vehicleId) where.vehicleId = vehicleId;
    if (month && year) {
      const m = parseInt(month);
      const y = parseInt(year);
      where.date = {
        gte: new Date(y, m - 1, 1),
        lt: new Date(y, m, 1),
      };
    } else if (year) {
      const y = parseInt(year);
      where.date = { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) };
    }
    const entries = await prisma.mileageEntry.findMany({
      where,
      include: { vehicle: true, user: { select: { id: true, name: true, email: true } } },
      orderBy: { entryNumber: 'asc' },
    });
    return NextResponse.json(entries ?? []);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'Błąd' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    if (!body?.vehicleId || !body?.purpose || !body?.kilometers) {
      return NextResponse.json({ error: 'Wypełnij wymagane pola' }, { status: 400 });
    }
    // Get next entry number for this vehicle
    const lastEntry = await prisma.mileageEntry.findFirst({
      where: { vehicleId: body.vehicleId },
      orderBy: { entryNumber: 'desc' },
    });
    const entryNumber = (lastEntry?.entryNumber ?? 0) + 1;
    
    // Calculate odometer
    const vehicle = await prisma.vehicle.findUnique({ where: { id: body.vehicleId } });
    const lastOdometer = lastEntry?.odometerAfter ?? vehicle?.odometerStart ?? 0;
    const km = parseFloat(body.kilometers) || 0;
    const odometerBefore = lastOdometer;
    const odometerAfter = lastOdometer + km;

    const entry = await prisma.mileageEntry.create({
      data: {
        entryNumber,
        date: new Date(body?.date ?? new Date()),
        purpose: body.purpose,
        kilometers: km,
        odometerBefore,
        odometerAfter,
        taxpayerSignature: body?.taxpayerSignature ?? '',
        vehicleId: body.vehicleId,
        userId: body?.userId ?? (session?.user as any)?.id ?? '',
      },
      include: { vehicle: true, user: { select: { id: true, name: true, email: true } } },
    });
    return NextResponse.json(entry);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'Błąd' }, { status: 500 });
  }
}
