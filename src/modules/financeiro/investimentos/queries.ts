import "server-only";
import { prisma } from "@/lib/prisma";
import { diaDeSaoPaulo } from "@/lib/data";
import type { EventoCaixa } from "@/modules/financeiro/liquidez/tipos";
import {
  entraNoPlanejador,
  movimentosDoAtivo,
  MOTIVO_DATA_DO_VENCIMENTO,
  posicaoDoAtivo,
  type LiquidezDoAtivo,
  type MovimentoDoAtivo,
  type PosicaoDoAtivo,
} from "@/modules/financeiro/investimentos/calculo";
import { lancamentosDoAtivo } from "@/modules/financeiro/investimentos/service";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export type AtivoDto = {
  id: string;
  nome: string;
  tipo: string;
  instituicao: string | null;
  indexador: string | null;
  liquidez: LiquidezDoAtivo;
  vencimento: string | null;
  isentoIR: boolean;
  contaId: string;
  contaOrigemId: string | null;
  contaOrigemNome: string | null;
  observacao: string | null;
  arquivado: boolean;
  posicao: PosicaoDoAtivo;
  /** Lançamentos na conta (qualquer situação): decide se o ativo pode ser excluído. */
  movimentos: number;
};

const SELECT = {
  id: true,
  nome: true,
  tipo: true,
  instituicao: true,
  indexador: true,
  liquidez: true,
  vencimento: true,
  isentoIR: true,
  contaId: true,
  contaOrigemId: true,
  contaOrigem: { select: { nome: true } },
  observacao: true,
  arquivado: true,
} as const;

type Linha = {
  id: string;
  nome: string;
  tipo: string;
  instituicao: string | null;
  indexador: string | null;
  liquidez: LiquidezDoAtivo;
  vencimento: Date | null;
  isentoIR: boolean;
  contaId: string;
  contaOrigemId: string | null;
  contaOrigem: { nome: string } | null;
  observacao: string | null;
  arquivado: boolean;
};

async function paraDto(a: Linha): Promise<AtivoDto> {
  const ls = await lancamentosDoAtivo(prisma, a.contaId);
  const movimentos = await prisma.lancamento.count({ where: { contaId: a.contaId, excluidoEm: { not: undefined } } });
  return {
    id: a.id,
    nome: a.nome,
    tipo: a.tipo,
    instituicao: a.instituicao,
    indexador: a.indexador,
    liquidez: a.liquidez,
    vencimento: iso(a.vencimento),
    isentoIR: a.isentoIR,
    contaId: a.contaId,
    contaOrigemId: a.contaOrigemId,
    contaOrigemNome: a.contaOrigem?.nome ?? null,
    observacao: a.observacao,
    arquivado: a.arquivado,
    posicao: posicaoDoAtivo(ls),
    movimentos,
  };
}

/** A carteira inteira (ativos e arquivados), cada um com a posição lida da sua conta. */
export async function carregarCarteira(): Promise<AtivoDto[]> {
  const as = await prisma.investimento.findMany({ orderBy: [{ arquivado: "asc" }, { vencimento: { sort: "asc", nulls: "last" } }, { nome: "asc" }], select: SELECT });
  const out: AtivoDto[] = [];
  for (const a of as) out.push(await paraDto(a));
  return out;
}

export type DetalheDoAtivo = { ativo: AtivoDto; movimentos: MovimentoDoAtivo[] };

export async function detalheDoAtivo(id: string): Promise<DetalheDoAtivo | null> {
  const a = await prisma.investimento.findUnique({ where: { id }, select: SELECT });
  if (!a) return null;
  const ativo = await paraDto(a);
  return { ativo, movimentos: movimentosDoAtivo(await lancamentosDoAtivo(prisma, a.contaId)).reverse() };
}

/** Soma dos valores atuais da carteira, em reais: a linha "Investimentos" do Balanço. */
export async function totalDaCarteira(): Promise<number> {
  const as = await prisma.investimento.findMany({ where: { arquivado: false }, select: { contaId: true } });
  let total = 0;
  for (const a of as) total += posicaoDoAtivo(await lancamentosDoAtivo(prisma, a.contaId)).valorAtual;
  return total / 100;
}

/**
 * Vencimento de aplicação como entrada prevista no planejador (spec §4): uma por ativo "no vencimento" dentro do
 * horizonte, no valor atual, data travada (é a do ativo). Antes dela o dinheiro não é caixa livre.
 */
export async function vencimentosDeInvestimento(hoje: string = diaDeSaoPaulo(), fim: string): Promise<EventoCaixa[]> {
  const as = await prisma.investimento.findMany({
    where: { arquivado: false, liquidez: "vencimento", vencimento: { not: null } },
    select: { id: true, nome: true, liquidez: true, vencimento: true, arquivado: true, contaId: true, instituicao: true },
  });
  const eventos: EventoCaixa[] = [];
  for (const a of as) {
    const vencimento = iso(a.vencimento);
    const p = posicaoDoAtivo(await lancamentosDoAtivo(prisma, a.contaId));
    if (!entraNoPlanejador({ liquidez: a.liquidez, vencimento, arquivado: a.arquivado }, p.valorAtual, hoje, fim)) continue;
    eventos.push({
      id: `inv:${a.id}`,
      origem: "investimento",
      tipo: "receita",
      // Volta de aplicação não é receita do resultado: é dinheiro da empresa que fica disponível.
      natureza: "fora_do_resultado",
      valor: p.valorAtual,
      data: vencimento!,
      vencido: false,
      descricao: `Vencimento — ${a.nome}`,
      favorecido: a.instituicao,
      projeto: null,
      categoriaNome: "Investimentos",
      status: null,
      prioridade: null,
      confianca: "provavel",
      caixinhaId: null,
      naoProgramavel: MOTIVO_DATA_DO_VENCIMENTO,
      transferencia: null,
    });
  }
  return eventos;
}

/** Contas correntes para aporte e resgate (sem as contas dos ativos). */
export async function contasParaInvestir() {
  return prisma.contaBancaria.findMany({
    where: { ativo: true, investimento: null },
    orderBy: [{ padrao: "desc" }, { ordem: "asc" }],
    select: { id: true, nome: true },
  });
}
