import "server-only";
import { prisma } from "@/lib/prisma";
import { inicioDoDiaUtc } from "@/lib/data";
import { getConfigLiquidez } from "@/modules/financeiro/config/queries";
import { diasEntre, isoDeDataDoBanco, somarDias } from "@/modules/financeiro/liquidez/datas";
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import { paraEventos, STATUS_PENDENTES } from "@/modules/financeiro/liquidez/eventos";
import { JANELA_DIAS_DE_CAIXA } from "@/modules/financeiro/liquidez/indicadores";
import { normalizarHorizonte } from "@/modules/financeiro/liquidez/motor";
import { anomaliasDoSaldo, saldoBase, type AnomaliasDoSaldo } from "@/modules/financeiro/liquidez/saldo-base";
import type { Centavos, Contraparte, DataIso, EventoCaixa, LancamentoEntrada } from "@/modules/financeiro/liquidez/tipos";

/** Tudo o que o planejador precisa do banco, já serializável (centavos, datas em string). */
export type BasePlanejador = {
  hoje: DataIso;
  horizonteDias: number;
  reservaMinima: Centavos;
  diasParaIncerta: number;
  /** S0 — o mesmo número de `fluxoCaixa().saldoTotal`, em centavos. */
  caixaAtual: Centavos;
  anomalias: AnomaliasDoSaldo;
  eventos: EventoCaixa[];
  /** Reservado de hoje por caixinha. Vazio até a F4 (caixinhas). */
  caixinhas: { id: string; reservado: Centavos }[];
  historico: { saidasNaJanela: Centavos; diasDeHistorico: number };
};

/**
 * Carrega a base do planejador (spec §3): caixa atual pelos REALIZADOS (mesma conta de
 * `fluxoCaixa`) e, como eventos, só os PENDENTES com data até o fim do horizonte — vencidos de
 * qualquer idade inclusos. Todo `where` escreve `excluidoEm: null`: a extensão de soft delete não
 * cobre busca por id nem leitura aninhada.
 */
