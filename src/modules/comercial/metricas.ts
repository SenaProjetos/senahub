import type { EstagioNegociacao } from "@/generated/prisma/client";

/**
 * Métricas do Comercial (F6.3) — implementação das fórmulas de `docs/crm/05-metricas.md`.
 *
 * **Puro.** Sem Prisma, sem relógio, sem I/O: recebe linhas já lidas e devolve números. É o que
 * torna cada fórmula testável com valores fixos calculados à mão, e o que impede a mesma conta de
 * ser reescrita de um jeito ligeiramente diferente em cada tela — o problema que o dicionário
 * existe para resolver.
 *
 * ── As duas regras que valem para o arquivo inteiro ─────────────────────────────────────────
 *
 * 1. **Denominador zero devolve `null`, nunca `0`.** "Nenhuma proposta no período" e "nenhuma das
 *    propostas fechou" são fatos diferentes, e a tela que os exibe igual faz o time desconfiar do
 *    painel todo. Quem chama decide como mostrar a ausência (§1.4 do dicionário).
 * 2. **O relógio entra por parâmetro.** Nenhuma function daqui lê `new Date()`. Mesmo padrão de
 *    `validade.ts` (F5.6): é o que permite testar com data fixa em vez de com o dia de hoje.
 */

// ── Formatos de entrada ──────────────────────────────────────────────────────────────────────
// Declarados aqui, e não em cada chamador, porque a query e a função precisam concordar sobre o
// que é uma "linha" — é a divergência mais fácil de introduzir depois (§6 do dicionário).

export type LinhaNegociacao = {
  id: string;
  estagio: EstagioNegociacao;
  criadoEm: Date;
  dataFechamento: Date | null;
  previsaoFechamento: Date | null;
  valorNegociado: number | null;
  valorProposto: number | null;
  valorEstimado: number | null;
  /** 0–100, vinda de `ProbabilidadeEstagio` respeitando o override manual (ADR-12). */
  probabilidade: number;
  /** JÁ resolvido pela fusão de empresas (`COALESCE(fundidoEmId, id)` — §1.2 do dicionário). */
  empresaId: string;
  /** `null` = negociação sem prospecção de origem; fica fora do funil ponta a ponta (§2.9). */
  leadId: string | null;
};

export type LinhaVersaoProposta = {
  valorOriginal: number;
  /** Abatimento em **R$**, não percentual — `Negociacao.desconto` é coluna morta (§2.7/§2.8). */
  desconto: number | null;
  criadoEm: Date;
};

/** Uma etapa que uma negociação comprovadamente alcançou, lida da timeline (§3.10). */
export type EtapaAlcancada = { negociacaoId: string; etapa: EstagioNegociacao };

/** Intervalo fechado no início e ABERTO no fim (§1.3) — evita buraco/duplicata na virada do mês. */
export type Periodo = { inicio: Date; fim: Date };

const dentro = (d: Date | null, p: Periodo): boolean =>
  d != null && d.getTime() >= p.inicio.getTime() && d.getTime() < p.fim.getTime();

// ── Pipeline ─────────────────────────────────────────────────────────────────────────────────

/**
 * Estágios que contam como pipeline ABERTO — inclui `EM_ESPERA` (§2.5).
 *
 * Não é escolha nova: `ESTAGIOS_ENCERRADOS` (`jornada.ts`) é só `[PERDIDO, CANCELADO]`, e
 * `probabilidadeDe` **preserva** a probabilidade em `EM_ESPERA` com o comentário "pausar não é
 * perder" (ADR-12). O dicionário alinhou com o código em vez de criar uma terceira definição.
 */
export const ESTAGIOS_PIPELINE_ABERTO: readonly EstagioNegociacao[] = [
  "LEVANTAMENTO",
  "ORCAMENTO",
  "PROPOSTA_ENVIADA",
  "NEGOCIACAO",
  "EM_ESPERA",
] as const;

