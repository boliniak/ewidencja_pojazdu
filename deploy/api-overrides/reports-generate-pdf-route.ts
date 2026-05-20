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
  @page { size: A4 landscape; margin: 15mm 10mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; margin: 20px; color: #1a1a1a; }
  h1 { text-align: center; font-size: 18px; margin-bottom: 5px; text-transform: uppercase; }
  h2 { text-align: center; font-size: 13px; font-weight: normal; color: #555; margin-bottom: 20px; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
  th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
  th { background: #e8e8e8; font-weight: bold; font-size: 10px; }
  td { font-size: 10px; }
  .right { text-align: right; }
  .center { text-align: center; }
  .footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 10px; }
  .total { font-weight: bold; background: #f0f0f0; }
  .signature-line { margin-top: 60px; display: flex; justify-content: flex-end; }
  .signature-box { text-align: center; width: 200px; }
  .signature-box .line { border-top: 1px solid #333; margin-top: 50px; padding-top: 5px; font-size: 9px; }
  @media print { body { margin: 0; } }
</style></head>
<body>
  <h1>Ewidencja przebiegu pojazdu</h1>
  <h2>Okres: ${periodLabel} | Pojazd: ${vehicle?.registrationNumber ?? ''} ${vehicle?.brand ?? ''} ${vehicle?.model ?? ''}</h2>
  <div class="meta">
    <div>
      ${companyName ? `<strong>Firma:</strong> ${companyName}` : ''}
      ${companyNip ? ` | <strong>NIP:</strong> ${companyNip}` : ''}
    </div>
    <div>
      <strong>Stan licznika na początek:</strong> ${entries?.[0]?.odometerBefore?.toLocaleString?.('pl-PL') ?? vehicle?.odometerStart?.toLocaleString?.('pl-PL') ?? 0} km
      ${entries?.length ? ` | <strong>Stan na koniec:</strong> ${entries[entries.length - 1]?.odometerAfter?.toLocaleString?.('pl-PL') ?? ''} km` : ''}
    </div>
  </div>
  <table>
    <thead><tr>
      <th class="center" style="width:40px">Nr</th>
      <th style="width:80px">Data</th>
      <th>Cel wyjazdu</th>
      <th style="width:120px">Pracownik</th>
      <th class="right" style="width:60px">km</th>
      <th class="right" style="width:80px">Licznik przed</th>
      <th class="right" style="width:80px">Licznik po</th>
      <th style="width:120px">Podpis podatnika</th>
    </tr></thead>
    <tbody>
      ${entries?.map?.((e: any) => `<tr>
        <td class="center">${e?.entryNumber ?? ''}</td>
        <td>${e?.date ? new Date(e.date).toLocaleDateString('pl-PL') : ''}</td>
        <td>${e?.purpose ?? ''}</td>
        <td>${e?.user?.name ?? ''}</td>
        <td class="right">${e?.kilometers?.toFixed?.(1) ?? ''}</td>
        <td class="right">${e?.odometerBefore?.toLocaleString?.('pl-PL') ?? ''}</td>
        <td class="right">${e?.odometerAfter?.toLocaleString?.('pl-PL') ?? ''}</td>
        <td>${e?.taxpayerSignature ?? ''}</td>
      </tr>`)?.join?.('') ?? ''}
      <tr class="total">
        <td colspan="4"><strong>RAZEM</strong></td>
        <td class="right"><strong>${totalKm?.toFixed?.(1)}</strong></td>
        <td colspan="3"></td>
      </tr>
    </tbody>
  </table>
  <div class="footer">
    <div>Wygenerowano: ${new Date().toLocaleDateString('pl-PL')}</div>
  </div>
  <div class="signature-line">
    <div class="signature-box">
      <div class="line">podpis osoby prowadzącej ewidencję</div>
    </div>
  </div>
</body></html>`;

    const { buffer, isPdf } = await generatePdfFromHtml(html_content);

    if (isPdf) {
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="ewidencja_${vehicle?.registrationNumber ?? 'pojazd'}_${periodLabel}.pdf"`,
        },
      });
    } else {
      // Fallback: zwróć HTML do wydruku w przeglądarce
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `inline; filename="ewidencja_${vehicle?.registrationNumber ?? 'pojazd'}_${periodLabel}.html"`,
        },
      });
    }
  } catch (error: any) {
    console.error('Report PDF error:', error);
    return NextResponse.json({ error: 'Błąd generowania raportu' }, { status: 500 });
  }
}
