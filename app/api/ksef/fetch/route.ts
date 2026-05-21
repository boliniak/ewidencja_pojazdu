export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

// KSeF API base URLs
const KSEF_URLS: Record<string, string> = {
  TEST: 'https://ksef-test.mf.gov.pl',
  PROD: 'https://ksef.mf.gov.pl',
};

// Safely parse response — handle both JSON and XML
async function safeParseResponse(res: Response): Promise<{ json?: any; text: string; isJson: boolean }> {
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return { json, text, isJson: true };
  } catch {
    return { text, isJson: false };
  }
}

// Extract value from XML tag
function xmlVal(xml: string, tag: string): string {
  const regex = new RegExp(`<[^>]*${tag}[^>]*>([^<]*)<`);
  const m = xml.match(regex);
  return m?.[1]?.trim() ?? '';
}

export async function POST(request: Request) {
  const logs: string[] = [];
  const log = (msg: string) => { console.log(`KSeF: ${msg}`); logs.push(msg); };

  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any)?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 });
    }

    const body = await request.json();
    const { dateFrom, dateTo } = body;
    if (!dateFrom || !dateTo) {
      return NextResponse.json({ error: 'Podaj zakres dat (dateFrom, dateTo)' }, { status: 400 });
    }

    const config = await prisma.ksefConfig.findFirst();
    if (!config || !config.active) {
      return NextResponse.json({ error: 'Integracja KSeF nie jest aktywna. Włącz ją w zakładce Konfiguracja.', logs }, { status: 400 });
    }
    if (!config.tokenEncrypted || !config.nip) {
      return NextResponse.json({ error: 'Brak tokenu lub NIP w konfiguracji KSeF', logs }, { status: 400 });
    }

    const baseUrl = KSEF_URLS[config.environment] || KSEF_URLS.TEST;
    log(`Środowisko: ${config.environment} (${baseUrl})`);
    log(`NIP: ${config.nip}`);
    log(`Zakres dat: ${dateFrom} — ${dateTo}`);

    // ============================================
    // KROK 1: AuthorisationChallenge (JSON → JSON)
    // ============================================
    log('Krok 1: Pobieranie wyzwania autoryzacyjnego...');
    let challengeRes: Response;
    try {
      challengeRes = await fetch(`${baseUrl}/api/online/Session/AuthorisationChallenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          contextIdentifier: {
            type: 'onip',
            identifier: config.nip,
          },
        }),
      });
    } catch (e: any) {
      log(`Błąd połączenia z KSeF: ${e?.message}`);
      return NextResponse.json({
        error: 'Nie można połączyć się z serwerem KSeF. Sprawdź połączenie internetowe kontenera Docker.',
        logs,
      }, { status: 502 });
    }

    const challengeParsed = await safeParseResponse(challengeRes);
    if (!challengeRes.ok) {
      log(`Błąd challenge: ${challengeRes.status} — ${challengeParsed.text.substring(0, 500)}`);
      return NextResponse.json({
        error: `Błąd autoryzacji KSeF (challenge): HTTP ${challengeRes.status}`,
        details: challengeParsed.text.substring(0, 1000),
        logs,
      }, { status: 502 });
    }

    let challenge: string;
    let timestamp: string;
    if (challengeParsed.isJson) {
      challenge = challengeParsed.json?.challenge ?? '';
      timestamp = challengeParsed.json?.timestamp ?? '';
    } else {
      challenge = xmlVal(challengeParsed.text, 'Challenge');
      timestamp = xmlVal(challengeParsed.text, 'Timestamp');
    }

    if (!challenge) {
      log('Brak wyzwania w odpowiedzi KSeF');
      return NextResponse.json({ error: 'Brak wyzwania w odpowiedzi KSeF', details: challengeParsed.text.substring(0, 500), logs }, { status: 502 });
    }
    log(`Wyzwanie otrzymane, timestamp: ${timestamp}`);

    // ============================================
    // KROK 2: Szyfrowanie tokenu kluczem publicznym KSeF
    // ============================================
    log('Krok 2: Przygotowanie tokenu...');
    let encryptedTokenBase64 = '';
    let useRawToken = false;

    try {
      const pubKeyRes = await fetch(`${baseUrl}/api/online/Session/CertificatePem`);
      if (pubKeyRes.ok) {
        const pubKeyText = await pubKeyRes.text();
        // Check if it's a valid PEM key
        if (pubKeyText.includes('BEGIN')) {
          const encrypted = crypto.publicEncrypt(
            {
              key: pubKeyText,
              padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
              oaepHash: 'sha256',
            },
            Buffer.from(config.tokenEncrypted, 'utf-8')
          );
          encryptedTokenBase64 = encrypted.toString('base64');
          log('Token zaszyfrowany kluczem publicznym KSeF');
        } else {
          log('Odpowiedź CertificatePem nie zawiera klucza PEM — używam tokenu bez szyfrowania');
          useRawToken = true;
        }
      } else {
        log(`CertificatePem: HTTP ${pubKeyRes.status} — używam tokenu bez szyfrowania`);
        useRawToken = true;
      }
    } catch (e: any) {
      log(`Błąd szyfrowania: ${e?.message} — używam tokenu bez szyfrowania`);
      useRawToken = true;
    }

    const tokenForRequest = useRawToken ? config.tokenEncrypted : encryptedTokenBase64;

    // ============================================
    // KROK 3: InitToken (XML → JSON)
    // ============================================
    log('Krok 3: Inicjalizacja sesji KSeF...');
    const initXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ns3:InitSessionTokenRequest
  xmlns="http://ksef.mf.gov.pl/schema/gtw/svc/online/types/2021/10/01/0001"
  xmlns:ns2="http://ksef.mf.gov.pl/schema/gtw/svc/types/2021/10/01/0001"
  xmlns:ns3="http://ksef.mf.gov.pl/schema/gtw/svc/online/auth/request/2021/10/01/0001">
  <ns3:Context>
    <Challenge>${challenge}</Challenge>
    <Identifier xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="ns2:SubjectIdentifierByCompanyType">
      <ns2:Identifier>${config.nip}</ns2:Identifier>
    </Identifier>
    <DocumentType>
      <ns2:Service>KSeF</ns2:Service>
      <ns2:FormCode>
        <ns2:SystemCode>FA (2)</ns2:SystemCode>
        <ns2:SchemaVersion>1-0E</ns2:SchemaVersion>
        <ns2:TargetNamespace>http://crd.gov.pl/wzor/2023/06/29/12648/</ns2:TargetNamespace>
        <ns2:Value>FA</ns2:Value>
      </ns2:FormCode>
    </DocumentType>
    <Token>${tokenForRequest}</Token>
  </ns3:Context>
</ns3:InitSessionTokenRequest>`;

    let initRes: Response;
    try {
      initRes = await fetch(`${baseUrl}/api/online/Session/InitToken`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Accept': 'application/json',
        },
        body: initXml,
      });
    } catch (e: any) {
      log(`Błąd połączenia InitToken: ${e?.message}`);
      return NextResponse.json({ error: 'Błąd połączenia z KSeF (InitToken)', logs }, { status: 502 });
    }

    const initParsed = await safeParseResponse(initRes);
    if (!initRes.ok) {
      log(`Błąd InitToken: HTTP ${initRes.status}`);
      log(`Odpowiedź: ${initParsed.text.substring(0, 500)}`);
      return NextResponse.json({
        error: `Błąd autoryzacji KSeF (InitToken): HTTP ${initRes.status}`,
        details: initParsed.text.substring(0, 1000),
        logs,
        hint: 'Sprawdź czy token KSeF jest poprawny i aktualny. Token generujesz na portalu KSeF (ksef.mf.gov.pl lub ksef-test.mf.gov.pl). Upewnij się, że NIP w konfiguracji zgadza się z NIP dla którego wygenerowano token.',
      }, { status: 502 });
    }

    let sessionToken = '';
    let referenceNumber = '';
    if (initParsed.isJson) {
      sessionToken = initParsed.json?.sessionToken?.token ?? '';
      referenceNumber = initParsed.json?.referenceNumber ?? '';
    } else {
      sessionToken = xmlVal(initParsed.text, 'token') || xmlVal(initParsed.text, 'Token');
      referenceNumber = xmlVal(initParsed.text, 'referenceNumber') || xmlVal(initParsed.text, 'ReferenceNumber');
    }

    if (!sessionToken) {
      log('Brak tokenu sesji w odpowiedzi');
      log(`Odpowiedź: ${initParsed.text.substring(0, 500)}`);
      return NextResponse.json({
        error: 'Autoryzacja w KSeF nie zwróciła tokenu sesji',
        details: initParsed.text.substring(0, 500),
        logs,
      }, { status: 502 });
    }
    log(`Sesja KSeF aktywna: ref=${referenceNumber}`);

    // ============================================
    // KROK 4: Query Invoice Sync (JSON → JSON)
    // ============================================
    log('Krok 4: Wyszukiwanie faktur kosztowych...');
    const queryBody = {
      queryCriteria: {
        subjectType: 'subject2',
        type: 'incremental',
        acquisitionTimestampThresholdFrom: `${dateFrom}T00:00:00`,
        acquisitionTimestampThresholdTo: `${dateTo}T23:59:59`,
      },
    };

    let queryRes: Response;
    try {
      queryRes = await fetch(`${baseUrl}/api/online/Query/Invoice/Sync?PageSize=100&PageOffset=0`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'SessionToken': sessionToken,
        },
        body: JSON.stringify(queryBody),
      });
    } catch (e: any) {
      log(`Błąd połączenia Query: ${e?.message}`);
      return NextResponse.json({ error: 'Błąd wyszukiwania faktur w KSeF', logs }, { status: 502 });
    }

    const queryParsed = await safeParseResponse(queryRes);
    if (!queryRes.ok) {
      log(`Błąd Query: HTTP ${queryRes.status}`);
      log(`Odpowiedź: ${queryParsed.text.substring(0, 500)}`);
      return NextResponse.json({
        error: `Błąd wyszukiwania faktur: HTTP ${queryRes.status}`,
        details: queryParsed.text.substring(0, 500),
        logs,
      }, { status: 502 });
    }

    // Parse invoice list
    let invoiceHeaders: any[] = [];
    if (queryParsed.isJson) {
      invoiceHeaders = queryParsed.json?.invoiceHeaderList ?? queryParsed.json?.invoicesList ?? [];
      // Check nested structures
      if (invoiceHeaders.length === 0 && queryParsed.json?.numberOfElements > 0) {
        invoiceHeaders = queryParsed.json?.items ?? [];
      }
    }
    log(`Znaleziono ${invoiceHeaders.length} faktur w KSeF`);

    // ============================================
    // KROK 5: Import faktur do bazy
    // ============================================
    const FUEL_KEYWORDS = ['BP', 'ORLEN', 'LOTOS', 'SHELL', 'CIRCLE K', 'AMIC', 'MOYA', 'STACJA PALIW', 'FUEL', 'MOL', 'TOTAL', 'BENZYNA', 'DIESEL', 'ON ', 'PB95', 'PB98', 'LPG'];

    let imported = 0;
    let skipped = 0;

    for (const header of invoiceHeaders) {
      const ksefNumber = header?.invoiceReferenceNumber ?? header?.ksefReferenceNumber ?? header?.ksefNumber ?? '';
      const invoiceNumber = header?.invoiceNumber ?? '';

      // Duplikat?
      if (ksefNumber) {
        const existing = await prisma.ksefInvoice.findFirst({ where: { ksefNumber } });
        if (existing) { skipped++; continue; }
      }

      const issueDate = header?.invoicingDate ?? header?.invoiceDate ?? header?.acquisitionDate ?? dateFrom;
      const sellerName = header?.subjectBy?.issuedByName ?? header?.subjectByName ?? header?.sellerName ?? '';
      const sellerNip = header?.subjectBy?.issuedByIdentifier ?? header?.subjectByIdentifier ?? header?.sellerNip ?? '';
      const grossAmount = parseFloat(header?.invoiceGrossValue ?? header?.grossValue ?? header?.totalAmount ?? '0') || 0;
      const netAmount = parseFloat(header?.invoiceNetValue ?? header?.netValue ?? '0') || 0;
      const vatAmount = grossAmount - netAmount;
      const description = JSON.stringify(header).toUpperCase();

      // Detekcja paliwa
      const isFuel = FUEL_KEYWORDS.some(kw =>
        sellerName.toUpperCase().includes(kw) || description.includes(kw)
      );

      await prisma.ksefInvoice.create({
        data: {
          ksefNumber,
          invoiceNumber,
          issueDate: new Date(issueDate),
          sellerName,
          sellerNip,
          grossAmount,
          netAmount,
          vatAmount,
          isFuel,
          rawData: JSON.stringify(header),
        },
      });
      imported++;
      if (isFuel) log(`  → FV paliwowa: ${invoiceNumber || ksefNumber} od ${sellerName}`);
    }

    log(`Import zakończony: ${imported} nowych, ${skipped} pominięto (duplikaty)`);

    // ============================================
    // KROK 6: Zamknięcie sesji
    // ============================================
    try {
      await fetch(`${baseUrl}/api/online/Session/Terminate`, {
        method: 'GET',
        headers: { 'SessionToken': sessionToken },
      });
      log('Sesja KSeF zamknięta');
    } catch {
      log('Ostrzeżenie: nie udało się zamknąć sesji KSeF (nie krytyczne)');
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      total: invoiceHeaders.length,
      logs,
    });

  } catch (error: any) {
    console.error('KSeF fetch error:', error);
    log(`Krytyczny błąd: ${error?.message}`);
    return NextResponse.json({
      error: `Błąd pobierania z KSeF: ${error?.message ?? 'Nieznany błąd'}`,
      logs,
    }, { status: 500 });
  }
}
