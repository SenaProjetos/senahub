import puppeteer from "puppeteer-core";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** PDF público da proposta — acesso por token (sem login), equivalente ao `/a/proposta/[token]`. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const p = await prisma.proposta.findUnique({
    where: { token },
    select: { numero: true, titulo: true, token: true },
  });
  if (!p) return new Response("Proposta não encontrada.", { status: 404 });

  const chrome = process.env.CHROME_PATH;
  if (!chrome) {
    return new Response("CHROME_PATH não configurado no servidor.", { status: 503 });
  }

  const port = process.env.PORT || "3000";
  const propostaUrl = `http://localhost:${port}/a/proposta/${token}`;

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.goto(propostaUrl, { waitUntil: "networkidle0", timeout: 30000 });
    await page.emulateMediaType("print");
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });
    const nome = `${p.numero} — ${p.titulo}`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(nome)}.pdf"`,
      },
    });
  } catch {
    return new Response("Falha ao gerar o PDF.", { status: 500 });
  } finally {
    await browser.close();
  }
}
