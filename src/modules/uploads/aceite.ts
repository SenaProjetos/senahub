export const DIAS_VALIDADE_ACEITE = 30;

type AceiteLink = {
  situacao: string;
  expiraEm: Date | null;
  revogadoEm: Date | null;
};

/** Expiração explícita evita que um link público perdido tenha validade indefinida. */
export function expiraAceiteEm(agora = new Date()): Date {
  const expiraEm = new Date(agora);
  expiraEm.setDate(expiraEm.getDate() + DIAS_VALIDADE_ACEITE);
  return expiraEm;
}

/** Links legados sem data de validade permanecem indisponíveis até serem regenerados. */
export function linkAceiteEstaAtivo(aceite: AceiteLink, agora = new Date()): boolean {
  return aceite.revogadoEm === null && aceite.expiraEm !== null && aceite.expiraEm > agora;
}

export function linkAceitePodeResponder(aceite: AceiteLink, agora = new Date()): boolean {
  return aceite.situacao === "pendente" && linkAceiteEstaAtivo(aceite, agora);
}
