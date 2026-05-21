export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { callLlm } from '@/lib/llm-client';

const FUEL_KEYWORDS = ['BP', 'ORLEN', 'LOTOS', 'SHELL', 'CIRCLE K', 'AMIC', 'MOYA', 'STACJA PALIW', 'FUEL', 'MOL', 'TOTAL', 'BENZYNA', 'DIESEL', 'ON ', 'PB95', 'PB98', 'LPG', 'PALIW'];

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Sprawdź czy OPENAI_API_KEY jest skonfigurowany
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ 
        error: 'Klucz API LLM nie jest skonfigurowany. Ustaw OPENAI_API_KEY w pliku .env w katalogu deploy/' 
      }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'Brak pliku' }, { status: 400 });

    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Tylko pliki PDF są obsługiwane' }, { status: 400 });
    }

    const fileBuffer = await file.arrayBuffer();
    const base64String = Buffer.from(fileBuffer).toString('base64');

    const parsePrompt = `Przeanalizuj tę fakturę/rachunek w formacie PDF. Wyodrębnij dane faktury.

Dla każdej faktury podaj:
- invoiceNumber (numer faktury)
- issueDate (data wystawienia, format YYYY-MM-DD)
- sellerName (nazwa sprzedawcy/wystawcy)
- sellerNip (NIP sprzedawcy, 10 cyfr bez myślników)
- grossAmount (kwota brutto jako liczba)
- netAmount (kwota netto jako liczba)
- vatAmount (kwota VAT jako liczba)
- isFuel (true jeśli to faktura paliwowa: stacja paliw, benzyna, diesel, ON, PB, LPG)
- fuelLiters (ilość litrów paliwa jako liczba, jeśli to faktura paliwowa, null jeśli nie)
- fuelPricePerLiter (cena netto za litr paliwa jako liczba, jeśli to faktura paliwowa, null jeśli nie)
- items (lista pozycji faktury, każda z: name, quantity, unit, unitPrice, netValue, grossValue)

Jeśli PDF zawiera więcej niż jedną fakturę, zwróć je wszystkie.

Odpowiedz TYLKO czystym JSON w formacie:
{
  "invoices": [
    {
      "invoiceNumber": "...",
      "issueDate": "YYYY-MM-DD",
      "sellerName": "...",
      "sellerNip": "...",
      "grossAmount": 0,
      "netAmount": 0,
      "vatAmount": 0,
      "isFuel": false,
      "fuelLiters": null,
      "fuelPricePerLiter": null,
      "items": [{ "name": "...", "quantity": 0, "unit": "...", "unitPrice": 0, "netValue": 0, "grossValue": 0 }]
    }
  ]
}
Nie używaj markdown, code blocks ani formatowania.`;

    // Próbuj wysyłać jako "file" (OpenAI native), fallback na "image_url" (kompatybilność)
    let content: string;
    try {
      // Sposób 1: OpenAI native "file" type
      content = await callLlm(
        [{
          role: 'user',
          content: [
            { type: 'file', file: { filename: file.name, file_data: `data:application/pdf;base64,${base64String}` } },
            { type: 'text', text: parsePrompt },
          ],
        }],
        { maxTokens: 4000, responseFormat: { type: 'json_object' } }
      );
    } catch (firstErr: any) {
      console.error('LLM file type failed, trying image_url fallback:', firstErr?.message);
      try {
        // Sposób 2: image_url fallback (niektóre API akceptują PDF jako image_url)
        content = await callLlm(
          [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:application/pdf;base64,${base64String}` } },
              { type: 'text', text: parsePrompt },
            ],
          }],
          { maxTokens: 4000, responseFormat: { type: 'json_object' } }
        );
      } catch (secondErr: any) {
        console.error('LLM image_url fallback also failed:', secondErr?.message);
        return NextResponse.json({ 
          error: `Nie udało się przeanalizować PDF. Błąd API: ${firstErr?.message?.substring(0, 200)}` 
        }, { status: 502 });
      }
    }

    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    const invoices = parsed?.invoices ?? (parsed?.invoiceNumber ? [parsed] : []);
    if (invoices.length === 0) {
      return NextResponse.json({ error: 'Nie znaleziono żadnych faktur w PDF' }, { status: 422 });
    }

    let imported = 0;
    let skipped = 0;
    const results: any[] = [];

    for (const inv of invoices) {
      const invoiceNumber = inv?.invoiceNumber ?? '';
      const sellerName = inv?.sellerName ?? '';

      if (invoiceNumber) {
        const existing = await prisma.ksefInvoice.findFirst({ where: { invoiceNumber } });
        if (existing) { skipped++; results.push({ invoiceNumber, status: 'duplikat' }); continue; }
      }

      const isFuel = inv?.isFuel === true || FUEL_KEYWORDS.some(kw =>
        sellerName.toUpperCase().includes(kw) ||
        JSON.stringify(inv?.items ?? []).toUpperCase().includes(kw)
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
          rawData: JSON.stringify({ source: 'pdf_upload', fileName: file.name, items: inv?.items ?? [], parsedData: inv }),
        },
      });
      imported++;
      results.push({ invoiceNumber, sellerName, isFuel, fuelLiters: record.fuelLiters, id: record.id, status: 'zaimportowano' });
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      total: invoices.length,
      results,
    });

  } catch (error: any) {
    console.error('PDF upload error:', error);
    return NextResponse.json({ error: `Błąd przetwarzania pliku PDF: ${error?.message?.substring(0, 200) ?? 'nieznany błąd'}` }, { status: 500 });
  }
}