const noPipeline = (n: LinhaNegociacao) =>
  (ESTAGIOS_PIPELINE_ABERTO as readonly string[]).includes(n.estagio);

/**
 * Valor de uma negociação, em cascata do mais firme para o mais especulativo.
 *
 * `valorNegociado` (fechado) → `valorProposto` (mandamos preço) → `valorEstimado` (chute inicial).
 * `null` quando os três faltam — e isso NÃO vira zero: uma negociação sem valor nenhum é um item
 * de trabalho ("alguém precisa estimar"), não um negócio de R$ 0.
 */
export function valorDaNegociacao(n: LinhaNegociacao): number | null {
  return n.valorNegociado ?? n.valorProposto ?? n.valorEstimado ?? null;
}

export type Pipeline = {
  /** Soma de tudo que está aberto. */
  total: number;
  /** A parcela parada em `EM_ESPERA` — exibida SEPARADA, senão pipeline travado parece saudável. */
  emEspera: number;
  /** Quantas negociações abertas não têm valor nenhum. Acionável, não decorativo. */
  semValor: number;
};

/** Foto do pipeline aberto hoje (§3.7). Não recebe período: pipeline de março não existe. */
export function pipelineAberto(negociacoes: readonly LinhaNegociacao[]): Pipeline {
  let total = 0;
  let emEspera = 0;
  let semValor = 0;
  for (const n of negociacoes) {
    if (!noPipeline(n)) continue;
    const v = valorDaNegociacao(n);
    if (v == null) {
      semValor++;
      continue;
    }
    total += v;
    if (n.estagio === "EM_ESPERA") emEspera += v;
  }
  return { total, emEspera, semValor };
}

/**
 * Pipeline ponderado: `Σ valor × probabilidade` (§3.8) — a expectativa, não o teto.
 *
 * Mesmo conjunto de estágios do aberto. `probabilidade` é `Int @default(0)`, então `0` é legítimo
 * e zera a contribuição da linha — o que é o comportamento correto, não um caso a tratar.
 */
export function pipelinePonderado(negociacoes: readonly LinhaNegociacao[]): number {
  let total = 0;
  for (const n of negociacoes) {
    if (!noPipeline(n)) continue;
    const v = valorDaNegociacao(n);
    if (v == null) continue;
    total += (v * n.probabilidade) / 100;
  }
  return total;
}

// ── Contratos e ticket ───────────────────────────────────────────────────────────────────────

export type ValorContratado = {
  total: number;
  /** Contratos fechados no período (com valor ou sem). */
  quantidade: number;
  /** Fechados SEM `valorNegociado`: contam na quantidade, não na soma (§3.6). */
  semValor: number;
};

/** Valor contratado no período (§3.6). Sempre LÍQUIDO de desconto — ver §2.6 do dicionário. */
export function valorContratado(
  negociacoes: readonly LinhaNegociacao[],
  periodo: Periodo,
): ValorContratado {
  let total = 0;
  let quantidade = 0;
  let semValor = 0;
  for (const n of negociacoes) {
    if (n.estagio !== "CONTRATADO" || !dentro(n.dataFechamento, periodo)) continue;
    quantidade++;
    if (n.valorNegociado == null) semValor++;
    else total += n.valorNegociado;
  }
  return { total, quantidade, semValor };
}

/**
 * Ticket médio POR CONTRATO (§3.9/§2.2) — o valor típico de um negócio nosso.
 *
 * O denominador são os contratos **com** valor, não todos: incluir os sem valor puxaria a média
 * para baixo por ausência de dado, não por negócio pequeno. `null` quando não há nenhum.
 *
 * O ticket **por empresa** é outra métrica (concentração de carteira) e mora em `novosVsRecorrentes`.
 */
export function ticketMedioPorContrato(
  negociacoes: readonly LinhaNegociacao[],
  periodo: Periodo,
): number | null {
  const { total, quantidade, semValor } = valorContratado(negociacoes, periodo);
  const comValor = quantidade - semValor;
  return comValor === 0 ? null : total / comValor;
}

