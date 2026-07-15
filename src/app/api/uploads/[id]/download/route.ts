import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { acessoGlobal } from "@/lib/roles";
import { lerArquivo } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  const { id } = await ctx.params;

  const upload = await prisma.upload.findUnique({
    where: { id },
    include: {
      disciplina: {
        select: {
          projetoId: true,
          responsaveis: { select: { userId: true } },
          projeto: { select: { membros: { select: { userId: true } } } },
        },
      },
    },
  });
  if (!upload) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  // Lixeira: findUnique não passa pelo filtro global — não sirva arquivo na lixeira.
  if (upload.excluidoEm) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });

  const ehGlobal = acessoGlobal(user);
  const ehResp = upload.disciplina.responsaveis.some((r) => r.userId === user.id);
  const ehMembro = upload.disciplina.projeto.membros.some((m) => m.userId === user.id);
  // A aba Arquivos (escopoProjeto) mostra os arquivos de TODAS as disciplinas para
  // quem é membro do projeto OU responsável de QUALQUER disciplina dele. O download
  // precisa do mesmo escopo — senão o responsável de uma disciplina vê, mas não baixa,
  // os arquivos das demais disciplinas ("Sem permissão." 403).
  let ehRespProjeto = false;
  if (!ehGlobal && !ehResp && !ehMembro) {
    ehRespProjeto =
      (await prisma.disciplina.count({
        where: { projetoId: upload.disciplina.projetoId, responsaveis: { some: { userId: user.id } } },
      })) > 0;
  }
  if (!ehGlobal && !ehResp && !ehMembro && !ehRespProjeto) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(upload.caminho);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível no disco." }, { status: 410 });
  }

  await logAudit({
    userId: user.id,
    modulo: "uploads",
    acao: "download-arquivo",
    resultado: "sucesso",
    entidade: "Upload",
    entidadeId: upload.id,
    ip: await getClientIp(),
  });

  // Visualizador online (pdf.js) precisa do PDF servido inline, não como anexo.
  const inline = new URL(req.url).searchParams.get("disposition") === "inline";
  const disposition = inline ? "inline" : "attachment";

  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": upload.mimeType || "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(upload.nomeArquivo)}"`,
    },
  });
}
