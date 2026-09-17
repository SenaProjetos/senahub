/**
 * Nome exibido de um canal — regra única, pura (sem prisma/server-only), testável.
 *
 * Canais de `projeto` e `disciplina` NÃO têm nome próprio: o nome é o da entidade
 * dona, lido na hora. `Canal.nome` foi gravado como cópia na criação e ficava
 * defasado quando o projeto/disciplina era renomeado — a coluna segue só como
 * fallback (canais legados sem a relação carregada) e como nome real dos tipos
 * que de fato têm nome próprio (`grupo`, `anotacoes`, `geral`, `socios`).
 *
 * DM e Anotações compõem o rótulo com os membros — isso fica no chamador, que é
 * quem tem essa lista.
 */
export function nomeCanal(canal: {
  tipo: string;
  nome: string | null;
  projeto?: { nome: string } | null;
  disciplina?: { disciplinaTextoLegado: string } | null;
}): string {
  if (canal.tipo === "projeto" && canal.projeto) return canal.projeto.nome;
  if (canal.tipo === "disciplina" && canal.disciplina) return canal.disciplina.disciplinaTextoLegado;
  return canal.nome ?? canal.tipo;
}
