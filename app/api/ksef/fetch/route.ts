export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

// KSeF API v2 base URLs
const KSEF_URLS: Record<string, string> = {
  TEST: 'https://ksef-test.mf.gov.pl',
  PROD: 'https://ksef.mf.gov.pl',
};

export async function POST(request: Request) {
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

    // Get KSeF config
    const config = await prisma.ksefConfig.findFirst();
    if (!config || !config.active) {
      return NextResponse.json({ error: 'Integracja KSeF nie jest aktywna. Włącz ją w zakładce Konfiguracja.' }, { status: 400 });
    }
    if (!config.tokenEncrypted || !config.nip) {
      return NextResponse.json({ error: 'Brak tokenu lub NIP w konfiguracji KSeF' }, { status: 400 });
    }

    const baseUrl = KSEF_URLS[config.environment] || KSEF_URLS.TEST;
    const logs: string[] = [];
    const log = (msg: string) => { console.log(`KSeF: ${msg}`); logs.push(msg); };

    log(`Środowisko: ${config.environment} (${baseUrl})`);
    log(`NIP: ${config.nip}`);
    log(`Zakres dat: ${dateFrom} - ${dateTo}`);

    // ==============================
    // Step 1: Get authorization challenge
    // ==============================
    log('Krok 1: Pobieranie wyzwania autoryzacyjnego...');
    const challengeRes = await fetch(`${baseUrl}/api/online/Session/AuthorisationChallenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contextIdentifier: {
          type: 'onip',
          identifier: config.nip,
        },
      }),
    });

    if (!challengeRes.ok) {
      const errText = await challengeRes.text();
      log(`Błąd challenge: ${challengeRes.status} - ${errText}`);
      return NextResponse.json({
        error: `Błąd autoryzacji KSeF (challenge): ${challengeRes.status}`,
        details: errText,
        logs,
      }, { status: 502 });
    }

    const challengeData = await challengeRes.json();
    const challenge = challengeData?.challenge;
    const timestamp = challengeData?.timestamp;
    log(`Wyzwanie otrzymane: ${challenge?.substring(0, 20)}...`);

    // ==============================
    // Step 2: Init session with token
    // ==============================
    log('Krok 2: Inicjalizacja sesji z tokenem...');

    // Encrypt token with KSeF public key
    let encryptedToken = config.tokenEncrypted;

    // Try to get public key and encrypt
    try {
      const pubKeyRes = await fetch(`${baseUrl}/api/online/Session/CertificatePem`);
      if (pubKeyRes.ok) {
        const pubKeyPem = await pubKeyRes.text();
        log('Klucz publiczny KSeF pobrany');

        // Encrypt token with RSA-OAEP
        const encrypted = crypto.publicEncrypt(
          {
            key: pubKeyPem,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256',
          },
          Buffer.from(config.tokenEncrypted, 'utf-8')
        );
        encryptedToken = encrypted.toString('base64');
        log('Token zaszyfrowany kluczem publicznym KSeF');
      } else {
        log('Nie udało się pobrać klucza publicznego - używam tokenu bez szyfrowania');
      }
    } catch (e: any) {
      log(`Błąd szyfrowania tokenu: ${e?.message} - kontynuuję bez szyfrowania`);
    }

    // Build InitSessionTokenRequest XML
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
    <Token>${encryptedToken}</Token>
  </ns3:Context>
</ns3:InitSessionTokenRequest>`;

    const initRes = await fetch(`${baseUrl}/api/online/Session/InitToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: initXml,
    });

    if (!initRes.ok) {
      const errText = await initRes.text();
      log(`Błąd InitToken: ${initRes.status} - ${errText}`);
      return NextResponse.json({
        error: `Błąd autoryzacji KSeF (InitToken): ${initRes.status}`,
        details: errText,
        logs,
        hint: 'Sprawdź czy token KSeF jest poprawny i czy NIP się zgadza. Token można wygenerować na portalu KSeF.',
      }, { status: 502 });
    }

    const initData = await initRes.json();
    const sessionToken = initData?.sessionToken?.token;
    const referenceNumber = initData?.referenceNumber;
    log(`Sesja zainicjalizowana: ref=${referenceNumber}`);

    if (!sessionToken) {
      log('Brak session token w odpowiedzi');
      return NextResponse.json({
        error: 'Nie otrzymano tokenu sesji z KSeF',
        details: JSON.stringify(initData),
        logs,
      }, { status: 502 });
    }

    // ==============================
    // Step 3: Query invoices (purchase / cost)
    // ==============================
    log('Krok 3: Wyszukiwanie faktur kosztowych...');

    const queryBody = {
      queryCriteria: {
        subjectType: 'subject2', // purchase invoices (we are buyer)
        type: 'incremental',
        acquisitionTimestampThresholdFrom: `${dateFrom}T00:00:00`,
        acquisitionTimestampThresholdTo: `${dateTo}T23:59:59`,
      },
    };

    const queryRes = await fetch(`${baseUrl}/api/online/Query/Invoice/Sync?PageSize=100&PageOffset=0`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'SessionToken': sessionToken,
      },
      body: JSON.stringify(queryBody),
    });

    if (!queryRes.ok) {
      const errText = await queryRes.text();
      log(`Błąd query: ${queryRes.status} - ${errText}`);

      // Try async query as fallback
      log('Próba asynchronicznego wyszukiwania...');
      const asyncQueryRes = await fetch(`${baseUrl}/api/online/Query/Invoice/Async?PageSize=100&PageOffset=0`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'SessionToken': sessionToken,
        },
        body: JSON.stringify(queryBody),
      });

      if (!asyncQueryRes.ok) {
        const asyncErr = await asyncQueryRes.text();
        log(`Błąd async query: ${asyncQueryRes.status} - ${asyncErr}`);
        return NextResponse.json({
          error: `Błąd wyszukiwania faktur: ${queryRes.status}`,
          details: errText,
          logs,
        }, { status: 502 });
      }

      const asyncData = await asyncQueryRes.json();
      log(`Async query started: ${JSON.stringify(asyncData)}`);
    }

    const queryData = await queryRes.json();
    const invoiceHeaders = queryData?.invoiceHeaderList ?? [];
    log(`Znaleziono ${invoiceHeaders.length} faktur`);

    // ==============================
    // Step 4: Fetch individual invoices and save to DB
    // ==============================
    let imported = 0;
    let skipped = 0;

    for (const header of invoiceHeaders) {
      const ksefNumber = header?.invoiceReferenceNumber ?? header?.ksefReferenceNumber ?? '';
      const invoiceNumber = header?.invoiceNumber ?? '';

      // Check if already exists
      if (ksefNumber) {
        const existing = await prisma.ksefInvoice.findFirst({ where: { ksefNumber } });
        if (existing) {
          skipped++;
          continue;
        }
      }

      // Parse invoice data
      const issueDate = header?.invoicingDate ?? header?.invoiceDate ?? header?.acquisitionDate ?? dateFrom;
      const sellerName = header?.subjectBy?.issuedByName ?? header?.sellerName ?? '';
      const sellerNip = header?.subjectBy?.issuedByIdentifier ?? header?.sellerNip ?? '';
      const grossAmount = parseFloat(header?.invoiceGrossValue ?? header?.grossValue ?? '0') || 0;
      const netAmount = parseFloat(header?.invoiceNetValue ?? header?.netValue ?? '0') || 0;
      const vatAmount = grossAmount - netAmount;

      // Try to detect fuel invoices by seller name
      const fuelKeywords = ['BP', 'ORLEN', 'LOTOS', 'SHELL', 'CIRCLE K', 'AMIC', 'MOYA', 'STACJA', 'PALIW', 'FUEL', 'MOL'];
      const isFuel = fuelKeywords.some(kw =>
        sellerName.toUpperCase().includes(kw) ||
        (header?.description ?? '').toUpperCase().includes(kw)
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
    }

    log(`Zaimportowano: ${imported}, pominięto (duplikaty): ${skipped}`);

    // ==============================
    // Step 5: Close session
    // ==============================
    try {
      await fetch(`${baseUrl}/api/online/Session/Terminate`, {
        method: 'GET',
        headers: { 'SessionToken': sessionToken },
      });
      log('Sesja zamknięta');
    } catch {
      log('Nie udało się zamknąć sesji (nie krytyczne)');
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
    return NextResponse.json({
      error: `Błąd pobierania z KSeF: ${error?.message ?? 'Nieznany błąd'}`,
      details: error?.stack,
    }, { status: 500 });
  }
}
