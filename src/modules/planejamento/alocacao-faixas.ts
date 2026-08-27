/** Regras puras para as faixas de vigência de uma alocação. */
export type FaixaAlocacao = {
  id?: string;
  inicio: string | null;
  fim: string | null;
};

/** Datas são YYYY-MM-DD; início e fim são inclusivos. */
export function faixaTemPeriodoValido(faixa: FaixaAlocacao): boolean {
  return !faixa.inicio || !faixa.fim || faixa.inicio <= faixa.fim;
}

export function faixasSeSobrepoem(a: FaixaAlocacao, b: FaixaAlocacao): boolean {
  return (!a.fim || !b.inicio || a.fim >= b.inicio)
    && (!b.fim || !a.inicio || b.fim >= a.inicio);
}

/** Ignora a própria faixa em edição e encontra qualquer conflito remanescente. */
export function haConflitoDeFaixa(candidata: FaixaAlocacao, existentes: FaixaAlocacao[]): boolean {
  return existentes.some((existente) => existente.id !== candidata.id && faixasSeSobrepoem(candidata, existente));
}
