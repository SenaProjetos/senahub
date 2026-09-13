import { type NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { reciboCompleto } from "@/modules/financeiro/recibo/queries";
import { renderReciboHtml } from "@/modules/financeiro/recibo/service";

/**
 * PDF do recibo de produção (G5/D36). Mesma mecânica da memória de cálculo: puppeteer-core +
 * `setContent`, sem servidor de impressão.
 *
 * Quem baixa: o próprio projetista (é o recibo dele) ou quem gere a folha (`folha_pj`).
 * `financeiro:ver` NÃO entra — recibo nominal não é relatório de caixa.
 *
 * O PDF renderiza o TEXTO GRAVADO, não um texto remontado agora: o documento tem de mostrar
 * o que a pessoa assinou, mesmo que a redação do gerador mude depois.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return new Response("Não autenticado.", { status: 401 });

  const recibo = await reciboCompleto(id);
  if (!recibo) return new Response("Recibo não encontrado.", { status: 404 });

  const titular = recibo.projetista.id === session.user.id;
  if (!titular && !(await can(session.user, "financeiro", "folha_pj"))) {
    return new Response("Sem permissão.", { status: 403 });
  }

  const chrome = process.env.CHROME_PATH;
  if (!chrome) return new Response("CHROME_PATH não configurado.", { status: 503 });

  const html = renderReciboHtml({
    numero: recibo.id,
    texto: recibo.texto,
    textoHash: recibo.textoHash,
    assinadoEm: recibo.assinadoEm,
    assinanteNome: recibo.assinante?.name ?? null,
  });

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });
    await page.emulateMediaType("print");
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    const competencia = recibo.ano && recibo.mes ? `-${recibo.ano}-${String(recibo.mes).padStart(2, "0")}` : "";
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Recibo${competencia}-${recibo.id.slice(0, 8)}.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}
