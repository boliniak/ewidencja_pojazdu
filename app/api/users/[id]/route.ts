export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any)?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 });
    }
    const body = await request.json();
    const data: any = {};
    if (body?.name) data.name = body.name;
    if (body?.email) data.email = body.email;
    if (body?.role) data.role = body.role;
    if (body?.password) data.password = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.update({ where: { id: params?.id }, data });
    return NextResponse.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (error: any) {
    return NextResponse.json({ error: 'Błąd' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any)?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 });
    }
    await prisma.user.delete({ where: { id: params?.id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'Błąd' }, { status: 500 });
  }
}
