/**
 * Quando um cliente pode ser EXCLUÍDO — **puro**. Só cadastro vazio sai: nenhum contato, projeto,
 * lançamento, prospecção, negociação, proposta, documento, interação, usuário do portal, regra de
 * preenchimento nem fusão. Com qualquer dado, o caminho é desativar (o histórico fica).
 *
 * A mesma frase é o `ActionError` de `excluirCliente` e o motivo do item desabilitado no menu
 * (ADR-0002, regra 5).
 */

export type VinculosCliente = {
  contatos: number;
  projetos: number;
  lancamentos: number;
  documentosFinanceiros: number;
  prospeccoes: number;
  negociacoes: number;
  propostas: number;
  documentos: number;
  documentosJuridicos: number;
  orcamentosCusto: number;
  usuariosPortal: number;
  regrasPreenchimento: number;
  /** Atividades registradas à mão (ligação, nota…). Os eventos automáticos não contam. */
  interacoes: number;
  /** Absorveu outro cliente ou foi absorvido — a fusão é rastro que não pode sumir. */
  fusao: boolean;
};

export const VINCULOS_VAZIOS: VinculosCliente = {
  contatos: 0,
  projetos: 0,
  lancamentos: 0,
  documentosFinanceiros: 0,
  prospeccoes: 0,
  negociacoes: 0,
  propostas: 0,
  documentos: 0,
  documentosJuridicos: 0,
  orcamentosCusto: 0,
  usuariosPortal: 0,
  regrasPreenchimento: 0,
  interacoes: 0,
  fusao: false,
};

const ROTULOS: [keyof Omit<VinculosCliente, "fusao">, string, string][] = [
  ["projetos", "projeto", "projetos"],
  ["propostas", "proposta", "propostas"],
  ["negociacoes", "negociação", "negociações"],
  ["prospeccoes", "prospecção", "prospecções"],
  ["lancamentos", "lançamento financeiro", "lançamentos financeiros"],
  ["documentosFinanceiros", "documento financeiro", "documentos financeiros"],
  ["documentos", "documento", "documentos"],
  ["documentosJuridicos", "documento jurídico", "documentos jurídicos"],
  ["orcamentosCusto", "orçamento de custo", "orçamentos de custo"],
  ["contatos", "contato", "contatos"],
  ["interacoes", "interação registrada", "interações registradas"],
  ["usuariosPortal", "usuário do portal", "usuários do portal"],
  ["regrasPreenchimento", "regra de preenchimento", "regras de preenchimento"],
];

export function motivoParaNaoExcluir(v: VinculosCliente): string | null {
  const partes = ROTULOS.filter(([campo]) => v[campo] > 0).map(
    ([campo, um, varios]) => `${v[campo]} ${v[campo] === 1 ? um : varios}`,
  );
  if (v.fusao) partes.push("fusão com outro cliente");
  if (partes.length === 0) return null;
  return `Só dá para excluir cliente sem nenhum dado. Este tem ${partes.join(", ")} — desative em vez de excluir.`;
}
