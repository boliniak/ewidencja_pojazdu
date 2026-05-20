/**
 * Generator PDF - wersja standalone
 * Używa puppeteer-core z systemowym Chromium (zainstalowanym w kontenerze Docker)
 * Fallback: zwraca HTML z odpowiednim nagłówkiem
 */

// Dynamic require that bypasses webpack bundling
// eslint-disable-next-line @typescript-eslint/no-var-requires
const dynamicRequire = typeof __webpack_require__ === 'function'
  ? __non_webpack_require__
  : require;

async function tryPuppeteerCore(htmlContent: string): Promise<Buffer | null> {
  try {
    const puppeteer = dynamicRequire('puppeteer-core');
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';
    
    console.log('PDF: Launching puppeteer-core with:', executablePath);
    
    const browser = await puppeteer.launch({
      headless: 'new',
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 10000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: true,
      margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' },
      printBackground: true,
    });
    await browser.close();
    console.log('PDF: Generated successfully via puppeteer-core');
    return Buffer.from(pdfBuffer);
  } catch (e: any) {
    console.error('PDF: puppeteer-core failed:', e?.message);
    return null;
  }
}

async function tryPuppeteer(htmlContent: string): Promise<Buffer | null> {
  try {
    const puppeteer = dynamicRequire('puppeteer');
    console.log('PDF: Trying full puppeteer...');
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 10000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: true,
      margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' },
      printBackground: true,
    });
    await browser.close();
    console.log('PDF: Generated successfully via puppeteer');
    return Buffer.from(pdfBuffer);
  } catch (e: any) {
    console.error('PDF: puppeteer failed:', e?.message);
    return null;
  }
}

export async function generatePdfFromHtml(htmlContent: string): Promise<{ buffer: Buffer; isPdf: boolean }> {
  // Próba 1: puppeteer-core
  const pdf1 = await tryPuppeteerCore(htmlContent);
  if (pdf1) return { buffer: pdf1, isPdf: true };

  // Próba 2: puppeteer (pełna wersja)
  const pdf2 = await tryPuppeteer(htmlContent);
  if (pdf2) return { buffer: pdf2, isPdf: true };

  // Fallback: zwróć HTML (klient otworzy w nowej karcie i użytkownik wydrukuje Ctrl+P)
  console.log('PDF: Falling back to HTML output');
  return { buffer: Buffer.from(htmlContent, 'utf-8'), isPdf: false };
}