// ── Conversão ────────────────────────────────────────────────────────────────────────────────

export type ConversaoEtapas = {
  /** Tamanho da coorte — TODA ela, inclusive canceladas, em espera e ainda ativas (§2.4). */
  coorte: number;
  /** Fração da coorte que ALCANÇOU cada etapa. `null` quando a coorte é vazia. */
  taxas: Record<EstagioNegociacao, number | null>;
};

/**
 * Conversão entre etapas do funil de negociação (§3.10), por **coorte de criação** (§2.1).
 *
 * **"Alcançou" ≠ "está".** Uma negociação hoje em `CONTRATADO` passou por `PROPOSTA_ENVIADA` e
 * conta nas duas etapas; ler o estágio atual subestimaria toda etapa intermediária. Como não há
 * carimbo por estágio no schema, quem alcançou o quê vem da timeline (`ESTAGIO_ALTERADO` com
 * `de`/`para` crus no metadata — é exatamente para isso que eles são gravados crus).
 *
 * Recebe as etapas alcançadas de fora, já lidas: manter esta function pura é o que permite testar
 * o caso "passou por PROPOSTA_ENVIADA e voltou para ORCAMENTO" sem banco nenhum.
 */
export function conversaoEntreEtapas(
  coorte: readonly LinhaNegociacao[],
  alcancadas: readonly EtapaAlcancada[],
): ConversaoEtapas {
  const idsDaCoorte = new Set(coorte.map((n) => n.id));
  const porEtapa = new Map<EstagioNegociacao, Set<string>>();
  for (const a of alcancadas) {
    if (!idsDaCoorte.has(a.negociacaoId)) continue;
    const s = porEtapa.get(a.etapa) ?? new Set<string>();
    s.add(a.negociacaoId);
    porEtapa.set(a.etapa, s);
  }

  const vazia = coorte.length === 0;
  const taxa = (e: EstagioNegociacao) =>
    vazia ? null : (porEtapa.get(e)?.size ?? 0) / coorte.length;

  return {
    coorte: coorte.length,
    taxas: {
      LEVANTAMENTO: taxa("LEVANTAMENTO"),
      ORCAMENTO: taxa("ORCAMENTO"),
      PROPOSTA_ENVIADA: taxa("PROPOSTA_ENVIADA"),
      NEGOCIACAO: taxa("NEGOCIACAO"),
      CONTRATADO: taxa("CONTRATADO"),
      PERDIDO: taxa("PERDIDO"),
      EM_ESPERA: taxa("EM_ESPERA"),
      CANCELADO: taxa("CANCELADO"),
    },
  };
}

export type ConversaoPontaAPonta = {
  /** Prospecções da coorte — o denominador. */
  prospeccoes: number;
  /** Quantas viraram contrato. */
  contratos: number;
  /** `contratos / prospeccoes`, ou `null` se a coorte é vazia. */
  taxa: number | null;
  /**
   * Contratos que ficaram FORA da conta por não terem prospecção de origem (§2.9). Exibido junto:
   * um funil que cobre metade dos negócios sem avisar é pior que não ter funil.
   */
  contratosSemProspeccao: number;
};

/**
 * Conversão prospecção → contrato (§3.11), por coorte de prospecções.
 *
 * Negociação com `leadId: null` (criada direto, ou sintética da migração F5.2) **não entra em
 * nenhum dos dois lados** — não há prospecção que a origine, então somá-la ao numerador seria
 * dividir por um denominador que não a contém. Mas ela é reportada à parte, porque é um negócio
 * real e sumir com ela sem dizer nada distorce a leitura.
 */
