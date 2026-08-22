import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { pdfArquivadoDaVersao } from "@/modules/comercial/pdf-proposta";

export const dynamic = "force-dynamic";

/**
 * PDF arquivado de UMA versão específica (F5.13) — o aceite literal da tarefa: "baixar o PDF da
 * versão 1 depois de salvar a versão 2 devolve o documento da v1".
 *
 * Rota INTERNA (gated por `comercial:ver`), separada da pública de propósito: o cliente vê o
 * documento que recebeu; o time precisa poder olhar qualquer versão do histórico.
 *
 * **Sem fallback para o ao-vivo, ao contrário da rota pública.** Aqui pedir "a v1" e receber uma
 * renderização do estado de hoje seria responder outra pergunta — 404 é a resposta honesta para
 * "esta versão não foi enviada, então não tem documento congelado".
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; numero: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user, "comercial", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id, numero } = await params;
  const n = Number(numero);
  if (!Number.isInteger(n) || n < 1) {
    return NextResponse.json({ error: "Versão inválida." }, { status: 400 });
  }

  const proposta = await prisma.proposta.findUnique({
    where: { id },
    select: { numero: true, titulo: true },
  });
  if (!proposta) return NextResponse.json({ error: "Proposta não encontrada." }, { status: 404 });

  const arquivado = await pdfArquivadoDaVersao(id, n);
  if (!arquivado) {
    return NextResponse.json(
      { error: `A versão ${n} não tem PDF arquivado (só versões enviadas têm).` },
      { status: 404 },
    );
  }

  const nome = `${proposta.numero} v${arquivado.versao} — ${proposta.titulo}`;
  return new Response(new Uint8Array(arquivado.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(nome)}.pdf"`,
    },
  });
}
