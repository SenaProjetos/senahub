/**
 * Regras puras da etapa de disciplina (F4 — par disciplina × fase, D30/D37).
 *
 * PURO: sem I/O. Mesmo desenho de `aprovacao.ts`, `aging.ts` e `parcelas.ts` — as
 * invariantes que custam caro quando quebram moram aqui, com teste vermelho para cada uma,
 * e não soltas dentro de uma action.
 *
 * Datas em `YYYY-MM-DD`: prazo é dia-calendário (ver `lib/data.ts`), e comparar ISO como
 * texto é exato e imune a fuso.
 */
import type { StatusDisciplina } from "@/generated/prisma/client";
import { transicaoDisciplinaPermitida } from "./status";

type Dia = string;

// Aritmética de percentual reimplementada aqui, e não importada de
// `comercial/proposta-composta/parcelas`: são três linhas, e o import prenderia `projetos` aos
// internos do CRM. A régua é a MESMA — pontos-base (1% = 100), para 33,33 + 33,33 + 33,34
// fechar 100 em inteiro e não em 99,99999.
const paraPontosBase = (p: number) => Math.round(p * 100);

/** Soma em pontos-base, devolvida em percentual com 2 casas. */
function somaPercentuais(itens: readonly { percentual: number }[]): number {
  return itens.reduce((s, i) => s + (Number.isFinite(i.percentual) ? paraPontosBase(i.percentual) : 0), 0) / 100;
}

/** Percentual escrito em pt-BR, sem zeros à direita: 30 → "30%", 33.33 → "33,33%". */
function rotuloPercentual(p: number): string {
  return `${String(Math.round(p * 100) / 100).replace(".", ",")}%`;
}

/**
 * `YYYY-MM-DD` que é um dia de verdade, num ano plausível para prazo de projeto.
 *
 * Existe porque o campo de data nativo do navegador, digitado dígito a dígito, passa por
 * valores intermediários válidos para o formato ("0002-10-12" enquanto se digita o ano), e
 * `Date.UTC` não recusa mês 13 nem 30 de fevereiro — rola para o mês seguinte em silêncio. Um
 * prazo desses consolidaria como o prazo da disciplina. A faixa 2000–2099 não é regra de
 * negócio: é o corte que separa digitação incompleta de data real.
 */
export function prazoEtapaValido(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (ano < 2000 || ano > 2099) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/**
 * Prazo da disciplina a partir das etapas (F4.2): o MAIOR prazo entre as etapas que TÊM
 * prazo. Sem nenhuma etapa com prazo, devolve o prazo ATUAL, intocado.
 *
 * O "mantém" não é detalhe. Adicionar Básico e Executivo e só depois preencher as datas é o
 * fluxo normal, então existir etapa sem prazo é rotina. Um máximo ingênuo devolveria `null`
 * nesse intervalo e apagaria o prazo contratual da disciplina — calando, sem aviso,
 * `alertasPrazoDisciplina`, `saudeProjeto` e o portal do cliente.
 */
export function consolidarPrazoDisciplina(
  etapas: readonly { prazo: Dia | null }[],
  prazoAtual: Dia | null,
): Dia | null {
  const comPrazo = etapas.map((e) => e.prazo).filter((p): p is Dia => p != null);
  if (comPrazo.length === 0) return prazoAtual;
  return comPrazo.reduce((a, b) => (a > b ? a : b));
}

/**
 * A etapa que define o prazo da disciplina — a de maior prazo. É nela que `reabrirDisciplina`
 * grava o novo prazo: gravar numa etapa menor não mudaria o prazo consolidado, e a reabertura
 * pareceria ter funcionado sem ter mudado nada.
 *
 * ORDENA SOZINHA por `ordem` (desempate por `id`), em vez de confiar na ordem recebida. O
 * Prisma não devolve por `ordem` sem `orderBy`, e deixar a correção nas mãos de cada chamador
 * é como uma reabertura acaba gravando na etapa errada.
 *
 * Empate de prazo fica com a de menor `ordem`. Sem nenhuma etapa com prazo, fica com a de
 * MAIOR `ordem` — a fase mais adiantada do trabalho.
 */
export function etapaQueDefineOPrazo<T extends { id: string; prazo: Dia | null; ordem: number }>(
  etapas: readonly T[],
): T | null {
  if (etapas.length === 0) return null;
  const ordenadas = [...etapas].sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id));
  let escolhida: T | null = null;
  for (const e of ordenadas) {
    if (e.prazo == null) continue;
    if (escolhida == null || e.prazo > (escolhida.prazo as Dia)) escolhida = e;
  }
  return escolhida ?? ordenadas[ordenadas.length - 1];
}

