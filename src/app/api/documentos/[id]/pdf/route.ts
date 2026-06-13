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
  const modelo = await prisma.documentoModelo.findUnique({ where: { id }, select: { nome: true } });
  if (!modelo) return new Response("Modelo não encontrado", { status: 404 });

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
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
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
