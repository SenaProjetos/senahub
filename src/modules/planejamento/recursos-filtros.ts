import { chaveSemanaIso } from "./disponibilidade";
import { diasDaJanela } from "./heatmap-recursos";

/**
 * Regras puras da tela `/recursos` (somente leitura): filtros, janela em semanas, quem está acima
 * da capacidade e o sinal de projeto sem cronograma aprovado. Sem I/O — o cliente roda tudo isto
 * sobre a lista já carregada.
 */

export type ProjetoRef = { id: string; codigo: string; nome: string };

export type PessoaFiltravel = {
  userId: string;
  nome: string;
  /** Disciplinas do catálogo em que a pessoa tem atribuição nas EAPs aprovadas. */
  disciplinas: readonly string[];
  /** Projetos em que ela tem carga (aprovada ou em rascunho). */
  projetoIds: readonly string[];
};

export type FiltrosRecursos = {
  busca: string;
  projetoId: string | null;
  disciplina: string | null;
  soSobrecarregados: boolean;
};

/** Minúsculas, sem acento, espaços aparados e colapsados — a busca por nome não pode depender de digitação. */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Quem passa nos filtros de nome, projeto e disciplina (E dos três). "Só sobrecarregados" é de cada vista. */
export function pessoasQuePassam(
  pessoas: readonly PessoaFiltravel[],
  f: Pick<FiltrosRecursos, "busca" | "projetoId" | "disciplina">,
): Set<string> {
  const busca = normalizarBusca(f.busca);
  const passa = (p: PessoaFiltravel) =>
    (busca === "" || normalizarBusca(p.nome).includes(busca)) &&
    (f.projetoId == null || p.projetoIds.includes(f.projetoId)) &&
    (f.disciplina == null || p.disciplinas.includes(f.disciplina));
  return new Set(pessoas.filter(passa).map((p) => p.userId));
}

/** Semanas ISO distintas que a janela toca. Janela inválida (vazia, invertida, longa demais) → nenhuma. */
export function semanasDaJanela(inicio: string, fim: string): string[] {
  return [...new Set(diasDaJanela(inicio, fim).map(chaveSemanaIso))];
}

/** Quem tem alguma semana da janela acima da capacidade (a regra do motor: `detectarSobrecargas`). */
export function sobrecarregadosNaJanela(
  sobrecargas: readonly { userId: string; semana: string }[],
  semanas: readonly string[],
): Set<string> {
  const naJanela = new Set(semanas);
  return new Set(sobrecargas.filter((s) => naJanela.has(s.semana)).map((s) => s.userId));
}

/** Carga real: alguma das semanas exibidas com mais horas registradas do que disponíveis (capacidade 0 e horas > 0 conta). */
export function sobrecarregadosNaCargaReal(
  linhas: readonly { userId: string; porSemana: Record<string, number>; capacidadePorSemana: Record<string, number> }[],
): Set<string> {
  const out = new Set<string>();
  for (const l of linhas) {
    for (const [semana, horas] of Object.entries(l.porSemana)) {
      const cap = l.capacidadePorSemana[semana] ?? 0;
      if (cap === 0 ? horas > 0 : horas > cap) out.add(l.userId);
    }
  }
  return out;
}

/** Projetos ativos sem cronograma aprovado, por pessoa: sem repetição, ordenados pelo código. */
export function projetosSemCronogramaPorPessoa(
  projetos: readonly (ProjetoRef & { userIds: readonly string[] })[],
): Map<string, ProjetoRef[]> {
  const out = new Map<string, ProjetoRef[]>();
  for (const { userIds, ...ref } of projetos) {
    for (const userId of new Set(userIds)) out.set(userId, [...(out.get(userId) ?? []), ref]);
  }
  for (const lista of out.values()) lista.sort((a, b) => a.codigo.localeCompare(b.codigo));
  return out;
}
