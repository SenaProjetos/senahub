import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { lerArquivo } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";

/** Download do arquivo ATUAL de uma certidão (cache em `Certidao.arquivoPath`). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  // Rota fora do matcher do middleware (ver src/middleware.ts) — a checagem de
  // conta ativa / troca de senha pendente é feita aqui.
  if (session.user.mustChangePassword || !session.user.ativo) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }
  if (!(await can(session.user, "certidoes", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const c = await prisma.certidao.findUnique({ where: { id } });
  if (!c) return NextResponse.json({ error: "Certidão não encontrada." }, { status: 404 });
  if (!c.arquivoPath || !c.arquivoNome) {
    return NextResponse.json({ error: "Nenhum arquivo anexado." }, { status: 404 });
  }

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(c.arquivoPath);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível no disco." }, { status: 410 });
  }

  const inline = new URL(req.url).searchParams.get("inline") === "1";
  await logAudit({
    userId: session.user.id,
    modulo: "certidoes",
    acao: "download-certidao",
    resultado: "sucesso",
    entidade: "Certidao",
    entidadeId: c.id,
    ip: await getClientIp(),
  });

  const ehPdf = c.arquivoNome.toLowerCase().endsWith(".pdf");
  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": ehPdf ? "application/pdf" : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(c.arquivoNome)}"`,
    },
  });
}
