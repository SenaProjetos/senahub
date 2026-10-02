import "server-only";
import { prisma } from "@/lib/prisma";
import { inicioDoDiaUtc } from "@/lib/data";
import { getConfigLiquidez } from "@/modules/financeiro/config/queries";
import { carregarCaixinhas, reservadosParaOMotor } from "@/modules/financeiro/caixinhas/queries";
import { recebimentosADistribuir } from "@/modules/financeiro/distribuicao/queries";
import { avisosDeRecorrencia, eventosProgramados, type AvisoRecorrencia } from "@/modules/financeiro/recorrencia/calculo";
import { anosDoHorizonte, calendarioFinanceiro, competenciasVinculadas, compromissosAtivos, lancamentosDaRecorrencia } from "@/modules/financeiro/recorrencia/queries";
import { diasEntre, isoDeDataDoBanco, somarDias } from "@/modules/financeiro/liquidez/datas";
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import { dataDoEvento, paraEventos, prioridadeEfetiva, STATUS_PENDENTES } from "@/modules/financeiro/liquidez/eventos";
import type { AlvoAtual } from "@/modules/financeiro/liquidez/aplicacao";
import { diasDeCaixa, JANELA_DIAS_DE_CAIXA, type DiasDeCaixa } from "@/modules/financeiro/liquidez/indicadores";
import { normalizarHorizonte, projetar, type Projecao } from "@/modules/financeiro/liquidez/motor";
import {
  alertasDaTorre,
  graficoDaTorre,
  indicadoresDaTorre,
  proximosDias,
  type AlertaTorre,
  type CaixinhaDaTorre,
  type GraficoDaTorre,
  type IndicadorTorre,
  type LinhaProxima,
} from "@/modules/financeiro/liquidez/torre";
import { agregarFaturas, type FaturaDoEvento } from "@/modules/financeiro/cartoes/eventos";
import { idsContasDeInvestimento } from "@/modules/financeiro/investimentos/service";
import { vencimentosDeInvestimento } from "@/modules/financeiro/investimentos/queries";
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
  /** Diferença de valor e possível pagamento em dobro nos compromissos recorrentes (§9). */
  avisosRecorrencia: AvisoRecorrencia[];
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

  const contas = await prisma.contaBancaria.findMany({ select: { id: true, ativo: true, saldoInicial: true, saldoInicialEm: true } });
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

  // M4: a conta de cada investimento fica fora do caixa (S0) — o dinheiro está aplicado.
  const contasFora = new Set(await idsContasDeInvestimento());
  const ativas = contas.filter((c) => c.ativo && !contasFora.has(c.id));
  const realizadosCent = realizados.map((l) => ({
    contaId: l.contaId,
    tipo: l.tipo,
    valor: paraCentavos(l.valorEfetivo ?? l.valor),
    dataConfirmacao: l.dataConfirmacao ? isoDeDataDoBanco(l.dataConfirmacao) : null,
    natureza: l.categoria.natureza,
  }));
  const base = saldoBase(
    ativas.map((c) => ({ id: c.id, saldoInicial: paraCentavos(c.saldoInicial), saldoInicialEm: c.saldoInicialEm ? isoDeDataDoBanco(c.saldoInicialEm) : null })),
    realizadosCent,
    contasFora,
  );
  const anomalias = anomaliasDoSaldo(hoje, new Set(ativas.map((c) => c.id)), realizadosCent, contasFora);

  let saidasNaJanela = 0;
  let maisAntigo: DataIso | null = null;
  const inicioJanelaIso = isoDeDataDoBanco(inicioJanela);
  for (const l of realizadosCent) {
    if (!l.dataConfirmacao) continue;
    if (maisAntigo == null || l.dataConfirmacao < maisAntigo) maisAntigo = l.dataConfirmacao;
    if (l.contaId && contasFora.has(l.contaId)) continue;
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
      faturaId: true,
      fornecedor: { select: { nome: true } },
      cliente: { select: { nome: true } },
      projeto: { select: { codigo: true } },
      categoria: {
        select: { nome: true, natureza: true, prioridadePadrao: true, pai: { select: { prioridadePadrao: true } } },
      },
    },
  });

  const idsArt = await idsDeTaxaArt(pendentes.map((l) => l.id));

  // M3: compras do mesmo cartão viram UM evento no vencimento da fatura (spec §6). O total projetado
  // é o mesmo; o que muda é a agenda não mostrar seis saídas soltas no mesmo dia.
  const idsFatura = [...new Set(pendentes.map((l) => l.faturaId).filter((x): x is string => !!x))];
  const faturas = idsFatura.length
    ? await prisma.faturaCartao.findMany({
        where: { id: { in: idsFatura } },
        select: {
          id: true,
          competencia: true,
          cartao: { select: { nome: true, tipo: true, socio: { select: { user: { select: { name: true } } } } } },
        },
      })
    : [];
  const faturaPorId = new Map(faturas.map((f) => [f.id, f]));
  const faturaPorLancamento = new Map<string, FaturaDoEvento>();
  for (const l of pendentes) {
    const f = l.faturaId ? faturaPorId.get(l.faturaId) : null;
    if (!f) continue;
    faturaPorLancamento.set(l.id, {
      faturaId: f.id,
      competencia: f.competencia,
      cartaoNome: f.cartao.nome,
      tipoCartao: f.cartao.tipo,
      socioNome: f.cartao.socio?.user.name ?? null,
    });
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

  // Compromissos recorrentes (§9): cada competência SEM lançamento vinculado vira um evento
  // "Programado". Com vínculo, o lançamento é que vale — e ele já está entre os pendentes.
  const compromissos = await compromissosAtivos();
  const vinculadas = compromissos.length ? await competenciasVinculadas() : new Set<string>();
  const calendario = compromissos.length ? await calendarioFinanceiro(anosDoHorizonte(hoje, fim)) : null;
  const programados = calendario ? eventosProgramados(compromissos, { hoje, fim, vinculadas, calendario }) : [];
  const avisos = calendario
    ? avisosDeRecorrencia(
        compromissos,
        await lancamentosDaRecorrencia([...new Set(compromissos.map((c) => c.categoriaId))], hojeData, fimData),
        { hoje, fim, calendario },
      )
    : [];

  return {
    hoje,
    horizonteDias,
    reservaMinima: config.reservaMinima,
    diasParaIncerta: config.diasParaIncerta,
    caixaAtual: base.total,
    anomalias,
    eventos: [
      ...agregarFaturas(paraEventos(entradas, { hoje, diasParaIncerta: config.diasParaIncerta }), faturaPorLancamento),
      ...programados,
      ...(await vencimentosDeInvestimento(hoje, fim)),
    ],
    avisosRecorrencia: avisos,
    caixinhas: await reservadosParaOMotor(hoje),
    historico: { saidasNaJanela, diasDeHistorico: maisAntigo ? diasEntre(maisAntigo, hoje) : 0 },
  };
}