export function conversaoPontaAPonta(
  prospeccoesDaCoorte: readonly { id: string }[],
  negociacoes: readonly LinhaNegociacao[],
): ConversaoPontaAPonta {
  const idsCoorte = new Set(prospeccoesDaCoorte.map((l) => l.id));
  const comContrato = new Set<string>();
  let contratosSemProspeccao = 0;

  for (const n of negociacoes) {
    if (n.estagio !== "CONTRATADO") continue;
    if (n.leadId == null) {
      contratosSemProspeccao++;
      continue;
    }
    if (idsCoorte.has(n.leadId)) comContrato.add(n.leadId);
  }

  const prospeccoes = prospeccoesDaCoorte.length;
  return {
    prospeccoes,
    contratos: comContrato.size,
    taxa: prospeccoes === 0 ? null : comContrato.size / prospeccoes,
    contratosSemProspeccao,
  };
}

// ── Tempo de fechamento ──────────────────────────────────────────────────────────────────────

export type TempoFechamento = {
  /** Média em dias. `null` quando nenhuma negociação válida fechou na coorte. */
  media: number | null;
  /** Mediana em dias — exibida junto da média: divergirem muito revela cauda longa. */
  mediana: number | null;
  /** Fechamentos com duração NEGATIVA, descartados. Ver o porquê abaixo. */
  descartadas: number;
};

const MS_POR_DIA = 86_400_000;

/**
 * Tempo médio (e mediano) entre abrir a negociação e fechar o contrato (§3.12).
 *
 * Coorte por data de criação. Só as que **fecharam** entram — incluir as ainda abertas com o tempo
 * até hoje misturaria "fechou rápido" com "ainda não fechou".
 *
 * **Duração negativa é descartada, não somada.** Rodando o SQL de referência contra o dev, a média
 * veio −7,75 dias: o seed de demonstração fabrica `dataFechamento` e `createdAt` sem relação
 * causal. Em produção não ocorre (o carimbo é `new Date()` na transição, sempre posterior), mas
 * uma média negativa numa tela destrói a confiança no painel inteiro — então a linha inválida sai
 * da conta e é **contada à parte**, para que o problema apareça em vez de ser silenciado.
 */
export function tempoMedioFechamento(
  negociacoes: readonly LinhaNegociacao[],
  periodo: Periodo,
): TempoFechamento {
  const dias: number[] = [];
  let descartadas = 0;

  for (const n of negociacoes) {
    if (n.estagio !== "CONTRATADO" || n.dataFechamento == null) continue;
    if (!dentro(n.criadoEm, periodo)) continue;
    const d = (n.dataFechamento.getTime() - n.criadoEm.getTime()) / MS_POR_DIA;
    if (d < 0) {
      descartadas++;
      continue;
    }
    dias.push(d);
  }

  if (dias.length === 0) return { media: null, mediana: null, descartadas };

  const media = dias.reduce((s, d) => s + d, 0) / dias.length;
  const ord = [...dias].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  const mediana = ord.length % 2 === 0 ? (ord[meio - 1] + ord[meio]) / 2 : ord[meio];

  return { media, mediana, descartadas };
}

// ── Desconto ─────────────────────────────────────────────────────────────────────────────────

export type DescontoMedio = {
  /**
   * `Σ desconto ÷ Σ valorOriginal × 100` — "de cada R$ 100 de tabela, quanto abrimos mão".
   * É a métrica PRINCIPAL: a pergunta de negócio é sobre dinheiro cedido.
   */
  ponderado: number | null;
  /**
   * `AVG(desconto ÷ valorOriginal) × 100` — hábito de negociar, onde uma proposta de R$ 5 mil
   * pesa igual a uma de R$ 500 mil. Secundária, para leitura comportamental.
   */
  simples: number | null;
};

/**
 * Desconto médio (§3.13), nas duas leituras que o §2.8 distingue.
 *
 * As duas existem de propósito, e divergem sempre que os descontos maiores estão nas propostas
 * menores (o caso comum). Publicar só uma delas sem dizer qual é confundir "quanto cedemos" com
 * "com que frequência cedemos".
 *
 * Versão SEM desconto entra com `0` — excluí-la mediria "desconto médio entre quem deu desconto",
 * que é outra pergunta. Versão com `valorOriginal <= 0` fica fora: não há tabela sobre a qual
 * calcular percentual, e dividir por zero daria `Infinity` na tela.
 */
