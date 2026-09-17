/**
 * Heurística pura (sem I/O) para sugerir a data de validade a partir do texto
 * selecionável de um PDF de certidão (extraído no cliente via pdfjs — ver
 * `UploadVersaoDialog` em `certidoes-view.tsx`). NÃO é OCR: só funciona em PDFs
 * com camada de texto real; PDF escaneado (imagem) não produz texto e a função
 * retorna `null` — nunca inventa uma data.
 *
 * Âncora em palavras-chave de validade (não pega a primeira data qualquer do
 * documento, que costuma ser a data de emissão) e valida a data encontrada
 * antes de sugerir — um preenchimento automático errado que passa despercebido
 * é pior que campo vazio.
 */

import type { ItemTextoPdf } from "@/lib/ler-texto-pdf";

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

const PALAVRAS_CHAVE = [
  "válida até", "valida ate", "válido até", "valido ate",
  "data de validade", "validade:", "validade ate", "validade até",
  "vencimento:", "vence em", "expira em",
];

const JANELA = 60; // caracteres após a palavra-chave onde a data deve aparecer

function normalizar(texto: string): string {
  return texto.replace(/\s+/g, " ").toLowerCase();
}

function diaValido(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function paraISO(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const DATA_NUMERICA = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/;
const DATA_EXTENSA = /(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/;
// Conector de período ("12/09/2026 a 11/10/2026", "de ... até ...", "... - ..."),
// ancorado no início do resto do texto logo após a primeira data.
const CONECTOR_PERIODO = /^\s*(?:até|ate|a|à|-|–|—)\s*/;

/** Converte um match de data (numérica ou por extenso) em ISO, ou null se inválida. */
function matchParaISO(match: RegExpMatchArray, extensa: boolean): string | null {
  const [, dStr, meio, yStr] = match;
  const d = Number(dStr);
  const m = extensa ? MESES[meio] : Number(meio);
  const y = Number(yStr);
  return m && diaValido(y, m, d) ? paraISO(y, m, d) : null;
}

/** Primeira data do texto (numérica ou por extenso, a que aparecer antes) com onde começa e termina. */
function primeiraData(texto: string): { iso: string | null; inicio: number; fim: number } | null {
  const candidatos = [
    { match: texto.match(DATA_NUMERICA), extensa: false },
    { match: texto.match(DATA_EXTENSA), extensa: true },
  ].filter((c): c is { match: RegExpMatchArray; extensa: boolean } => c.match !== null);
  if (candidatos.length === 0) return null;
  const { match, extensa } = candidatos.reduce((a, b) => (b.match.index! < a.match.index! ? b : a));
  return { iso: matchParaISO(match, extensa), inicio: match.index!, fim: match.index! + match[0].length };
}

/**
 * Procura uma data (numérica ou por extenso) dentro de uma janela de texto. Retorna ISO ou null.
 * Se a data abre um período ("12/09/2026 a 11/10/2026" — ex.: CRF do FGTS), a validade é a
 * data FINAL, não a inicial.
 */
function buscarDataNaJanela(janela: string): string | null {
  const inicio = primeiraData(janela);
  if (!inicio) return null;

  const resto = janela.slice(inicio.fim);
  const conector = resto.match(CONECTOR_PERIODO);
  if (inicio.iso && conector) {
    const fim = primeiraData(resto.slice(conector[0].length));
    // A data final precisa vir colada ao conector (não uma data solta mais adiante).
    if (fim?.iso && fim.inicio === 0) return fim.iso;
  }

  return inicio.iso;
}

// Âncoras da data de emissão, usadas só quando a validade vem como prazo em dias.
const PALAVRAS_EMISSAO = [
  "expedida em", "emitida em", "data de expedição", "data da expedição", "data de expedicao",
  "data de emissão", "data da emissão", "data de emissao", "expedição:", "emissão:",
];

// "válida por 60 (sessenta) dias", "validade de 90 dias", "válido pelo prazo de 180 dias".
const PRAZO_EM_DIAS =
  /(?:v[aá]lid[ao]|validade)\s+(?:por\s+|de\s+|pelo\s+prazo\s+de\s+)?(\d{1,3})\s*(?:\([^)]*\)\s*)?dias/;

/** Primeira data ancorada em alguma das palavras-chave (na ordem da lista), ou null. */
function buscarDataAncorada(t: string, chaves: string[]): string | null {
  for (const chave of chaves) {
    let pos = t.indexOf(chave);
    while (pos !== -1) {
      const janela = t.slice(pos + chave.length, pos + chave.length + JANELA);
      const achada = buscarDataNaJanela(janela);
      if (achada) return achada;
      pos = t.indexOf(chave, pos + 1);
    }
  }
  return null;
}

function somarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return paraISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

// Célula que é SÓ o rótulo ("VALIDADE", "Data de validade:", "Vencimento") — o valor fica em outra célula.
const ROTULO_VALIDADE = /^(?:data\s+de\s+)?(?:validade|vencimento|v[aá]lid[ao]\s+at[eé])\s*:?$/;

/**
 * Validade em layout de tabela/caixa: rótulo numa linha e a data na linha de baixo, na mesma
 * coluna (ex.: CIM do Recife — "COMPETÊNCIA | VALIDADE | SITUAÇÃO" com os valores embaixo).
 * No texto corrido isso vira "competência validade situação 2026/2 10/02/2027 ativo" e não dá
 * para saber qual valor é de qual coluna — por isso usa a posição dos itens.
 */
function buscarDataAbaixoDoRotulo(itens: ItemTextoPdf[]): string | null {
  const TOL_X = 4;
  const TOL_LINHA = 2;
  for (const rotulo of itens) {
    if (!ROTULO_VALIDADE.test(normalizar(rotulo.str).trim())) continue;
    const altura = rotulo.h > 0 ? rotulo.h : 10;
    const naColuna = itens.filter(
      (it) =>
        it !== rotulo &&
        it.pagina === rotulo.pagina &&
        it.y < rotulo.y - TOL_LINHA &&
        rotulo.y - it.y <= altura * 4 &&
        it.x < rotulo.x + rotulo.w + TOL_X &&
        it.x + it.w > rotulo.x - TOL_X &&
        it.str.trim() !== "",
    );
    // Agrupa por linha (mesmo y) e testa da linha mais próxima do rótulo para baixo.
    const linhas = new Map<number, ItemTextoPdf[]>();
    for (const it of naColuna) {
      const chave = [...linhas.keys()].find((y) => Math.abs(y - it.y) <= TOL_LINHA) ?? it.y;
      linhas.set(chave, [...(linhas.get(chave) ?? []), it]);
    }
    for (const y of [...linhas.keys()].sort((a, b) => b - a)) {
      const texto = linhas.get(y)!.sort((a, b) => a.x - b.x).map((it) => it.str).join(" ");
      const achada = buscarDataNaJanela(normalizar(texto));
      if (achada) return achada;
    }
  }
  return null;
}

/**
 * Sugere a validade (ISO `AAAA-MM-DD`) a partir do texto extraído de um PDF, ou
 * `null` se nenhuma palavra-chave de validade tiver uma data reconhecível por perto.
 *
 * Ordem: (1) data explícita após palavra-chave de validade; (2) data na célula abaixo
 * de um rótulo "Validade" (precisa dos `itens` com posição); (3) prazo em dias
 * ("válida por 60 dias a contar da expedição") somado à data de emissão/expedição
 * — só se as duas coisas forem encontradas.
 */
export function extrairValidadeDoTexto(texto: string, itens: ItemTextoPdf[] = []): string | null {
  const t = normalizar(texto);
  const explicita = buscarDataAncorada(t, PALAVRAS_CHAVE);
  if (explicita) return explicita;

  const emTabela = buscarDataAbaixoDoRotulo(itens);
  if (emTabela) return emTabela;

  const prazo = t.match(PRAZO_EM_DIAS);
  const dias = prazo ? Number(prazo[1]) : 0;
  if (dias < 1) return null;
  const emissao = buscarDataAncorada(t, PALAVRAS_EMISSAO);
  return emissao ? somarDias(emissao, dias) : null;
}
