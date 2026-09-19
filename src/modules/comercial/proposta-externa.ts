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

export type ArquivoDaPasta = { caminho: string; modificadoEm: Date };

/** Carência antes de um PDF sem versão ser considerado órfão — dá tempo de terminar o formulário. */
export const CARENCIA_PDF_ORFAO_MS = 24 * 60 * 60 * 1000;

/**
 * Quais arquivos da pasta das externas podem ser apagados: os que o upload gerou (formato do
 * `caminhoPdfExternoValido` — nada que alguém tenha posto ali à mão), que NENHUMA versão referencia
 * e que já passaram da carência. O upload acontece antes do registro; sem carência, apagaria o
 * arquivo de quem está preenchendo o formulário agora.
 */
export function selecionarPdfsOrfaos(
  arquivos: readonly ArquivoDaPasta[],
  referenciados: ReadonlySet<string>,
  agora: Date,
  carenciaMs: number = CARENCIA_PDF_ORFAO_MS,
): string[] {
  return arquivos
    .filter(
      (a) =>
        caminhoPdfExternoValido(a.caminho) &&
        !referenciados.has(a.caminho) &&
        agora.getTime() - a.modificadoEm.getTime() >= carenciaMs,
    )
    .map((a) => a.caminho);
}
