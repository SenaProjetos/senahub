import "server-only";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { TAG_PARCELA_CONTRATO, TAG_ENTREGA_PREFIXO, contratosDeCobranca } from "./queries";
import { avisoCobrancaContrato } from "./cobranca-contrato";
import { codigoCategoriaReceita } from "./categoria";

/**
 * N-26: fatura a entrega de uma disciplina, criando uma receita PREVISTA (recebível) do CLIENTE com o
 * `valor` informado por quem fatura. Idempotente por disciplina (a tag `entrega:<id>` evita duplicar).
 *
 * O valor NUNCA sai de `Disciplina.valor`: esse é o pool que se paga ao projetista (custo), e cobrar o
 * cliente por ele lançava a receita com o número do custo. Projeto com contrato cobrado por entrega
 * recusa — a cobrança é do contrato. Separado da action para o smoke alcançar a regra sem sessão.
 */
export async function faturarEntregaDaDisciplina(p: {
  disciplinaId: string;
  valor: number;
  autorId: string;
}): Promise<{ disciplinaId: string; projetoId: string }> {
  const disciplina = await prisma.disciplina.findUnique({
    where: { id: p.disciplinaId },
    select: { disciplinaTextoLegado: true, projeto: { select: { id: true, tipo: true, codigo: true } } },
  });
  if (!disciplina) throw new ActionError("Disciplina não encontrada.");

  const aviso = avisoCobrancaContrato(await contratosDeCobranca(disciplina.projeto.id));
  if (aviso?.nivel === "recusa") throw new ActionError(aviso.texto);

  const valor = Math.round(p.valor * 100) / 100;
  if (!(valor > 0)) throw new ActionError("Informe o valor a cobrar do cliente por esta entrega.");

  const tagEntrega = `${TAG_ENTREGA_PREFIXO}${p.disciplinaId}`;
  const jaFaturada = await prisma.lancamento.findFirst({
    where: { tipo: "receita", status: { not: "cancelado" }, tags: { has: tagEntrega } },
    select: { id: true },
  });
  if (jaFaturada) throw new ActionError("Esta disciplina já foi faturada.");

  const codigoCat = codigoCategoriaReceita(disciplina.projeto.tipo);
  const categoria = await prisma.categoriaFinanceira.findUnique({ where: { codigo: codigoCat } });
  if (!categoria) throw new ActionError(`Categoria ${codigoCat} ausente no plano de contas.`);

  const agora = new Date();
  await prisma.lancamento.create({
    data: {
      tipo: "receita",
      descricao: `Faturamento — ${disciplina.disciplinaTextoLegado} (${disciplina.projeto.codigo})`,
      valor,
      status: "previsto",
      data: agora,
      vencimento: agora,
      categoriaId: categoria.id,
      projetoId: disciplina.projeto.id,
      tags: [TAG_PARCELA_CONTRATO, tagEntrega],
      autorId: p.autorId,
    },
  });
  return { disciplinaId: p.disciplinaId, projetoId: disciplina.projeto.id };
}
