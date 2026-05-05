export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const vehicles = await prisma.vehicle.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json(vehicles ?? []);
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
    const count = await prisma.vehicle.count();
    if (count >= 10) return NextResponse.json({ error: 'Maksymalnie 10 pojazdów' }, { status: 400 });
    if (!body?.registrationNumber) return NextResponse.json({ error: 'Nr rejestracyjny wymagany' }, { status: 400 });
    const vehicle = await prisma.vehicle.create({
      data: {
        registrationNumber: (body.registrationNumber ?? '').toUpperCase().trim(),
        brand: body?.brand ?? '',
        model: body?.model ?? '',
        startDate: new Date(body?.startDate ?? new Date()),
        endDate: body?.endDate ? new Date(body.endDate) : null,
        odometerStart: parseFloat(body?.odometerStart ?? '0') || 0,
        odometerEnd: body?.odometerEnd ? parseFloat(body.odometerEnd) : null,
      },
    });
    return NextResponse.json(vehicle);
  } catch (error: any) {
    console.error(error);
    if (error?.code === 'P2002') return NextResponse.json({ error: 'Pojazd o tym numerze już istnieje' }, { status: 400 });
    return NextResponse.json({ error: 'Błąd' }, { status: 500 });
  }
}
