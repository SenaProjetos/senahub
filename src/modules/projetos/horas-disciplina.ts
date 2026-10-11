/**
 * Horas por disciplina: orçado (linha de base) × planejado (EAP) × realizado (ponto) — R5 do rateio,
 * decisões 16 e 19 do spec 2026-09-15. PURO. A visibilidade é decidida AQUI, no servidor: quem não é
 * coordenador recebe só as próprias horas por pessoa, e reais só chegam a quem pode ver custo.
 */
export type LinhaHoras = {
  disciplinaId: string;
  nome: string;
  /** null = o projeto não tem linha de base. */
  orcadoMin: number | null;
  planejadoMin: number;
  realizadoMin: number;
  porPessoa: { userId: string; nome: string; minutos: number }[];
  /** null = quem pede não pode ver custo. */
  custoCent: number | null;
};

const emMin = (horas: number) => Math.round(horas * 60);

export function montarHorasPorDisciplina(p: {
  disciplinas: { id: string; nome: string }[];
  orcado: { disciplinaId: string; horas: number }[] | null;
  planejado: { disciplinaId: string; horas: number }[];
  realizado: { disciplinaId: string; userId: string; nome: string; minutos: number }[];
  custo: { disciplinaId: string; cent: number }[];
  viewer: { userId: string; coordenador: boolean; podeVerCusto: boolean };
}): LinhaHoras[] {
  const somaHoras = (xs: { disciplinaId: string; horas: number }[], id: string) =>
    xs.filter((x) => x.disciplinaId === id).reduce((s, x) => s + x.horas, 0);
  return p.disciplinas.map((d) => {
    const reais = p.realizado.filter((r) => r.disciplinaId === d.id);
    const porPessoaTodas = new Map<string, { userId: string; nome: string; minutos: number }>();
    for (const r of reais) {
      const cur = porPessoaTodas.get(r.userId) ?? { userId: r.userId, nome: r.nome, minutos: 0 };
      cur.minutos += r.minutos;
      porPessoaTodas.set(r.userId, cur);
    }
    const porPessoa = [...porPessoaTodas.values()].filter((x) => p.viewer.coordenador || x.userId === p.viewer.userId);
    return {
      disciplinaId: d.id,
      nome: d.nome,
      orcadoMin: p.orcado === null ? null : emMin(somaHoras(p.orcado, d.id)),
      planejadoMin: emMin(somaHoras(p.planejado, d.id)),
      realizadoMin: reais.reduce((s, r) => s + r.minutos, 0),
      porPessoa,
      custoCent: p.viewer.podeVerCusto ? p.custo.filter((c) => c.disciplinaId === d.id).reduce((s, c) => s + c.cent, 0) : null,
    };
  });
}
