/**
 * Competências com nível (Gestão de Pessoas F2) — regras puras, client-safe.
 * Decisões do dono (2026-10-05): escala de 5, a pessoa declara e o coordenador valida, nada vence,
 * Engenharia propõe e RH publica.
 */

export const NIVEIS: Record<number, { rotulo: string; descricao: string }> = {
  1: { rotulo: "1 · Conhece", descricao: "Conhece o básico." },
  2: { rotulo: "2 · Com supervisão", descricao: "Executa com supervisão." },
  3: { rotulo: "3 · Sozinho", descricao: "Executa sozinho." },
  4: { rotulo: "4 · Revisa", descricao: "Revisa o trabalho de outros." },
  5: { rotulo: "5 · Referência", descricao: "É referência e ensina." },
};

export const CATEGORIAS = ["software", "disciplina", "norma", "outra"] as const;
export type Categoria = (typeof CATEGORIAS)[number];
export const CATEGORIA_LABEL: Record<Categoria, string> = {
  software: "Software",
  disciplina: "Disciplina",
  norma: "Norma",
  outra: "Outra",
};

export const nivelValido = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5;

export type Aptidao = "apto_validado" | "apto_declarado" | "abaixo" | "sem_nivel";

/** Pessoa sem nível informado nunca é promovida a apta em silêncio (aceite da F2). */
export function aptidao(uh: { nivel: number | null; validadoEm: string | Date | null } | null | undefined, minimo: number): Aptidao {
  if (!uh || uh.nivel == null) return "sem_nivel";
  if (uh.nivel < minimo) return "abaixo";
  return uh.validadoEm ? "apto_validado" : "apto_declarado";
}

export const APTIDAO_LABEL: Record<Aptidao, string> = {
  apto_validado: "apto · validado",
  apto_declarado: "apto · declarado, não validado",
  abaixo: "abaixo do nível",
  sem_nivel: "nível não informado",
};

export type Candidato = { userId: string; nome: string; nivel: number | null; validadoEm: string | null; folga: number; diasAusente: number };

/**
 * Quem cobre uma necessidade: nível ≥ mínimo E folga no período. Validado vem antes de declarado;
 * depois, maior nível e maior folga. Quem não tem folga ou nível fica fora.
 */
export function candidatosParaNecessidade(pessoas: readonly Candidato[], minimo: number): (Candidato & { aptidao: Aptidao })[] {
  return pessoas
    .map((p) => ({ ...p, aptidao: aptidao(p, minimo) }))
    .filter((p) => (p.aptidao === "apto_validado" || p.aptidao === "apto_declarado") && p.folga > 0)
    .sort(
      (a, b) =>
        Number(b.aptidao === "apto_validado") - Number(a.aptidao === "apto_validado") ||
        (b.nivel ?? 0) - (a.nivel ?? 0) ||
        b.folga - a.folga ||
        a.nome.localeCompare(b.nome),
    );
}

export const MOTIVO_NAO_VALIDA_PROPRIO = "Você não pode validar o próprio nível.";
export const MOTIVO_SEM_NIVEL = "Informe o nível antes de validar.";
export const MOTIVO_NAO_PUBLICADA = "Esta competência ainda não foi publicada pelo RH.";

/** Quem valida: gestor de Recursos ou RH, nunca sobre si mesmo, e só com nível informado. */
export function motivoParaNaoValidar(alvoUserId: string, quemId: string, nivel: number | null): string | null {
  if (alvoUserId === quemId) return MOTIVO_NAO_VALIDA_PROPRIO;
  if (nivel == null) return MOTIVO_SEM_NIVEL;
  return null;
}
