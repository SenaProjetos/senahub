import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { lerArquivo } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";
import { projetoVisivel } from "@/modules/planejamento/queries";

/**
 * Baixa o PDF de uma ART. `?versao=<artVersaoId>` baixa o arquivo daquela versão histórica
 * em vez do vigente. Gate: `projetos:ver` + escopo do projeto (mesma muralha da aba Arquivos).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { can } = await import("@/lib/permissions");
  if (!(await can(session.user.role, "projetos", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const versaoId = new URL(req.url).searchParams.get("versao");

  const art = await prisma.art.findUnique({
    where: { id },
    select: { id: true, projetoId: true, tipo: true, numero: true, arquivoPath: true, arquivoNome: true },
  });
  if (!art) return NextResponse.json({ error: "ART não encontrada." }, { status: 404 });
  if (!(await projetoVisivel(session.user, art.projetoId))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  let caminho = art.arquivoPath;
  let nome = art.arquivoNome;
  if (versaoId) {
    const versao = await prisma.artVersao.findFirst({
      where: { id: versaoId, artId: art.id },
      select: { arquivoPath: true, arquivoNome: true },
    });
    if (!versao) return NextResponse.json({ error: "Versão não encontrada." }, { status: 404 });
    caminho = versao.arquivoPath;
    nome = versao.arquivoNome;
  }
  if (!caminho) return NextResponse.json({ error: "Esta ART não tem arquivo anexado." }, { status: 404 });

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(caminho);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível no disco." }, { status: 410 });
  }

  await logAudit({
    userId: session.user.id,
    modulo: "projetos",
    acao: "download-art",
    resultado: "sucesso",
    entidade: "Art",
    entidadeId: art.id,
    ip: await getClientIp(),
  });

  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(nome || `${art.tipo}-${art.numero}.pdf`)}"`,
    },
  });
}
