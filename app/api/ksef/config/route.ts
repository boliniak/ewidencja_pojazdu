export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const config = await prisma.ksefConfig.findFirst();
    if (!config) return NextResponse.json({ active: false, environment: 'TEST', nip: '', hasToken: false });
    return NextResponse.json({
      id: config.id,
      active: config.active,
      environment: config.environment,
      nip: config.nip,
      hasToken: !!(config?.tokenEncrypted),
    });
  } catch { return NextResponse.json({ error: 'Błąd' }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any)?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 });
    }
    const body = await request.json();
    const existing = await prisma.ksefConfig.findFirst();
    const data = {
      tokenEncrypted: body?.token ?? existing?.tokenEncrypted ?? '',
      environment: body?.environment ?? 'TEST',
      nip: body?.nip ?? '',
      active: body?.active ?? false,
    };
    if (existing) {
      await prisma.ksefConfig.update({ where: { id: existing.id }, data });
    } else {
      await prisma.ksefConfig.create({ data });
    }
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: 'Błąd' }, { status: 500 }); }
}
