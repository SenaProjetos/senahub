/** Papel do membro do projeto em lista fixa (R5 do rateio, decisão 25 do spec 2026-09-15). PURO. */
export const PAPEIS_PROJETO = ["coordenador", "projetista", "apoio", "estagiario", "consultor_externo"] as const;
export type PapelProjeto = (typeof PAPEIS_PROJETO)[number];

export const ROTULO_PAPEL: Record<PapelProjeto, string> = {
  coordenador: "Coordenador",
  projetista: "Projetista",
  apoio: "Apoio",
  estagiario: "Estagiário",
  consultor_externo: "Consultor externo",
};

export function rotuloPapel(papel: string | null): string {
  return papel && papel in ROTULO_PAPEL ? ROTULO_PAPEL[papel as PapelProjeto] : "Sem papel";
}

/** Coordenador do projeto = papel `coordenador` NO projeto OU perfil de acesso `coordenador` (decisão 18). */
export function ehCoordenador(p: { papelNoProjeto: string | null; perfilChave: string | null }): boolean {
  return p.papelNoProjeto === "coordenador" || p.perfilChave === "coordenador";
}
