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
  if (!ehGlobal && !ehResp && !ehMembro) {
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
