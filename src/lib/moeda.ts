/**
 * Núcleo puro para entrada de valores monetários (BRL).
 *
 * Modelo: o campo guarda um buffer de dígitos e o valor cresce da direita para a
 * esquerda (dos centavos para os reais), como nas máquinas de cartão — digitar
 * "5" vira 0,05; "50" vira 0,50; "500" vira 5,00.
 *
 * Dois caminhos de entrada que NUNCA compartilham a mesma regra:
 *  - valor vindo do banco (`valorParaDigitos`) → interpretado em reais;
 *  - tecla digitada (`aplicarDigito`)          → interpretada em centavos.
 *
 * O buffer é "dígitos, com sinal opcional à esquerda" (`"-150050"`). Negativo é
 * exceção — vale só onde o domínio permite (aditivo de supressão, saldo inicial de
 * conta); o componente exige `permiteNegativo` para liberar a tecla `-`.
 */

/** Máximo de dígitos no buffer (≈ 9.999.999.999.999,99). */
export const MAX_DIGITOS_MOEDA = 15;

const formatador = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formata um número em reais sem o símbolo: 1500.5 → "1.500,50". */
export function formatarMoeda(valor: number): string {
  return formatador.format(valor);
}

/** Só os dígitos de um texto qualquer. */
function somenteDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

/** Separa o buffer em sinal + dígitos. */
function partes(buffer: string): { negativo: boolean; digitos: string } {
  return { negativo: buffer.trimStart().startsWith("-"), digitos: somenteDigitos(buffer) };
}

/** Remove zeros à esquerda mantendo ao menos um dígito; reaplica o sinal. */
function normalizarBuffer(digitos: string, negativo = false): string {
  const limpo = digitos.replace(/^0+(?=\d)/, "").slice(0, MAX_DIGITOS_MOEDA);
  return negativo ? "-" + limpo : limpo;
}

/** Inverte o sinal do buffer. Buffer vazio vira "-" (o menos aparece antes do 1º dígito). */
export function alternarSinal(buffer: string): string {
  const { negativo, digitos } = partes(buffer);
  return normalizarBuffer(digitos, !negativo);
}

/** Buffer de dígitos (centavos) → valor em reais. "150050" → 1500.5 */
export function digitosParaValor(buffer: string): number | null {
  const { negativo, digitos } = partes(buffer);
  if (!digitos) return null;
  const valor = Number(digitos) / 100;
  return negativo ? -valor : valor;
}

/**
 * Valor em reais → buffer de dígitos. 1400 → "140000".
 * Caminho de hidratação: um valor existente NUNCA passa pelo redutor de teclas.
 */
export function valorParaDigitos(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "";
  return normalizarBuffer(String(Math.round(Math.abs(valor) * 100)), valor < 0);
}

/** Buffer → texto exibido. "" → "" (campo vazio, distinto de 0,00). */
export function formatarDigitos(buffer: string): string {
  const valor = digitosParaValor(buffer);
  if (valor !== null) return formatarMoeda(valor);
  return partes(buffer).negativo ? "-" : "";
}

/** Acrescenta um dígito à direita (centavos entram primeiro). */
export function aplicarDigito(buffer: string, tecla: string): string {
  if (!/^\d$/.test(tecla)) return buffer;
  const { negativo, digitos } = partes(buffer);
  if (digitos.length >= MAX_DIGITOS_MOEDA) return buffer;
  return normalizarBuffer(digitos + tecla, negativo);
}

/** Apaga o dígito da direita — o número desloca de volta para os centavos. */
export function apagarDigito(buffer: string): string {
  const { negativo, digitos } = partes(buffer);
  const restante = digitos.slice(0, -1);
  // Apagar o último dígito também descarta o sinal — nada a negativar.
  return restante ? normalizarBuffer(restante, negativo) : "";
}

/**
 * Texto colado → buffer.
 * Com separador decimal, lê como reais ("1.500,50" → "150050");
 * só dígitos, lê como centavos ("150050" → "150050").
 * Retorna null quando não há nada aproveitável.
 */
export function colarParaDigitos(texto: string): string | null {
  const cru = texto.replace(/\s| |R\$/gi, "").trim();
  const negativo = /^[-(]/.test(cru) || cru.endsWith(")");
  const bruto = cru.replace(/^[-(]|\)$/g, "");
  if (!bruto) return null;
  if (!/\d/.test(bruto)) return null;

  const temVirgula = bruto.includes(",");
  const temPonto = bruto.includes(".");

  let reais: number | null = null;
  if (temVirgula) {
    // pt-BR: ponto é milhar, vírgula é decimal.
    reais = Number(bruto.replace(/\./g, "").replace(",", "."));
  } else if (temPonto) {
    const grupos = bruto.split(".");
    const ultima = grupos[grupos.length - 1] ?? "";
    // "1.400" = milhar; "1.4" / "1.45" = decimal.
    const ehMilhar = grupos.length > 1 && ultima.length === 3;
    reais = ehMilhar
      ? Number(grupos.join(""))
      : Number(grupos.slice(0, -1).join("") + "." + ultima);
  }

  if (reais !== null && Number.isFinite(reais)) return valorParaDigitos(negativo ? -reais : reais);

  const digitos = normalizarBuffer(somenteDigitos(bruto), negativo);
  return somenteDigitos(digitos) ? digitos : null;
}
