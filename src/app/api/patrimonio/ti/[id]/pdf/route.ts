import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import puppeteer from "puppeteer-core";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import type { Role } from "@/lib/roles";
import { obterMaquina } from "@/modules/patrimonio/queries";
import { renderMaquinaHtml } from "@/modules/patrimonio/render-html";

/** PDF do relatório por máquina (puppeteer + setContent). Gateado a patrimonio:ti. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response("Não autorizado.", { status: 401 });
  if (!(await can(session.user.role as Role, "patrimonio", "ti"))) return new Response("Sem permissão.", { status: 403 });

  const { id } = await params;
  const maquina = await obterMaquina(id);
  if (!maquina) return new Response("Máquina não encontrada.", { status: 404 });

  const chrome = process.env.CHROME_PATH;
  if (!chrome) return new Response("CHROME_PATH não configurado.", { status: 503 });

  const html = renderMaquinaHtml(maquina);
  const slug = maquina.nome.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "maquina";

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
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="relatorio-${slug}.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}
