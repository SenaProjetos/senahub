/**
 * Lista "Decisões" do projeto — PURO (roda no navegador). Junta as decisões marcadas na conversa com a coordenação e as
 * decisões da versão vigente de cada ata publicada (não retirada), a mais nova primeiro.
 */

export type DecisaoDeAtaDTO = {
  reuniaoId: string;
  /** Identidade do item (única): chave da lista na tela. */
  chave: string;
  titulo: string;
  descricao: string | null;
  reuniaoTitulo: string;
  /** "YYYY-MM-DD" da reunião. */
  reuniaoData: string;
  /** O cliente respondeu "Tenho observações" à versão vigente. */
  comObservacoes: boolean;
};

export type DecisaoDaConversa = { mensagemId: string; resumo: string | null; trecho: string; mensagemEm: string; marcadaPor: string };

export type DecisaoCombinada = ({ origem: "conversa" } & DecisaoDaConversa) | ({ origem: "ata" } & DecisaoDeAtaDTO);

const quando = (d: DecisaoCombinada) => (d.origem === "conversa" ? d.mensagemEm.slice(0, 10) : d.reuniaoData);
const instante = (d: DecisaoCombinada) => (d.origem === "conversa" ? d.mensagemEm : `${d.reuniaoData}T00:00:00.000Z`);

export function decisoesCombinadas(conversa: readonly DecisaoDaConversa[], atas: readonly DecisaoDeAtaDTO[]): DecisaoCombinada[] {
  const lista: DecisaoCombinada[] = [
    ...conversa.map((d) => ({ origem: "conversa" as const, ...d })),
    ...atas.map((d) => ({ origem: "ata" as const, ...d })),
  ];
  // Por dia, mais novo primeiro; no mesmo dia, pelo instante (a ata conta do começo do dia dela).
  return lista.sort((a, b) => quando(b).localeCompare(quando(a)) || instante(b).localeCompare(instante(a)));
}
