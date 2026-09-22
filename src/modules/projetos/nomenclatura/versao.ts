/**
 * Qual versão do padrão de nomenclatura vale para um projeto — puro, client-safe (D2/D3 da spec
 * `docs/superpowers/specs/2026-09-21-nomenclatura-versionada-subdisciplinas.md`).
 */

export type SequenciaNomenclatura = "faixa" | "card" | "sub";

export type VersaoNomenclatura = {
  id: string;
  numero: number;
  nome: string;
  /** Null só na v1 herdada de um global vazio = leitor embutido (`parsePranchaFilename`). */
  modelo: string | null;
  larguraNumero: number;
  sequenciaPor: SequenciaNomenclatura;
  vigenteDesde: Date;
  /** Null = rascunho: nunca vale para projeto nenhum. */
  publicadaEm: Date | null;
};

/**
 * Modelo equivalente ao leitor embutido, para quem precisa de um TEXTO de padrão (o aviso "parece
 * seguir a vN" e os geradores de nome). Não substitui o leitor embutido na validação da v1: a
 * compilação do modelo não é idêntica a `parsePranchaFilename` e trocar um pelo outro mudaria o
 * que já é "fora do padrão" (achado da F5 do motor, 2026-09-16).
 */
export const MODELO_PADRAO_ORIGINAL = "{proj}-{disc}-{fase}-{num}-{tipo}";

export function rotuloVersao(v: Pick<VersaoNomenclatura, "numero" | "nome">): string {
  return `v${v.numero} (${v.nome})`;
}

/**
 * A versão do projeto: a fixada nele, se estiver publicada; senão, a publicada mais recente com
 * vigência até a data de criação do projeto (D2); senão, a primeira publicada (projeto mais
 * antigo que qualquer vigência — a v1 nasce com vigência antiga justamente para isso não ocorrer).
 */
export function versaoDoProjeto(
  projeto: { nomenclaturaVersaoId: string | null; createdAt: Date },
  versoes: readonly VersaoNomenclatura[],
): VersaoNomenclatura | null {
  const publicadas = versoes.filter((v) => v.publicadaEm !== null);
  const fixada = projeto.nomenclaturaVersaoId
    ? publicadas.find((v) => v.id === projeto.nomenclaturaVersaoId)
    : undefined;
  if (fixada) return fixada;
  const vigentes = publicadas
    .filter((v) => v.vigenteDesde.getTime() <= projeto.createdAt.getTime())
    .sort((a, b) => b.vigenteDesde.getTime() - a.vigenteDesde.getTime() || b.numero - a.numero);
  if (vigentes[0]) return vigentes[0];
  return [...publicadas].sort((a, b) => a.numero - b.numero)[0] ?? null;
}

/**
 * Padrões das outras versões publicadas, para o aviso D6. `excetoId` é a versão do projeto
 * (projeto personalizado passa `null` e recebe todas).
 */
export function outrosPadroes(
  versoes: readonly VersaoNomenclatura[],
  excetoId: string | null,
): { rotulo: string; padrao: string }[] {
  return versoes
    .filter((v) => v.publicadaEm !== null && v.id !== excetoId)
    .sort((a, b) => b.numero - a.numero)
    .map((v) => ({ rotulo: rotuloVersao(v), padrao: v.modelo?.trim() || MODELO_PADRAO_ORIGINAL }));
}
