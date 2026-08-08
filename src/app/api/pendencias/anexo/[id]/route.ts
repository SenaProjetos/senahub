import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { acessoGlobal } from "@/lib/roles";
import { lerArquivo } from "@/lib/storage";

/**
 * Serve um anexo de apontamento (item 12).
 *
 * Imagem e áudio saem **inline** por padrão: é o que faz o `<img>` e o `<audio controls>` da
 * barra lateral funcionarem. O resto (PDF) sai como anexo. `?disposition=` força o contrário,
 * mesmo padrão de `/api/uploads/[id]/download`.
 *
 * Gate: LEITURA por acesso ao projeto (global, membro, ou responsável de alguma disciplina) —
 * o mesmo das rotas irmãs de apontamento. Anexar é mais restrito que ler, e vive na rota POST.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  const { id } = await ctx.params;

  const a = await prisma.pendenciaAnexo.findUnique({
    where: { id },
    include: { pendencia: { select: { projetoId: true, excluidoEm: true } } },
  });
  if (!a || a.pendencia.excluidoEm) return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });
  if (a.tipo !== "arquivo" || !a.caminho) {
    return NextResponse.json({ error: "Este anexo é um link, não um arquivo." }, { status: 400 });
  }

  const projetoId = a.pendencia.projetoId;
  if (!acessoGlobal(user)) {
    const [membro, resp] = await Promise.all([
      prisma.projetoMembro.findFirst({ where: { projetoId, userId: user.id }, select: { id: true } }),
      prisma.disciplinaResponsavel.findFirst({
        where: { userId: user.id, disciplina: { projetoId } },
        select: { id: true },
      }),
    ]);
    if (!membro && !resp) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(a.caminho);
  } catch {
    return NextResponse.json({ error: "Anexo indisponível no disco." }, { status: 410 });
  }

  const mime = a.mime ?? "application/octet-stream";
  const pedido = new URL(req.url).searchParams.get("disposition");
  const inlinePadrao = mime.startsWith("image/") || mime.startsWith("audio/");
  const inline = pedido ? pedido === "inline" : inlinePadrao;

  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(a.nomeArquivo ?? a.nome)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
