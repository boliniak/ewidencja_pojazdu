/**
 * Offline parser faktur PDF
 * Wykorzystuje poppler (pdftotext/pdftoppm) + ImageMagick + Tesseract OCR
 * Działa bez połączenia z internetem
 */
import { execSync } from 'child_process';
import { writeFileSync, readdirSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const FUEL_SELLER_KEYWORDS = ['BP', 'ORLEN', 'LOTOS', 'SHELL', 'CIRCLE K', 'CIRCLEK', 'AMIC', 'MOYA', 'MOL', 'TOTAL', 'AVIA'];
const FUEL_PRODUCT_KEYWORDS = ['BENZYNA', 'DIESEL', 'PB95', 'PB98', 'PB 95', 'PB 98', 'LPG', 'PALIW', 'OLEJ NAP', 'E5', 'E10', 'B7'];

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

    // Krok 1: Próba ekstrakcji tekstu z cyfrowego PDF
    let text = '';
    let ocrUsed = false;
    try {
      text = execSync(`pdftotext -layout "${pdfPath}" -`, {
        timeout: 15000, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024,
      }).trim();
    } catch { text = ''; }

    // Krok 2: Jeśli tekst za krótki — skan, użyj OCR
    if (text.length < 80) {
      ocrUsed = true;
      text = ocrPdfWithPreprocessing(pdfPath, tmpDir);
    }

    if (!text || text.length < 30) {
      throw new Error('Nie udało się wyekstrahować tekstu z PDF. Plik może być uszkodzony lub pusty.');
    }

    console.log(`[PDF-OCR] Tekst: ${text.length} znaków, metoda: ${ocrUsed ? 'OCR' : 'digital'}, plik: ${fileName}`);
    console.log(`[PDF-OCR] ---START---\n${text}\n---END---`);

    // Krok 3: Parsowanie tekstu
    const invoice = parseInvoiceText(text, ocrUsed);
    return [invoice];

  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

/**
 * OCR pipeline z preprocessingiem obrazu
 */
function ocrPdfWithPreprocessing(pdfPath: string, tmpDir: string): string {
  try {
    // PDF → PNG 300 DPI
    execSync(`pdftoppm -png -r 300 "${pdfPath}" "${join(tmpDir, 'page')}"`, { timeout: 30000 });

    const images = readdirSync(tmpDir)
      .filter(f => f.startsWith('page') && f.endsWith('.png'))
      .sort();

    if (images.length === 0) throw new Error('Nie udało się skonwertować PDF na obrazy');

    let fullText = '';
    for (const img of images) {
      const imgPath = join(tmpDir, img);
      const prepPath = join(tmpDir, `prep-${img}`);

      // Preprocessing ImageMagick: grayscale + delikatny kontrast + wyostrzenie
      try {
        execSync(
          `convert "${imgPath}" -colorspace Gray -contrast-stretch 1%x1% -sharpen 0x0.5 -adaptive-sharpen 0x1 "${prepPath}"`,
          { timeout: 30000 }
        );
      } catch {
        // Fallback: bez preprocessingu
        execSync(`cp "${imgPath}" "${prepPath}"`);
      }

      // Tesseract z --psm 6 (uniform block of text) i polskim językiem
      try {
        const ocrText = execSync(
          `tesseract "${prepPath}" stdout -l pol --psm 6 2>/dev/null`,
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
 * Parser tekstu faktury
 */
function parseInvoiceText(text: string, ocrUsed: boolean): ParsedInvoice {
  const upper = text.toUpperCase();
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const invoiceNumber = extractInvoiceNumber(text, lines);
  const issueDate = extractDate(text);
  const sellerNip = extractSellerNip(text, lines);
  const sellerName = extractSellerName(text, upper, lines);
  const { gross, net, vat } = extractAmounts(text, upper);
  const isFuel = detectFuel(upper, sellerName);

  let fuelLiters: number | null = null;
  let fuelPricePerLiter: number | null = null;
  if (isFuel) {
    const fuel = extractFuelData(text, upper, net || gross);
    fuelLiters = fuel.liters;
    fuelPricePerLiter = fuel.pricePerLiter;
  }

  console.log(`[PDF-OCR] Wynik parsowania:`, JSON.stringify({
    invoiceNumber, issueDate, sellerName, sellerNip,
    gross, net, vat, isFuel, fuelLiters, fuelPricePerLiter
  }));

  return {
    invoiceNumber, issueDate, sellerName, sellerNip,
    grossAmount: gross, netAmount: net, vatAmount: vat,
    isFuel, fuelLiters, fuelPricePerLiter,
    ocrConfidence: ocrUsed ? 'OCR' : 'digital',
  };
}

// ========================================
// EKSTRAKCJA PÓL
// ========================================

function extractInvoiceNumber(text: string, lines: string[]): string {
  // Szukaj "FAKTURA NR:" lub "Nr faktury" — numer może być w tej samej lub następnej linii
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // "FAKTURA NR: FV/123/2026" w jednej linii
    const sameLineMatch = line.match(/faktura\s+(?:vat\s+)?nr\.?[\s:]+(.{3,40})/i);
    if (sameLineMatch?.[1]) {
      const num = sameLineMatch[1].trim();
      if (num.length >= 3) return num;
    }
    // "FAKTURA NR:" na końcu linii — numer w następnej
    if (/faktura\s+(?:vat\s+)?nr\.?\s*:?\s*$/i.test(line) && i + 1 < lines.length) {
      // Następna linia to potencjalny numer faktury (może być zaszumiony OCR)
      const nextLine = lines[i + 1].trim();
      if (nextLine.length >= 3 && nextLine.length <= 50) return nextLine;
    }
    // "Nr dokumentu: XXX"
    const nrDocMatch = line.match(/nr\.?\s+(?:dokumentu|faktury|fv)[\s:]+(.{3,40})/i);
    if (nrDocMatch?.[1]) return nrDocMatch[1].trim();
  }

  // Fallback: szukaj wzorca alfanumerycznego z /
  const slashPattern = text.match(/\b([A-Z]{1,4}[\s\/]\d{3,}[\s\/][\d\/]{2,}[^\s]{0,10})\b/);
  if (slashPattern?.[1]) return slashPattern[1].trim();

  // Ostatni fallback: numer pod "FAKTURA" jeśli go nie udało się znaleźć
  return '';
}

function extractDate(text: string): string {
  // Priorytet: data sprzedaży/wystawienia
  const dateContextPatterns = [
    /data\s+sprzeda[żz]y[\s:]*([\d]{4}[.\-\/][\d]{1,2}[.\-\/][\d]{1,2})/i,
    /data\s+sprzeda[żz]y[\s:]*([\d]{1,2}[.\-\/][\d]{1,2}[.\-\/][\d]{2,4})/i,
    /data\s+wystawieni[aą][\s:]*(?:faktury\s+)?([\d]{4}[.\-\/][\d]{1,2}[.\-\/][\d]{1,2})/i,
    /data\s+wystawieni[aą][\s:]*(?:faktury\s+)?([\d]{1,2}[.\-\/][\d]{1,2}[.\-\/][\d]{2,4})/i,
    /wystawion[aoy]?\s*(?:dnia)?[\s:]*([\d]{1,2}[.\-\/][\d]{1,2}[.\-\/][\d]{2,4})/i,
  ];

  for (const p of dateContextPatterns) {
    const m = text.match(p);
    if (m?.[1]) return normalizeDate(m[1]);
  }

  // Fallback: szukaj daty ISO
  const isoDate = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return isoDate[0];

  // Fallback: dowolna data DD.MM.YYYY
  const anyDate = text.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})/);
  if (anyDate) return normalizeDate(anyDate[0]);

  return new Date().toISOString().split('T')[0];
}

function normalizeDate(dateStr: string): string {
  const parts = dateStr.split(/[.\-\/]/);
  if (parts.length !== 3) return dateStr;
  let [a, b, c] = parts.map(p => p.trim());
  if (a.length === 4) return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
  if (c.length === 2) c = `20${c}`;
  return `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
}

function extractSellerNip(text: string, lines: string[]): string {
  // Szukaj NIP z kontekstem — PIERWSZY NIP w dokumencie to zwykle NIP sprzedawcy
  // Pomiń NIP nabywcy
  for (const line of lines) {
    // Pomiń linie z "nabywc" 
    if (/nabyw/i.test(line)) continue;
    const nipMatch = line.match(/NIP[\s:]*([\d][\d\s\-]{8,}[\d])/i);
    if (nipMatch?.[1]) {
      const nip = nipMatch[1].replace(/[\s\-]/g, '');
      if (nip.length === 10 && /^\d{10}$/.test(nip)) return nip;
    }
  }

  // Fallback: pierwszy 10-cyfrowy ciąg po "NIP"
  const fallback = text.match(/NIP[^\d]{0,5}(\d{3})[\s\-]?(\d{3})[\s\-]?(\d{2})[\s\-]?(\d{2})/i);
  if (fallback) return fallback.slice(1).join('');

  return '';
}

function extractSellerName(text: string, upper: string, lines: string[]): string {
  // Znane stacje paliw / firmy — szukaj ich nazwy
  const knownSellers: Record<string, string> = {
    'BP EUROPA': 'BP Europa SE Oddział w Polsce',
    'CIRCLE K': 'Circle K Polska',
    'SHELL': 'Shell Polska',
    'PKN ORLEN': 'PKN ORLEN S.A.',
    'ORLEN': 'PKN ORLEN S.A.',
    'LOTOS': 'LOTOS S.A.',
    'MOYA': 'MOYA S.A.',
    'AMIC': 'AMIC Polska',
    'MOL': 'MOL Polska',
    'TOTAL': 'Total Energies',
    'AVIA': 'AVIA',
  };

  for (const [keyword, fullName] of Object.entries(knownSellers)) {
    if (upper.includes(keyword)) {
      // Spróbuj znaleźć pełną linię z tą nazwą
      for (const line of lines) {
        if (line.toUpperCase().includes(keyword) && line.length >= 5 && line.length <= 80) {
          // Czyść typowe artefakty OCR
          return line.replace(/[|=\[\]{}]/g, '').trim() || fullName;
        }
      }
      return fullName;
    }
  }

  // Szukaj po "Sprzedawca:"
  const sellerMatch = text.match(/sprzedawca[\s:]*\n?\s*([^\n]{3,80})/i);
  if (sellerMatch?.[1]) return sellerMatch[1].trim();

  // Pierwsza linia dokumentu (często nazwa firmy)
  if (lines[0] && lines[0].length >= 3 && lines[0].length <= 80) {
    return lines[0].replace(/[|=\[\]{}]/g, '').trim();
  }

  return '';
}

function extractAmounts(text: string, upper: string): { gross: number; net: number; vat: number } {
  let gross = 0, net = 0, vat = 0;

  // === KWOTA BRUTTO ===
  // Wzorce: "SUMA PLN 419,11", "Do zapłaty: 450,21", "Gotówka 450,21"
  const grossPatterns = [
    /SUM[AĄ]\s+PLN\s+([\d][\d\s]*[.,]\d{2})/i,
    /do\s+zap[łl]aty[\s:]*([\d][\d\s]*[.,]\d{2})/i,
    /razem\s+brutto[\s:]*([\d][\d\s]*[.,]\d{2})/i,
    /brutto[\s:]*([\d][\d\s]*[.,]\d{2})/i,
    /got[óo]wka\s+([\d][\d\s]*[.,]\d{2})/i,
    /([\d][\d\s]*[.,]\d{2})\s*(?:z[łl]|PLN)\s*(?:brutto)?/i,
  ];
  for (const p of grossPatterns) {
    const m = text.match(p);
    if (m?.[1]) {
      const val = parsePolishNumber(m[1]);
      if (val > 0 && val > gross) gross = val;
    }
  }

  // === KWOTA NETTO ===
  const netPatterns = [
    /netto[\s:]*([\d][\d\s]*[.,]\d{2})/i,
    /warto[śs][ćc]\s+netto[\s:]*([\d][\d\s]*[.,]\d{2})/i,
  ];
  for (const p of netPatterns) {
    const m = text.match(p);
    if (m?.[1]) {
      const val = parsePolishNumber(m[1]);
      if (val > 0 && val > net) net = val;
    }
  }

  // === VAT ===
  // "Kwota B: 08,003 31,05" → "31,05" to VAT
  // OCR often garbles "08,00%" (stawka 8%) before the VAT amount
  const vatPatterns = [
    /kwota\s+[BVA][\s:]*[\d]+[.,][\d]+[%3]?\s+([\d][\d\s]*[.,]\d{2})/i,
    /vat[\s:]*([\d][\d\s]*[.,]\d{2})/i,
    /podatek[\s:]*([\d][\d\s]*[.,]\d{2})/i,
  ];
  for (const p of vatPatterns) {
    const m = text.match(p);
    if (m?.[1]) {
      const val = parsePolishNumber(m[1]);
      if (val > 0 && val > vat) vat = val;
    }
  }

  // Oblicz brakujące
  if (gross > 0 && net > 0 && vat === 0) vat = round2(gross - net);
  if (gross > 0 && vat > 0 && net === 0) net = round2(gross - vat);
  if (net > 0 && vat > 0 && gross === 0) gross = round2(net + vat);

  // Fallback: z linii "67,49L x 6:2] 419,11" → 419,11 to brutto
  if (gross === 0) {
    const lineAmountMatch = text.match(/\d+[.,]\d{1,3}\s*L\s*[xX×*]\s*\d+[.,]\d{1,4}[\]\s]+([\d][\d\s]*[.,]\d{2})/i);
    if (lineAmountMatch?.[1]) {
      gross = parsePolishNumber(lineAmountMatch[1]);
    }
  }

  // Fallback: "Gotówka 450,21" jako brutto
  if (gross === 0) {
    const cashMatch = text.match(/got[óo]wka[\s:]*([\d]+[.,]\d{2})/i);
    if (cashMatch?.[1]) gross = parsePolishNumber(cashMatch[1]);
  }

  return { gross, net, vat };
}

function detectFuel(upper: string, sellerName: string): boolean {
  const sellerUpper = sellerName.toUpperCase();
  if (FUEL_SELLER_KEYWORDS.some(kw => sellerUpper.includes(kw) || upper.includes(kw))) return true;
  if (FUEL_PRODUCT_KEYWORDS.some(kw => upper.includes(kw))) return true;
  // Heurystyka: wzorzec "XX,XXL x Y,YYYY" sugeruje paliwo
  if (/\d+[.,]\d+\s*L\s*[xX×*]/i.test(upper)) return true;
  return false;
}

function extractFuelData(text: string, upper: string, amount: number): { liters: number | null; pricePerLiter: number | null } {
  let liters: number | null = null;
  let pricePerLiter: number | null = null;

  // Wzorzec BP/Shell: "67,49L x 6,2100 419,11" (OCR: "67,49L x 6:2] 419,11")
  // Ilość L x cena = wartość
  const fuelLineMatch = text.match(/(\d+[.,]\d{1,3})\s*L\s*[xX×*]\s*([\d][\d:.,]{1,6})/i);
  if (fuelLineMatch) {
    const qty = parsePolishNumber(fuelLineMatch[1]);
    // Cena może być zgarbled: "6:2]" zamiast "6,21" — spróbuj naprawić
    let priceStr = fuelLineMatch[2].replace(/[:\]\[})/g, ',').replace(/,,+/g, ',');
    const price = parsePolishNumber(priceStr);
    if (qty >= 1 && qty <= 500) liters = round2(qty);
    if (price >= 2 && price <= 15) pricePerLiter = round2(price);
  }

  if (!liters) {
    // "Ilość: 67,490" lub "67,490 L"
    const literPatterns = [
      /(\d+[.,]\d{1,3})\s*(?:L|l|litr|dm3)\b/,
      /ilo[śs][ćc][\s:]*([\d]+[.,]\d{1,3})/i,
      /(?:PB\s*9[58]|ON|DIESEL|BENZYNA|E[510]|B7)[^\d]{0,20}(\d+[.,]\d{2,3})/i,
    ];
    for (const p of literPatterns) {
      const m = text.match(p);
      if (m?.[1]) {
        const val = parsePolishNumber(m[1]);
        if (val >= 1 && val <= 500) { liters = round2(val); break; }
      }
    }
  }

  if (!pricePerLiter) {
    const pricePatterns = [
      /(\d+[.,]\d{2,4})\s*(?:z[łl]|PLN)?\s*\/\s*(?:L|l|litr)/i,
      /cena\s*(?:jedn\.?|jednostkowa|\/?\s*l)[\s:]*([\d]+[.,]\d{2,4})/i,
      /cj\.?\s*(?:netto)?[\s:]*([\d]+[.,]\d{2,4})/i,
    ];
    for (const p of pricePatterns) {
      const m = text.match(p);
      if (m?.[1]) {
        const val = parsePolishNumber(m[1]);
        if (val >= 2 && val <= 15) { pricePerLiter = round2(val); break; }
      }
    }
  }

  // Oblicz brakujące wartości
  if (liters && liters > 0 && !pricePerLiter && amount > 0) {
    pricePerLiter = round2(amount / liters);
  }
  if (!liters && pricePerLiter && pricePerLiter > 0 && amount > 0) {
    liters = round2(amount / pricePerLiter);
  }

  return { liters, pricePerLiter };
}

function parsePolishNumber(str: string): number {
  const cleaned = str.replace(/\s/g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
