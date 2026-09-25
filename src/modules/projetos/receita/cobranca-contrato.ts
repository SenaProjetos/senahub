/**
 * A cobrança de um projeto tem dois caminhos que não devem se misturar: as parcelas manuais do card
 * "Receita / Contrato" e o contrato de cliente (Jurídico → Pagamento). Os dois viram receita prevista:
 * gerar parcelas à mão num projeto que já tem contrato cobra em dobro na projeção de caixa.
 *
 * Contrato por ENTREGA manda na cobrança (parcelas e previsão saem dele) → recusa. Contrato por DATA
 * com plano definido só gera parcelas na assinatura e convive com fluxos antigos → avisa.
 */

export type ContratoDeCobranca = {
  titulo: string;
  formaCobranca: "por_data" | "por_entrega";
  statusContrato: "rascunho" | "aguardando_assinatura" | "assinado" | "vencido" | "rescindido" | null;
  /** Nº de parcelas do plano por data; nulo = plano ainda não definido. */
  parcelas: number | null;
};

export type AvisoCobrancaContrato = { nivel: "recusa" | "aviso"; texto: string };

export function avisoCobrancaContrato(contratos: readonly ContratoDeCobranca[]): AvisoCobrancaContrato | null {
  const vigentes = contratos.filter((c) => c.statusContrato != null && c.statusContrato !== "rescindido");

  const porEntrega = vigentes.find((c) => c.formaCobranca === "por_entrega");
  if (porEntrega) {
    return {
      nivel: "recusa",
      texto: `O contrato "${porEntrega.titulo}" deste projeto é cobrado por entrega: as parcelas e a previsão de recebimento saem dele (Jurídico → Pagamento). Gerar parcelas aqui somaria a cobrança duas vezes.`,
    };
  }

  const porData = vigentes.find((c) => c.formaCobranca === "por_data" && c.parcelas != null);
  if (porData) {
    return {
      nivel: "aviso",
      texto: `O contrato "${porData.titulo}" deste projeto já tem parcelas por data. Gerar parcelas aqui soma uma segunda cobrança — confira antes para não cobrar em dobro.`,
    };
  }

  return null;
}
