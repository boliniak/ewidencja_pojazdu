export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const vehicle = await prisma.vehicle.update({
      where: { id: params?.id },
      data: {
        registrationNumber: body?.registrationNumber ? (body.registrationNumber).toUpperCase().trim() : undefined,
        brand: body?.brand,
        model: body?.model,
        startDate: body?.startDate ? new Date(body.startDate) : undefined,
        endDate: body?.endDate ? new Date(body.endDate) : null,
        odometerStart: body?.odometerStart !== undefined ? parseFloat(body.odometerStart) || 0 : undefined,
        odometerEnd: body?.odometerEnd ? parseFloat(body.odometerEnd) : null,
        active: body?.active,
      },
    });
    return NextResponse.json(vehicle);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'Błąd' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await prisma.vehicle.delete({ where: { id: params?.id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'Błąd usuwania' }, { status: 500 });
  }
}
