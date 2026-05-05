export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { generatePdfFromHtml } from '@/lib/pdf-generator';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { vehicleId, month, year } = body ?? {};
    if (!vehicleId || !year) return NextResponse.json({ error: 'Podaj pojazd i rok' }, { status: 400 });

    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) return NextResponse.json({ error: 'Pojazd nie znaleziony' }, { status: 404 });

    const where: any = { vehicleId };
    if (month) {
      const m = parseInt(month);
      const y = parseInt(year);
      where.date = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
    } else {
      const y = parseInt(year);
      where.date = { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) };
    }

    const entries = await prisma.mileageEntry.findMany({
      where,
      include: { user: { select: { name: true } } },
      orderBy: { entryNumber: 'asc' },
    });

    const companyName = (await prisma.systemSettings.findUnique({ where: { key: 'COMPANY_NAME' } }))?.value ?? '';
    const companyNip = (await prisma.systemSettings.findUnique({ where: { key: 'COMPANY_NIP' } }))?.value ?? '';

    const totalKm = entries?.reduce?.((s: number, e: any) => s + (e?.kilometers ?? 0), 0) ?? 0;
    const periodLabel = month ? `${String(month).padStart(2, '0')}/${year}` : year;

    const html_content = `<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; color: #1a1a1a; }
  h1 { text-align: center; font-size: 16px; margin-bottom: 5px; }
  h2 { text-align: center; font-size: 13px; font-weight: normal; color: #555; margin-bottom: 20px; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  th { background: #f5f5f5; font-weight: bold; font-size: 10px; }
  td { font-size: 10px; }
  .right { text-align: right; }
  .footer { margin-top: 30px; display: flex; justify-content: space-between; font-size: 10px; }
  .total { font-weight: bold; background: #f0f0f0; }
</style></head>
<body>
  <h1>EWIDENCJA PRZEBIEGU POJAZDU</h1>
  <h2>Okres: ${periodLabel} | Pojazd: ${vehicle?.registrationNumber ?? ''} ${vehicle?.brand ?? ''} ${vehicle?.model ?? ''}</h2>
  <div class="meta">
    <div>${companyName ? `Firma: ${companyName}` : ''}${companyNip ? ` | NIP: ${companyNip}` : ''}</div>
    <div>Stan pocz\u0105tkowy: ${entries?.[0]?.odometerBefore?.toLocaleString?.('pl-PL') ?? vehicle?.odometerStart ?? 0} km</div>
  </div>
  <table>
    <thead><tr>
      <th>Nr</th><th>Data</th><th>Cel wyjazdu</th><th>Pracownik</th>
      <th class="right">km</th><th class="right">Licznik przed</th><th class="right">Licznik po</th><th>Podpis podatnika</th>
    </tr></thead>
    <tbody>
      ${entries?.map?.((e: any) => `<tr>
        <td>${e?.entryNumber ?? ''}</td>
        <td>${e?.date ? new Date(e.date).toLocaleDateString('pl-PL') : ''}</td>
        <td>${e?.purpose ?? ''}</td>
        <td>${e?.user?.name ?? ''}</td>
        <td class="right">${e?.kilometers?.toFixed?.(1) ?? ''}</td>
        <td class="right">${e?.odometerBefore?.toLocaleString?.('pl-PL') ?? ''}</td>
        <td class="right">${e?.odometerAfter?.toLocaleString?.('pl-PL') ?? ''}</td>
        <td>${e?.taxpayerSignature ?? ''}</td>
      </tr>`)?.join?.('') ?? ''}
      <tr class="total"><td colspan="4">RAZEM</td><td class="right">${totalKm?.toFixed?.(1)}</td><td colspan="3"></td></tr>
    </tbody>
  </table>
  <div class="footer">
    <div>Wygenerowano: ${new Date().toLocaleDateString('pl-PL')}</div>
    <div>Podpis: ................................</div>
  </div>
</body></html>`;

    const pdfBuffer = await generatePdfFromHtml(html_content);

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="ewidencja_${vehicle?.registrationNumber ?? 'pojazd'}_${periodLabel}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('Report PDF error:', error);
    return NextResponse.json({ error: 'B\u0142\u0105d generowania raportu' }, { status: 500 });
  }
}
