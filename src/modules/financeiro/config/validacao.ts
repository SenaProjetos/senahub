/** Configuração de campos obrigatórios no cadastro de lançamentos (puro, testável). */
export type CamposObrigatorios = {
  centro: boolean;
  forma: boolean;
  projeto: boolean;
  /** Fornecedor (despesa) ou Cliente (receita). */
  contato: boolean;
  observacao: boolean;
};

export type DadosLancamento = {
  tipo: "receita" | "despesa";
  centroId?: string;
  formaId?: string;
  projetoId?: string;
  fornecedorId?: string;
  clienteId?: string;
  observacao?: string;
};

/** Primeiro campo obrigatório ausente (rótulo) ou null se tudo ok. */
export function obrigatorioFaltando(o: CamposObrigatorios, d: DadosLancamento): string | null {
  if (o.centro && !d.centroId) return "Centro de custo";
  if (o.forma && !d.formaId) return "Forma de pagamento";
  if (o.projeto && !d.projetoId) return "Projeto";
  if (o.contato && !(d.tipo === "receita" ? d.clienteId : d.fornecedorId)) {
    return d.tipo === "receita" ? "Cliente" : "Fornecedor";
  }
  if (o.observacao && !d.observacao?.trim()) return "Observação";
  return null;
}

export const MOTIVO_COMPROVANTE_OBRIGATORIO = "Anexe o comprovante antes de dar baixa (exigido em Configurações).";

/** M10: se a config exige comprovante na baixa e o lançamento não tem nenhum anexo, recusa. */
export function faltaComprovante(exigir: boolean, qtdAnexos: number): boolean {
  return exigir && qtdAnexos === 0;
}
