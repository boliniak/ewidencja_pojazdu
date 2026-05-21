export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

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

    const fileBuffer = await file.arrayBuffer();
    const base64String = Buffer.from(fileBuffer).toString('base64');

    const parsePrompt = `Przeanalizuj dokładnie tę fakturę/rachunek PDF. Wyodrębnij dane.

WAŻNE zasady:
- invoiceNumber: dokładny numer faktury (np. "I26140B1005229", "FV/123/2026"). NIE kopiuj kwot ani ilości jako numer faktury.
- issueDate: data wystawienia w formacie YYYY-MM-DD
- sellerName: pełna nazwa sprzedawcy (np. "BP Europa SE Oddział w Polsce")
- sellerNip: NIP sprzedawcy, 10 cyfr bez myślników
- grossAmount: kwota brutto (DO ZAPŁATY) jako liczba
- netAmount: kwota netto jako liczba
- vatAmount: kwota VAT jako liczba
- isFuel: true jeśli faktura dotyczy paliwa (stacja paliw, benzyna, diesel, ON, PB95, LPG)
- fuelLiters: ilość litrów paliwa (np. 67.49), null jeśli nie paliwowa
- fuelPricePerLiter: cena netto za litr (np. 6.21), null jeśli nie paliwowa

Jeśli PDF zawiera wiele faktur, zwróć wszystkie.

Odpowiedz TYLKO czystym JSON:
{"invoices": [{"invoiceNumber": "", "issueDate": "", "sellerName": "", "sellerNip": "", "grossAmount": 0, "netAmount": 0, "vatAmount": 0, "isFuel": false, "fuelLiters": null, "fuelPricePerLiter": null}]}
Bez markdown, bez code blocks.`;

    const llmResponse = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'file', file: { filename: file.name, file_data: `data:application/pdf;base64,${base64String}` } },
            { type: 'text', text: parsePrompt },
          ],
        }],
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!llmResponse.ok) {
      const errText = await llmResponse.text();
      console.error('LLM API error:', errText);
      return NextResponse.json({ error: 'Nie udało się przeanalizować PDF. Spróbuj ponownie.' }, { status: 502 });
    }

    const llmData = await llmResponse.json();
    const content = llmData?.choices?.[0]?.message?.content ?? '{}';
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

      // Sprawdź duplikaty po numerze faktury
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
    return NextResponse.json({ error: 'Błąd przetwarzania pliku PDF' }, { status: 500 });
  }
}
