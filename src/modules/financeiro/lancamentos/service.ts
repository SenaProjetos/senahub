import "server-only";
import { somarMesesUtc } from "@/lib/data";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action-error";
import { notificarMuitos } from "@/lib/notificar";
import { prisma } from "@/lib/prisma";
import { brl } from "@/lib/utils";
import { aprovadoresPorPapeis, getNiveisAprovacao } from "@/modules/financeiro/aprovacao/queries";
import { papeisAprovadores, precisaAprovacao, valorDaAlcada } from "@/modules/financeiro/aprovacao/niveis";
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

  // Alçada por faixa: despesa em faixa que exige aprovação trava em aguardando_aprovacao. Vale o
  // TOTAL das ocorrências (N3): 60 × R$ 900 não passa como "R$ 900".
  const niveis = await getNiveisAprovacao();
  const precisaAprovar = precisaAprovacao(i.tipo, valorDaAlcada(i.valor, i.ocorrencias), niveis);
  const status = precisaAprovar
    ? ("aguardando_aprovacao" as const)
    : i.confirmado
      ? ("confirmado" as const)
      : ("previsto" as const);

  // Caixinha paga SAÍDA EM ABERTO: receita não sai de caixinha, e o realizado já é uso — o que
  // consome o reservado de verdade é a baixa de uma despesa ligada, nunca um lançamento nascido pago.
  let caixinhaId: string | null = null;
  if (i.caixinhaId) {
    if (i.tipo !== "despesa") throw new ActionError("Só conta a pagar sai de caixinha.");
    if (i.confirmado) throw new ActionError("Para pagar por uma caixinha, lance a conta em aberto e dê baixa nela.");
    const c = await db.caixinha.findUnique({ where: { id: i.caixinhaId }, select: { ativo: true } });
    if (!c?.ativo) throw new ActionError("A caixinha escolhida não existe ou está inativa.");
    caixinhaId = i.caixinhaId;
  }

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
    caixinhaId,
  };

  // A10: lançar "confirmado" com recorrência confirma só o 1º mês; os seguintes são futuros e nascem em
  // aberto — antes entravam no caixa de hoje e na DRE futura como já pagos.
  const registros = Array.from({ length: i.ocorrencias }, (_, n) => {
    const realizado = status === "confirmado" && n === 0;
    return {
      ...comum,
      status: status === "confirmado" && !realizado ? ("previsto" as const) : status,
      data: somarMesesUtc(dataBase, n),
      vencimento: vencBase ? somarMesesUtc(vencBase, n) : null,
      dataConfirmacao: realizado ? dataBase : null,
      dataCompetencia: compBase ? somarMesesUtc(compBase, n) : null,
    };
  });

  if (registros.length === 1) {
    const criado = await db.lancamento.create({
      // Histórico desde o nascimento (N1): a linha do tempo da situação começa aqui.
      data: { ...registros[0], statusHistorico: { create: { de: null, para: status, autorId } } },
      select: { id: true, vencimento: true, data: true },
    });
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
