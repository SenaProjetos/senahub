import "server-only";
import { prisma } from "@/lib/prisma";
import { inicioDoDiaUtc } from "@/lib/data";
import { getConfigLiquidez } from "@/modules/financeiro/config/queries";
import { reservadosParaOMotor } from "@/modules/financeiro/caixinhas/queries";
import { diasEntre, isoDeDataDoBanco, somarDias } from "@/modules/financeiro/liquidez/datas";
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import { dataDoEvento, paraEventos, prioridadeEfetiva, STATUS_PENDENTES } from "@/modules/financeiro/liquidez/eventos";
import type { AlvoAtual } from "@/modules/financeiro/liquidez/aplicacao";
import { JANELA_DIAS_DE_CAIXA } from "@/modules/financeiro/liquidez/indicadores";
import { normalizarHorizonte } from "@/modules/financeiro/liquidez/motor";
import { anomaliasDoSaldo, saldoBase, type AnomaliasDoSaldo } from "@/modules/financeiro/liquidez/saldo-base";
import type { Centavos, Contraparte, DataIso, EventoCaixa, LancamentoEntrada, Observado } from "@/modules/financeiro/liquidez/tipos";

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
  /** Reservado de hoje por caixinha ativa (alocado − usado, nunca negativo). */
  caixinhas: { id: string; nome: string; reservado: Centavos }[];
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
      caixinhaId: true,
      transferenciaId: true,
      fornecedor: { select: { nome: true } },
      cliente: { select: { nome: true } },
      projeto: { select: { codigo: true } },
      categoria: {
        select: { nome: true, natureza: true, prioridadePadrao: true, pai: { select: { prioridadePadrao: true } } },
      },
    },
  });

  const idsArt = await idsDeTaxaArt(pendentes.map((l) => l.id));

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
    caixinhaId: l.caixinhaId,
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
    caixinhas: await reservadosParaOMotor(hoje),
    historico: { saidasNaJanela, diasDeHistorico: maisAntigo ? diasEntre(maisAntigo, hoje) : 0 },
  };
}

/** Ids de lançamento que são taxa (ou reembolso) de ART: a data deles é regravada pelo sync da ART. */
async function idsDeTaxaArt(ids: readonly string[]): Promise<Set<string>> {
  const r = new Set<string>();
  if (ids.length === 0) return r;
  const arts = await prisma.art.findMany({
    where: { OR: [{ lancamentoId: { in: [...ids] } }, { reembolsoLancamentoId: { in: [...ids] } }] },
    select: { lancamentoId: true, reembolsoLancamentoId: true },
  });
  for (const a of arts) {
    if (a.lancamentoId) r.add(a.lancamentoId);
    if (a.reembolsoLancamentoId) r.add(a.reembolsoLancamentoId);
  }
  return r;
}

/**
 * Estado de AGORA dos lançamentos alvo de ajustes (spec §7, passo 1) — inclusive excluídos e
 * realizados: a busca só por id escapa do filtro de soft delete de propósito, para dizer "foi
 * excluído" em vez de "não existe". Id ausente do mapa = não existe mais.
 */
export async function alvosAtuais(ids: readonly string[]): Promise<Map<string, AlvoAtual>> {
  const unicos = [...new Set(ids)];
  const mapa = new Map<string, AlvoAtual>();
  if (unicos.length === 0) return mapa;
  const ls = await prisma.lancamento.findMany({
    where: { id: { in: unicos } },
    select: {
      id: true,
      tipo: true,
      status: true,
      excluidoEm: true,
      valor: true,
      data: true,
      vencimento: true,
      descricao: true,
      prioridade: true,
      confianca: true,
      caixinhaId: true,
      categoria: { select: { natureza: true, prioridadePadrao: true, pai: { select: { prioridadePadrao: true } } } },
    },
  });
  const art = await idsDeTaxaArt(ls.map((l) => l.id));
  for (const l of ls) {
    const data = dataDoEvento({ vencimento: l.vencimento ? isoDeDataDoBanco(l.vencimento) : null, data: isoDeDataDoBanco(l.data) });
    mapa.set(l.id, {
      id: l.id,
      tipo: l.tipo,
      natureza: l.categoria.natureza,
      descricao: l.descricao,
      ehTaxaArt: art.has(l.id),
      prioridadeEfetiva: prioridadeEfetiva({
        tipo: l.tipo,
        prioridade: l.prioridade,
        categoria: {
          natureza: l.categoria.natureza,
          prioridadePadrao: l.categoria.prioridadePadrao,
          prioridadePadraoPai: l.categoria.pai?.prioridadePadrao ?? null,
        },
      }),
      status: l.status,
      excluido: l.excluidoEm != null,
      data,
      valor: paraCentavos(l.valor),
      prioridade: l.prioridade,
      confianca: l.confianca,
      caixinhaId: l.caixinhaId,
    });
  }
  return mapa;
}

/** Só a foto observada (para a tela marcar ajuste obsoleto/inexistente de alvo fora da projeção). */
export async function observadosAtuais(ids: readonly string[]): Promise<Record<string, Observado | null>> {
  const mapa = await alvosAtuais(ids);
  const r: Record<string, Observado | null> = {};
  for (const id of new Set(ids)) {
    const a = mapa.get(id);
    r[id] = a
      ? { status: a.status, excluido: a.excluido, data: a.data, valor: a.valor, prioridade: a.prioridade, confianca: a.confianca, caixinhaId: a.caixinhaId }
      : null;
  }
  return r;
}
