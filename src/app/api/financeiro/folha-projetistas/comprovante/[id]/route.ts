import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { lerArquivo } from "@/lib/storage";

/**
 * Download de comprovante de pagamento de produção (G6/B3) — par estreito da rota de anexo
 * de Lançamentos (`api/financeiro/lancamentos/anexo/[id]`), que gate `financeiro:ver`. Um
 * usuário só-`folha_pj` não tem `ver`, então precisava desta rota própria para baixar o
 * comprovante que ele mesmo anexou. Mesma guarda de escopo das actions: só serve anexo de
 * um lançamento com `pagamentoProjetistaId`.
 *
 * D35: o TITULAR do pagamento (o próprio projetista, no extrato) também baixa — mesmo
 * padrão "titular ou `folha_pj`" do PDF de recibo (G5). Sem permissão de `folha_pj`,
 * projetista/freelancer só passam pela checagem de titularidade.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await ctx.params;
  const anexo = await prisma.lancamentoAnexo.findUnique({
    where: { id },
    select: { caminho: true, nome: true, mime: true, lancamento: { select: { pagamentoProjetistaId: true } } },
  });
  if (!anexo?.lancamento.pagamentoProjetistaId) {
    return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });
  }

  const podeStaff = await can(session.user, "financeiro", "folha_pj");
  if (!podeStaff) {
    const pagamento = await prisma.pagamentoProjetista.findUnique({
      where: { id: anexo.lancamento.pagamentoProjetistaId },
      select: { projetistaId: true },
    });
    if (pagamento?.projetistaId !== session.user.id) {
      // Mesmo 404 do "não achou" acima — não revela pra quem não tem acesso que o id existe.
      return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });
    }
  }

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(anexo.caminho);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível." }, { status: 410 });
  }
  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": anexo.mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(anexo.nome)}"`,
    },
  });
}
