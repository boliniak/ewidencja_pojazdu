export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const logs = await prisma.backupLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    return NextResponse.json(logs ?? []);
  } catch { return NextResponse.json({ error: 'Błąd' }, { status: 500 }); }
}