export function descontoMedio(versoes: readonly LinhaVersaoProposta[]): DescontoMedio {
  const elegiveis = versoes.filter((v) => v.valorOriginal > 0);
  if (elegiveis.length === 0) return { ponderado: null, simples: null };

  let somaDesconto = 0;
  let somaOriginal = 0;
  let somaPercentuais = 0;
  for (const v of elegiveis) {
    const d = v.desconto ?? 0;
    somaDesconto += d;
    somaOriginal += v.valorOriginal;
    somaPercentuais += d / v.valorOriginal;
  }

  return {
    ponderado: somaOriginal === 0 ? null : (somaDesconto / somaOriginal) * 100,
    simples: (somaPercentuais / elegiveis.length) * 100,
  };
}

// ── Novos × recorrentes, e recompra ──────────────────────────────────────────────────────────

export type NovosVsRecorrentes = {
  contratosDeNovos: number;
  contratosDeRecorrentes: number;
  receitaNovos: number;
  receitaRecorrentes: number;
  /** Ticket por EMPRESA (§2.2) — concentração de carteira, não tamanho de negócio. */
  ticketPorEmpresa: number | null;
};

/**
 * Novos × recorrentes no período (§3.14).
 *
 * O marco é o **1º contrato da empresa**, com janela **retroativa infinita** (§2.3): escritório de
 * engenharia tem ciclo longo, e um cliente de 2019 que volta em 2026 é recorrente, não uma
 * conquista nova. Por isso a classificação precisa de TODO o histórico, não só do período — daí a
 * function receber os contratos completos e o período separado.
 *
 * `empresaId` já vem resolvido pela fusão (§1.2): sem isso, a mesma empresa fundida entraria duas
 * vezes e apareceria como recorrente de si mesma.
 */
export function novosVsRecorrentes(
  negociacoes: readonly LinhaNegociacao[],
  periodo: Periodo,
): NovosVsRecorrentes {
  const contratos = negociacoes
    .filter((n) => n.estagio === "CONTRATADO" && n.dataFechamento != null)
    .sort((a, b) => a.dataFechamento!.getTime() - b.dataFechamento!.getTime());

  const jaFechou = new Set<string>();
  let contratosDeNovos = 0;
  let contratosDeRecorrentes = 0;
  let receitaNovos = 0;
  let receitaRecorrentes = 0;
  let receitaTotal = 0;
  const empresasNoPeriodo = new Set<string>();

  for (const c of contratos) {
    const ehPrimeiro = !jaFechou.has(c.empresaId);
    jaFechou.add(c.empresaId);

    // A classificação olha todo o histórico; a CONTAGEM só o período.
    if (!dentro(c.dataFechamento, periodo)) continue;
    empresasNoPeriodo.add(c.empresaId);
    const valor = c.valorNegociado ?? 0;
    receitaTotal += valor;

    if (ehPrimeiro) {
      contratosDeNovos++;
      receitaNovos += valor;
    } else {
      contratosDeRecorrentes++;
      receitaRecorrentes += valor;
    }
  }

  return {
    contratosDeNovos,
    contratosDeRecorrentes,
    receitaNovos,
    receitaRecorrentes,
    ticketPorEmpresa: empresasNoPeriodo.size === 0 ? null : receitaTotal / empresasNoPeriodo.size,
  };
}

export type Recompra = {
  /** Empresas cujo 1º contrato caiu na coorte. */
  empresasCoorte: number;
  /** Quantas fecharam outro dentro da janela. */
  recompraram: number;
  /** `recompraram / empresasCoorte`, ou `null` — inclusive quando a janela ainda não fechou. */
  taxa: number | null;
  /** `true` quando `agora` ainda não passou do fim da janela para toda a coorte. */
  janelaAindaAberta: boolean;
};

