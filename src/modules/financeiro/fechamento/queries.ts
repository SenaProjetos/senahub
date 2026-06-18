import "server-only";
import { prisma } from "@/lib/prisma";
import { calcularFechamento, type Aliquotas, type FechamentoEntrada } from "./calculo";
import { getAliquotas } from "@/modules/financeiro/config/queries";
import type { Prisma } from "@/generated/prisma/client";

function periodoMes(ano: number, mes: number) {
  return { ini: new Date(ano, mes - 1, 1), fim: new Date(ano, mes, 0, 23, 59, 59, 999) };
}

/** Consolida receita/despesa confirmadas e folha bruta de projetistas do mês. */
async function consolidar(ano: number, mes: number): Promise<FechamentoEntrada> {
  const { ini, fim } = periodoMes(ano, mes);
  const [receitas, despesas, folha] = await Promise.all([
    prisma.lancamento.findMany({
      where: { tipo: "receita", status: "confirmado", dataConfirmacao: { gte: ini, lte: fim } },
      select: { valor: true, valorEfetivo: true },
    }),
    prisma.lancamento.findMany({
      where: { tipo: "despesa", status: "confirmado", dataConfirmacao: { gte: ini, lte: fim } },
      select: { valor: true, valorEfetivo: true },
    }),
    prisma.pagamentoProjetista.aggregate({ where: { liberadoEm: { gte: ini, lte: fim } }, _sum: { valor: true } }),
  ]);
  const soma = (arr: { valor: Prisma.Decimal; valorEfetivo: Prisma.Decimal | null }[]) =>
    arr.reduce((s, l) => s + Number(l.valorEfetivo ?? l.valor), 0);
  return {
    receitaConfirmada: soma(receitas),
    despesaConfirmada: soma(despesas),
    folhaBruta: Number(folha._sum.valor ?? 0),
  };
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
