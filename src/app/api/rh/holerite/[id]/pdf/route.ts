import { type NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import { getSession } from "@/lib/session";
import { HR_ADMIN_ROLES, type Role } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { renderHoleriteHtml } from "@/modules/rh/folha/service";
import { empresaParaTimbrado } from "@/modules/configuracoes/empresa/queries";

/**
 * PDF do holerite CLT (P3, espelha `/api/financeiro/recibos/[id]/pdf`). Mesma mecânica:
 * puppeteer-core + `setContent`, sem servidor de impressão.
 *
 * Quem baixa: o próprio funcionário (é o holerite dele, sem exigir `rh:folha`, mesmo motivo de
 * `minha-ficha` não gatear leitura própria) ou quem gere RH (`HR_ADMIN_ROLES`, mesmo gate de
 * `/rh/folha`, que também é role-only — não há permissão fina `rh:folha` nas actions do módulo).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return new Response("Não autenticado.", { status: 401 });

  const holerite = await prisma.holerite.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      assinadoEm: true,
      user: { select: { name: true, nomeCompleto: true } },
      assinante: { select: { name: true } },
      folha: { select: { ano: true, mes: true } },
      itens: { select: { descricao: true, tipo: true, valor: true }, orderBy: { descricao: "asc" } },
    },
  });
  if (!holerite) return new Response("Holerite não encontrado.", { status: 404 });

  const titular = holerite.userId === session.user.id;
  if (!titular && !(HR_ADMIN_ROLES as readonly Role[]).includes(session.user.role)) {
    return new Response("Sem permissão.", { status: 403 });
  }

  const chrome = process.env.CHROME_PATH;
  if (!chrome) return new Response("CHROME_PATH não configurado.", { status: 503 });

  const empresa = await empresaParaTimbrado();

  const html = renderHoleriteHtml({
    id: holerite.id,
    nomeFuncionario: holerite.user.nomeCompleto?.trim() || holerite.user.name,
    ano: holerite.folha.ano,
    mes: holerite.folha.mes,
    itens: holerite.itens.map((it) => ({ descricao: it.descricao, tipo: it.tipo, valor: Number(it.valor) })),
    assinadoEm: holerite.assinadoEm,
    assinanteNome: holerite.assinante?.name ?? null,
    empresa,
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
    const competencia = `${String(holerite.folha.mes).padStart(2, "0")}-${holerite.folha.ano}`;
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Holerite-${competencia}-${holerite.id.slice(0, 8)}.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}