export async function baseDoPlanejador(opcoes: { horizonteDias?: number; agora?: Date } = {}): Promise<BasePlanejador> {
  const config = await getConfigLiquidez();
  const horizonteDias = normalizarHorizonte(opcoes.horizonteDias, config.horizontePadraoDias);
  const hojeData = inicioDoDiaUtc(opcoes.agora);
  const hoje = isoDeDataDoBanco(hojeData);
  const fim = somarDias(hoje, horizonteDias - 1);
  const fimData = new Date(`${fim}T00:00:00.000Z`);
  const inicioJanela = new Date(`${somarDias(hoje, -JANELA_DIAS_DE_CAIXA)}T00:00:00.000Z`);

  const contas = await prisma.contaBancaria.findMany({ select: { id: true, ativo: true, saldoInicial: true } });
  const realizados = await prisma.lancamento.findMany({
    where: { status: "confirmado", excluidoEm: null },
    select: {
      contaId: true,
      tipo: true,
      valor: true,
      valorEfetivo: true,
      dataConfirmacao: true,
      categoria: { select: { natureza: true } },
    },
  });

  const ativas = contas.filter((c) => c.ativo);
  const realizadosCent = realizados.map((l) => ({
    contaId: l.contaId,
    tipo: l.tipo,
    valor: paraCentavos(l.valorEfetivo ?? l.valor),
    dataConfirmacao: l.dataConfirmacao ? isoDeDataDoBanco(l.dataConfirmacao) : null,
    natureza: l.categoria.natureza,
  }));
  const base = saldoBase(
    ativas.map((c) => ({ id: c.id, saldoInicial: paraCentavos(c.saldoInicial) })),
    realizadosCent,
  );
  const anomalias = anomaliasDoSaldo(hoje, new Set(ativas.map((c) => c.id)), realizadosCent);

  let saidasNaJanela = 0;
  let maisAntigo: DataIso | null = null;
  const inicioJanelaIso = isoDeDataDoBanco(inicioJanela);
  for (const l of realizadosCent) {
    if (!l.dataConfirmacao) continue;
    if (maisAntigo == null || l.dataConfirmacao < maisAntigo) maisAntigo = l.dataConfirmacao;
    if (l.tipo === "despesa" && l.natureza === "resultado" && l.dataConfirmacao > inicioJanelaIso && l.dataConfirmacao <= hoje) {
      saidasNaJanela += l.valor;
    }
  }

  const pendentes = await prisma.lancamento.findMany({
    where: {
      status: { in: [...STATUS_PENDENTES] },
      excluidoEm: null,
      OR: [{ vencimento: { lte: fimData } }, { vencimento: null, data: { lte: fimData } }],
    },
    select: {
      id: true,
      tipo: true,
      status: true,
      valor: true,
      data: true,
      vencimento: true,
      descricao: true,
      prioridade: true,
      confianca: true,
      transferenciaId: true,
      fornecedor: { select: { nome: true } },
      cliente: { select: { nome: true } },
      projeto: { select: { codigo: true } },
      categoria: {
        select: { nome: true, natureza: true, prioridadePadrao: true, pai: { select: { prioridadePadrao: true } } },
      },
    },
  });

  const ids = pendentes.map((l) => l.id);
  const arts = ids.length
    ? await prisma.art.findMany({
        where: { OR: [{ lancamentoId: { in: ids } }, { reembolsoLancamentoId: { in: ids } }] },
        select: { lancamentoId: true, reembolsoLancamentoId: true },
      })
    : [];
  const idsArt = new Set<string>();
  for (const a of arts) {
    if (a.lancamentoId) idsArt.add(a.lancamentoId);
    if (a.reembolsoLancamentoId) idsArt.add(a.reembolsoLancamentoId);
  }

  const idsTransf = [
    ...new Set(
      pendentes.filter((l) => l.categoria.natureza === "transferencia" && l.transferenciaId).map((l) => l.transferenciaId!),
    ),
  ];
  const pernas = idsTransf.length
    ? await prisma.lancamento.findMany({
        where: { transferenciaId: { in: idsTransf }, excluidoEm: null, status: { not: "cancelado" } },
        select: { id: true, transferenciaId: true, status: true, data: true, vencimento: true, dataConfirmacao: true },
      })
    : [];
  const contrapartesDe = (id: string, transferenciaId: string | null): Contraparte[] =>
    transferenciaId
      ? pernas
          .filter((p) => p.transferenciaId === transferenciaId && p.id !== id)
          .map((p) => {
            const realizada = p.status === "confirmado";
            const d = realizada ? (p.dataConfirmacao ?? p.data) : (p.vencimento ?? p.data);
            return { id: p.id, realizada, data: isoDeDataDoBanco(d) };
          })
      : [];

  const entradas: LancamentoEntrada[] = pendentes.map((l) => ({
    id: l.id,
    tipo: l.tipo,
    status: l.status,
    valor: paraCentavos(l.valor),
    data: isoDeDataDoBanco(l.data),
    vencimento: l.vencimento ? isoDeDataDoBanco(l.vencimento) : null,
    descricao: l.descricao,
    favorecido: l.fornecedor?.nome ?? l.cliente?.nome ?? null,
    projeto: l.projeto?.codigo ?? null,
    categoriaNome: l.categoria.nome,
    prioridade: l.prioridade,
    confianca: l.confianca,
    categoria: {
      natureza: l.categoria.natureza,
      prioridadePadrao: l.categoria.prioridadePadrao,
      prioridadePadraoPai: l.categoria.pai?.prioridadePadrao ?? null,
    },
    ehTaxaArt: idsArt.has(l.id),
    transferencia:
      l.categoria.natureza === "transferencia"
        ? { id: l.transferenciaId, contrapartes: contrapartesDe(l.id, l.transferenciaId) }
        : null,
  }));

  return {
    hoje,
    horizonteDias,
    reservaMinima: config.reservaMinima,
    diasParaIncerta: config.diasParaIncerta,
    caixaAtual: base.total,
    anomalias,
    eventos: paraEventos(entradas, { hoje, diasParaIncerta: config.diasParaIncerta }),
    caixinhas: [],
    historico: { saidasNaJanela, diasDeHistorico: maisAntigo ? diasEntre(maisAntigo, hoje) : 0 },
  };
}
