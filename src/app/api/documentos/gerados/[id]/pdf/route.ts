import puppeteer from "puppeteer-core";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { acquireExecutionSlot, ExecutionCapacityError } from "@/lib/execution-limit";
import { auditarBloqueioRateLimit, limitarRequisicao, respostaLimiteRequisicoes } from "@/lib/rate-limit";
import { salvarArquivo, lerArquivo } from "@/lib/storage";
import { docSchemaZ } from "@/modules/documentos/schema";
import { escopoDocumentoGerado } from "@/modules/documentos/queries";
import { FAIXA_RODAPE, FOOTER_PAGINACAO, reservarFaixaDoRodape } from "@/modules/documentos/rodape-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** PDF de um DocumentoGerado (snapshot): navega na página /documentos/gerados/[id]. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Não autenticado", { status: 401 });
  if (!(await can(session.user, "documentos", "ver"))) {
    return new Response("Sem acesso", { status: 403 });
  }

  const limite = limitarRequisicao(req, {
    escopo: "documentos-gerados-pdf",
    identificador: session.user.id,
    maximo: 12,
    janelaMs: 10 * 60_000,
  });
  if (!limite.permitido) {
    await auditarBloqueioRateLimit(limite, {
      modulo: "documentos",
      acao: "gerar-pdf-documento",
      userId: session.user.id,
      entidade: "DocumentoGerado",
    });
    return respostaLimiteRequisicoes(limite);
  }

  const { id } = await params;
  const g = await prisma.documentoGerado.findFirst({
    where: { id, ...escopoDocumentoGerado(session.user) },
    select: { modeloNome: true, schemaSnapshot: true, arquivoPath: true },
  });
  if (!g) return new Response("Documento não encontrado", { status: 404 });

  // Se o PDF já foi salvo anteriormente, servir direto do storage.
  if (g.arquivoPath) {
    try {
      const buf = await lerArquivo(g.arquivoPath);
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${encodeURIComponent(g.modeloNome)}.pdf"`,
        },
      });
    } catch {
      // Arquivo não existe ou inacessível — regenerar abaixo
    }
  }

  const schemaParsed = docSchemaZ.safeParse(g.schemaSnapshot);
  const pagina = schemaParsed.success ? schemaParsed.data.pagina : null;
  const FORMATO_PDF: Record<string, "A0" | "A1" | "A2" | "A3" | "A4" | "A5" | "Letter"> = {
    A0: "A0", A1: "A1", A2: "A2", A3: "A3", A4: "A4", A5: "A5", Carta: "Letter",
  };
  const formatoPdf = FORMATO_PDF[pagina?.formato ?? "A4"] ?? "A4";
  const landscape = pagina?.orientacao === "paisagem";
  const numerarPaginas = pagina?.numerarPaginas === true;

  const chrome = process.env.CHROME_PATH;
  if (!chrome) return new Response("CHROME_PATH não configurado.", { status: 503 });

  const port = process.env.PORT || "3000";
  const previewUrl = `http://localhost:${port}/documentos/gerados/${id}`;
  const cookie = req.headers.get("cookie") ?? "";

  let liberar: (() => void) | null = null;
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    liberar = await acquireExecutionSlot({ name: "puppeteer-pdf", maximum: 2, maximumQueue: 8, queueTimeoutMs: 45_000 });
    browser = await puppeteer.launch({
      executablePath: chrome,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    if (cookie) await page.setExtraHTTPHeaders({ cookie });
    await page.goto(previewUrl, { waitUntil: "networkidle0", timeout: 30000 });
    // Reserva a faixa do rodapé ANTES de imprimir — sem isso o `@page` do globals.css anula o
    // `margin.bottom` abaixo e o rodapé sai por cima do texto. Ver `rodape-pdf.ts`.
    if (numerarPaginas) await reservarFaixaDoRodape(page);
    await page.emulateMediaType("print");
    const pdf = await page.pdf({
      format: formatoPdf,
      landscape,
      printBackground: true,
      displayHeaderFooter: numerarPaginas,
      ...(numerarPaginas
        ? {
            headerTemplate: "<span></span>",
            footerTemplate: FOOTER_PAGINACAO,
            margin: { top: "0", right: "0", bottom: FAIXA_RODAPE, left: "0" },
          }
        : { margin: { top: "0", right: "0", bottom: "0", left: "0" } }),
    });

    // Salvar no storage se configurado.
    try {
      const salvo = await salvarArquivo(`documentos/gerados/${id}.pdf`, Buffer.from(pdf));
      await prisma.documentoGerado.update({
        where: { id },
        data: { arquivoPath: salvo.caminho },
      });
    } catch {
      // Falha ao salvar não impede download (é cache, best-effort)
    }

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(g.modeloNome)}.pdf"`,
      },
    });
  } catch (erro) {
    if (erro instanceof ExecutionCapacityError) {
      return new Response("Servidor ocupado. Tente novamente em instantes.", { status: 503, headers: { "Retry-After": "15" } });
    }
    return new Response("Falha ao gerar o PDF.", { status: 500 });
  } finally {
    try {
      await browser?.close();
    } finally {
      liberar?.();
    }
  }
}
