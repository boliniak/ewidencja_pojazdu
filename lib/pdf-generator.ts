/**
 * Generator PDF - wersja standalone
 * Używa puppeteer-core z systemowym Chromium (zainstalowanym w kontenerze Docker)
 * Fallback: zwraca HTML jeśli puppeteer-core niedostępny
 */

export async function generatePdfFromHtml(htmlContent: string): Promise<Buffer> {
  try {
    // puppeteer-core nie pobiera Chromium - używa systemowego
    const puppeteer = require('puppeteer-core');
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';
    
    const browser = await puppeteer.launch({
      headless: 'new',
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: true,
      margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' },
      printBackground: true,
    });
    await browser.close();
    return Buffer.from(pdfBuffer);
  } catch (e) {
    console.error('Puppeteer-core unavailable, falling back to HTML:', e);
    // Fallback: zwróć HTML (użytkownik może zainstalować puppeteer-core + chromium)
    return Buffer.from(htmlContent, 'utf-8');
  }
}
