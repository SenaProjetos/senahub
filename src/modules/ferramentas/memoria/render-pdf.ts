import "server-only";
import puppeteer from "puppeteer-core";

/**
 * PDF A4 de um HTML já pronto (puppeteer + setContent), sem margem de página: a memória traz a própria.
 * Compartilhado pela rota do cálculo salvo e pela do Estudos. `null` quando o `CHROME_PATH` não está definido.
 */
export async function htmlParaPdf(html: string): Promise<Buffer | null> {
  const chrome = process.env.CHROME_PATH;
  if (!chrome) return null;
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });
    await page.emulateMediaType("print");
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
