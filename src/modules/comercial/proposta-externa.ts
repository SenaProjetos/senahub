/**
 * Proposta externa (ADR-0005): regras puras do PDF anexado. Sem I/O — usado pela rota de upload e
 * pelo serviço.
 */

/** Pasta onde a rota de upload grava. O serviço só aceita caminhos daqui. */
export const PASTA_PDF_EXTERNO = "comercial/propostas/externas/";

const PADRAO_CAMINHO = /^comercial\/propostas\/externas\/[a-f0-9]{24}\.pdf$/;

/** Assinatura real do arquivo: todo PDF começa com `%PDF-`. O `type` do navegador não vale. */
export function ehPdf(conteudo: Uint8Array): boolean {
  const assinatura = [0x25, 0x50, 0x44, 0x46, 0x2d];
  return conteudo.length >= assinatura.length && assinatura.every((b, i) => conteudo[i] === b);
}

/**
 * O caminho chega no payload da Server Action, que é editável pelo cliente. Sem esta checagem,
 * alguém poderia apontar a versão para QUALQUER arquivo do storage (holerite, documento de outro
 * cliente) e baixá-lo depois pela rota de PDF da versão.
 */
export function caminhoPdfExternoValido(caminho: string): boolean {
  return PADRAO_CAMINHO.test(caminho);
}
