/**
 * Parser CSV tolerante (RFC-4180) para exports de ERP brasileiros.
 * Detecta o delimitador (`;` ou `,`), remove BOM, e trata aspas duplas com
 * escape `""` e quebras de linha dentro de campos entre aspas.
 */

/** Conta ocorrências de um delimitador FORA de aspas na primeira linha lógica. */
function contarFora(texto: string, delim: string): number {
  let n = 0;
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') aspas = !aspas;
    else if (c === "\n" && !aspas) break;
    else if (c === delim && !aspas) n++;
  }
  return n;
}

/** Decide o delimitador comparando `;` vs `,` na 1ª linha (BR exporta com `;`). */
export function detectarDelimitador(texto: string): string {
  return contarFora(texto, ";") >= contarFora(texto, ",") ? ";" : ",";
}

/** Faz o parse do CSV em matriz de strings. Linhas totalmente vazias são descartadas. */
export function parseCsv(texto: string, delimitador?: string): string[][] {
  // remove BOM
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  const delim = delimitador ?? detectarDelimitador(texto);

  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++; // pula o segundo "
        } else {
          aspas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') {
      aspas = true;
    } else if (c === delim) {
      linha.push(campo);
      campo = "";
    } else if (c === "\r") {
      // ignora; o \n cuida da quebra
    } else if (c === "\n") {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else {
      campo += c;
    }
  }
  // último campo/linha (arquivo sem \n final)
  if (campo.length > 0 || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }

  return linhas.filter((l) => l.some((c) => c.trim() !== ""));
}
