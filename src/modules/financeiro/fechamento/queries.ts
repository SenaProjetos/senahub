import "server-only";
import { utcInicioDoDia, utcFimDoDia } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { SO_RESULTADO } from "@/modules/financeiro/natureza";
import { calcularFechamento, type Aliquotas, type FechamentoEntrada } from "./calculo";
import { getAliquotas } from "@/modules/financeiro/config/queries";
import { saldoDoSistema } from "@/modules/financeiro/conciliacao/service";
import type { Prisma } from "@/generated/prisma/client";

function periodoMes(ano: number, mes: number) {
  return {
    // Colunas de data (`dataConfirmacao`): fronteiras em UTC (A9).
    ini: utcInicioDoDia(ano, mes - 1),
    fim: utcFimDoDia(ano, mes, 0),
    // `liberadoEm` é instante: fronteiras locais.
    iniLocal: new Date(ano, mes - 1, 1),
    fimLocal: new Date(ano, mes, 0, 23, 59, 59, 999),
  };
}

/** Consolida receita/despesa confirmadas e folha bruta de projetistas do mês. */
async function consolidar(ano: number, mes: number): Promise<FechamentoEntrada> {
  const { ini, fim, iniLocal, fimLocal } = periodoMes(ano, mes);
  const [receitas, despesas, folha] = await Promise.all([
    prisma.lancamento.findMany({
      where: { tipo: "receita", status: "confirmado", dataConfirmacao: { gte: ini, lte: fim }, ...SO_RESULTADO },
      select: { valor: true, valorEfetivo: true },
    }),
    prisma.lancamento.findMany({
      where: { tipo: "despesa", status: "confirmado", dataConfirmacao: { gte: ini, lte: fim }, ...SO_RESULTADO },
      select: { valor: true, valorEfetivo: true },
    }),
    prisma.pagamentoProjetista.aggregate({ where: { liberadoEm: { gte: iniLocal, lte: fimLocal } }, _sum: { valor: true } }),
  ]);
  const soma = (arr: { valor: Prisma.Decimal; valorEfetivo: Prisma.Decimal | null }[]) =>
    arr.reduce((s, l) => s + Number(l.valorEfetivo ?? l.valor), 0);
  return {
    receitaConfirmada: soma(receitas),
    despesaConfirmada: soma(despesas),
    folhaBruta: Number(folha._sum.valor ?? 0),
  };
}

export type SaldoDaConta = { contaId: string; nome: string; saldo: number };

/**
 * Saldo de cada conta ativa no último dia do mês, pelo sistema (N5): é o que se confere com o extrato
 * do banco ao fechar. Mesmo cálculo da conferência do OFX (`saldoDoSistema`).
 */
export async function saldosDasContasNoFimDoMes(ano: number, mes: number): Promise<SaldoDaConta[]> {
  const contas = await prisma.contaBancaria.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } });
  const fim = utcFimDoDia(ano, mes, 0).toISOString().slice(0, 10);
  const out: SaldoDaConta[] = [];
  for (const c of contas) out.push({ contaId: c.id, nome: c.nome, saldo: await saldoDoSistema(prisma, c.id, fim) });
  return out;
}

/** Prévia (não persiste): o que seria o fechamento do mês com as alíquotas atuais. */
export async function previewFechamento(ano: number, mes: number) {
  const [entrada, aliquotas] = await Promise.all([consolidar(ano, mes), getAliquotas()]);
  return { ano, mes, entrada, aliquotas, calc: calcularFechamento(entrada, aliquotas) };
}
export type PreviewFechamento = Awaited<ReturnType<typeof previewFechamento>>;

/** Consolida e devolve a entrada (uso interno das actions ao gerar). */
export async function consolidarMes(ano: number, mes: number) {
  return consolidar(ano, mes);
}

type FechRaw = Prisma.FechamentoMensalGetPayload<{ include: { responsavel: { select: { name: true } } } }>;
function serial(f: FechRaw) {
  const receita = Number(f.receitaConfirmada);
  const despesa = Number(f.despesaConfirmada);
  const folhaBruta = Number(f.folhaBruta);
  const retencaoIss = Number(f.retencaoIss);
  const retencaoInss = Number(f.retencaoInss);
  const retencaoIr = Number(f.retencaoIr);
  const descontos = Number(f.descontos);
  const retencoesTotal = retencaoIss + retencaoInss + retencaoIr;
  return {
    id: f.id,
    ano: f.ano,
    mes: f.mes,
    status: f.status,
    receitaConfirmada: receita,
    despesaConfirmada: despesa,
    resultadoBruto: receita - despesa,
    folhaBruta,
    retencaoIss,
    retencaoInss,
    retencaoIr,
    retencoesTotal,
    descontos,
    folhaLiquida: folhaBruta - retencoesTotal - descontos,
    aliquotas: (f.aliquotas as Aliquotas | null) ?? null,
    saldosContas: (f.saldosContas as SaldoDaConta[] | null) ?? null,
    observacoes: f.observacoes,
    responsavel: f.responsavel.name,
    fechadoEm: f.fechadoEm ? f.fechadoEm.toISOString() : null,
    criadoEm: f.createdAt.toISOString(),
  };
}

export async function listarFechamentos() {
  const fs = await prisma.fechamentoMensal.findMany({
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
    include: { responsavel: { select: { name: true } } },
  });
  return fs.map(serial);
}
export type FechamentoItem = Awaited<ReturnType<typeof listarFechamentos>>[number];

export async function obterFechamento(id: string) {
  const f = await prisma.fechamentoMensal.findUnique({
    where: { id },
    include: { responsavel: { select: { name: true } } },
  });
  return f ? serial(f) : null;
}
