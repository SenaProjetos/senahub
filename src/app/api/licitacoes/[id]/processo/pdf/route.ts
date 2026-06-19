import puppeteer from "puppeteer-core";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { obterLicitacao } from "@/modules/licitacoes/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * PDF do processo de licitação: o Chrome (CHROME_PATH) navega na página de impressão
 * /licitacoes/[id]/processo (reutilizando o cookie de sessão) e imprime em A4.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Não autenticado", { status: 401 });
  if (!(await can(session.user.role, "licitacoes", "ver"))) {
    return new Response("Sem acesso", { status: 403 });
  }

  const { id } = await params;
  const lic = await obterLicitacao(id);
  if (!lic) return new Response("Licitação não encontrada", { status: 404 });

  const chrome = process.env.CHROME_PATH;
  if (!chrome) {
    return new Response("CHROME_PATH não configurado no servidor.", { status: 503 });
  }

  const port = process.env.PORT ?? "3000";
  const previewUrl = `http://localhost:${port}/licitacoes/${id}/processo`;
  const cookie = req.headers.get("cookie") ?? "";

  const filename = `processo-${lic.titulo.replace(/[^a-zA-Z0-9\-_ ]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || id}.pdf`;

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
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch {
    return new Response("Falha ao gerar o PDF.", { status: 500 });
  } finally {
    await browser.close();
  }
}