export type ResultadoPercentuais =
  | { ok: true; soma: number }
  | { ok: false; soma: number; mensagem: string };

/**
 * Os percentuais fecham 100%? Mesma régua de `calcularParcelas`: pontos-base, para 33,33 +
 * 33,33 + 33,34 não virar 99,99999.
 *
 * RECUSA, nunca corrige. Ajustar em silêncio a última etapa para fechar 100 esconderia
 * exatamente o erro que a proposta composta foi feita para barrar (planos somando 105% e
 * 110% nas 163 propostas auditadas). Quem repartir dinheiro com isso — a F7 — tem de
 * receber a recusa e mostrá-la.
 *
 * Disciplina sem etapa é válida (soma 0, nada a repartir): é o estado de toda disciplina
 * existente.
 *
 * ACEITA 0% numa etapa — e isso DIVERGE de propósito de `calcularParcelas`, que recusa
 * `<= 0`. Lá a parcela É o pagamento; parcela de 0% não é parcela. Aqui a etapa carrega
 * prazo e status além do dinheiro: "Básico 0% / Executivo 100%" é plano real (o Básico é
 * cronograma, só o Executivo é faturado). Não "alinhar" com a proposta recusando 0.
 */
export function validarPercentuais(etapas: readonly { percentual: number }[]): ResultadoPercentuais {
  if (etapas.length === 0) return { ok: true, soma: 0 };
  for (const e of etapas) {
    if (!Number.isFinite(e.percentual) || e.percentual < 0 || e.percentual > 100) {
      return {
        ok: false,
        soma: somaPercentuais(etapas),
        mensagem: "Cada etapa deve ter um percentual entre 0% e 100%.",
      };
    }
  }
  const soma = somaPercentuais(etapas);
  if (paraPontosBase(soma) !== 10000) {
    return {
      ok: false,
      soma,
      mensagem: `Os percentuais das etapas somam ${rotuloPercentual(soma)}; precisam somar 100%.`,
    };
  }
  return { ok: true, soma };
}

/**
 * O que falta para fechar 100% — a tela pré-preenche a próxima etapa com isso, em vez de o
 * campo nascer 0% parecendo válido. Nunca negativo: com a soma já acima de 100, sugere 0 e
 * deixa `validarPercentuais` acusar o excesso.
 */
export function percentualQueFalta(etapas: readonly { percentual: number }[]): number {
  const falta = (10000 - paraPontosBase(somaPercentuais(etapas))) / 100;
  return falta > 0 ? falta : 0;
}

/**
 * Transição de status de uma etapa PELO EDITOR (`salvarEtapaDisciplina`). Mesma máquina da
 * disciplina (`transicaoDisciplinaPermitida`), com um corte a mais: o editor NÃO leva a etapa a
 * `aprovado`.
 *
 * `aprovado` é terminal e é o gatilho do pagamento da fase (F7.4). Só nasce de quem aprova com
 * `aprovacoes:disciplina` — `aprovarEtapaDisciplina` (uma fase) ou a aprovação da disciplina
 * inteira (as fases que faltam) —, sempre junto com `liberarPagamentosDaFase`. Deixar o select
 * do editor marcar `aprovado` criaria uma aprovação que não libera nada, e alguém esperando um
 * pagamento que não vem. Etapa JÁ aprovada continua aceitando a mesma situação (editar o prazo).
 */
export function transicaoEtapaPermitida(de: StatusDisciplina, para: StatusDisciplina): boolean {
  if (para === "aprovado" && de !== "aprovado") return false;
  return transicaoDisciplinaPermitida(de, para);
}

/**
 * Linha do editor de etapas. Mora AQUI, e não em `etapas-actions.ts`: arquivo "use server" só
 * pode exportar função async, e o erro de exportar outra coisa só aparece em runtime, na
 * primeira chamada da action — tsc, lint e build passam verdes (ver memória do projeto).
 */
export type EtapaParaTela = {
  id: string;
  etapaId: string;
  sigla: string;
  nome: string;
  prazo: string | null;
  status: StatusDisciplina;
  percentual: number;
  ordem: number;
  /**
   * F7.4: o pagamento desta fase já foi liberado. Daí em diante o percentual e a própria fase
   * ficam fixos — o pool dela foi congelado na liberação.
   */
  liberada: boolean;
  /**
   * Pool congelado na liberação. Nulo enquanto a fase não foi liberada — e SEMPRE nulo para
   * quem não vê financeiro (o mesmo corte que esconde o valor da disciplina no card).
   */
  valorPagamento: number | null;
};
