export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const url = new URL(request.url);
    const fuelOnly = url.searchParams.get('fuelOnly') === 'true';
    const where: any = fuelOnly ? { isFuel: true } : {};
    const invoices = await prisma.ksefInvoice.findMany({ where, orderBy: { issueDate: 'desc' } });
    return NextResponse.json(invoices ?? []);
  } catch { return NextResponse.json({ error: 'Błąd' }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    // Manual invoice add or KSeF fetch simulation
    const invoice = await prisma.ksefInvoice.create({
      data: {
        ksefNumber: body?.ksefNumber ?? '',
        invoiceNumber: body?.invoiceNumber ?? '',
        issueDate: new Date(body?.issueDate ?? new Date()),
        sellerName: body?.sellerName ?? '',
        sellerNip: body?.sellerNip ?? '',
        grossAmount: parseFloat(body?.grossAmount ?? '0') || 0,
        netAmount: parseFloat(body?.netAmount ?? '0') || 0,
        vatAmount: parseFloat(body?.vatAmount ?? '0') || 0,
        isFuel: body?.isFuel ?? false,
        fuelLiters: body?.fuelLiters ? parseFloat(body.fuelLiters) : null,
        fuelPricePerLiter: body?.fuelPricePerLiter ? parseFloat(body.fuelPricePerLiter) : null,
        rawData: JSON.stringify(body?.rawData ?? {}),
      },
    });
    return NextResponse.json(invoice);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'Błąd' }, { status: 500 });
  }
}
