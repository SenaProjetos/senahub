/**
 * Pastas da tela de Normas Técnicas (chamado de 2026-09-10: "estão todas as disciplinas
 * misturadas"). Regra pura, sem I/O — a tela e o teste leem daqui.
 *
 * Uma pasta por disciplina do catálogo que TEM norma (pasta vazia seria ruído numa lista de 18),
 * na ordem do catálogo, e a pasta "Geral" no fim para a norma sem disciplina. A mesma norma pode
 * estar em várias pastas (NBR 15575 é de várias disciplinas), então a soma das pastas pode passar
 * do total — o total de "Todas" conta cada norma uma vez.
 */

import { normalizar } from "@/lib/disciplinas-core";

/** Valor da pasta "Geral" na URL (`?pasta=geral`). Id de catálogo é cuid, nunca colide. */
export const PASTA_GERAL = "geral";

export type DisciplinaDaNorma = { id: string; nome: string; ordem: number };

export type NormaParaPasta = {
  numero: string;
  titulo: string;
  ano: number;
  disciplinas: DisciplinaDaNorma[];
};

export type PastaNormas =
  | { tipo: "disciplina"; id: string; nome: string; total: number }
  | { tipo: "geral"; id: typeof PASTA_GERAL; nome: string; total: number };

export function montarPastas(normas: readonly NormaParaPasta[]): PastaNormas[] {
  const porId = new Map<string, DisciplinaDaNorma & { total: number }>();
  let semDisciplina = 0;
  for (const n of normas) {
    if (n.disciplinas.length === 0) semDisciplina++;
    for (const d of n.disciplinas) {
      const atual = porId.get(d.id);
      if (atual) atual.total++;
      else porId.set(d.id, { ...d, total: 1 });
    }
  }
  const pastas: PastaNormas[] = [...porId.values()]
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"))
    .map((d) => ({ tipo: "disciplina", id: d.id, nome: d.nome, total: d.total }));
  if (semDisciplina > 0) pastas.push({ tipo: "geral", id: PASTA_GERAL, nome: "Geral", total: semDisciplina });
  return pastas;
}

/**
 * Normas de uma pasta. `null` = todas. Pasta que não existe (link antigo, disciplina que perdeu a
 * última norma) devolve vazio — a tela mostra o aviso e o caminho de volta para "Todas".
 */
export function normasDaPasta<T extends NormaParaPasta>(normas: readonly T[], pasta: string | null): T[] {
  if (!pasta) return [...normas];
  if (pasta === PASTA_GERAL) return normas.filter((n) => n.disciplinas.length === 0);
  return normas.filter((n) => n.disciplinas.some((d) => d.id === pasta));
}

/**
 * Busca por número, título, ano ou nome da disciplina, sem acento nem caixa ("hidrossanitario"
 * acha "Hidrossanitário"). Termo vazio devolve a lista inteira.
 */
export function buscarNormas<T extends NormaParaPasta>(normas: readonly T[], termo: string): T[] {
  const t = normalizar(termo.trim());
  if (!t) return [...normas];
  return normas.filter(
    (n) =>
      normalizar(n.numero).includes(t) ||
      normalizar(n.titulo).includes(t) ||
      String(n.ano).includes(t) ||
      n.disciplinas.some((d) => normalizar(d.nome).includes(t)),
  );
}
