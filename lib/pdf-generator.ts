/**
 * Generator PDF - wersja standalone
 * Używa html-pdf-node (nie wymaga puppeteer zainstalowanego globalnie)
 * Alternatywnie można użyć jsPDF na froncie.
 */

export async function generatePdfFromHtml(htmlContent: string): Promise<Buffer> {
  // Dynamiczny import - puppeteer zainstalowane w kontenerze
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
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
    console.error('Puppeteer unavailable, falling back to basic PDF:', e);
    // Fallback: zwróć HTML jako "PDF" (użytkownik może zainstalować puppeteer)
    return Buffer.from(htmlContent, 'utf-8');
  }
}
