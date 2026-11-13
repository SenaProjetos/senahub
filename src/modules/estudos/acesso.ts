import { getFerramenta, situacaoValidacao, type SituacaoValidacao } from "@/modules/ferramentas/registry";

import { TIPO_ESTUDO_CARGAS_DEMANDA } from "./cargas-demanda/conteudo";
import { TIPO_ESTUDO_CARGAS } from "./conteudo";

export { TIPO_ESTUDO_CARGAS, TIPO_ESTUDO_CARGAS_DEMANDA };

/**
 * Regras de acesso PURAS do Estudos (Lote 5d) — sem I/O, testáveis. Leitura, escrita e a trava de
 * validação herdada do motor. Os fatos (`can`, responsável de disciplina) são resolvidos por quem chama.
 */

/** Tipos de estudo (`EstudoProjeto.tipo`). Um estudo sem tipo gravado é o legado, de cargas elétricas por ambiente. */
export const TIPOS_DE_ESTUDO = [TIPO_ESTUDO_CARGAS, TIPO_ESTUDO_CARGAS_DEMANDA] as const;
export type TipoDeEstudo = (typeof TIPOS_DE_ESTUDO)[number];

export function tipoDeEstudoValido(tipo: unknown): tipo is TipoDeEstudo {
  return typeof tipo === "string" && (TIPOS_DE_ESTUDO as readonly string[]).includes(tipo);
}

/** O estudo de cargas por ambiente roda o motor desta calculadora: a validação dela vale para ele. */
export const FERRAMENTA_DO_ESTUDO = "corrente-demanda";

/** Calculadora cuja validação libera cada tipo de estudo (a de cargas e demanda é só-estudo no registro). */
export const FERRAMENTA_POR_TIPO: Record<TipoDeEstudo, string> = {
  [TIPO_ESTUDO_CARGAS]: FERRAMENTA_DO_ESTUDO,
  [TIPO_ESTUDO_CARGAS_DEMANDA]: "cargas-demanda",
};

export const MOTIVO_SEM_EDICAO =
  "Só o responsável por uma disciplina do projeto (ou quem coordena as disciplinas) pode alterar os estudos.";

export const MOTIVO_ALTERADO_POR_OUTRA_PESSOA =
  "Este estudo foi alterado por outra pessoa depois que você o abriu. Recarregue a página para ver a versão atual (suas mudanças desta tela não foram gravadas).";

export const AVISO_EM_VALIDACAO =
  "O motor de cálculo ainda está em validação por um engenheiro. Estes números não podem ser usados em projeto.";

/** Situação de validação do motor do tipo de estudo, lida do registro de ferramentas. */
export function situacaoDoMotor(tipo: TipoDeEstudo = TIPO_ESTUDO_CARGAS): SituacaoValidacao {
  const meta = getFerramenta(FERRAMENTA_POR_TIPO[tipo]);
  // Sem registro não há quem tenha validado: o seguro é tratar como em validação.
  return meta ? situacaoValidacao(meta) : "em_validacao";
}

/**
 * Motor em validação: só quem gere as ferramentas vê a aba (com o aviso). Validado: todos com acesso.
 * Como o estudo só guarda entradas, o que for criado em validação passa a mostrar o motor validado.
 */
export function estudosLiberados(
  situacao: SituacaoValidacao,
  podeGerirFerramentas: boolean,
): { liberado: boolean; emValidacao: boolean } {
  const emValidacao = situacao === "em_validacao";
  return { liberado: !emValidacao || podeGerirFerramentas, emValidacao };
}

/**
 * A aba Estudos como um todo: abre se ALGUM tipo está liberado para a pessoa (cada estudo ainda confere o
 * seu tipo). O aviso de validação aparece quando algum tipo ainda está em validação.
 */
export function liberacaoDaAba(
  situacoes: readonly SituacaoValidacao[],
  podeGerirFerramentas: boolean,
): { liberado: boolean; emValidacao: boolean } {
  const por = situacoes.map((s) => estudosLiberados(s, podeGerirFerramentas));
  return { liberado: por.some((x) => x.liberado), emValidacao: por.some((x) => x.emValidacao) };
}

/** Escrever nos estudos: quem atua em disciplina alheia OU é responsável por alguma disciplina do projeto. */
export function podeEditarEstudos(params: {
  atuaEmDisciplinaAlheia: boolean;
  ehResponsavelDeDisciplina: boolean;
}): boolean {
  return params.atuaEmDisciplinaAlheia || params.ehResponsavelDeDisciplina;
}
