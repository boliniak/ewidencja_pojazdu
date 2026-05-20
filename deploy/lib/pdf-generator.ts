/**
 * Generator PDF - wersja standalone
 * Używa puppeteer-core z systemowym Chromium (zainstalowanym w kontenerze Docker)
 * Fallback: zwraca HTML z odpowiednim nagłówkiem
 */

export async function generatePdfFromHtml(htmlContent: string): Promise<{ buffer: Buffer; isPdf: boolean }> {
  // Próba 1: puppeteer-core
  try {
    const puppeteer = require('puppeteer-core');
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
    return { buffer: Buffer.from(pdfBuffer), isPdf: true };
  } catch (e: any) {
    console.error('PDF: puppeteer-core failed:', e?.message);
  }

  // Próba 2: puppeteer (pełna wersja)
  try {
    const puppeteer = require('puppeteer');
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
    return { buffer: Buffer.from(pdfBuffer), isPdf: true };
  } catch (e: any) {
    console.error('PDF: puppeteer failed:', e?.message);
  }

  // Fallback: zwróć HTML (klient otworzy w nowej karcie i użytkownik wydrukuje Ctrl+P)
  console.log('PDF: Falling back to HTML output');
  return { buffer: Buffer.from(htmlContent, 'utf-8'), isPdf: false };
}
