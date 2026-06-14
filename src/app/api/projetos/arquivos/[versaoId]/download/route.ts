import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { GLOBAL_ROLES } from "@/lib/roles";
import { lerArquivo } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";

export async function GET(_req: Request, ctx: { params: Promise<{ versaoId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  const { versaoId } = await ctx.params;

  const versao = await prisma.arquivoProjetoVersao.findUnique({
    where: { id: versaoId },
    include: {
      arquivo: {
        select: {
          projeto: {
            select: {
              membros: { select: { userId: true } },
              disciplinas: { select: { responsaveis: { select: { userId: true } } } },
            },
          },
        },
      },
    },
  });
  if (!versao) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });

  const proj = versao.arquivo.projeto;
  const ehGlobal = user.role === "admin" || GLOBAL_ROLES.includes(user.role);
  const ehMembro = proj.membros.some((m) => m.userId === user.id);
  const ehResp = proj.disciplinas.some((d) => d.responsaveis.some((r) => r.userId === user.id));
  if (!ehGlobal && !ehMembro && !ehResp) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(versao.caminho);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível no disco." }, { status: 410 });
  }

  await logAudit({
    userId: user.id,
    modulo: "projetos",
    acao: "download-arquivo",
    resultado: "sucesso",
    entidade: "ArquivoProjetoVersao",
    entidadeId: versao.id,
    ip: await getClientIp(),
  });

  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": versao.mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(versao.nomeArquivo)}"`,
    },
  });
}
