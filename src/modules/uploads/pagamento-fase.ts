/**
 * Pagamento por fase (F7.4 — D31, D38). Regras puras, sem I/O — a integração fica em
 * `pagamento.ts`, os gates nas actions de aprovação.
 *
 * O valor da disciplina (`Disciplina.valor`, o pool dos PJ/freelancer) se divide entre as fases
 * pelo percentual de cada uma, e cada fase libera o SEU pagamento quando é aprovada ("Básico
 * de Fundação entregue → libera a etapa Básica"). Três regras sustentam isto:
 *
 * 1. FASE LIBERADA CONGELA. O pool da fase é fixado na liberação (`valorPagamento`) e, com ele,
 *    quem recebe. Daí em diante nem o valor da disciplina nem troca de responsável o mexem —
 *    "valor a pagar não pode mudar sozinho" (D38). Só um ajuste manual na Produção o move, e aí
 *    o total da disciplina anda pela mesma diferença (`writeBackFase`).
 * 2. O QUE FALTA SE REPARTE PELO % DO QUE FALTA. O pool de uma fase ainda não liberada é
 *    (valor da disciplina − já liberado) × % dela ÷ soma dos % das pendentes; a última pendente
 *    leva o resto exato. Assim, depois da última liberação, a soma dos pools é o valor da
 *    disciplina no centavo — em qualquer ordem de liberação, com o valor mudando entre elas, e
 *    com ajustes manuais pelo caminho (que ficam na fase ajustada, não vazam para as seguintes).
 * 3. UM MODO SÓ. A disciplina paga inteira (pagamento sem fase) OU por fase, nunca os dois — o
 *    modo é fixado na primeira liberação.
 */
import { validarPercentuais } from "@/modules/projetos/etapas";

export type FaseParaPagamento = {
  id: string;
  ordem: number;
  /** 0 a 100, 2 casas. */
  percentual: number;
  /** Nulo = ainda não liberada. */
  liberadaEm: Date | string | null;
  /** Pool fixado na liberação; nulo se não liberada. */
  valorPagamento: number | null;
};

export type ModoPagamento = "disciplina" | "fase" | "indefinido";

/**
 * Como a disciplina paga. `indefinido` = nada liberado ainda — a primeira liberação decide:
 * disciplina com fase libera por fase; sem fase, inteira.
 *
 * Pagamento cancelado não conta: é história, não modo. Uma disciplina cujo único pagamento
 * "inteiro" foi cancelado pode passar a pagar por fase.
 */
export function modoPagamento(
  pagamentos: readonly { etapaId: string | null; status: string }[],
  fases: readonly { liberadaEm: Date | string | null }[],
): ModoPagamento {
  const vivos = pagamentos.filter((p) => p.status !== "cancelado");
  if (vivos.some((p) => p.etapaId == null)) return "disciplina";
  if (vivos.some((p) => p.etapaId != null) || fases.some((f) => f.liberadaEm != null)) return "fase";
  return "indefinido";
}

/** Mensagem para quem tenta liberar por fase uma disciplina que já pagou inteira. */
export const MOTIVO_JA_PAGA_INTEIRA =
  "Esta disciplina já teve o pagamento liberado por inteiro — não dá para liberar por fase também.";

const centavos = (v: number) => Math.round(v * 100);
const paraPontosBase = (p: number) => Math.round(p * 100);
const reais = (c: number | bigint) => Number(c) / 100;

