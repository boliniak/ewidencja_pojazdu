export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { parsePdfOffline } from '@/lib/pdf-ocr-parser';
import { callLlm } from '@/lib/llm-client';

const FUEL_KEYWORDS = ['BP', 'ORLEN', 'LOTOS', 'SHELL', 'CIRCLE K', 'AMIC', 'MOYA', 'STACJA PALIW', 'FUEL', 'MOL', 'TOTAL', 'BENZYNA', 'DIESEL', 'ON ', 'PB95', 'PB98', 'LPG', 'PALIW'];

/**
 * Parsuj PDF za pomocą LLM (Abacus AI lub OpenAI)
 */
async function parsePdfWithLlm(base64String: string, fileName: string): Promise<any[]> {
  if (!process.env.ABACUSAI_API_KEY && !process.env.OPENAI_API_KEY) return [];

  const parsePrompt = `Przeanalizuj dokładnie tę fakturę/rachunek PDF. Wyodrębnij dane.

WAŻNE zasady:
- invoiceNumber: dokładny numer faktury (np. "I26140B1005229", "FV/123/2026"). NIE kopiuj kwot ani ilości jako numer.
- issueDate: data wystawienia YYYY-MM-DD
- sellerName: pełna nazwa sprzedawcy
- sellerNip: NIP sprzedawcy 10 cyfr
- grossAmount: kwota brutto (DO ZAPŁATY)
- netAmount: kwota netto
- vatAmount: kwota VAT
- isFuel: true jeśli paliwo (stacja, benzyna, diesel, ON, PB95, LPG)
- fuelLiters: litry paliwa (np. 67.49), null jeśli nie paliwowa
- fuelPricePerLiter: cena netto/litr (np. 6.21), null jeśli nie

Odpowiedz TYLKO czystym JSON:
{"invoices": [{"invoiceNumber": "", "issueDate": "", "sellerName": "", "sellerNip": "", "grossAmount": 0, "netAmount": 0, "vatAmount": 0, "isFuel": false, "fuelLiters": null, "fuelPricePerLiter": null}]}
Bez markdown.`;

  try {
    // Sposób 1: typ "file"
    let content: string;
    try {
      content = await callLlm(
        [{ role: 'user', content: [
          { type: 'file', file: { filename: fileName, file_data: `data:application/pdf;base64,${base64String}` } },
          { type: 'text', text: parsePrompt },
        ]}],
        { maxTokens: 4000, responseFormat: { type: 'json_object' } }
      );
    } catch {
      // Fallback: image_url
      content = await callLlm(
        [{ role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:application/pdf;base64,${base64String}` } },
          { type: 'text', text: parsePrompt },
        ]}],
        { maxTokens: 4000, responseFormat: { type: 'json_object' } }
      );
    }

    const parsed = JSON.parse(content);
    const invoices = parsed?.invoices ?? (parsed?.invoiceNumber ? [parsed] : []);
    return invoices.map((inv: any) => ({ ...inv, ocrConfidence: 'LLM' }));
  } catch (e: any) {
    console.error('[PDF] Błąd LLM:', e?.message);
    return [];
  }
}

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
    const base64String = fileBuffer.toString('base64');

    // === STRATEGIA HYBRYDOWA ===
    // 1. Spróbuj LLM (najlepsza jakość, wymaga OPENAI_API_KEY)
    // 2. Jeśli brak klucza lub błąd — użyj OCR offline
    let invoices: any[] = [];
    let method = 'unknown';

    // Próba LLM
    invoices = await parsePdfWithLlm(base64String, file.name);
    if (invoices.length > 0) {
      method = 'llm';
      console.log(`[PDF] Przetworzono przez LLM: ${invoices.length} faktur`);
    }

    // Fallback: OCR offline
    if (invoices.length === 0) {
      try {
        invoices = await parsePdfOffline(fileBuffer, file.name);
        method = 'ocr';
        console.log(`[PDF] Przetworzono przez OCR: ${invoices.length} faktur`);
      } catch (ocrErr: any) {
        console.error('[PDF] Błąd OCR:', ocrErr?.message);
        return NextResponse.json({
          error: `Nie udało się przeanalizować PDF. ${!process.env.ABACUSAI_API_KEY && !process.env.OPENAI_API_KEY ? 'Skonfiguruj ABACUSAI_API_KEY lub OPENAI_API_KEY w .env.' : ''} Błąd: ${ocrErr?.message ?? 'nieznany'}`
        }, { status: 422 });
      }
    }

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({ error: 'Nie znaleziono żadnych faktur w PDF' }, { status: 422 });
    }

    let imported = 0;
    let skipped = 0;
    let updated = 0;
    const results: any[] = [];

    for (const inv of invoices) {
      const invoiceNumber = inv?.invoiceNumber ?? '';
      const sellerName = inv?.sellerName ?? '';

      // Duplikaty
      if (invoiceNumber) {
        const existing = await prisma.ksefInvoice.findFirst({ where: { invoiceNumber } });
        if (existing) {
          if (!existing.fuelLiters && inv?.fuelLiters) {
            await prisma.ksefInvoice.update({
              where: { id: existing.id },
              data: {
                isFuel: inv.isFuel ?? existing.isFuel,
                fuelLiters: parseFloat(String(inv.fuelLiters)) || null,
                fuelPricePerLiter: parseFloat(String(inv.fuelPricePerLiter)) || null,
              },
            });
            updated++;
            results.push({ invoiceNumber, status: 'zaktualizowano (litry)' });
          } else {
            skipped++;
            results.push({ invoiceNumber, status: 'duplikat' });
          }
          continue;
        }
      }

      const isFuel = inv?.isFuel === true || FUEL_KEYWORDS.some(kw =>
        sellerName.toUpperCase().includes(kw) || JSON.stringify(inv).toUpperCase().includes(kw)
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
          rawData: JSON.stringify({ source: 'pdf_upload', fileName: file.name, method, ocrConfidence: inv?.ocrConfidence ?? 'unknown', parsedData: inv }),
        },
      });
      imported++;
      results.push({
        invoiceNumber, sellerName, isFuel,
        fuelLiters: record.fuelLiters,
        id: record.id,
        status: 'zaimportowano',
        method,
      });
    }

    return NextResponse.json({
      success: true,
      imported,
      updated,
      skipped,
      total: invoices.length,
      results,
      method,
    });

  } catch (error: any) {
    console.error('PDF upload error:', error);
    return NextResponse.json({ error: `Błąd przetwarzania: ${error?.message?.substring(0, 200) ?? 'nieznany błąd'}` }, { status: 500 });
  }
}
