/**
 * De onde vem o título que a tela de envio propõe para cada documento — regra pura, sem I/O.
 *
 * Precedência: título que o documento JÁ tinha no banco (alguém escreveu; nunca é sobrescrito)
 * > título lido do carimbo do PDF. Sem nenhum dos dois, o campo fica vazio e a tela mostra o
 * nome do tipo (Configurações → Lista Mestre) como padrão, que só é gravado se a pessoa marcar
 * "usar padrão" — o padrão é genérico, então não vira título sem alguém confirmar.
 *
 * PDF e DWG da mesma prancha caem no MESMO documento e chegam em respostas separadas, em
 * qualquer ordem: o que a tela já registrou para o documento vale até o fim do lote.
 */

export type OrigemTitulo = "banco" | "carimbo" | "usuario";

export type TituloRegistrado = { valor: string; origem: OrigemTitulo };

export function decidirTitulo(entrada: {
  /** O que esta tela já registrou para o documento (arquivo anterior do mesmo lote). */
  registrado: TituloRegistrado | null;
  /** Título que o servidor devolveu como já existente no documento. */
  tituloAtual: string | null;
  tituloDoCarimbo: string | null;
}): { registro: TituloRegistrado | null; gravar: boolean } {
  const { registrado, tituloAtual, tituloDoCarimbo } = entrada;
  if (registrado) return { registro: registrado, gravar: false };
  if (tituloAtual) return { registro: { valor: tituloAtual, origem: "banco" }, gravar: false };
  if (tituloDoCarimbo) return { registro: { valor: tituloDoCarimbo, origem: "carimbo" }, gravar: true };
  return { registro: null, gravar: false };
}

/**
 * O checkbox "usar padrão" fica marcado enquanto o título é exatamente o nome do tipo — derivado,
 * sem estado próprio: digitar outra coisa desmarca sozinho.
 */
export function usaTituloPadrao(titulo: string | null | undefined, nomeDoTipo: string | null | undefined): boolean {
  return !!titulo && !!nomeDoTipo && titulo.trim() === nomeDoTipo.trim();
}
