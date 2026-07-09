import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { mensagensCanal, mensagensFixadas, agregarReacoes, membrosCanal } from "@/modules/chat/queries";

export async function GET(req: Request, ctx: { params: Promise<{ canalId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { canalId } = await ctx.params;
  const antes = new URL(req.url).searchParams.get("antes") ?? undefined;

  const resultado = await mensagensCanal(canalId, session.user.id, { antesDe: antes }, session.user.role);
  if (resultado === null) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });

  const mensagens = resultado.itens.map((m) => ({
    id: m.id,
    conteudo: m.conteudo,
    fixada: m.fixada,
    editedAt: m.editedAt,
    excluidaEm: m.excluidaEm,
    encaminhada: m.encaminhada,
    anexoMime: m.anexoMime,
    anexoNome: m.anexoNome,
    anexos: m.anexos,
    autor: { id: m.autor.id, name: m.autor.name, image: m.autor.image },
    createdAt: m.createdAt,
    leituras: m.leituras.map((l) => ({ userId: l.userId, user: { name: l.user.name } })),
    entreguesIds: m.entreguesIds,
    ouvidasIds: m.ouvidasIds,
    reacoes: agregarReacoes(m.reacoes),
    respostaA: m.respostaA
      ? {
          id: m.respostaA.id,
          conteudo: m.respostaA.excluidaEm ? null : m.respostaA.conteudo,
          autor: m.respostaA.autor,
        }
      : null,
  }));

  // Páginas antigas (com cursor) não precisam reenviar as fixadas.
  if (antes) {
    return NextResponse.json({ mensagens, temMais: resultado.temMais });
  }

  const [fixadas, membros] = await Promise.all([
    mensagensFixadas(canalId),
    membrosCanal(canalId),
  ]);
  return NextResponse.json({
    mensagens,
    temMais: resultado.temMais,
    fixadas: fixadas.map((f) => ({ id: f.id, conteudo: f.conteudo, autor: { name: f.autor.name } })),
    membros: membros.map((u) => ({ id: u.id, name: u.name, role: u.role, chatStatus: u.chatStatus })),
  });
}
