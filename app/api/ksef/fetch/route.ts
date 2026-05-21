export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

// KSeF API v2 base URLs (nowe adresy od KSeF 2.0, stare domeny wyłączone 01.02.2026)
const KSEF_URLS: Record<string, string> = {
  TEST: 'https://api-test.ksef.mf.gov.pl',
  DEMO: 'https://api-demo.ksef.mf.gov.pl',
  PROD: 'https://api.ksef.mf.gov.pl',
};

// Safely parse response — handle both JSON and non-JSON
async function safeParseResponse(res: Response): Promise<{ json?: any; text: string; isJson: boolean }> {
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return { json, text, isJson: true };
  } catch {
    return { text, isJson: false };
  }
}

// Extract value from XML tag (case-insensitive)
function xmlVal(xml: string, tag: string): string {
  const regex = new RegExp(`<[^>]*${tag}[^>]*>([^<]*)<`, 'i');
  const m = xml.match(regex);
  return m?.[1]?.trim() ?? '';
}

// Sleep helper for polling
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

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
    log('Używam KSeF API v2');

    // ============================================
    // KROK 1: Pobranie klucza publicznego KSeF
    // ============================================
    log('Krok 1: Pobieranie klucza publicznego KSeF...');
    let ksefPublicKeyPem = '';
    let publicKeyId = '';

    try {
      const keysRes = await fetch(`${baseUrl}/api/v2/security/public-key-certificates`, {
        method: 'GET',
        headers: { 'Accept': 'application/json, application/xml, text/xml, */*' },
      });
      if (!keysRes.ok) {
        const errText = await keysRes.text();
        log(`Błąd pobierania klucza publicznego: HTTP ${keysRes.status} — ${errText.substring(0, 300)}`);
        return NextResponse.json({ error: `Błąd pobierania klucza publicznego KSeF: HTTP ${keysRes.status}`, details: errText.substring(0, 500), logs }, { status: 502 });
      }

      // Response may be JSON or XML — handle both
      const keysParsed = await safeParseResponse(keysRes);
      log(`Content-Type kluczy: ${keysRes.headers.get('content-type') ?? 'brak'}`);

      if (keysParsed.isJson) {
        // JSON response — look for certificate in structured data
        const keysData = keysParsed.json;
        // API v2 returns: { certificates: [{ usage: ["KsefTokenEncryption"], certificate: "...", keyId: "...", certificateId: "..." }] }
        // usage can be string or array
        const findTokenKey = (list: any[]) => list?.find?.((c: any) => {
          const u = c.usage;
          return u === 'KsefTokenEncryption' || (Array.isArray(u) && u.includes('KsefTokenEncryption'));
        });
        const tokenEncKey = findTokenKey(keysData?.certificates)
          || findTokenKey(keysData?.items)
          || (Array.isArray(keysData) ? findTokenKey(keysData) : null)
          || keysData?.certificates?.[0]
          || keysData?.[0];
        if (tokenEncKey?.pem || tokenEncKey?.certificate) {
          ksefPublicKeyPem = tokenEncKey.pem || tokenEncKey.certificate;
          publicKeyId = tokenEncKey.keyId || tokenEncKey.id || tokenEncKey.publicKeyId || '';
          log(`Klucz publiczny pobrany z JSON (keyId: ${publicKeyId || 'brak'}, usage: ${JSON.stringify(tokenEncKey.usage)})`);
        }
      }

      // If not found via JSON, try to extract PEM from raw text (works for XML and other formats)
      if (!ksefPublicKeyPem) {
        const rawText = keysParsed.text;
        log(`Odpowiedź kluczy (surowa, 300zn): ${rawText.substring(0, 300)}`);

        // Extract PEM block
        const pemMatch = rawText.match(/-----BEGIN[^-]*-----[\s\S]*?-----END[^-]*-----/);
        if (pemMatch) {
          ksefPublicKeyPem = pemMatch[0];
          log('Wyekstrahowano klucz PEM z odpowiedzi');
        }

        // Extract base64-encoded certificate from XML tags
        if (!ksefPublicKeyPem) {
          // Try common XML tags: <pem>, <certificate>, <X509Certificate>, <value>
          const certMatch = rawText.match(/<(?:pem|certificate|X509Certificate|value|cert)>([^<]+)<\//i);
          if (certMatch?.[1]) {
            const certBase64 = certMatch[1].trim();
            // Wrap in PEM format
            ksefPublicKeyPem = `-----BEGIN CERTIFICATE-----\n${certBase64}\n-----END CERTIFICATE-----`;
            log('Wyekstrahowano certyfikat z XML i opakowano w PEM');
          }
        }

        // Extract publicKeyId from XML
        if (!publicKeyId) {
          const idMatch = rawText.match(/<(?:id|publicKeyId|keyId)>([^<]+)<\//i);
          if (idMatch?.[1]) {
            publicKeyId = idMatch[1].trim();
          }
        }
      }

      if (!ksefPublicKeyPem) {
        return NextResponse.json({
          error: 'Nie znaleziono klucza publicznego KSeF w odpowiedzi',
          details: keysParsed.text.substring(0, 500),
          logs,
        }, { status: 502 });
      }
    } catch (e: any) {
      log(`Błąd połączenia: ${e?.message}`);
      return NextResponse.json({ error: 'Nie można połączyć się z serwerem KSeF.', logs }, { status: 502 });
    }

    // ============================================
    // KROK 2: AuthChallenge (API v2)
    // ============================================
    log('Krok 2: Pobieranie wyzwania autoryzacyjnego (v2)...');
    let challengeRes: Response;
    try {
      challengeRes = await fetch(`${baseUrl}/api/v2/auth/challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({}),
      });
    } catch (e: any) {
      log(`Błąd połączenia z KSeF: ${e?.message}`);
      return NextResponse.json({ error: 'Nie można połączyć się z serwerem KSeF.', logs }, { status: 502 });
    }

    const challengeParsed = await safeParseResponse(challengeRes);
    if (!challengeRes.ok) {
      log(`Błąd challenge: HTTP ${challengeRes.status} — ${challengeParsed.text.substring(0, 500)}`);
      return NextResponse.json({ error: `Błąd autoryzacji KSeF (challenge): HTTP ${challengeRes.status}`, details: challengeParsed.text.substring(0, 1000), logs }, { status: 502 });
    }

    let challenge = '';
    let timestampMs = '';
    if (challengeParsed.isJson) {
      challenge = challengeParsed.json?.challenge ?? '';
      timestampMs = challengeParsed.json?.timestampMs ?? challengeParsed.json?.timestamp ?? '';
    } else {
      // XML fallback
      challenge = xmlVal(challengeParsed.text, 'challenge') || xmlVal(challengeParsed.text, 'Challenge');
      timestampMs = xmlVal(challengeParsed.text, 'timestampMs') || xmlVal(challengeParsed.text, 'TimestampMs') || xmlVal(challengeParsed.text, 'timestamp');
      log(`Challenge z XML: challenge=${challenge ? 'OK' : 'brak'}, ts=${timestampMs || 'brak'}`);
    }

    if (!challenge) {
      log(`Brak challenge w odpowiedzi: ${challengeParsed.text.substring(0, 500)}`);
      return NextResponse.json({ error: 'Brak wyzwania w odpowiedzi KSeF', details: challengeParsed.text.substring(0, 500), logs }, { status: 502 });
    }
    log(`Wyzwanie otrzymane, timestampMs: ${timestampMs}`);

    // ============================================
    // KROK 3: Szyfrowanie tokenu (token|timestampMs)
    // ============================================
    log('Krok 3: Szyfrowanie tokenu...');
    let encryptedTokenBase64 = '';

    try {
      const tokenPayload = `${config.tokenEncrypted}|${timestampMs}`;

      // Normalize PEM — ensure proper line breaks (64 chars per line)
      let pemKey = ksefPublicKeyPem.trim();

      // If it's raw base64 without PEM headers, wrap it as a CERTIFICATE
      if (!pemKey.startsWith('-----')) {
        // Remove any whitespace/newlines from raw base64
        const cleanB64 = pemKey.replace(/\s+/g, '');
        // Wrap with proper 64-char line breaks
        const lines = cleanB64.match(/.{1,64}/g) || [];
        pemKey = `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
        log('Opakowano surowy Base64 w format PEM CERTIFICATE');
      } else {
        // Has PEM headers — ensure body has proper 64-char line breaks
        const headerMatch = pemKey.match(/(-----BEGIN[^-]+-----)([\s\S]*?)(-----END[^-]+-----)/);
        if (headerMatch) {
          const cleanB64 = headerMatch[2].replace(/\s+/g, '');
          const lines = cleanB64.match(/.{1,64}/g) || [];
          pemKey = `${headerMatch[1]}\n${lines.join('\n')}\n${headerMatch[3]}`;
        }
      }

      // Extract the actual PUBLIC KEY from the X.509 certificate
      // crypto.publicEncrypt may fail with CERTIFICATE PEM on some Node.js versions
      let encryptionKey: crypto.KeyObject | string;
      try {
        encryptionKey = crypto.createPublicKey({
          key: pemKey,
          format: 'pem',
        });
        log('Wyekstrahowano klucz publiczny z certyfikatu X.509');
      } catch (extractErr: any) {
        log(`Uwaga: nie udało się wyekstrahować klucza (${extractErr?.message}), próbuję bezpośrednio PEM`);
        encryptionKey = pemKey;
      }

      const encrypted = crypto.publicEncrypt(
        {
          key: encryptionKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        Buffer.from(tokenPayload, 'utf-8')
      );
      encryptedTokenBase64 = encrypted.toString('base64');
      log('Token zaszyfrowany kluczem publicznym KSeF (RSA-OAEP SHA-256)');
    } catch (e: any) {
      log(`Błąd szyfrowania: ${e?.message}`);
      return NextResponse.json({
        error: 'Błąd szyfrowania tokenu KSeF. Sprawdź czy token jest poprawny.',
        details: e?.message,
        logs,
      }, { status: 500 });
    }

    // ============================================
    // KROK 4: Autoryzacja tokenem KSeF (POST /auth/ksef-token)
    // ============================================
    log('Krok 4: Autoryzacja tokenem KSeF...');
    const authTokenBody: any = {
      challenge,
      contextIdentifier: {
        type: 'Nip',
        value: config.nip,
      },
      encryptedToken: encryptedTokenBase64,
    };
    if (publicKeyId) {
      authTokenBody.publicKeyId = publicKeyId;
    }

    let authRes: Response;
    try {
      authRes = await fetch(`${baseUrl}/api/v2/auth/ksef-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(authTokenBody),
      });
    } catch (e: any) {
      log(`Błąd połączenia auth/ksef-token: ${e?.message}`);
      return NextResponse.json({ error: 'Błąd połączenia z KSeF (auth/ksef-token)', logs }, { status: 502 });
    }

    const authParsed = await safeParseResponse(authRes);
    if (!authRes.ok && authRes.status !== 202) {
      log(`Błąd auth/ksef-token: HTTP ${authRes.status}`);
      log(`Odpowiedź: ${authParsed.text.substring(0, 500)}`);
      return NextResponse.json({
        error: `Błąd autoryzacji KSeF: HTTP ${authRes.status}`,
        details: authParsed.text.substring(0, 1000),
        logs,
        hint: 'Sprawdź czy token KSeF jest poprawny i aktualny. Token generujesz w MCU na portalu KSeF. Upewnij się, że NIP w konfiguracji zgadza się z NIP dla którego wygenerowano token.',
      }, { status: 502 });
    }

    let authenticationToken = '';
    let referenceNumber = '';
    if (authParsed.isJson) {
      authenticationToken = authParsed.json?.authenticationToken?.token ?? authParsed.json?.authenticationToken ?? '';
      referenceNumber = authParsed.json?.referenceNumber ?? '';
    } else {
      authenticationToken = xmlVal(authParsed.text, 'token') || xmlVal(authParsed.text, 'authenticationToken');
      referenceNumber = xmlVal(authParsed.text, 'referenceNumber') || xmlVal(authParsed.text, 'ReferenceNumber');
    }

    if (!authenticationToken) {
      log(`Brak authenticationToken w odpowiedzi: ${authParsed.text.substring(0, 500)}`);
      return NextResponse.json({ error: 'KSeF nie zwrócił tokenu autoryzacji', details: authParsed.text.substring(0, 500), logs }, { status: 502 });
    }
    log(`Autoryzacja przyjęta, referenceNumber: ${referenceNumber}`);

    // ============================================
    // KROK 5: Sprawdzenie statusu autoryzacji (polling)
    // ============================================
    log('Krok 5: Oczekiwanie na potwierdzenie autoryzacji...');
    let authConfirmed = false;
    for (let attempt = 0; attempt < 15; attempt++) {
      await sleep(2000);
      try {
        const statusRes = await fetch(`${baseUrl}/api/v2/auth/${referenceNumber}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authenticationToken}`,
            'Accept': 'application/json',
          },
        });
        if (statusRes.status === 200) {
          authConfirmed = true;
          log('Autoryzacja potwierdzona');
          break;
        } else if (statusRes.status === 202) {
          // Still processing
          log(`Autoryzacja w toku (próba ${attempt + 1})...`);
        } else {
          const statusText = await statusRes.text();
          log(`Status autoryzacji: HTTP ${statusRes.status} — ${statusText.substring(0, 200)}`);
          // 4xx means error, stop
          if (statusRes.status >= 400) break;
        }
      } catch (e: any) {
        log(`Błąd sprawdzania statusu: ${e?.message}`);
      }
    }

    if (!authConfirmed) {
      return NextResponse.json({ error: 'Timeout — autoryzacja KSeF nie została potwierdzona w ciągu 30s', logs }, { status: 504 });
    }

    // ============================================
    // KROK 6: Wymiana na accessToken (POST /auth/token/redeem)
    // ============================================
    log('Krok 6: Wymiana tokenu na accessToken...');
    let accessToken = '';

    try {
      const redeemRes = await fetch(`${baseUrl}/api/v2/auth/token/redeem`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authenticationToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const redeemParsed = await safeParseResponse(redeemRes);
      if (!redeemRes.ok) {
        log(`Błąd token/redeem: HTTP ${redeemRes.status} — ${redeemParsed.text.substring(0, 300)}`);
        return NextResponse.json({ error: `Błąd wymiany tokenu: HTTP ${redeemRes.status}`, details: redeemParsed.text.substring(0, 500), logs }, { status: 502 });
      }

      if (redeemParsed.isJson) {
        // Response structure: { accessToken: { token: "jwt...", validUntil: "..." }, refreshToken: "..." }
        const atObj = redeemParsed.json?.accessToken;
        if (typeof atObj === 'object' && atObj?.token) {
          accessToken = atObj.token;
        } else if (typeof atObj === 'string') {
          accessToken = atObj;
        }
        // Also try top-level token field
        if (!accessToken) {
          accessToken = redeemParsed.json?.token ?? '';
        }
      } else {
        accessToken = xmlVal(redeemParsed.text, 'token') || xmlVal(redeemParsed.text, 'accessToken') || xmlVal(redeemParsed.text, 'AccessToken');
      }
      if (!accessToken) {
        log(`Brak accessToken w odpowiedzi redeem: ${redeemParsed.text.substring(0, 500)}`);
        return NextResponse.json({ error: 'KSeF nie zwrócił accessToken', details: redeemParsed.text.substring(0, 500), logs }, { status: 502 });
      }
      log(`AccessToken JWT otrzymany (długość: ${accessToken.length}, prefix: ${accessToken.substring(0, 20)}...)`);
    } catch (e: any) {
      log(`Błąd token/redeem: ${e?.message}`);
      return NextResponse.json({ error: 'Błąd wymiany tokenu KSeF', logs }, { status: 502 });
    }

    // ============================================
    // KROK 7: Wyszukiwanie faktur (POST /invoices/query/metadata)
    // ============================================
    log('Krok 7: Wyszukiwanie faktur kosztowych...');
    // API v2 enum values are PascalCase: Subject1 (seller), Subject2 (buyer), Subject3, SubjectAuthorized
    // dateType: Issue, Invoicing, PermanentStorage
    const queryBody = {
      subjectType: 'Subject2',
      dateRange: {
        dateType: 'Invoicing',
        from: `${dateFrom}T00:00:00Z`,
        to: `${dateTo}T23:59:59Z`,
      },
    };

    let allInvoices: any[] = [];
    let pageOffset = 0;
    const pageSize = 100;
    let hasMore = true;

    while (hasMore) {
      let queryRes: Response;
      try {
        queryRes = await fetch(`${baseUrl}/api/v2/invoices/query/metadata?PageSize=${pageSize}&PageOffset=${pageOffset}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify(queryBody),
        });
      } catch (e: any) {
        log(`Błąd wyszukiwania faktur: ${e?.message}`);
        return NextResponse.json({ error: 'Błąd wyszukiwania faktur w KSeF', logs }, { status: 502 });
      }

      const queryParsed = await safeParseResponse(queryRes);
      if (!queryRes.ok) {
        log(`Błąd zapytania faktur: HTTP ${queryRes.status}`);
        log(`Odpowiedź: ${queryParsed.text.substring(0, 500)}`);
        return NextResponse.json({
          error: `Błąd wyszukiwania faktur: HTTP ${queryRes.status}`,
          details: queryParsed.text.substring(0, 500),
          logs,
        }, { status: 502 });
      }

      // Parse invoices from response
      const invoices = queryParsed.json?.invoiceHeaderList
        ?? queryParsed.json?.invoices
        ?? queryParsed.json?.items
        ?? queryParsed.json?.elements
        ?? [];
      allInvoices = allInvoices.concat(invoices);

      log(`Strona ${pageOffset / pageSize + 1}: ${invoices.length} faktur (razem: ${allInvoices.length})`);

      // API v2 uses hasMore boolean in response
      const responseHasMore = queryParsed.json?.hasMore ?? false;
      if (!responseHasMore || invoices.length === 0) {
        hasMore = false;
      } else {
        pageOffset += pageSize;
      }
    }

    log(`Znaleziono łącznie ${allInvoices.length} faktur w KSeF`);

    // ============================================
    // KROK 8: Import faktur do bazy
    // ============================================
    const FUEL_KEYWORDS = ['BP', 'ORLEN', 'LOTOS', 'SHELL', 'CIRCLE K', 'AMIC', 'MOYA', 'STACJA PALIW', 'FUEL', 'MOL', 'TOTAL', 'BENZYNA', 'DIESEL', 'ON ', 'PB95', 'PB98', 'LPG'];

    let imported = 0;
    let skipped = 0;
    let updated = 0;

    for (const header of allInvoices) {
      // API v2 InvoiceMetadata fields:
      // ksefNumber (object with value), invoiceNumber, issueDate, invoicingDate,
      // seller: { nip, name }, buyer: { identifier: { type, value }, name },
      // grossAmount, netAmount, vatAmount
      const ksefNumberObj = header?.ksefNumber;
      const ksefNumber = typeof ksefNumberObj === 'object' ? (ksefNumberObj?.value ?? ksefNumberObj?.number ?? '') : (ksefNumberObj ?? header?.ksefReferenceNumber ?? '');
      const invoiceNumber = header?.invoiceNumber ?? '';

      // Duplikat? Jeśli istnieje ale brakuje litrów paliwa — uzupełnij
      let existingInvoice: any = null;
      if (ksefNumber) {
        existingInvoice = await prisma.ksefInvoice.findFirst({ where: { ksefNumber } });
        if (existingInvoice && existingInvoice.fuelLiters) {
          // Kompletny duplikat — mamy już litry
          skipped++;
          continue;
        }
        // Jeśli existingInvoice istnieje ale brak litrów — kontynuuj żeby uzupełnić
      }

      // API v2: issueDate (YYYY-MM-DD), seller: { nip, name }, grossAmount/netAmount/vatAmount (numbers)
      const issueDate = header?.issueDate ?? header?.invoicingDate ?? dateFrom;
      const sellerName = header?.seller?.name ?? '';
      const sellerNip = typeof header?.seller?.nip === 'object' ? (header?.seller?.nip?.value ?? '') : (header?.seller?.nip ?? '');
      const grossAmount = parseFloat(String(header?.grossAmount ?? header?.invoiceGrossValue ?? '0')) || 0;
      const netAmount = parseFloat(String(header?.netAmount ?? header?.invoiceNetValue ?? '0')) || 0;
      const vatAmount = parseFloat(String(header?.vatAmount ?? '0')) || (grossAmount - netAmount);
      const description = JSON.stringify(header).toUpperCase();

      // Detekcja paliwa
      const isFuel = FUEL_KEYWORDS.some(kw =>
        sellerName.toUpperCase().includes(kw) || description.includes(kw)
      );

      // Dla faktur paliwowych — próbuj pobrać XML i wyekstrahować litry
      let fuelLiters: number | null = null;
      let fuelPricePerLiter: number | null = null;

      if (isFuel && ksefNumber) {
        try {
          log(`  → Pobieranie XML faktury paliwowej: ${ksefNumber}...`);
          const ksefNumStr = typeof ksefNumberObj === 'object' ? (ksefNumberObj?.value ?? ksefNumber) : ksefNumber;
          const xmlRes = await fetch(`${baseUrl}/api/v2/invoices/ksef/${encodeURIComponent(ksefNumStr)}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/xml, text/xml, */*',
            },
          });
          if (xmlRes.ok) {
            const contentType = xmlRes.headers.get('content-type') ?? '';
            const xmlText = await xmlRes.text();
            log(`    XML pobrany (${xmlText.length} B, Content-Type: ${contentType})`);

            // Parse quantities from FA(3) XML structure
            // <FaWiersz> contains: <Ilosc>, <JednMiara>, <CenaJednostkowa>
            // FA(2) uses: <P_8B> (quantity), <P_8A> (unit), <P_9A>/<P_9B> (price)
            const qtyMatches = xmlText.match(/<(?:Ilosc|P_8B)>\s*([\d.,]+)\s*<\//gi);
            const unitMatches = xmlText.match(/<(?:JednMiara|P_8A)>\s*([^<]+)\s*<\//gi);
            const priceMatches = xmlText.match(/<(?:CenaJednostkowa|P_9A|CenaJedn|P_9B)>\s*([\d.,]+)\s*<\//gi);

            log(`    Znaleziono ilości: ${qtyMatches?.length ?? 0}, jednostki: ${unitMatches?.length ?? 0}, ceny: ${priceMatches?.length ?? 0}`);

            if (qtyMatches && qtyMatches.length > 0) {
              let totalLiters = 0;
              for (let qi = 0; qi < qtyMatches.length; qi++) {
                const qtyStr = qtyMatches[qi].replace(/<[^>]+>/g, '').replace(',', '.').trim();
                const qty = parseFloat(qtyStr) || 0;
                const unitStr = unitMatches?.[qi]?.replace(/<[^>]+>/g, '').trim() ?? '';
                log(`    Pozycja ${qi + 1}: ilość=${qty}, jednostka='${unitStr}'`);
                // Accept liters: L, l, litr, litry, LTR, LITR, dm3, or empty (assume liters for fuel)
                if (!unitStr || /^(L|l|litr|litry|LTR|LITR|dm3|dm³)$/i.test(unitStr)) {
                  totalLiters += qty;
                }
              }
              if (totalLiters > 0) {
                fuelLiters = Math.round(totalLiters * 100) / 100;
                if (fuelLiters > 0 && netAmount > 0) {
                  fuelPricePerLiter = Math.round((netAmount / fuelLiters) * 100) / 100;
                } else if (priceMatches?.[0]) {
                  const priceStr = priceMatches[0].replace(/<[^>]+>/g, '').replace(',', '.').trim();
                  fuelPricePerLiter = parseFloat(priceStr) || null;
                }
                log(`    ✓ Litry: ${fuelLiters} L, cena/L: ${fuelPricePerLiter ?? '?'} zł`);
              } else {
                log(`    ✗ Nie znaleziono litrów (nieznane jednostki)`);
              }
            } else {
              // Fallback: szukaj wzorca liczbowego w kontekście paliwa
              log(`    ✗ Brak tagów Ilosc/P_8B w XML`);
              // Log short fragment for debugging
              const snippet = xmlText.substring(0, 500).replace(/\n/g, ' ');
              log(`    Fragment XML: ${snippet}...`);
            }
          } else {
            const errBody = await xmlRes.text().catch(() => '');
            log(`    Nie udało się pobrać XML (HTTP ${xmlRes.status}): ${errBody.substring(0, 200)}`);
          }
          // Rate limiting: wait 200ms between XML downloads
          await sleep(200);
        } catch (xmlErr: any) {
          log(`    Błąd pobierania XML: ${xmlErr?.message}`);
        }
      }

      if (existingInvoice) {
        // Aktualizuj istniejącą fakturę — uzupełnij brakujące litry
        await prisma.ksefInvoice.update({
          where: { id: existingInvoice.id },
          data: {
            isFuel,
            ...(fuelLiters ? { fuelLiters } : {}),
            ...(fuelPricePerLiter ? { fuelPricePerLiter } : {}),
          },
        });
        updated++;
        if (fuelLiters) log(`  → Uzupełniono litry: ${invoiceNumber || ksefNumber} — ${fuelLiters} L`);
      } else {
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
            fuelLiters,
            fuelPricePerLiter,
            rawData: JSON.stringify(header),
          },
        });
        imported++;
      }
      if (isFuel) log(`  → FV paliwowa: ${invoiceNumber || ksefNumber} od ${sellerName} — ${fuelLiters ?? '?'} L`);
    }

    log(`Import zakończony: ${imported} nowych, ${updated} zaktualizowanych, ${skipped} pominięto`);

    return NextResponse.json({
      success: true,
      imported,
      updated,
      skipped,
      total: allInvoices.length,
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
