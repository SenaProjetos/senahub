import "server-only";
import { addMonths } from "date-fns";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action-error";
import { notificarMuitos } from "@/lib/notificar";
import { prisma } from "@/lib/prisma";
import { brl } from "@/lib/utils";
import { aprovadoresPorPapeis, getNiveisAprovacao } from "@/modules/financeiro/aprovacao/queries";
import { papeisAprovadores, precisaAprovacao } from "@/modules/financeiro/aprovacao/niveis";
import { getConfigFinanceiro } from "@/modules/financeiro/config/queries";
import { obrigatorioFaltando } from "@/modules/financeiro/config/validacao";
import type { CriarLancamentoInput } from "@/modules/financeiro/lancamentos/schemas";

/**
 * Criação de lançamento compartilhada (spec do planejador §7): a action `criarLancamento` e o
 * "aplicar cenário" passam pelas MESMAS regras — campos obrigatórios configuráveis e alçada. Não
 * mora em `actions.ts` porque tudo que um arquivo "use server" exporta vira endpoint.
 */

export type Db = Prisma.TransactionClient | typeof prisma;

function data(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

export type LancamentoCriado = {
  ocorrencias: number;
  /** Id do lançamento quando é um só (recorrência usa `createMany`, sem ids). */
  id: string | null;
  vencimentoOuData: string | null;
  precisaAprovar: boolean;
  status: "previsto" | "confirmado" | "aguardando_aprovacao";
};

/**
 * Valida e cria. Recebe o cliente de banco (a transação do "aplicar cenário" ou o `prisma`) e
 * **lança** `ActionError` quando uma regra recusa — dentro de uma transação, isso desfaz tudo o que
 * ela já tinha gravado. Notificar quem aprova é do chamador, DEPOIS do commit.
 */
export async function criarLancamentoNoTx(db: Db, i: CriarLancamentoInput, autorId: string): Promise<LancamentoCriado> {
  const dataBase = data(i.data);
  if (!dataBase) throw new ActionError("Data inválida.");
  const vencBase = data(i.vencimento || undefined);
  const compBase = data(i.dataCompetencia || undefined);

  // Campos obrigatórios configuráveis (Configurações do módulo financeiro).
  const cfg = await getConfigFinanceiro();
  const faltando = obrigatorioFaltando(cfg.obrigatorios, {
    tipo: i.tipo,
    centroId: i.centroId || undefined,
    formaId: i.formaId || undefined,
    projetoId: i.projetoId || undefined,
    fornecedorId: i.fornecedorId || undefined,
    clienteId: i.clienteId || undefined,
    observacao: i.observacao || undefined,
  });
  if (faltando) throw new ActionError(`Campo obrigatório: ${faltando}.`);

  // Alçada por faixa: despesa em faixa que exige aprovação trava em aguardando_aprovacao.
  const niveis = await getNiveisAprovacao();
  const precisaAprovar = precisaAprovacao(i.tipo, i.valor, niveis);
  const status = precisaAprovar
    ? ("aguardando_aprovacao" as const)
    : i.confirmado
      ? ("confirmado" as const)
      : ("previsto" as const);

  const grupo = i.ocorrencias > 1 ? randomUUID() : null;
  const comum = {
    tipo: i.tipo,
    descricao: i.descricao,
    valor: i.valor,
    categoriaId: i.categoriaId,
    centroId: i.centroId || null,
    contaId: i.contaId || null,
    formaId: i.formaId || null,
    projetoId: i.projetoId || null,
    fornecedorId: i.fornecedorId || null,
    clienteId: i.clienteId || null,
    observacao: i.observacao || null,
    recorrenciaGrupo: grupo,
    autorId,
    status,
    // Planejador: prioridade só em despesa, confiança só em receita (nula = herda/padrão).
    prioridade: i.tipo === "despesa" ? (i.prioridade ?? null) : null,
    confianca: i.tipo === "receita" ? (i.confianca ?? null) : null,
  };

  const confirmaAgora = status === "confirmado";
  const registros = Array.from({ length: i.ocorrencias }, (_, n) => ({
    ...comum,
    data: addMonths(dataBase, n),
    vencimento: vencBase ? addMonths(vencBase, n) : null,
    dataConfirmacao: confirmaAgora ? addMonths(dataBase, n) : null,
    dataCompetencia: compBase ? addMonths(compBase, n) : null,
  }));

  if (registros.length === 1) {
    const criado = await db.lancamento.create({ data: registros[0], select: { id: true, vencimento: true, data: true } });
    return {
      ocorrencias: 1,
      id: criado.id,
      vencimentoOuData: (criado.vencimento ?? criado.data).toISOString().slice(0, 10),
      precisaAprovar,
      status,
    };
  }
  await db.lancamento.createMany({ data: registros });
  return { ocorrencias: registros.length, id: null, vencimentoOuData: null, precisaAprovar, status };
}

/** Avisa quem aprova a faixa do valor (fora da transação — notificação não desfaz). */
export async function notificarAprovacaoPendente(descricao: string, valor: number, autorId: string) {
  const niveis = await getNiveisAprovacao();
  const ids = await aprovadoresPorPapeis(papeisAprovadores(valor, niveis));
  await notificarMuitos(
    ids.filter((id) => id !== autorId),
    { titulo: "Despesa aguardando aprovação", corpo: `${descricao} — ${brl(valor)}`, href: "/financeiro/aprovacoes" },
  );
}
