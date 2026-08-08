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

/** Procura uma data (numérica ou por extenso) dentro de uma janela de texto. Retorna ISO ou null. */
function buscarDataNaJanela(janela: string): string | null {
  const numerica = janela.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (numerica) {
    const [, dStr, mStr, yStr] = numerica;
    const d = Number(dStr);
    const m = Number(mStr);
    const y = Number(yStr);
    if (diaValido(y, m, d)) return paraISO(y, m, d);
  }

  const extensa = janela.match(/(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/);
  if (extensa) {
    const [, dStr, mesNome, yStr] = extensa;
    const m = MESES[mesNome];
    const d = Number(dStr);
    const y = Number(yStr);
    if (m && diaValido(y, m, d)) return paraISO(y, m, d);
  }

  return null;
}

/**
 * Sugere a validade (ISO `AAAA-MM-DD`) a partir do texto extraído de um PDF, ou
 * `null` se nenhuma palavra-chave de validade tiver uma data reconhecível por perto.
 */
export function extrairValidadeDoTexto(texto: string): string | null {
  const t = normalizar(texto);
  for (const chave of PALAVRAS_CHAVE) {
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
