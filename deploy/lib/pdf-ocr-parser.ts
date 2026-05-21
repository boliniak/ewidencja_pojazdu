/**
 * Offline parser faktur PDF
 * Wykorzystuje poppler (pdftotext/pdftoppm) + Tesseract OCR
 * Działa bez połączenia z internetem
 */
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, readdirSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const FUEL_KEYWORDS = ['BP', 'ORLEN', 'LOTOS', 'SHELL', 'CIRCLE K', 'CIRCLEK', 'AMIC', 'MOYA', 'MOL', 'TOTAL', 'AVIA'];
const FUEL_PRODUCT_KEYWORDS = ['BENZYNA', 'DIESEL', 'ON ', 'PB95', 'PB98', 'PB 95', 'PB 98', 'LPG', 'PALIW', 'OLEJ NAP', 'E5', 'E10', 'B7'];

export interface ParsedInvoice {
  invoiceNumber: string;
  issueDate: string;
  sellerName: string;
  sellerNip: string;
  grossAmount: number;
  netAmount: number;
  vatAmount: number;
  isFuel: boolean;
  fuelLiters: number | null;
  fuelPricePerLiter: number | null;
  ocrConfidence: string;
}

/**
 * Główna funkcja — parsuje PDF offline
 */
export async function parsePdfOffline(pdfBuffer: Buffer, fileName: string): Promise<ParsedInvoice[]> {
  const tmpDir = join('/tmp', `ocr-${randomUUID()}`);
  const pdfPath = join(tmpDir, 'input.pdf');

  try {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(pdfPath, pdfBuffer);

    // Krok 1: Próba ekstrakcji tekstu z PDF (szybka ścieżka dla cyfrowych PDF)
    let text = '';
    let ocrUsed = false;
    try {
      text = execSync(`pdftotext -layout "${pdfPath}" -`, {
        timeout: 15000,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      }).trim();
    } catch {
      text = '';
    }

    // Krok 2: Jeśli tekst za krótki — OCR (skan)
    if (text.length < 80) {
      ocrUsed = true;
      text = await ocrPdf(pdfPath, tmpDir);
    }

    if (!text || text.length < 30) {
      throw new Error('Nie udało się wyekstrahować tekstu z PDF');
    }

    console.log(`[PDF-OCR] Tekst wyekstrahowany (${text.length} znaków, OCR: ${ocrUsed}), plik: ${fileName}`);
    console.log(`[PDF-OCR] Fragment: ${text.substring(0, 300)}...`);

    // Krok 3: Parsowanie tekstu regexami
    const invoice = parseInvoiceText(text, ocrUsed);
    return [invoice];

  } finally {
    // Cleanup
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

/**
 * OCR: konwertuje PDF na obrazy i rozpoznaje tekst
 */
async function ocrPdf(pdfPath: string, tmpDir: string): Promise<string> {
  try {
    // PDF → PNG (300 DPI)
    execSync(`pdftoppm -png -r 300 "${pdfPath}" "${join(tmpDir, 'page')}"`, {
      timeout: 30000,
    });

    // Znajdź wygenerowane obrazy
    const images = readdirSync(tmpDir)
      .filter(f => f.startsWith('page') && f.endsWith('.png'))
      .sort();

    if (images.length === 0) {
      throw new Error('Nie udało się skonwertować PDF na obrazy');
    }

    // OCR każdej strony
    let fullText = '';
    for (const img of images) {
      const imgPath = join(tmpDir, img);
      try {
        const ocrText = execSync(
          `tesseract "${imgPath}" stdout -l pol --psm 6 2>/dev/null`,
          { timeout: 60000, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
        );
        fullText += ocrText + '\n';
      } catch (e: any) {
        console.error(`[PDF-OCR] Błąd OCR dla ${img}:`, e?.message);
      }
    }

    return fullText.trim();
  } catch (e: any) {
    console.error('[PDF-OCR] Błąd OCR pipeline:', e?.message);
    return '';
  }
}

/**
 * Parser tekstu faktury — wyciąga dane za pomocą regexów
 */
function parseInvoiceText(text: string, ocrUsed: boolean): ParsedInvoice {
  const upper = text.toUpperCase();

  // === NUMER FAKTURY ===
  const invoiceNumber = extractInvoiceNumber(text);

  // === DATA WYSTAWIENIA ===
  const issueDate = extractDate(text);

  // === NIP SPRZEDAWCY ===
  const sellerNip = extractNip(text);

  // === NAZWA SPRZEDAWCY ===
  const sellerName = extractSellerName(text, upper);

  // === KWOTY ===
  const { gross, net, vat } = extractAmounts(text);

  // === PALIWO ===
  const isFuel = detectFuel(upper, sellerName);
  let fuelLiters: number | null = null;
  let fuelPricePerLiter: number | null = null;

  if (isFuel) {
    const fuel = extractFuelData(text, upper, net);
    fuelLiters = fuel.liters;
    fuelPricePerLiter = fuel.pricePerLiter;
  }

  return {
    invoiceNumber,
    issueDate,
    sellerName,
    sellerNip,
    grossAmount: gross,
    netAmount: net,
    vatAmount: vat,
    isFuel,
    fuelLiters,
    fuelPricePerLiter,
    ocrConfidence: ocrUsed ? 'OCR' : 'digital',
  };
}

// ========================================
// Funkcje ekstrakcji poszczególnych pól
// ========================================

function extractInvoiceNumber(text: string): string {
  // Wzorce numerów faktur
  const patterns = [
    // "Faktura VAT nr FV/2026/04/001", "FAKTURA VAT NR: 123/2026"
    /faktura\s+(?:vat\s+)?(?:nr\.?|numer)?[\s:]*([^\n]{3,40})/i,
    // "Nr faktury: FV/123/2026"
    /nr\.?\s+(?:faktury|fv|dokumentu)[\s:]*([^\n]{3,40})/i,
    // "FV 123/2026" standalone
    /\b(FV[\s\/-]?\d{2,}[^\n]{0,30})/i,
    // Typowe formaty: "F 1184K3/1708/26", "I26140B1005229"
    /\b([A-Z]\d{2,}[A-Z]\d{3,}[^\s]{0,20})/,
    /\b([A-Z]{1,3}[\s\/]?\d{3,}[\s\/]?\d{2,}[^\s]{0,20})/,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) {
      let num = m[1].trim();
      // Wyczyść trailing whitespace i znaki
      num = num.replace(/\s{2,}.*$/, '').replace(/[,;]$/, '').trim();
      if (num.length >= 3 && num.length <= 40) return num;
    }
  }
  return '';
}

function extractDate(text: string): string {
  // Szukaj daty wystawienia
  const dateContextPatterns = [
    /data\s+wystawienia[\s:]*([\d]{1,2}[.\-\/][\d]{1,2}[.\-\/][\d]{2,4})/i,
    /data\s+sprzeda[żz]y[\s:]*([\d]{1,2}[.\-\/][\d]{1,2}[.\-\/][\d]{2,4})/i,
    /wystawion[aoy]?\s*(?:dnia)?[\s:]*([\d]{1,2}[.\-\/][\d]{1,2}[.\-\/][\d]{2,4})/i,
    /dnia[\s:]*([\d]{1,2}[.\-\/][\d]{1,2}[.\-\/][\d]{2,4})/i,
  ];

  for (const p of dateContextPatterns) {
    const m = text.match(p);
    if (m?.[1]) return normalizeDate(m[1]);
  }

  // Fallback: szukaj dowolnej daty w formacie DD.MM.YYYY
  const anyDate = text.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})/);
  if (anyDate) {
    return normalizeDate(anyDate[0]);
  }

  // Format YYYY-MM-DD
  const isoDate = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return isoDate[0];

  return new Date().toISOString().split('T')[0];
}

