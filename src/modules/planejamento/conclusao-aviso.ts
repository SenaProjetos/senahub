/**
 * Aviso ao gestor quando alguém conclui uma atividade (reunião de 08/10/2026, decisão do dono em 2026-10-10).
 * Regras puras, sem I/O.
 *
 * Quem recebe é quem VALIDA os 100%: a coordenação do projeto; sem coordenador cadastrado, os gestores
 * (admin e supervisor) — para o aviso nunca cair no vazio. Quem concluiu não é avisado do que ele mesmo fez.
 */
export function destinatariosDaConclusao(p: {
  coordenadores: readonly string[];
  gestores: readonly string[];
  autorId: string;
}): string[] {
  const base = p.coordenadores.length > 0 ? p.coordenadores : p.gestores;
  return [...new Set(base)].filter((id) => id !== p.autorId);
}

export function textoConclusao(p: { atividade: string; autorNome: string; projetoCodigo: string }): { titulo: string; corpo: string } {
  return {
    titulo: `Atividade concluída: ${p.atividade}`,
    corpo: `${p.projetoCodigo} — ${p.autorNome} marcou como concluída. Confira e valide o percentual na EAP.`,
  };
}
