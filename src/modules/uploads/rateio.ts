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
import { PJ_ROLES, type Role } from "@/lib/roles";

type ComRole = { user: { role: string } };

export function ehPagavel(r: ComRole): boolean {
  return PJ_ROLES.includes(r.user.role as Role);
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
