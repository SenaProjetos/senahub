/**
 * Rubricas que o contador NÃO imprime no holerite (a empresa paga por fora) e que o RH lança à mão.
 * Entram na folha como proventos, então contam no líquido que vai para a conta a pagar da folha.
 *
 * Como não vêm do PDF, o import do contador NÃO as apaga ao substituir os itens do holerite — só o
 * que veio do PDF é trocado. Nomes iguais aos do cadastro (`RubricaFolha.nome`, único): criados pela
 * migration `20261007140000_rubricas_auxilio_transporte_alimentacao` e pelo seed.
 */
export const RUBRICAS_LANCADAS_A_MAO = ["Auxílio transporte", "Auxílio alimentação"] as const;