function brlSimples(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export type ResultadoPools =
  | { ok: true; pools: Map<string, number>; restante: number }
  | { ok: false; motivo: string };

/**
 * Pool de cada fase AINDA NÃO liberada (regra 2 do cabeçalho).
 *
 * Mesma aritmética de `calcularParcelas` (proposta composta) — centavos inteiros, meio para
 * cima, a última absorve —, sem reusar a função: ela exige que os percentuais somem 100 e recusa
 * 0%, e aqui o subconjunto de fases pendentes quase nunca soma 100, e fase de 0% é plano
 * legítimo (F4: "Básico 0% / Executivo 100%"). Pesos em pontos-base, contas em BigInt (o
 * produto valor × pontos-base passa de 2^53 para valores grandes).
 *
 * Recusa, nunca corrige:
 *  - percentuais de TODAS as fases ≠ 100 (a F4 deixou salvar rascunho; a F7 é quem reparte);
 *  - valor da disciplina menor que o já liberado (sobraria "resto" negativo);
 *  - valor pequeno demais para as fases pendentes (arredondar para cima estouraria o resto).
 *
 * Pendentes todas de 0% com resto positivo (ex.: o valor subiu depois do Básico 100% liberado):
 * o resto vai para a ÚLTIMA pendente, pela regra da última que absorve — é a única forma de a
 * soma dos pools continuar fechando no valor da disciplina.
 */
export function poolsDasFasesPendentes(valorDisciplina: number, fases: readonly FaseParaPagamento[]): ResultadoPools {
  const soma = validarPercentuais(fases);
  if (!soma.ok) {
    return {
      ok: false,
      motivo: `${soma.mensagem} Ajuste em "Etapas" da disciplina antes de liberar o pagamento.`,
    };
  }

  const liberadoCent = fases
    .filter((f) => f.liberadaEm != null)
    .reduce((s, f) => s + centavos(f.valorPagamento ?? 0), 0);
  const restanteCent = centavos(valorDisciplina) - liberadoCent;
  if (restanteCent < 0) {
    return {
      ok: false,
      motivo: `O valor da disciplina (${brlSimples(valorDisciplina)}) ficou menor que o já liberado nas fases (${brlSimples(reais(liberadoCent))}).`,
    };
  }

  const pendentes = fases
    .filter((f) => f.liberadaEm == null)
    .sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id));
  const pools = new Map<string, number>();
  if (pendentes.length === 0) return { ok: true, pools, restante: reais(restanteCent) };

  const pesos = pendentes.map((f) => BigInt(paraPontosBase(f.percentual)));
  const somaPesos = pesos.reduce((s, p) => s + p, BigInt(0));
  const resto = BigInt(restanteCent);
  const DOIS = BigInt(2);

  let acumulado = BigInt(0);
  pendentes.forEach((f, i) => {
    if (i === pendentes.length - 1) {
      pools.set(f.id, reais(resto - acumulado));
      return;
    }
    // resto × peso ÷ somaPesos, meio para cima, só com inteiros: (2·r·p + S) / (2·S).
    const c = somaPesos > BigInt(0) ? (DOIS * resto * pesos[i] + somaPesos) / (DOIS * somaPesos) : BigInt(0);
    pools.set(f.id, reais(c));
    acumulado += c;
  });

  if (resto - acumulado < BigInt(0)) {
    return { ok: false, motivo: "O valor da disciplina é pequeno demais para ser dividido entre as fases que faltam." };
  }
  return { ok: true, pools, restante: reais(restanteCent) };
}

/**
 * Pode mudar o valor da disciplina, estando em modo fase? `null` = pode.
 *
 * Mudar o valor só alimenta as fases que AINDA não foram liberadas (regra 2): as liberadas estão
 * congeladas. Por isso recusa quando não sobra fase nenhuma para receber a mudança, e quando o
 * valor novo fica abaixo do que já foi liberado.
 */
export function bloqueioValorEmModoFase(valorNovo: number, fases: readonly FaseParaPagamento[]): string | null {
  const pendentes = fases.filter((f) => f.liberadaEm == null);
  const liberadoCent = fases
    .filter((f) => f.liberadaEm != null)
    .reduce((s, f) => s + centavos(f.valorPagamento ?? 0), 0);
  if (pendentes.length === 0) {
    if (centavos(valorNovo) === liberadoCent) return null;
    return "Todas as fases já tiveram o pagamento liberado — ajuste os pagamentos na Produção, não o valor da disciplina.";
  }
  if (centavos(valorNovo) < liberadoCent) {
    return `O valor não pode ficar abaixo do já liberado nas fases (${brlSimples(reais(liberadoCent))}).`;
  }
  return null;
}

/**
 * Write-back de um ajuste manual num pagamento de fase (editar, corrigir, estornar ou cancelar
 * na Produção): o pool da fase passa a ser a soma dos pagamentos vivos dela, e o valor da
 * disciplina anda pela MESMA diferença.
 *
 * Andar pela diferença — e não recalcular o valor como "soma dos vivos", que é o write-back do
 * modo inteiro — é o que mantém as fases futuras intactas: o "que falta" (valor − liberado) não
 * muda, então o pool delas também não. Um acréscimo negociado no Básico fica no Básico.
 */
export function writeBackFase(p: {
  valorDisciplina: number;
  poolFaseAntes: number;
  somaVivosFase: number;
}): { valorDisciplina: number; poolFase: number } {
  const delta = centavos(p.somaVivosFase) - centavos(p.poolFaseAntes);
  return { valorDisciplina: reais(centavos(p.valorDisciplina) + delta), poolFase: reais(centavos(p.somaVivosFase)) };
}

/**
 * Fragmento de `include`/`select` do Prisma para a sigla da fase de um pagamento — quem mostra
 * o rótulo (`rotuloDisciplinaPagamento`) inclui isto ao lado de `disciplina`. Objeto literal,
 * sem importar o Prisma: este arquivo continua puro.
 */
export const SELECT_FASE_DO_PAGAMENTO = { select: { etapa: { select: { sigla: true } } } } as const;

/** "Elétrica · BS" — o rótulo que distingue duas linhas de pagamento da mesma disciplina. */
export function rotuloDisciplinaPagamento(disciplina: string, siglaFase: string | null | undefined): string {
  return siglaFase ? `${disciplina} · ${siglaFase}` : disciplina;
}
