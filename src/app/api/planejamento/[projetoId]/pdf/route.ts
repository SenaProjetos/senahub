import { type NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import { requirePermission } from "@/lib/session";
import { podeVerDatasDoPlanejamento } from "@/modules/planejamento/acesso";

/** N-44: PDF do cronograma (gantt) de um projeto via puppeteer. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projetoId: string }> },
) {
  let user;
  try {
    user = await requirePermission("planejamento", "ver");
  } catch {
    return new Response("Não autorizado.", { status: 401 });
  }
  // O PDF é o Gantt inteiro: quem só vê a estrutura do planejamento (decisão #3) não o gera.
  if (!(await podeVerDatasDoPlanejamento(user))) {
    return new Response("Sem permissão para exportar as datas do cronograma.", { status: 403 });
  }

  const { projetoId } = await params;
  const chrome = process.env.CHROME_PATH;
  if (!chrome) return new Response("CHROME_PATH não configurado.", { status: 503 });

  const port = process.env.PORT || "3000";
  const printUrl = `http://localhost:${port}/planejamento/${projetoId}/print`;
  const cookie = req.headers.get("cookie") ?? "";

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    if (cookie) await page.setExtraHTTPHeaders({ cookie });
    await page.goto(printUrl, { waitUntil: "networkidle0", timeout: 30000 });
    await page.emulateMediaType("print");
    const pdf = await page.pdf({
      format: "A3",
      landscape: true,
      printBackground: true,
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
    });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="cronograma-${projetoId}.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}
