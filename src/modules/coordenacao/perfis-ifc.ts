/**
 * Correções no texto STEP do IFC ANTES da conversão para .frag, para contornar
 * perfis que o web-ifc gera errado.
 *
 * IfcCShapeProfileDef (perfil C enrijecido, "Ue": terças e banzos de estrutura
 * metálica) com InternalFilletRadius preenchido sai ACHATADO no web-ifc 0.0.77 e
 * 0.0.78: a altura do perfil vira zero e a peça vira uma fita de 4 triângulos (no
 * visualizador aparece como um fio). Sem o raio, a seção sai certa. Medido com um
 * IFC do CYPECAD (84 de 84 perfis C achatados). Tirar o raio só arredonda menos o
 * canto interno (milímetros) — não muda a peça no modelo federado nem no clash.
 *
 * O arquivo pode ter centenas de MB: trabalha em bytes, nunca vira string inteira.
 * Puro (sem I/O), roda no child process do conversor.
 */

const ENTIDADE_C = Buffer.from("IFCCSHAPEPROFILEDEF", "latin1");
/** InternalFilletRadius é o 8º atributo (índice 7) no IFC2X3 e no IFC4. */
const INDICE_RAIO = 7;

const ASPAS = 0x27; // '
const ABRE = 0x28; // (
const FECHA = 0x29; // )
const VIRGULA = 0x2c; // ,
const DOLAR = 0x24; // $

function ehEspaco(b: number) {
  return b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d;
}

function ehLetraOuDigito(b: number) {
  return (b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a) || (b >= 0x30 && b <= 0x39) || b === 0x5f;
}

/**
 * Faixa [inicio, fim) do atributo `indice` da entidade cujo "(" está em `abre`,
 * ou null se a entidade acaba antes (ou o arquivo está cortado).
 */
function faixaDoAtributo(buf: Uint8Array, abre: number, indice: number): [number, number] | null {
  let prof = 0;
  let atributo = 0;
  let inicio = abre + 1;
  for (let i = abre + 1; i < buf.length; i++) {
    const b = buf[i];
    if (b === ASPAS) {
      // String STEP: '' é aspas escapada; a string acaba na aspa isolada.
      i++;
      while (i < buf.length) {
        if (buf[i] === ASPAS) {
          if (buf[i + 1] === ASPAS) i += 2;
          else break;
        } else i++;
      }
      continue;
    }
    if (b === ABRE) prof++;
    else if (b === FECHA) {
      if (prof === 0) return atributo === indice ? [inicio, i] : null;
      prof--;
    } else if (b === VIRGULA && prof === 0) {
      if (atributo === indice) return [inicio, i];
      atributo++;
      inicio = i + 1;
    }
  }
  return null;
}

function ehVazio(buf: Uint8Array, [inicio, fim]: [number, number]) {
  for (let i = inicio; i < fim; i++) {
    if (!ehEspaco(buf[i]) && buf[i] !== DOLAR) return false;
  }
  return true;
}

export function corrigirPerfisIfc(bytes: Uint8Array): { bytes: Uint8Array; corrigidos: number } {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const trocas: [number, number][] = [];
  let pos = buf.indexOf(ENTIDADE_C, 0);
  while (pos !== -1) {
    const depoisNome = pos + ENTIDADE_C.length;
    if (pos === 0 || !ehLetraOuDigito(buf[pos - 1])) {
      let abre = depoisNome;
      while (abre < buf.length && ehEspaco(buf[abre])) abre++;
      if (buf[abre] === ABRE) {
        const faixa = faixaDoAtributo(buf, abre, INDICE_RAIO);
        if (faixa && !ehVazio(buf, faixa)) trocas.push(faixa);
      }
    }
    pos = buf.indexOf(ENTIDADE_C, depoisNome);
  }
  if (!trocas.length) return { bytes, corrigidos: 0 };

  const partes: Buffer[] = [];
  let cursor = 0;
  const dolar = Buffer.from("$", "latin1");
  for (const [inicio, fim] of trocas) {
    partes.push(buf.subarray(cursor, inicio), dolar);
    cursor = fim;
  }
  partes.push(buf.subarray(cursor));
  return { bytes: new Uint8Array(Buffer.concat(partes)), corrigidos: trocas.length };
}
