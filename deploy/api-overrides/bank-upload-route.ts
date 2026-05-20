export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { saveFile } from '@/lib/local-storage';
import { callLlm } from '@/lib/llm-client';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'Brak pliku' }, { status: 400 });

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    
    // Save locally
    const cloud_storage_path = await saveFile(fileBuffer, file.name, file.type, false);

    // Parse PDF via LLM API
    const base64String = fileBuffer.toString('base64');
    const parsePrompt = `Przeanalizuj ten wyciąg bankowy PKO BP w formacie PDF. Wyodrębnij WSZYSTKIE transakcje i zwróć je w formacie JSON.

Dla każdej transakcji podaj:
- operationDate (format YYYY-MM-DD)
- valueDate (format YYYY-MM-DD)
- operationId (identyfikator operacji)
- operationType (typ operacji)
- description (pełny opis operacji)
- amount (kwota jako liczba, ujemna = wydatek)
- balance (saldo po operacji jako liczba)
- isFuel (true jeśli to transakcja na stacji paliw: SHELL, CIRCLE K, BP, ORLEN, AMIC, LOTOS, TOTAL, MOYA, AVIA)
- stationName (nazwa stacji paliw jeśli isFuel=true, inaczej null)
- location (lokalizacja jeśli dostępna, inaczej null)

Dodatkowo podaj metadane wyciągu:
- periodFrom (YYYY-MM-DD)
- periodTo (YYYY-MM-DD)

Odpowiedz TYLKO czystym JSON w formacie:
{
  "metadata": { "periodFrom": "...", "periodTo": "..." },
  "transactions": [ { ... }, ... ]
}
Nie używaj markdown, code blocks ani formatowania.`;

    let parsed: any = {};
    try {
      const content = await callLlm(
        [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:application/pdf;base64,${base64String}` } },
            { type: 'text', text: parsePrompt },
          ],
        }],
        { maxTokens: 8000, responseFormat: { type: 'json_object' } }
      );
      parsed = JSON.parse(content);
    } catch (parseErr) {
      console.error('LLM parsing error:', parseErr);
      // Save statement without transactions
      const statement = await prisma.bankStatement.create({
        data: { fileName: file.name, cloudStoragePath: cloud_storage_path },
      });
      return NextResponse.json({ statement, parseError: 'Nie udało się przeanalizować PDF. Sprawdź konfigurację API LLM.' });
    }

    const statement = await prisma.bankStatement.create({
      data: {
        fileName: file.name,
        cloudStoragePath: cloud_storage_path,
        periodFrom: parsed?.metadata?.periodFrom ? new Date(parsed.metadata.periodFrom) : null,
        periodTo: parsed?.metadata?.periodTo ? new Date(parsed.metadata.periodTo) : null,
      },
    });

    const transactions = parsed?.transactions ?? [];
    for (const t of transactions) {
      await prisma.bankTransaction.create({
        data: {
          operationDate: new Date(t?.operationDate ?? new Date()),
          valueDate: t?.valueDate ? new Date(t.valueDate) : null,
          operationId: t?.operationId ?? '',
          operationType: t?.operationType ?? '',
          description: t?.description ?? '',
          amount: parseFloat(t?.amount ?? '0') || 0,
          balance: t?.balance ? parseFloat(t.balance) : null,
          isFuel: t?.isFuel ?? false,
          stationName: t?.stationName ?? null,
          location: t?.location ?? null,
          statementId: statement.id,
        },
      });
    }

    return NextResponse.json({ statement, transactionCount: transactions?.length ?? 0 });
  } catch (error: any) {
    console.error('Bank upload error:', error);
    return NextResponse.json({ error: 'Błąd przetwarzania' }, { status: 500 });
  }
}
