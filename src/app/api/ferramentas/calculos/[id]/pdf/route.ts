import { type NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import { memoriaDoCalculo } from "@/modules/ferramentas/queries";
import { renderMemoriaHtml } from "@/modules/ferramentas/memoria/render-html";
import { slugCalculo } from "@/modules/ferramentas/export-util";

/** PDF da memória de cálculo (puppeteer + setContent). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let html: string;
  let nome: string;
  try {
    const res = await memoriaDoCalculo(id);
    if (!res) return new Response("Cálculo não encontrado.", { status: 404 });
    html = renderMemoriaHtml(res.doc);
    nome = slugCalculo(res.calc.titulo);
  } catch {
    return new Response("Não autorizado.", { status: 401 });
  }

  const chrome = process.env.CHROME_PATH;
  if (!chrome) return new Response("CHROME_PATH não configurado.", { status: 503 });

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
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nome}.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}
