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
    const tx = await prisma.bankTransaction.update({
      where: { id: params?.id },
      data: { isFuel: body?.isFuel ?? false, stationName: body?.stationName ?? null },
    });
    return NextResponse.json(tx);
  } catch { return NextResponse.json({ error: 'B\u0142\u0105d' }, { status: 500 }); }
}
