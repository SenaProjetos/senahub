/**
 * Rateio do valor da disciplina entre os responsáveis, e a regra que exige valor
 * definido antes de concluir. Puro (sem Prisma/IO) — a integração fica em
 * `pagamento.ts`, os gates em `validarEntrega`/`confirmarAprovacaoDisciplina`.
 *
 * Decisão de processo (2026-08-12): `Disciplina.valor` é o POOL DE PAGAMENTO dos
 * responsáveis PJ/freelancer, não o custo total da entrega. CLT/estagiário não
 * recebem por entrega (o custo deles entra via ponto/rateio de horas) e por isso
 * NÃO consomem cota — antes o divisor incluía todo mundo e a cota do salariado
 * simplesmente desaparecia do pagamento.
 */
import { ehPrestador } from "@/lib/contratacao";
import type { Contratacao } from "@/generated/prisma/enums";

/** Pagável = prestador (contratação `pj`/`autonomo_rpa`) — Onda F, bloco D; era `PJ_ROLES`. */
type ComRole = { user: { contratacao: Contratacao | null } };

export function ehPagavel(r: ComRole): boolean {
  return ehPrestador(r.user.contratacao);
}

/**
 * Tipo do profissional gravado no pagamento — escolhe a categoria do DRE (`CATEGORIA_POR_TIPO`).
 * Regra do dono (2026-10-10): quem tem CNPJ é PJ (2.01), quem não tem é freelancer (2.02). O eixo é a
 * CONTRATAÇÃO: `pj` = tem CNPJ e emite nota; `autonomo_rpa` = pessoa física. A migration
 * `20261010175000` reclassificou como `autonomo_rpa` os freelancers sem PJ vinculada.
 *
 * Não é `pjId`: em produção (2026-10-10) só 1 de 13 projetistas PJ tinha a PJ cadastrada — pelo `pjId`
 * todos os outros cairiam em 2.02. Era o papel (`projetista_pj` × `freelancer`).
 */
export function tipoProfissionalDoPagamento(u: { contratacao: Contratacao | null }): "projetista_pj" | "freelancer" {
  return u.contratacao === "autonomo_rpa" ? "freelancer" : "projetista_pj";
}

/**
 * Divide `valorTotal` igualmente entre os responsáveis PAGÁVEIS, com a sobra de
 * centavos no PRIMEIRO pagável (não no primeiro responsável — se o índice 0 fosse
 * um CLT, a sobra ficava sem dono e a soma paga saía menor que o valor da disciplina).
 */
export function ratearPagamentoProjetista<T extends ComRole>(
  responsaveis: T[],
  valorTotal: number,
): { pagaveis: { responsavel: T; valor: number }[]; salariados: T[] } {
  const elegiveis = responsaveis.filter(ehPagavel);
  const salariados = responsaveis.filter((r) => !ehPagavel(r));
  const n = elegiveis.length;
  if (n === 0) return { pagaveis: [], salariados };

  const base = Math.floor((valorTotal / n) * 100) / 100;
  const pagaveis = elegiveis.map((responsavel, i) => ({
    responsavel,
    valor: i === 0 ? Number((valorTotal - base * (n - 1)).toFixed(2)) : base,
  }));
  return { pagaveis, salariados };
}

/**
 * Gate de conclusão: devolve a mensagem de bloqueio, ou `null` se pode concluir.
 * Só exige valor quando existe responsável pagável — disciplina 100% CLT conclui
 * sem valor, porque não gera `PagamentoProjetista` nenhum.
 */
export function bloqueioValorDisciplina(
  responsaveis: ComRole[],
  valor: number | null,
): string | null {
  if (!responsaveis.some(ehPagavel)) return null;
  if (valor != null && valor > 0) return null;
  return "Defina o valor de pagamento da disciplina antes de concluí-la — há responsável PJ/freelancer sem valor a receber.";
}
