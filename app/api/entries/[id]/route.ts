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
    const entry = await prisma.mileageEntry.update({
      where: { id: params?.id },
      data: {
        date: body?.date ? new Date(body.date) : undefined,
        purpose: body?.purpose,
        kilometers: body?.kilometers ? parseFloat(body.kilometers) : undefined,
        taxpayerSignature: body?.taxpayerSignature,
        userId: body?.userId,
      },
    });
    return NextResponse.json(entry);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'Błąd' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await prisma.mileageEntry.delete({ where: { id: params?.id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'Błąd' }, { status: 500 });
  }
}