/** Tudo o que a torre de controle da Visão geral mostra (F7). */
export type TorreDeControle = {
  hoje: DataIso;
  horizonteDias: number;
  caixaAtual: Centavos;
  reservaMinima: Centavos;
  /** Reservado e livre de HOJE (o livre nunca é negativo; a falta vira `descoberto`). */
  posicao: { reservado: Centavos; livre: Centavos; descoberto: Centavos };
  indicadores: IndicadorTorre[];
  grafico: GraficoDaTorre;
  alertas: AlertaTorre[];
  proximos: LinhaProxima[];
  caixinhas: CaixinhaDaTorre[];
  anomalias: AnomaliasDoSaldo;
  diasDeCaixa: DiasDeCaixa;
};

/**
 * Torre de controle: o MESMO motor do planejador, rodado em dois cenários — Provável (o do dia a
 * dia) e Conservador (só entrada confirmada pelo cliente) —, mais as caixinhas, a fila de
 * distribuição e os indicadores. A Visão geral deixou de ter conta própria de projeção: duas contas
 * diferentes para o mesmo caixa era o risco nº 1 do plano.
 */
export async function torreDeControle(opcoes: { horizonteDias?: number; agora?: Date } = {}): Promise<TorreDeControle> {
  const base = await baseDoPlanejador(opcoes);
  const comum = {
    hoje: base.hoje,
    horizonteDias: base.horizonteDias,
    caixaAtual: base.caixaAtual,
    reservaMinima: base.reservaMinima,
    eventos: base.eventos,
    caixinhas: base.caixinhas,
  };
  const provavel: Projecao = projetar({ ...comum, eixos: { entradas: "provaveis", compromissos: "todos" } });
  const conservador: Projecao = projetar({ ...comum, eixos: { entradas: "confirmadas", compromissos: "todos" } });

  const { distribuirDesde } = await getConfigLiquidez();
  const fila = await recebimentosADistribuir(distribuirDesde);
  const detalhadas = await carregarCaixinhas({ hoje: base.hoje });
  const caixinhas: CaixinhaDaTorre[] = detalhadas.map((c) => ({
    id: c.id,
    nome: c.nome,
    reservado: c.situacao.reservado,
    necessidade: c.situacao.necessidade,
    percentual: c.situacao.percentual,
    falta: c.situacao.falta,
  }));
  const dias = diasDeCaixa({ caixaAtual: base.caixaAtual, ...base.historico });

  return {
    hoje: base.hoje,
    horizonteDias: base.horizonteDias,
    caixaAtual: base.caixaAtual,
    reservaMinima: base.reservaMinima,
    posicao: { reservado: provavel.hoje.reservado, livre: provavel.hoje.livre, descoberto: provavel.hoje.descoberto },
    indicadores: indicadoresDaTorre({ provavel, conservador, reservaMinima: base.reservaMinima, diasDeCaixa: dias }),
    grafico: graficoDaTorre(provavel, conservador, base.reservaMinima),
    alertas: alertasDaTorre({
      hoje: base.hoje,
      provavel,
      eventos: base.eventos,
      caixinhas,
      aDistribuir: { qtd: fila.length, valor: fila.reduce((s, r) => s + r.valor, 0) },
      avisosRecorrencia: base.avisosRecorrencia.map((a) => a.texto),
    }),
    proximos: proximosDias(provavel, base.eventos, 7),
    caixinhas,
    anomalias: base.anomalias,
    diasDeCaixa: dias,
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