/**
 * Taxa de recompra em N meses (§3.15).
 *
 * **O erro fácil desta métrica, e o motivo de `janelaAindaAberta` existir:** a taxa de 24 meses de
 * uma coorte de 2026 não existe até 2028. Calculá-la assim mesmo devolveria um número baixo e
 * convincente — que na verdade só diz "ainda não deu tempo". Enquanto a janela de qualquer empresa
 * da coorte não tiver fechado, `taxa` é `null` e a tela explica o motivo em vez de mostrar 0%.
 */
export function taxaRecompra(
  negociacoes: readonly LinhaNegociacao[],
  coorte: Periodo,
  meses: number,
  agora: Date,
): Recompra {
  const contratos = negociacoes
    .filter((n) => n.estagio === "CONTRATADO" && n.dataFechamento != null)
    .sort((a, b) => a.dataFechamento!.getTime() - b.dataFechamento!.getTime());

  const primeiroPorEmpresa = new Map<string, Date>();
  for (const c of contratos) {
    if (!primeiroPorEmpresa.has(c.empresaId)) primeiroPorEmpresa.set(c.empresaId, c.dataFechamento!);
  }

  const naCoorte = [...primeiroPorEmpresa.entries()].filter(([, d]) => dentro(d, coorte));
  if (naCoorte.length === 0) {
    return { empresasCoorte: 0, recompraram: 0, taxa: null, janelaAindaAberta: false };
  }

  const fimDaJanela = (d: Date) => {
    const f = new Date(d.getTime());
    f.setMonth(f.getMonth() + meses);
    return f;
  };

  const janelaAindaAberta = naCoorte.some(([, d]) => fimDaJanela(d).getTime() > agora.getTime());

  let recompraram = 0;
  for (const [empresaId, primeira] of naCoorte) {
    const limite = fimDaJanela(primeira);
    const houve = contratos.some(
      (c) =>
        c.empresaId === empresaId &&
        c.dataFechamento!.getTime() > primeira.getTime() &&
        c.dataFechamento!.getTime() <= limite.getTime(),
    );
    if (houve) recompraram++;
  }

  return {
    empresasCoorte: naCoorte.length,
    recompraram,
    taxa: janelaAindaAberta ? null : recompraram / naCoorte.length,
    janelaAindaAberta,
  };
}

// ── Forecast ─────────────────────────────────────────────────────────────────────────────────

export type Forecast = {
  /** Já contratado dentro do horizonte. */
  fechado: number;
  /** Ponderado das abertas COM previsão dentro do horizonte. */
  esperadoDoAberto: number;
  /** Total: `fechado + esperadoDoAberto`. */
  total: number;
  /**
   * Valor ponderado que ficou de FORA por falta de `previsaoFechamento`. Exibido junto: sem isso o
   * forecast parece completo quando não é, e a omissão é justamente o que dá para agir sobre.
   */
  ponderadoSemPrevisao: number;
};

/**
 * Forecast do horizonte (§3.18): o que já fechou mais a expectativa do que está aberto.
 *
 * Só entra na parte aberta a negociação **com** `previsaoFechamento` dentro do horizonte. Sem
 * previsão não vira palpite: vai para `ponderadoSemPrevisao`, que é uma fila de trabalho
 * ("alguém precisa datar isto"), não um número a somar.
 */
export function forecast(negociacoes: readonly LinhaNegociacao[], horizonte: Periodo): Forecast {
  const fechado = valorContratado(negociacoes, horizonte).total;

  let esperadoDoAberto = 0;
  let ponderadoSemPrevisao = 0;
  for (const n of negociacoes) {
    if (!noPipeline(n)) continue;
    const v = valorDaNegociacao(n);
    if (v == null) continue;
    const ponderado = (v * n.probabilidade) / 100;
    if (n.previsaoFechamento == null) ponderadoSemPrevisao += ponderado;
    else if (dentro(n.previsaoFechamento, horizonte)) esperadoDoAberto += ponderado;
  }

  return {
    fechado,
    esperadoDoAberto,
    total: fechado + esperadoDoAberto,
    ponderadoSemPrevisao,
  };
}
