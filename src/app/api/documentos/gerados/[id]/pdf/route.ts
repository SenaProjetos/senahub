import puppeteer from "puppeteer-core";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { docSchemaZ } from "@/modules/documentos/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** PDF de um DocumentoGerado (snapshot): navega na página /documentos/gerados/[id]. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Não autenticado", { status: 401 });
  if (!(await can(session.user.role, "documentos", "ver"))) {
    return new Response("Sem acesso", { status: 403 });
  }

  const { id } = await params;
  const g = await prisma.documentoGerado.findUnique({
    where: { id },
    select: { modeloNome: true, schemaSnapshot: true },
  });
  if (!g) return new Response("Documento não encontrado", { status: 404 });

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
        "Content-Disposition": `inline; filename="${encodeURIComponent(g.modeloNome)}.pdf"`,
      },
    });
  } catch {
    return new Response("Falha ao gerar o PDF.", { status: 500 });
  } finally {
    await browser.close();
  }
}
