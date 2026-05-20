export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json(users ?? []);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'Błąd' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any)?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 });
    }
    const body = await request.json();
    if (!body?.email || !body?.password || !body?.name) {
      return NextResponse.json({ error: 'Wypełnij wymagane pola' }, { status: 400 });
    }
    const count = await prisma.user.count();
    if (count >= 10) return NextResponse.json({ error: 'Maks. 10 użytkowników' }, { status: 400 });
    const hashed = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: { email: body.email, password: hashed, name: body.name, role: body?.role ?? 'USER' },
    });
    return NextResponse.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (error: any) {
    if (error?.code === 'P2002') return NextResponse.json({ error: 'Email już istnieje' }, { status: 400 });
    return NextResponse.json({ error: 'Błąd' }, { status: 500 });
  }
}
