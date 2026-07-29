import { type NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import { requirePermission } from "@/lib/session";

/** PDF da planilha orçamentária — renderiza a rota /print autenticada por cookie (padrão do projeto). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("custos", "ver");
  } catch {
    return new Response("Não autorizado.", { status: 401 });
  }

  const { id } = await params;
  const chrome = process.env.CHROME_PATH;
  if (!chrome) return new Response("CHROME_PATH não configurado.", { status: 503 });

  const tipo = req.nextUrl.searchParams.get("tipo") === "analitica" ? "analitica" : "sintetica";
  const port = process.env.PORT || "3000";
  const printUrl = `http://localhost:${port}/custos/${id}/print?tipo=${tipo}`;
  const cookie = req.headers.get("cookie") ?? "";

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    if (cookie) await page.setExtraHTTPHeaders({ cookie });
    await page.goto(printUrl, { waitUntil: "networkidle0", timeout: 60000 });
    await page.emulateMediaType("print");
    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "10mm", right: "8mm", bottom: "10mm", left: "8mm" },
    });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="planilha-${tipo}-${id}.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}
