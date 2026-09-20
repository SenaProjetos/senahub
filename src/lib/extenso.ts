/**
 * Números e valores por extenso em pt-BR — puro, sem I/O.
 *
 * Existe porque, nas 163 propostas analisadas, 12 valores por extenso estavam errados (vários com o
 * número atualizado e o extenso da proposta copiada: R$ 105.000,00 "(cento e cinco reais)"), e
 * documento enviado ao cliente com valor divergente vale o que está escrito. Gerar o extenso do
 * número elimina a classe inteira de erro.
 *
 * Genérico de propósito (contratos e recibos precisam do mesmo): não conhece proposta nenhuma.
 */

const UNIDADES = [
  "zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez",
  "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
  "seiscentos", "setecentos", "oitocentos", "novecentos",
];

/** Maior inteiro suportado: 999.999.999.999 (o `Decimal(14,2)` do banco vai até aí em reais). */
export const EXTENSO_MAX = 999_999_999_999;

/** 1..999 por extenso. `feminino` concorda "um/dois" e as centenas ("duas", "duzentas"). */
function ateMil(n: number, feminino: boolean): string {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;

  let centena = c > 0 ? CENTENAS[c] : "";
  if (feminino && c >= 2) centena = centena.replace(/os$/, "as");

  let dezenaUnidade = "";
  if (resto > 0) {
    if (resto < 20) {
      dezenaUnidade = UNIDADES[resto];
      if (feminino && resto === 1) dezenaUnidade = "uma";
      if (feminino && resto === 2) dezenaUnidade = "duas";
    } else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      let unidade = u > 0 ? UNIDADES[u] : "";
      if (feminino && u === 1) unidade = "uma";
      if (feminino && u === 2) unidade = "duas";
      dezenaUnidade = u > 0 ? `${DEZENAS[d]} e ${unidade}` : DEZENAS[d];
    }
  }

  if (centena && dezenaUnidade) return `${centena} e ${dezenaUnidade}`;
  return centena || dezenaUnidade;
}

/**
 * Inteiro não negativo por extenso: 1980 → "mil novecentos e oitenta".
 *
 * O "e" entre classes só aparece antes da ÚLTIMA classe não nula, e só quando ela é menor que 100
 * ou centena redonda ("mil e quinhentos", "dois mil e cinquenta", "um milhão e duzentos mil"), mas
 * não em "mil novecentos e oitenta" nem "um milhão duzentos e cinquenta mil".
 */
export function extensoInteiro(n: number, opcoes: { feminino?: boolean } = {}): string {
  if (!Number.isInteger(n) || n < 0 || n > EXTENSO_MAX) {
    throw new RangeError(`extensoInteiro: valor fora do suportado (0 a ${EXTENSO_MAX}): ${n}`);
  }
  if (n === 0) return "zero";
  const feminino = opcoes.feminino === true;

  // Classes da menos para a mais significativa: unidades, mil, milhão, bilhão.
  const classes: number[] = [];
  for (let resto = n; resto > 0; resto = Math.floor(resto / 1000)) classes.push(resto % 1000);

  const frases: { valor: number; texto: string }[] = [];
  for (let i = classes.length - 1; i >= 0; i--) {
    const valor = classes[i];
    if (valor === 0) continue;
    let texto: string;
    if (i === 0) texto = ateMil(valor, feminino);
    else if (i === 1) texto = valor === 1 ? "mil" : `${ateMil(valor, feminino)} mil`;
    else {
      // milhão/bilhão são masculinos: não herdam o feminino ("duas mil", mas "dois milhões").
      const [singular, plural] = i === 2 ? ["milhão", "milhões"] : ["bilhão", "bilhões"];
      texto = `${ateMil(valor, false)} ${valor === 1 ? singular : plural}`;
    }
    frases.push({ valor, texto });
  }

  return frases
    .map((f, idx) => {
      if (idx === 0) return f.texto;
      const ultima = idx === frases.length - 1;
      const ligacao = ultima && (f.valor < 100 || f.valor % 100 === 0) ? " e " : " ";
      return `${ligacao}${f.texto}`;
    })
    .join("");
}

/**
 * Valor em reais por extenso: 12500 → "doze mil e quinhentos reais".
 *
 * Espera o valor JÁ com 2 casas (é o que o `Decimal(14,2)` devolve). Para o que vier com mais
 * casas, arredonde antes com `arredondarMoeda` (`modules/comercial/honorarios.ts`) — aqui o
 * arredondamento é o simples e serve só para descartar ruído de ponto flutuante.
 *
 * Lança em valor negativo, não numérico ou acima do limite: extenso errado num documento enviado
 * ao cliente é pior que um erro, então a função não "faz o possível".
 */
export function extensoMoeda(valor: number): string {
  if (!Number.isFinite(valor) || valor < 0) {
    throw new RangeError(`extensoMoeda: valor inválido: ${valor}`);
  }
  const centavosTotais = Math.round(valor * 100);
  const reais = Math.floor(centavosTotais / 100);
  const centavos = centavosTotais % 100;
  if (reais > EXTENSO_MAX) throw new RangeError(`extensoMoeda: valor acima do suportado: ${valor}`);

  const partes: string[] = [];
  if (reais > 0) {
    // "um milhão DE reais", "dois bilhões DE reais": redondo em milhão/bilhão pede o "de".
    const complemento = reais % 1_000_000 === 0 ? "de reais" : reais === 1 ? "real" : "reais";
    partes.push(`${extensoInteiro(reais)} ${complemento}`);
  }
  if (centavos > 0) {
    partes.push(`${extensoInteiro(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  }
  return partes.length > 0 ? partes.join(" e ") : "zero real";
}

/**
 * Quantidade com o extenso entre parênteses, como se escreve em contrato: "45 (quarenta e cinco)
 * dias", "1 (um) dia", "2 (duas) parcelas".
 */
export function quantidadeComExtenso(
  n: number,
  substantivo: { singular: string; plural: string; feminino?: boolean },
): string {
  const extenso = extensoInteiro(n, { feminino: substantivo.feminino });
  return `${n} (${extenso}) ${n === 1 ? substantivo.singular : substantivo.plural}`;
}

/** "45 (quarenta e cinco) dias". */
export const diasComExtenso = (n: number) => quantidadeComExtenso(n, { singular: "dia", plural: "dias" });
