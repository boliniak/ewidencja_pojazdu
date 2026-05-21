export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const settings = await prisma.systemSettings.findMany();
    const map: Record<string, string> = {};
    settings?.forEach?.((s: any) => { if (s?.key) map[s.key] = s?.value ?? ''; });
    return NextResponse.json(map);
  } catch { return NextResponse.json({ error: 'Błąd' }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any)?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 });
    }
    const body = await request.json();
    const entries = Object.entries(body ?? {});
    for (const [key, value] of entries) {
      await prisma.systemSettings.upsert({
        where: { key },
        update: { value: String(value ?? '') },
        create: { key, value: String(value ?? '') },
      });
    }
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: 'Błąd' }, { status: 500 }); }
}
