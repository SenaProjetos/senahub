import "server-only";
import { prisma } from "@/lib/prisma";
import { criarCalendario, type Calendario } from "@/lib/calendario-trabalho";
import { feriadosParaCalculo } from "@/modules/rh/feriados/queries";
import { isoDeDataDoBanco } from "@/modules/financeiro/liquidez/datas";
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import { idDoProgramado, type CompromissoRecorrenteEntrada, type LancamentoDaCompetencia } from "@/modules/financeiro/recorrencia/calculo";

const SELECT = {
  id: true,
  descricao: true,
  valor: true,
  diaVencimento: true,
  regraVencimento: true,
  mesesAteVencimento: true,
  adiantamento: true,
  competenciaInicio: true,
  competenciaFim: true,
  antecedenciaDias: true,
  ativo: true,
  prioridade: true,
  caixinhaId: true,
  socioId: true,
  categoriaId: true,
  categoria: { select: { nome: true, natureza: true } },
  socio: { select: { user: { select: { name: true } } } },
  caixinha: { select: { nome: true } },
} as const;

type Linha = {
  id: string;
  descricao: string;
  valor: unknown;
  diaVencimento: number;
  regraVencimento: "dia_fixo" | "dia_util";
  mesesAteVencimento: number;
  adiantamento: boolean;
  competenciaInicio: string;
  competenciaFim: string | null;
  antecedenciaDias: number;
  ativo: boolean;
  prioridade: "p1" | "p2" | "p3" | "p4" | null;
  caixinhaId: string | null;
  socioId: string | null;
  categoriaId: string;
  categoria: { nome: string; natureza: "resultado" | "fora_do_resultado" | "transferencia" };
  socio: { user: { name: string } } | null;
  caixinha: { nome: string } | null;
};

function paraEntrada(c: Linha): CompromissoRecorrenteEntrada {
  return {
    id: c.id,
    descricao: c.descricao,
    valor: paraCentavos(c.valor as number),
    diaVencimento: c.diaVencimento,
    regraVencimento: c.regraVencimento,
    mesesAteVencimento: c.mesesAteVencimento,
    adiantamento: c.adiantamento,
    competenciaInicio: c.competenciaInicio,
    competenciaFim: c.competenciaFim,
    antecedenciaDias: c.antecedenciaDias,
    ativo: c.ativo,
    prioridade: c.prioridade,
    caixinhaId: c.caixinhaId,
    socioId: c.socioId,
    categoriaId: c.categoriaId,
    categoriaNome: c.categoria.nome,
    natureza: c.categoria.natureza,
    socioNome: c.socio?.user.name ?? null,
  };
}

/**
 * Calendário de dias úteis para os vencimentos ("5º dia útil"): feriados do RH dos anos pedidos, com
 * os nacionais calculados quando o ano não foi cadastrado (`feriadosParaCalculo`). Sem isso, um
 * feriado no começo do mês adiantaria o vencimento da folha em um dia.
 */
export async function calendarioFinanceiro(anos: readonly number[]): Promise<Calendario> {
  const feriados: string[] = [];
  for (const ano of [...new Set(anos)]) {
    for (const f of await feriadosParaCalculo(ano)) feriados.push(f.data);
  }
  return criarCalendario({ feriados });
}

/** Anos que um horizonte toca, com folga de um ano para trás (competências antigas a gerar). */
export function anosDoHorizonte(hoje: string, fim: string): number[] {
  const a = Number(hoje.slice(0, 4));
  const b = Number(fim.slice(0, 4));
  const r: number[] = [];
  for (let x = a - 1; x <= b + 1; x++) r.push(x);
  return r;
}

/** Compromissos ativos, no formato puro do motor (`eventosProgramados`, `competenciasAGerar`). */
export async function compromissosAtivos(): Promise<CompromissoRecorrenteEntrada[]> {
  const rows = await prisma.compromissoRecorrente.findMany({ where: { ativo: true }, orderBy: [{ descricao: "asc" }], select: SELECT });
  return rows.map((r) => paraEntrada(r as Linha));
}

export type CompromissoDto = CompromissoRecorrenteEntrada & {
  caixinhaNome: string | null;
  /** Lançamentos já gerados/vinculados. */
  gerados: number;
};

export async function carregarCompromissos(): Promise<CompromissoDto[]> {
  const rows = await prisma.compromissoRecorrente.findMany({
    orderBy: [{ ativo: "desc" }, { descricao: "asc" }],
    select: { ...SELECT, _count: { select: { lancamentos: true } } },
  });
  return rows.map((r) => ({ ...paraEntrada(r as Linha), caixinhaNome: r.caixinha?.nome ?? null, gerados: r._count.lancamentos }));
}

/**
 * Competências já cobertas por um lançamento — inclusive canceladas e excluídas: o par
 * `(origem, competência)` é único no banco, então uma competência usada nunca volta a ser gerada.
 * Cancelar um mês gerado é um ato deliberado ("este mês não será pago"), não um convite a gerar de novo.
 */
export async function competenciasVinculadas(): Promise<Set<string>> {
  const rows = await prisma.lancamento.findMany({
    where: { recorrenciaOrigemId: { not: null }, excluidoEm: { not: undefined } },
    select: { recorrenciaOrigemId: true, recorrenciaCompetencia: true },
  });
  return new Set(rows.flatMap((l) => (l.recorrenciaOrigemId && l.recorrenciaCompetencia ? [idDoProgramado(l.recorrenciaOrigemId, l.recorrenciaCompetencia)] : [])));
}

/**
 * Lançamentos que interessam aos avisos do §9: despesas vivas das categorias dos compromissos, no
 * período, com ou sem vínculo. `excluidoEm: null` explícito (a extensão não cobre todo caminho).
 */
export async function lancamentosDaRecorrencia(categoriasIds: readonly string[], de: Date, ate: Date): Promise<LancamentoDaCompetencia[]> {
  if (categoriasIds.length === 0) return [];
  const rows = await prisma.lancamento.findMany({
    where: {
      excluidoEm: null,
      tipo: "despesa",
      status: { not: "cancelado" },
      OR: [
        { categoriaId: { in: [...categoriasIds] }, vencimento: { gte: de, lte: ate } },
        { categoriaId: { in: [...categoriasIds] }, vencimento: null, data: { gte: de, lte: ate } },
        { recorrenciaOrigemId: { not: null } },
      ],
    },
    select: {
      id: true,
      descricao: true,
      valor: true,
      data: true,
      vencimento: true,
      status: true,
      categoriaId: true,
      socioId: true,
      recorrenciaOrigemId: true,
      recorrenciaCompetencia: true,
    },
  });
  return rows.map((l) => ({
    id: l.id,
    descricao: l.descricao,
    valor: paraCentavos(l.valor),
    data: isoDeDataDoBanco(l.vencimento ?? l.data),
    status: l.status,
    categoriaId: l.categoriaId,
    socioId: l.socioId,
    recorrenciaOrigemId: l.recorrenciaOrigemId,
    recorrenciaCompetencia: l.recorrenciaCompetencia,
  }));
}
