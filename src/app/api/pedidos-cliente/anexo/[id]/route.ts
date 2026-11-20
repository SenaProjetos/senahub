import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { arquivoParaStream } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";
import { contentDisposition } from "@/modules/projetos/arquivos/link-publico-regras";
import { escopoProjeto } from "@/modules/projetos/queries";
import { anexoParaBaixar } from "@/modules/portal/pedido-revisao/service";

/**
 * Download de um anexo do pedido de revisão do cliente: a coordenação (`arquivos:alterar_status` + projeto no seu
 * escopo) ou uma conta do portal com acesso ao projeto do pedido. Sempre como anexo (`attachment`), nunca inline: o
 * arquivo veio de fora.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  const user = session?.user ?? null;
  const anexo = await anexoParaBaixar(user, id, async (projetoId) => {
    if (!user || !(await can(user, "arquivos", "alterar_status"))) return false;
    return (await prisma.projeto.count({ where: { AND: [{ id: projetoId }, escopoProjeto(user)] } })) > 0;
  });
  if (!user || !anexo) return NextResponse.json({ error: "Arquivo indisponível." }, { status: 404 });

  let arquivo: Awaited<ReturnType<typeof arquivoParaStream>>;
  try {
    arquivo = await arquivoParaStream(anexo.caminho);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível no disco." }, { status: 410 });
  }
  await logAudit({
    modulo: "portal",
    acao: "pedido-revisao-anexo-baixado",
    resultado: "sucesso",
    userId: user.id,
    entidade: "AnexoPedidoCliente",
    entidadeId: id,
    detalhe: { projetoId: anexo.projetoId },
    ip: await getClientIp(),
  });
  const headers = new Headers({
    "Content-Length": String(arquivo.tamanho),
    "Content-Type": "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": contentDisposition("attachment", anexo.nome),
  });
  return new NextResponse(arquivo.abrir(), { headers });
}
