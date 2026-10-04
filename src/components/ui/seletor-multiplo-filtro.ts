/**
 * Regra pura do `SeletorMultiplo`: o que a busca mostra. Sem React — testável no env node.
 *
 * A busca ignora acento e caixa e casa por PALAVRA: "ana silva" acha "Ana Paula Da Silva".
 * Cada palavra digitada tem de aparecer em algum lugar do rótulo ou do detalhe.
 */
export type OpcaoSeletor = {
  id: string;
  rotulo: string;
  /** Texto menor ao lado do rótulo (cargo, setor…); também entra na busca. */
  detalhe?: string | null;
};

export function normalizarBusca(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export function filtrarOpcoes<T extends OpcaoSeletor>(opcoes: readonly T[], busca: string): T[] {
  const palavras = normalizarBusca(busca).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return [...opcoes];
  return opcoes.filter((o) => {
    const alvo = normalizarBusca(`${o.rotulo} ${o.detalhe ?? ""}`);
    return palavras.every((p) => alvo.includes(p));
  });
}

/** Liga ou desliga um id, preservando a ordem do que já estava escolhido. */
export function alternarId(selecionados: readonly string[], id: string): string[] {
  return selecionados.includes(id) ? selecionados.filter((x) => x !== id) : [...selecionados, id];
}