function normalizeDate(dateStr: string): string {
  const parts = dateStr.split(/[.\-\/]/);
  if (parts.length !== 3) return dateStr;

  let [a, b, c] = parts.map(p => p.trim());

  // Determine format
  if (a.length === 4) {
    // YYYY-MM-DD
    return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
  }
  // DD.MM.YYYY or DD.MM.YY
  if (c.length === 2) c = `20${c}`;
  return `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
}

function extractNip(text: string): string {
  // NIP z kontekstem
  const nipPatterns = [
    /NIP[\s:]*([\d][\d\s\-]{8,}[\d])/i,
    /(?:numer\s+identyfikacji|identyfikacja\s+podatkowa)[\s:]*([\d][\d\s\-]{8,}[\d])/i,
  ];

  for (const p of nipPatterns) {
    const m = text.match(p);
    if (m?.[1]) {
      const nip = m[1].replace(/[\s\-]/g, '');
      if (nip.length === 10 && /^\d{10}$/.test(nip)) return nip;
    }
  }

  // Fallback: szukaj 10-cyfrowego ciągu po "NIP"
  const fallback = text.match(/NIP[^\d]{0,5}(\d{3})[\s\-]?(\d{3})[\s\-]?(\d{2})[\s\-]?(\d{2})/i);
  if (fallback) {
    return fallback.slice(1).join('');
  }

  return '';
}

function extractSellerName(text: string, upper: string): string {
  // Sprawdź znane stacje paliw
  for (const kw of FUEL_KEYWORDS) {
    if (upper.includes(kw)) {
      // Szukaj pełnej nazwy w okolicy
      const idx = upper.indexOf(kw);
      // Weź linię z tą nazwą
      const lineStart = text.lastIndexOf('\n', idx) + 1;
      const lineEnd = text.indexOf('\n', idx);
      const line = text.substring(lineStart, lineEnd > 0 ? lineEnd : idx + 60).trim();
      if (line.length >= 3 && line.length <= 100) return line;
      return kw;
    }
  }

  // Szukaj po "Sprzedawca"
  const sellerPatterns = [
    /sprzedawca[\s:]*\n?\s*([^\n]{3,80})/i,
    /wystawca[\s:]*\n?\s*([^\n]{3,80})/i,
    /nazwa[\s:]*\n?\s*([^\n]{3,80})/i,
  ];

  for (const p of sellerPatterns) {
    const m = text.match(p);
    if (m?.[1]) {
      const name = m[1].trim();
      if (name.length >= 3) return name;
    }
  }

  return '';
}

function extractAmounts(text: string): { gross: number; net: number; vat: number } {
  let gross = 0;
  let net = 0;
  let vat = 0;

  // Kwota brutto
  const grossPatterns = [
    /(?:brutto|do\s+zap[łl]aty|razem\s+brutto|warto[śs][ćc]\s+brutto|suma\s+brutto|RAZEM)[\s:]*([\d][\d\s]*[.,]\d{2})/i,
    /([\d][\d\s]*[.,]\d{2})\s*(?:z[łl])?\s*(?:brutto)/i,
  ];
  for (const p of grossPatterns) {
    const m = text.match(p);
    if (m?.[1]) {
      const val = parsePolishNumber(m[1]);
      if (val > 0 && val > gross) gross = val;
    }
  }

  // Kwota netto
  const netPatterns = [
    /(?:netto|warto[śs][ćc]\s+netto|suma\s+netto|razem\s+netto)[\s:]*([\d][\d\s]*[.,]\d{2})/i,
    /([\d][\d\s]*[.,]\d{2})\s*(?:z[łl])?\s*(?:netto)/i,
  ];
  for (const p of netPatterns) {
    const m = text.match(p);
    if (m?.[1]) {
      const val = parsePolishNumber(m[1]);
      if (val > 0 && val > net) net = val;
    }
  }

  // VAT
  const vatPatterns = [
    /(?:kwota\s+vat|podatek\s+vat|suma\s+vat|vat)[\s:]*([\d][\d\s]*[.,]\d{2})/i,
    /([\d][\d\s]*[.,]\d{2})\s*(?:z[łl])?\s*(?:vat)/i,
  ];
  for (const p of vatPatterns) {
    const m = text.match(p);
    if (m?.[1]) {
      const val = parsePolishNumber(m[1]);
      if (val > 0 && val > vat) vat = val;
    }
  }

  // Fallback: oblicz brakujące
  if (gross > 0 && net > 0 && vat === 0) vat = Math.round((gross - net) * 100) / 100;
  if (gross > 0 && vat > 0 && net === 0) net = Math.round((gross - vat) * 100) / 100;
  if (net > 0 && vat > 0 && gross === 0) gross = Math.round((net + vat) * 100) / 100;

  // Jeśli nadal brak — szukaj największej kwoty w tekście jako brutto
  if (gross === 0) {
    const allAmounts = text.match(/\d[\d\s]*[.,]\d{2}/g) ?? [];
    const values = allAmounts.map(a => parsePolishNumber(a)).filter(v => v > 0);
    if (values.length > 0) {
      gross = Math.max(...values);
    }
  }

  return { gross, net, vat };
}

function detectFuel(upper: string, sellerName: string): boolean {
  const sellerUpper = sellerName.toUpperCase();
  // Sprawdź nazwę sprzedawcy
  if (FUEL_KEYWORDS.some(kw => sellerUpper.includes(kw) || upper.includes(kw))) return true;
  // Sprawdź produkty
  if (FUEL_PRODUCT_KEYWORDS.some(kw => upper.includes(kw))) return true;
  return false;
}

function extractFuelData(text: string, upper: string, netAmount: number): { liters: number | null; pricePerLiter: number | null } {
  let liters: number | null = null;
  let pricePerLiter: number | null = null;

  // Wzorce ilości litrów
  const literPatterns = [
    // "53,860 L" / "53.86 l" / "67,490 L"
    /(\d+[.,]\d{1,3})\s*(?:L|l|litr|litry|LTR|dm3)\b/,
    // "Ilość: 53,860" (z kontekstem paliwa w pobliżu)
    /ilo[śs][ćc][\s:]*([\d]+[.,]\d{1,3})/i,
    // "53,860 x 6,2100" (ilość x cena)
    /(\d+[.,]\d{2,3})\s*[xX×*]\s*\d+[.,]\d{2,4}/,
    // Po słowie kluczowym paliwa: "PB95   53,860"
    /(?:PB\s*9[58]|ON|DIESEL|BENZYNA|E[510]|B7|LPG)[^\d]{0,15}(\d+[.,]\d{2,3})/i,
  ];

  for (const p of literPatterns) {
    const m = text.match(p);
    if (m?.[1]) {
      const val = parsePolishNumber(m[1]);
      // Litry paliwa typowo: 5-200L
      if (val >= 1 && val <= 500) {
        liters = Math.round(val * 100) / 100;
        break;
      }
    }
  }

  // Wzorce ceny za litr
  const pricePatterns = [
    // "6,2100 zł/l" / "6.21 PLN/l"
    /(\d+[.,]\d{2,4})\s*(?:z[łl]|PLN)?\s*\/\s*(?:L|l|litr)/i,
    // "x 6,2100" (ilość x cena)
    /\d+[.,]\d{2,3}\s*[xX×*]\s*(\d+[.,]\d{2,4})/,
    // "cena jedn: 6,21" / "cena/l: 6.21"
    /cena\s*(?:jedn\.?|jednostkowa|\/?\s*l)[\s:]*([\d]+[.,]\d{2,4})/i,
    // "Cj netto: 6,21"
    /cj\.?\s*(?:netto)?[\s:]*([\d]+[.,]\d{2,4})/i,
  ];

  for (const p of pricePatterns) {
    const m = text.match(p);
    if (m?.[1]) {
      const val = parsePolishNumber(m[1]);
      // Cena paliwa typowo: 3-12 zł/L
      if (val >= 2 && val <= 15) {
        pricePerLiter = Math.round(val * 100) / 100;
        break;
      }
    }
  }

  // Fallback: oblicz cenę z kwoty netto i litrów
  if (liters && liters > 0 && !pricePerLiter && netAmount > 0) {
    pricePerLiter = Math.round((netAmount / liters) * 100) / 100;
  }

  // Fallback: oblicz litry z ceny i kwoty netto
  if (!liters && pricePerLiter && pricePerLiter > 0 && netAmount > 0) {
    liters = Math.round((netAmount / pricePerLiter) * 100) / 100;
  }

  return { liters, pricePerLiter };
}

function parsePolishNumber(str: string): number {
  // "1 234,56" → 1234.56
  const cleaned = str.replace(/\s/g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}
