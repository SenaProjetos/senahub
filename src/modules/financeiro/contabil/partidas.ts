/**
 * Motor de partidas da integração contábil (M5, fase C2) — PURO: sem Prisma, sem Next, sem relógio.
 * Spec: docs/superpowers/specs/2026-10-07-integracao-contabil.md §5.
 *
 * O SenaHub não escritura: as partidas são DERIVADAS dos lançamentos do mês fechado a cada exportação.
 * Cada linha é uma partida simples (uma conta de débito, uma de crédito), no código REDUZIDO do Alterdata.
 *
 * Eventos (pedido do contador: "dois lançamentos, reconhecimento e baixa"):
 *  - E1 reconhecimento: título na competência — despesa D categoria / C contrapartida; receita o inverso;
 *  - E2 baixa: pagamento — despesa D contrapartida / C banco; receita o inverso (compras de cartão: uma
 *    linha por fatura, D cartão / C banco);
 *  - E3 transferência entre contas próprias: UMA linha por par, D destino / C origem;
 *  - E4 movimento: juros/multa/desconto da baixa (acessórios M7) e rendimento/IR na conta de um
 *    investimento — linha única contra o banco.
 */

import { ratearValor, type ItemRateio } from "@/modules/financeiro/lancamentos/rateio";

export type StatusContabil = "previsto" | "aguardando_aprovacao" | "confirmado" | "cancelado" | "previsao";

export type LancamentoContabil = {
  id: string;
  tipo: "receita" | "despesa";
  status: StatusContabil;
  descricao: string;
  /** Valor do título, em centavos. */
  valorCentavos: number;
  /** O que foi pago/recebido (`valorEfetivo ?? valor`), em centavos. */
  pagoCentavos: number;
  /** `dataCompetencia ?? data`, `YYYY-MM-DD`. */
  competencia: string;
  /** `dataConfirmacao`, `YYYY-MM-DD`, ou null se em aberto. */
  pagamento: string | null;
  categoriaId: string;
  contaId: string | null;
  clienteId: string | null;
  fornecedorId: string | null;
  contatoNome: string | null;
  cartaoId: string | null;
  faturaId: string | null;
  /** "Fatura Itaú Black 2026-09" — histórico da linha da fatura. */
  faturaRotulo: string | null;
  transferenciaId: string | null;
  acessorioDeId: string | null;
  restanteDeId: string | null;
  numeroDocumento: string | null;
  chaveNfe: string | null;
  centroId: string | null;
  projetoId: string | null;
  rateio: readonly ItemRateio[];
};

/** De-para já carregado: tudo em código reduzido (número) ou código de centro (texto). */
export type DeParaDoMotor = {
  /** Mãe de cada categoria (null na raiz): o de-para e o "não exportar" herdam da mãe. */
  paiDaCategoria: Readonly<Record<string, string | null>>;
  categoria: Readonly<Record<string, number>>;
  contrapartidaDaCategoria: Readonly<Record<string, number>>;
  naoExportar: ReadonlySet<string>;
  contaBancaria: Readonly<Record<string, number>>;
  cartao: Readonly<Record<string, number>>;
  cliente: Readonly<Record<string, number>>;
  fornecedor: Readonly<Record<string, number>>;
  padraoClientes: number | null;
  padraoFornecedores: number | null;
  centro: Readonly<Record<string, string>>;
  projeto: Readonly<Record<string, string>>;
  /** Contas bancárias que SÃO um investimento (M4): receita/despesa avulsa nelas é movimento (E4). */
  contasDeInvestimento: ReadonlySet<string>;
};

export type EventoContabil = "reconhecimento" | "baixa" | "transferencia" | "movimento";

export type LinhaContabil = {
  data: string;
  /** Reduzido; null = falta o de-para (a linha sai em branco nessa coluna, com pendência). */
  debito: number | null;
  credito: number | null;
  valorCentavos: number;
  historico: string;
  documento: string | null;
  chaveNfe: string | null;
  centro: string | null;
  subcentro: string | null;
  /** Lançamento de origem (na linha da fatura: o primeiro da fatura). */
  lancamentoId: string;
  evento: EventoContabil;
};

