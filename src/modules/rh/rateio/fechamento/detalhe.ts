export type LinhaParaDetalhe = {
  projetoId: string | null;
  disciplinaId: string | null;
  natureza: "projeto" | "reuniao" | "nao_alocado";
  minutos: number;
  custoCent: number;
};

export type GrupoDoMes = LinhaParaDetalhe;

/**
 * Soma as linhas do mês por (projeto, disciplina, natureza) — a pessoa some: o detalhe do mês é do
 * projeto, não de quem apontou (R3.5). Do que mais pesa em horas ao que menos; "não alocado" por último.
 */
export function agruparLinhasDoMes(linhas: readonly LinhaParaDetalhe[]): GrupoDoMes[] {
  const grupos = new Map<string, GrupoDoMes>();
  for (const l of linhas) {
    const chave = `${l.projetoId ?? ""}|${l.disciplinaId ?? ""}|${l.natureza}`;
    const g = grupos.get(chave) ?? { projetoId: l.projetoId, disciplinaId: l.disciplinaId, natureza: l.natureza, minutos: 0, custoCent: 0 };
    g.minutos += l.minutos;
    g.custoCent += l.custoCent;
    grupos.set(chave, g);
  }
  const ordem = (g: GrupoDoMes) => (g.natureza === "nao_alocado" ? 1 : 0);
  return [...grupos.values()].sort((a, b) => ordem(a) - ordem(b) || b.minutos - a.minutos || b.custoCent - a.custoCent);
}
