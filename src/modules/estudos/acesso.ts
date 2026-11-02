import { getFerramenta, situacaoValidacao, type SituacaoValidacao } from "@/modules/ferramentas/registry";

/**
 * Regras de acesso PURAS do Estudos (Lote 5d) — sem I/O, testáveis. Leitura, escrita e a trava de
 * validação herdada do motor. Os fatos (`can`, responsável de disciplina) são resolvidos por quem chama.
 */

/** O estudo roda o motor desta calculadora: a validação dela vale para o Estudos. */
export const FERRAMENTA_DO_ESTUDO = "corrente-demanda";

export const MOTIVO_SEM_EDICAO =
  "Só o responsável por uma disciplina do projeto (ou quem coordena as disciplinas) pode alterar os estudos.";

export const MOTIVO_ALTERADO_POR_OUTRA_PESSOA =
  "Este estudo foi alterado por outra pessoa depois que você o abriu. Recarregue a página para ver a versão atual (suas mudanças desta tela não foram gravadas).";

export const AVISO_EM_VALIDACAO =
  "O motor de cálculo ainda está em validação por um engenheiro. Estes números não podem ser usados em projeto.";

/** Situação de validação do motor, lida do registro de ferramentas. */
export function situacaoDoMotor(): SituacaoValidacao {
  const meta = getFerramenta(FERRAMENTA_DO_ESTUDO);
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

/** Escrever nos estudos: quem atua em disciplina alheia OU é responsável por alguma disciplina do projeto. */
export function podeEditarEstudos(params: {
  atuaEmDisciplinaAlheia: boolean;
  ehResponsavelDeDisciplina: boolean;
}): boolean {
  return params.atuaEmDisciplinaAlheia || params.ehResponsavelDeDisciplina;
}