export type AlvoPendencia = "categoria" | "contrapartida" | "conta_bancaria" | "cartao" | "padrao" | "sem_conta" | "transferencia";

export type Pendencia = {
  alvo: AlvoPendencia;
  /** Id da categoria/conta/cartão; "clientes"/"fornecedores" no padrão; id do lançamento em sem_conta/transferência. */
  alvoId: string;
  /** Quantos lançamentos do mês ficaram com essa conta em branco. */
  lancamentos: number;
};

export type ResumoContabil = {
  linhas: LinhaContabil[];
  pendencias: Pendencia[];
  totalCentavos: number;
  /** Fora do arquivo de propósito. */
  fora: {
    /** Categoria marcada "não exportar" (folha CLT: o contador lança). */
    naoExportar: number;
    aguardandoAprovacao: number;
    /** Por conta bancária: o realizado no mês que ficou fora (para a conferência com o extrato). */
    realizadoForaPorConta: Readonly<Record<string, number>>;
  };
};

const ORDEM_EVENTO: Record<EventoContabil, number> = { reconhecimento: 0, baixa: 1, transferencia: 2, movimento: 3 };

const doMes = (dia: string | null, mes: string): dia is string => dia != null && dia.slice(0, 7) === mes;

/** Sobe a cadeia de mães até achar um valor (o de-para da categoria herda da mãe, como `tipoCusto`). */
function herdado<T>(categoriaId: string, mapa: Readonly<Record<string, T>>, pai: DeParaDoMotor["paiDaCategoria"]): T | undefined {
  const visitados = new Set<string>();
  let atual: string | null | undefined = categoriaId;
  while (atual && !visitados.has(atual)) {
    visitados.add(atual);
    if (mapa[atual] !== undefined) return mapa[atual];
    atual = pai[atual];
  }
  return undefined;
}

function naoExporta(categoriaId: string, dp: DeParaDoMotor): boolean {
  const visitados = new Set<string>();
  let atual: string | null | undefined = categoriaId;
  while (atual && !visitados.has(atual)) {
    visitados.add(atual);
    if (dp.naoExportar.has(atual)) return true;
    atual = dp.paiDaCategoria[atual];
  }
  return false;
}

