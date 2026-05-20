export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const statements = await prisma.bankStatement.findMany({
      include: { transactions: { orderBy: { operationDate: 'asc' } } },
      orderBy: { importedAt: 'desc' },
    });
    return NextResponse.json(statements ?? []);
  } catch { return NextResponse.json({ error: 'Błąd' }, { status: 500 }); }
}
