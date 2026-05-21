/**
 * Generator PDF - wersja standalone
 * Używa puppeteer-core z systemowym Chromium (zainstalowanym w kontenerze Docker)
 * Fallback: zwraca HTML z odpowiednim nagłówkiem
 */

/* eslint-disable @typescript-eslint/no-require-imports */

// Bypass webpack bundling — eval('require') is resolved at runtime, not build time
const loadModule = (name: string) => {
  try {
    // eslint-disable-next-line no-eval
    return eval('require')(name);
  } catch {
    return null;
  }
};

async function launchAndGenerate(puppeteer: any, opts: any, htmlContent: string): Promise<Buffer> {
  const browser = await puppeteer.launch(opts);
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 10000 });
  const pdfBuffer = await page.pdf({
    format: 'A4',
    landscape: true,
    margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' },
    printBackground: true,
  });
  await browser.close();
  return Buffer.from(pdfBuffer);
}

export async function generatePdfFromHtml(htmlContent: string): Promise<{ buffer: Buffer; isPdf: boolean }> {
  // Próba 1: puppeteer-core z systemowym Chromium
  try {
    const puppeteer = loadModule('puppeteer-core');
    if (puppeteer) {
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';
      console.log('PDF: Launching puppeteer-core with:', executablePath);
      const buf = await launchAndGenerate(puppeteer, {
        headless: 'new',
        executablePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process'],
      }, htmlContent);
      console.log('PDF: Generated successfully via puppeteer-core');
      return { buffer: buf, isPdf: true };
    }
  } catch (e: any) {
    console.error('PDF: puppeteer-core failed:', e?.message);
  }

  // Próba 2: puppeteer (pełna wersja z wbudowanym Chromium)
  try {
    const puppeteer = loadModule('puppeteer');
    if (puppeteer) {
      console.log('PDF: Trying full puppeteer...');
      const buf = await launchAndGenerate(puppeteer, {
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      }, htmlContent);
      console.log('PDF: Generated successfully via puppeteer');
      return { buffer: buf, isPdf: true };
    }
  } catch (e: any) {
    console.error('PDF: puppeteer failed:', e?.message);
  }

  // Fallback: zwróć HTML (klient otworzy w nowej karcie i użytkownik wydrukuje Ctrl+P)
  console.log('PDF: Falling back to HTML output');
  return { buffer: Buffer.from(htmlContent, 'utf-8'), isPdf: false };
}
