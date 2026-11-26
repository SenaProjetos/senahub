import type { ConteudoPublico } from "@/modules/projetos/arquivos/link-publico";

/**
 * A pasta da obra sem o texto do pedido de revisão do cliente (spec 2026-11-25): o motivo da marca "Em revisão" é o comentário
 * do cliente ("Pedido do cliente: …") e a construtora é terceiro. A marca fica (`""` = em revisão, sem motivo); o texto sai.
 */
export function semMotivoDoCliente(c: ConteudoPublico | null): ConteudoPublico | null {
  if (!c) return null;
  const limpar = <T extends { emRevisao: string | null }>(a: T): T => (a.emRevisao === null ? a : { ...a, emRevisao: "" });
  const disciplina = (d: ConteudoPublico["disciplinas"][number]) => ({
    ...d,
    pastas: d.pastas.map((f) => ({ ...f, extensoes: f.extensoes.map((e) => ({ ...e, arquivos: e.arquivos.map(limpar) })) })),
  });
  return {
    ...c,
    disciplinas: c.disciplinas.map(disciplina),
    situacoes: c.situacoes.map((s) => ({ ...s, disciplinas: s.disciplinas.map(disciplina) })),
  };
}
