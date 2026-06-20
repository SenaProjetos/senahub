/**
 * Parser de CSV puro (sem dependências) para os Datasets do Estúdio de Documentos.
 *
 * Regras:
 * - Detecta o separador automaticamente: vírgula (`,`) ou ponto-e-vírgula (`;`).
 * - Suporta campos entre aspas duplas, com escape de aspas via `""`.
 * - A primeira linha (não vazia) é sempre o cabeçalho (define as colunas).
 * - Linhas totalmente vazias são ignoradas.
 * - Normaliza quebras de linha CRLF (`\r\n`) e CR (`\r`) para LF (`\n`).
 */

export type CsvParseResult = {
  colunas: string[];
  linhas: Record<string, string>[];
};

/**
 * Detecta o separador olhando a primeira linha física (fora de aspas).
 * Conta `,` e `;`; escolhe o de maior frequência. Empate/ausência → `,`.
 */
function detectarSeparador(texto: string): "," | ";" {
  let virgulas = 0;
  let pontosVirgula = 0;
  let dentroAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') {
      dentroAspas = !dentroAspas;
    } else if (!dentroAspas) {
      if (c === ",") virgulas++;
      else if (c === ";") pontosVirgula++;
      else if (c === "\n") break; // só a primeira linha
    }
  }
  return pontosVirgula > virgulas ? ";" : ",";
}

/**
 * Tokeniza o texto inteiro em uma matriz de células, respeitando aspas.
 * Quebras de linha dentro de aspas fazem parte da célula.
 */
function tokenizar(texto: string, sep: "," | ";"): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linhaAtual: string[] = [];
  let dentroAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (dentroAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          // aspas escapada ("")
          campo += '"';
          i++;
        } else {
          dentroAspas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') {
      dentroAspas = true;
    } else if (c === sep) {
      linhaAtual.push(campo);
      campo = "";
    } else if (c === "\n") {
      linhaAtual.push(campo);
      linhas.push(linhaAtual);
      linhaAtual = [];
      campo = "";
    } else {
      campo += c;
    }
  }

  // último campo/linha (sem newline final)
  linhaAtual.push(campo);
  linhas.push(linhaAtual);

  return linhas;
}

/** Uma linha (array de células) é "vazia" se todas as células estão em branco. */
function linhaVazia(celulas: string[]): boolean {
  return celulas.every((c) => c.trim() === "");
}

export function parseCsv(texto: string): CsvParseResult {
  // Normaliza CRLF e CR para LF.
  const normalizado = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (normalizado.trim() === "") {
    return { colunas: [], linhas: [] };
  }

  const sep = detectarSeparador(normalizado);
  const matriz = tokenizar(normalizado, sep).filter((celulas) => !linhaVazia(celulas));

  if (matriz.length === 0) {
    return { colunas: [], linhas: [] };
  }

  const colunas = matriz[0].map((c) => c.trim());
  const linhas: Record<string, string>[] = [];

  for (let r = 1; r < matriz.length; r++) {
    const celulas = matriz[r];
    const registro: Record<string, string> = {};
    colunas.forEach((coluna, idx) => {
      registro[coluna] = celulas[idx] ?? "";
    });
    linhas.push(registro);
  }

  return { colunas, linhas };
}
