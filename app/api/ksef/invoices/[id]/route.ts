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
    const invoice = await prisma.ksefInvoice.update({
      where: { id: params?.id },
      data: {
        isFuel: body?.isFuel,
        fuelLiters: body?.fuelLiters ? parseFloat(body.fuelLiters) : null,
        fuelPricePerLiter: body?.fuelPricePerLiter ? parseFloat(body.fuelPricePerLiter) : null,
      },
    });
    return NextResponse.json(invoice);
  } catch { return NextResponse.json({ error: 'B\u0142\u0105d' }, { status: 500 }); }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await prisma.ksefInvoice.delete({ where: { id: params?.id } });
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: 'B\u0142\u0105d' }, { status: 500 }); }
}
