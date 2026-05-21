export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { parsePdfOffline } from '@/lib/pdf-ocr-parser';

const FUEL_KEYWORDS = ['BP', 'ORLEN', 'LOTOS', 'SHELL', 'CIRCLE K', 'AMIC', 'MOYA', 'STACJA PALIW', 'FUEL', 'MOL', 'TOTAL', 'BENZYNA', 'DIESEL', 'ON ', 'PB95', 'PB98', 'LPG', 'PALIW'];

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'Brak pliku' }, { status: 400 });

    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Tylko pliki PDF są obsługiwane' }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Analiza offline (OCR + regex) — bez potrzeby internetu
    let invoices: any[];
    try {
      invoices = await parsePdfOffline(fileBuffer, file.name);
    } catch (ocrErr: any) {
      console.error('OCR parsing error:', ocrErr?.message);
      return NextResponse.json({ 
        error: `Nie udało się przeanalizować PDF: ${ocrErr?.message ?? 'błąd OCR'}` 
      }, { status: 422 });
    }

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({ error: 'Nie znaleziono żadnych faktur w PDF' }, { status: 422 });
    }

    let imported = 0;
    let skipped = 0;
    const results: any[] = [];

    for (const inv of invoices) {
      const invoiceNumber = inv?.invoiceNumber ?? '';
      const sellerName = inv?.sellerName ?? '';

      // Sprawdź duplikaty po numerze faktury
      if (invoiceNumber) {
        const existing = await prisma.ksefInvoice.findFirst({ where: { invoiceNumber } });
        if (existing) {
          // Jeśli istnieje ale brakuje litrów — zaktualizuj
          if (!existing.fuelLiters && inv?.fuelLiters) {
            await prisma.ksefInvoice.update({
              where: { id: existing.id },
              data: {
                isFuel: inv.isFuel ?? existing.isFuel,
                fuelLiters: inv.fuelLiters,
                fuelPricePerLiter: inv.fuelPricePerLiter,
              },
            });
            results.push({ invoiceNumber, status: 'zaktualizowano (litry)' });
            imported++;
          } else {
            skipped++;
            results.push({ invoiceNumber, status: 'duplikat' });
          }
          continue;
        }
      }

      const isFuel = inv?.isFuel === true || FUEL_KEYWORDS.some(kw =>
        sellerName.toUpperCase().includes(kw) ||
        JSON.stringify(inv).toUpperCase().includes(kw)
      );

      const record = await prisma.ksefInvoice.create({
        data: {
          ksefNumber: '',
          invoiceNumber,
          issueDate: inv?.issueDate ? new Date(inv.issueDate) : new Date(),
          sellerName,
          sellerNip: inv?.sellerNip ?? '',
          grossAmount: parseFloat(String(inv?.grossAmount ?? '0')) || 0,
          netAmount: parseFloat(String(inv?.netAmount ?? '0')) || 0,
          vatAmount: parseFloat(String(inv?.vatAmount ?? '0')) || 0,
          isFuel,
          fuelLiters: isFuel ? (parseFloat(String(inv?.fuelLiters ?? '0')) || null) : null,
          fuelPricePerLiter: isFuel ? (parseFloat(String(inv?.fuelPricePerLiter ?? '0')) || null) : null,
          rawData: JSON.stringify({ source: 'pdf_upload', fileName: file.name, ocrConfidence: inv?.ocrConfidence ?? 'unknown', parsedData: inv }),
        },
      });
      imported++;
      results.push({ 
        invoiceNumber, sellerName, isFuel, 
        fuelLiters: record.fuelLiters, 
        id: record.id, 
        status: 'zaimportowano',
        ocrConfidence: inv?.ocrConfidence,
      });
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      total: invoices.length,
      results,
      method: 'offline-ocr',
    });

  } catch (error: any) {
    console.error('PDF upload error:', error);
    return NextResponse.json({ error: `Błąd przetwarzania pliku PDF: ${error?.message?.substring(0, 200) ?? 'nieznany błąd'}` }, { status: 500 });
  }
}
