/**
 * Regras do cadastro de Tipos de empreendimento (Configurações). Puras, sem I/O — as mesmas frases valem na tela
 * (botão desabilitado) e na action (recusa), como no resto do sistema.
 */
export const NOME_MAX = 80;

export const MOTIVO_SEM_FASE = "Marque ao menos uma etapa — ou o projeto deste tipo nasceria sem nenhuma.";

/** Normaliza o nome para comparar: sem espaços nas pontas e sem diferença de caixa. */
export function chaveDoNome(nome: string): string {
  return nome.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

export function validarNome(nome: string): string | null {
  const n = nome.trim();
  if (n.length === 0) return "Informe o nome do tipo de empreendimento.";
  if (n.length > NOME_MAX) return `O nome passa de ${NOME_MAX} caracteres.`;
  return null;
}

/** Fases escolhidas que existem no catálogo ativo, sem repetir. Vazio em `idsValidos` = nenhuma vale. */
export function fasesValidas(escolhidas: readonly string[], idsValidos: ReadonlySet<string>): string[] {
  return [...new Set(escolhidas)].filter((id) => idsValidos.has(id));
}

export type UsoDoTipo = { projetos: number; negociacoes: number; modelos: number };

/** Por que o tipo não pode ser EXCLUÍDO (desativar sempre pode). `null` = pode. */
export function motivoNaoExcluir(uso: UsoDoTipo): string | null {
  const partes: string[] = [];
  if (uso.projetos > 0) partes.push(`${uso.projetos} projeto(s)`);
  if (uso.negociacoes > 0) partes.push(`${uso.negociacoes} negociação(ões)`);
  if (uso.modelos > 0) partes.push(`${uso.modelos} modelo(s) de EAP`);
  return partes.length === 0 ? null : `Está em uso por ${partes.join(", ")}. Desative o tipo em vez de excluir.`;
}

/**
 * Troca a posição do tipo com o vizinho e devolve a nova `ordem` de CADA um (0, 1, 2…): reordena tudo de uma vez,
 * porque as ordens gravadas podem ter buracos ou repetições (cadastro antigo, seed).
 */
export function reordenar(
  atual: readonly { id: string }[],
  id: string,
  direcao: "cima" | "baixo",
): { id: string; ordem: number }[] | null {
  const i = atual.findIndex((t) => t.id === id);
  const j = direcao === "cima" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= atual.length) return null;
  const novo = atual.map((t) => t.id);
  [novo[i], novo[j]] = [novo[j], novo[i]];
  return novo.map((x, ordem) => ({ id: x, ordem }));
}