export function gerarPartidas(mes: string, lancamentos: readonly LancamentoContabil[], dp: DeParaDoMotor): ResumoContabil {
  const linhas: LinhaContabil[] = [];
  const pend = new Map<string, { alvo: AlvoPendencia; alvoId: string; ids: Set<string> }>();
  const fora = { naoExportar: 0, aguardandoAprovacao: 0, realizadoForaPorConta: {} as Record<string, number> };

  const pendente = (alvo: AlvoPendencia, alvoId: string, lancamentoId: string) => {
    const k = `${alvo}:${alvoId}`;
    const p = pend.get(k) ?? { alvo, alvoId, ids: new Set<string>() };
    p.ids.add(lancamentoId);
    pend.set(k, p);
  };

  const contaDaCategoria = (l: LancamentoContabil): number | null => {
    const r = herdado(l.categoriaId, dp.categoria, dp.paiDaCategoria);
    if (r === undefined) pendente("categoria", l.categoriaId, l.id);
    return r ?? null;
  };

  const contaDoBanco = (l: LancamentoContabil, contaId: string | null = l.contaId): number | null => {
    if (!contaId) {
      pendente("sem_conta", l.id, l.id);
      return null;
    }
    const r = dp.contaBancaria[contaId];
    if (r === undefined) pendente("conta_bancaria", contaId, l.id);
    return r ?? null;
  };

  /** Contrapartida do título: cartão → contrapartida da categoria → conta do contato → padrão. */
  const contrapartida = (l: LancamentoContabil): number | null => {
    if (l.cartaoId) {
      const r = dp.cartao[l.cartaoId];
      if (r === undefined) pendente("cartao", l.cartaoId, l.id);
      return r ?? null;
    }
    const daCategoria = herdado(l.categoriaId, dp.contrapartidaDaCategoria, dp.paiDaCategoria);
    if (daCategoria !== undefined) return daCategoria;
    if (l.tipo === "receita") {
      if (l.clienteId && dp.cliente[l.clienteId] !== undefined) return dp.cliente[l.clienteId];
      if (dp.padraoClientes == null) pendente("padrao", "clientes", l.id);
      return dp.padraoClientes;
    }
    if (l.fornecedorId && dp.fornecedor[l.fornecedorId] !== undefined) return dp.fornecedor[l.fornecedorId];
    if (dp.padraoFornecedores == null) pendente("padrao", "fornecedores", l.id);
    return dp.padraoFornecedores;
  };

  const historico = (l: LancamentoContabil, prefixo = "") => {
    const contato = l.contatoNome && !l.descricao.includes(l.contatoNome) ? ` — ${l.contatoNome}` : "";
    return `${prefixo}${l.descricao}${contato}`;
  };

  /** Linha(s) com conta de resultado: leva centro/subcentro e se divide pelo rateio (M10). */
  const comCentro = (l: LancamentoContabil, base: Omit<LinhaContabil, "centro" | "subcentro">) => {
    if (l.rateio.length >= 2) {
      const partes = ratearValor(base.valorCentavos, l.rateio);
      l.rateio.forEach((item, i) => {
        if (partes[i] > 0)
          linhas.push({
            ...base,
            valorCentavos: partes[i],
            centro: item.centroId ? (dp.centro[item.centroId] ?? null) : null,
            subcentro: item.projetoId ? (dp.projeto[item.projetoId] ?? null) : null,
          });
      });
      return;
    }
    linhas.push({
      ...base,
      centro: l.centroId ? (dp.centro[l.centroId] ?? null) : null,
      subcentro: l.projetoId ? (dp.projeto[l.projetoId] ?? null) : null,
    });
  };

  const semCentro = (base: Omit<LinhaContabil, "centro" | "subcentro">) => linhas.push({ ...base, centro: null, subcentro: null });

  const porTransferencia = new Map<string, LancamentoContabil[]>();
  for (const l of lancamentos) {
    if (l.transferenciaId) porTransferencia.set(l.transferenciaId, [...(porTransferencia.get(l.transferenciaId) ?? []), l]);
  }

  // Baixa das compras de cartão: uma linha por fatura + dia + conta.
  const faturas = new Map<string, { primeiro: LancamentoContabil; valor: number }>();

  for (const l of lancamentos) {
    const realizadoNoMes = l.status === "confirmado" && doMes(l.pagamento, mes);

    if (l.status === "cancelado" || l.status === "previsao") continue;

    if (l.transferenciaId) {
      // E3 — uma linha por par, emitida pela perna de saída (despesa).
      if (!realizadoNoMes || l.tipo !== "despesa") continue;
      const entrada = (porTransferencia.get(l.transferenciaId) ?? []).find((x) => x.tipo === "receita");
      if (!entrada) pendente("transferencia", l.id, l.id);
      semCentro({
        data: l.pagamento!,
        debito: entrada ? contaDoBanco(entrada) : null,
        credito: contaDoBanco(l),
        valorCentavos: l.pagoCentavos,
        historico: l.descricao,
        documento: l.numeroDocumento,
        chaveNfe: l.chaveNfe,
        lancamentoId: l.id,
        evento: "transferencia",
      });
      continue;
    }

    if (naoExporta(l.categoriaId, dp)) {
      if (doMes(l.competencia, mes) || realizadoNoMes) fora.naoExportar++;
      if (realizadoNoMes && l.contaId) {
        const efeito = l.tipo === "receita" ? l.pagoCentavos : -l.pagoCentavos;
        fora.realizadoForaPorConta[l.contaId] = (fora.realizadoForaPorConta[l.contaId] ?? 0) + efeito;
      }
      continue;
    }

    if (l.status === "aguardando_aprovacao") {
      if (doMes(l.competencia, mes)) fora.aguardandoAprovacao++;
      continue;
    }

    const movimento = l.acessorioDeId != null || (l.contaId != null && dp.contasDeInvestimento.has(l.contaId));
    if (movimento) {
      // E4 — linha única contra o banco, no dia do pagamento.
      if (!realizadoNoMes) continue;
      const cat = contaDaCategoria(l);
      const banco = contaDoBanco(l);
      comCentro(l, {
        data: l.pagamento!,
        debito: l.tipo === "despesa" ? cat : banco,
        credito: l.tipo === "despesa" ? banco : cat,
        valorCentavos: l.pagoCentavos,
        historico: historico(l),
        documento: l.numeroDocumento,
        chaveNfe: l.chaveNfe,
        lancamentoId: l.id,
        evento: "movimento",
      });
      continue;
    }

    // E1 — reconhecimento. O resto de um pagamento parcial é o MESMO título: não nasce de novo.
    if (doMes(l.competencia, mes) && l.restanteDeId == null && (l.status === "previsto" || l.status === "confirmado")) {
      const cat = contaDaCategoria(l);
      const cp = contrapartida(l);
      comCentro(l, {
        data: l.competencia,
        debito: l.tipo === "despesa" ? cat : cp,
        credito: l.tipo === "despesa" ? cp : cat,
        valorCentavos: l.valorCentavos,
        historico: historico(l),
        documento: l.numeroDocumento,
        chaveNfe: l.chaveNfe,
        lancamentoId: l.id,
        evento: "reconhecimento",
      });
    }

    // E2 — baixa.
    if (realizadoNoMes) {
      if (l.cartaoId && l.faturaId) {
        const k = `${l.faturaId}|${l.pagamento}|${l.contaId ?? ""}`;
        const f = faturas.get(k);
        if (f) f.valor += l.pagoCentavos;
        else faturas.set(k, { primeiro: l, valor: l.pagoCentavos });
        continue;
      }
      const cp = contrapartida(l);
      const banco = contaDoBanco(l);
      semCentro({
        data: l.pagamento!,
        debito: l.tipo === "despesa" ? cp : banco,
        credito: l.tipo === "despesa" ? banco : cp,
        valorCentavos: l.pagoCentavos,
        historico: historico(l, l.tipo === "despesa" ? "Pagamento: " : "Recebimento: "),
        documento: l.numeroDocumento,
        chaveNfe: l.chaveNfe,
        lancamentoId: l.id,
        evento: "baixa",
      });
    }
  }

  for (const { primeiro: l, valor } of faturas.values()) {
    const cartao = dp.cartao[l.cartaoId!];
    if (cartao === undefined) pendente("cartao", l.cartaoId!, l.id);
    semCentro({
      data: l.pagamento!,
      debito: cartao ?? null,
      credito: contaDoBanco(l),
      valorCentavos: valor,
      historico: `Pagamento: ${l.faturaRotulo ?? "fatura do cartão"}`,
      documento: null,
      chaveNfe: null,
      lancamentoId: l.id,
      evento: "baixa",
    });
  }

  const finais = linhas
    .filter((x) => x.valorCentavos > 0)
    .sort((a, b) => a.data.localeCompare(b.data) || ORDEM_EVENTO[a.evento] - ORDEM_EVENTO[b.evento] || a.lancamentoId.localeCompare(b.lancamentoId));
  return {
    linhas: finais,
    pendencias: [...pend.values()]
      .map((p) => ({ alvo: p.alvo, alvoId: p.alvoId, lancamentos: p.ids.size }))
      .sort((a, b) => b.lancamentos - a.lancamentos || a.alvo.localeCompare(b.alvo) || a.alvoId.localeCompare(b.alvoId)),
    totalCentavos: finais.reduce((s, x) => s + x.valorCentavos, 0),
    fora,
  };
}

/**
 * Efeito das linhas numa conta contábil (débito soma, crédito subtrai), em centavos. Para a conta de um
 * banco, mais o que ficou fora de propósito naquela conta, tem de dar entradas − saídas do Extrato por
 * conta no mesmo mês — a invariante que o smoke confere.
 */
export function movimentoDaConta(linhas: readonly LinhaContabil[], reduzido: number): number {
  let total = 0;
  for (const l of linhas) {
    if (l.debito === reduzido) total += l.valorCentavos;
    if (l.credito === reduzido) total -= l.valorCentavos;
  }
  return total;
}
