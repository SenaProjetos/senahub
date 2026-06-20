import puppeteer from "puppeteer-core";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * PDF server-side do documento: o Chrome (CHROME_PATH) navega na própria página de preview
 * (reaproveita o cookie de sessão) e imprime em A4 — idêntico ao preview, sem o diálogo do navegador.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Não autenticado", { status: 401 });
  if (!(await can(session.user.role, "documentos", "ver"))) {
    return new Response("Sem acesso", { status: 403 });
  }

  const { id } = await params;
  const modelo = await prisma.documentoModelo.findUnique({ where: { id }, select: { nome: true, schemaJson: true } });
  if (!modelo) return new Response("Modelo não encontrado", { status: 404 });

  // Formato/orientação do modelo → opções do page.pdf (puppeteer suporta A0–A5 + Letter + landscape).
  const pagina = (modelo.schemaJson as {
    pagina?: { formato?: string; orientacao?: string; numerarPaginas?: boolean };
  } | null)?.pagina;
  const FORMATO_PDF: Record<string, "A0" | "A1" | "A2" | "A3" | "A4" | "A5" | "Letter"> = {
    A0: "A0", A1: "A1", A2: "A2", A3: "A3", A4: "A4", A5: "A5", Carta: "Letter",
  };
  const formatoPdf = FORMATO_PDF[pagina?.formato ?? "A4"] ?? "A4";
  const landscape = pagina?.orientacao === "paisagem";
  // NUMERAÇÃO REAL de páginas (opt-in): a única forma confiável de mostrar
  // "Página X / Y" com X/Y corretos por página é o footer NATIVO do Puppeteer,
  // que usa as classes especiais `pageNumber`/`totalPages`. Os tokens
  // [Pagina]/[Paginas] no CORPO da banda permanecem 1/1 (limitação conhecida:
  // CSS counter(pages) só funciona no margin-box do @page, não no body).
  const numerarPaginas = pagina?.numerarPaginas === true;

  const chrome = process.env.CHROME_PATH;
  if (!chrome) {
    return new Response("CHROME_PATH não configurado no servidor.", { status: 503 });
  }

  const qs = new URL(req.url).searchParams.toString();
  const port = process.env.PORT || "3000";
  const previewUrl = `http://localhost:${port}/documentos/${id}/preview${qs ? `?${qs}` : ""}`;
  const cookie = req.headers.get("cookie") ?? "";

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    if (cookie) await page.setExtraHTTPHeaders({ cookie });
    await page.goto(previewUrl, { waitUntil: "networkidle0", timeout: 30000 });
    await page.emulateMediaType("print");
    // OPT-IN: com numerarPaginas, ligamos o header/footer nativo do Chrome e
    // RESERVAMOS margem inferior (~14mm) para o rodapé caber; header vazio.
    // Sem isso, mantemos o full-bleed original (margem 0, sem header/footer).
    const footerTemplate =
      '<div style="width:100%;font-size:9px;color:#666;text-align:center;padding:0 6mm;">' +
      'Página <span class="pageNumber"></span> / <span class="totalPages"></span>' +
      "</div>";
    const pdf = await page.pdf({
      format: formatoPdf,
      landscape,
      printBackground: true,
      displayHeaderFooter: numerarPaginas,
      ...(numerarPaginas
        ? {
            headerTemplate: "<span></span>",
            footerTemplate,
            margin: { top: "0", right: "0", bottom: "14mm", left: "0" },
          }
        : { margin: { top: "0", right: "0", bottom: "0", left: "0" } }),
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(modelo.nome)}.pdf"`,
      },
    });
  } catch {
    return new Response("Falha ao gerar o PDF.", { status: 500 });
  } finally {
    await browser.close();
  }
}
