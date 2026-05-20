export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name } = body ?? {};
    console.log('Signup attempt:', { email, name, hasPassword: !!password });
    if (!email || !password || !name) {
      console.log('Signup validation failed - missing fields:', { email: !!email, password: !!password, name: !!name });
      return NextResponse.json({ error: 'Wszystkie pola są wymagane' }, { status: 400 });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log('Signup failed - email already exists:', email);
      return NextResponse.json({ error: 'Użytkownik o tym adresie email już istnieje' }, { status: 400 });
    }
    const userCount = await prisma.user.count();
    console.log('Current user count:', userCount);
    if (userCount >= 10) {
      return NextResponse.json({ error: 'Osiągnięto maksymalną liczbę użytkowników (10)' }, { status: 400 });
    }
    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, password: hashed, name, role: 'USER' },
    });
    return NextResponse.json({ id: user.id, email: user.email, name: user.name });
  } catch (error: any) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Błąd rejestracji' }, { status: 500 });
  }
}
