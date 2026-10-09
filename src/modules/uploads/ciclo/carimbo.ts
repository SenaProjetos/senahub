/**
 * Conferência do carimbo no "Enviar para análise" (D9, regra aprovada pelo dono em 2026-10-09). PURO.
 *
 * Calibrado nos três carimbos reais que o dono mandou — por isso não depende do layout:
 *  - SENA novo:  `CÓDIGO: 260029-HDR-BS-6001-DE.DWG` · `REVISÃO: 00`
 *  - SENA antigo: `CÓDIGO:` traz o NOME DO DWG ("SENA PROJETOS_ESTRUTURAL - ESCOLA … .DWG") · `REVISÃO: 00`
 *  - Cliente (Localiza): `ARQUIVO: 26027-EST-EX-4006-DTC-R00` · `REVISÃO: R00`
 *
 * Código: qualquer trecho da prancha com cara de código de documento (projeto + 2 ou mais blocos). Sem
 * nenhum, o código não é conferido (SENA antigo). Com algum, um deles tem de ser o do nome do arquivo —
 * extensão e `-Rnn` final não contam.
 * Revisão: o valor do campo "REVISÃO:" (`00`, `R00`, `REV 00`, `REV.0`); sem ele, o `-Rnn` do código.
 * Leitura falhou = PDF sem texto, ou nem código nem revisão encontrados: não bloqueia, pede confirmação.
 */
import type { ItemTextoPdf } from "@/lib/ler-texto-pdf";
import { rotuloRevisao } from "@/lib/utils";
import { paraEspacoDeLeitura, type ItemLeitura } from "../titulo-carimbo";

export type LeituraCarimbo = {
  temTexto: boolean;
  /** Códigos encontrados, já normalizados (`codigoBase`), sem repetição. */
  codigos: string[];
  /** Revisão lida (0 = R00), ou `null`. */
  revisao: number | null;
};

export const LEITURA_VAZIA: LeituraCarimbo = { temTexto: false, codigos: [], revisao: null };

/** Mesma frase no servidor (ActionError) e na tela, que reconhece o caso e oferece a confirmação. */
export const MOTIVO_CARIMBO_ILEGIVEL =
  "Não foi possível ler o código e a revisão no carimbo do PDF. Confira o carimbo e confirme o envio sem a conferência.";

/** Código de documento: projeto (3–6 dígitos) + 2 ou mais blocos, com extensão opcional. */
const CODIGO = /(?<![\w.])(\d{3,6}(?:-[A-Za-zÀ-ÿ0-9]{1,12}){2,})(?:\.(?:dwg|pdf|dxf|rvt|ifc|nwd))?(?![\w-])/gi;
const REV_FINAL = /-R(\d{1,3})$/;
const ROTULO_REVISAO = /^\s*REVIS[ÃA]O\s*:\s*(.*)$/i;
const VALOR_REVISAO = /^(?:R|REV\.?\s*)?0*(\d{1,3})$/i;

/** Maiúsculas, sem extensão e sem `-Rnn` final: `26027-est-ex-4006-dtc-R00.pdf` → `26027-EST-EX-4006-DTC`. */
export function codigoBase(texto: string): string {
  return texto
    .trim()
    .toUpperCase()
    .replace(/\.(DWG|PDF|DXF|RVT|IFC|NWD)$/, "")
    .replace(REV_FINAL, "");
}

function revisaoDoValor(texto: string): number | null {
  const m = texto.trim().match(VALOR_REVISAO);
  return m ? Number(m[1]) : null;
}

/** Valor do rótulo "REVISÃO:": no próprio item, ou o item mais perto à direita/abaixo com cara de revisão. */
function revisaoDoCampo(itens: ItemLeitura[]): number | null {
  for (const rotulo of itens) {
    const m = rotulo.str.match(ROTULO_REVISAO);
    if (!m) continue;
    const inline = m[1] ? revisaoDoValor(m[1]) : null;
    if (inline !== null) return inline;
    const h = rotulo.h > 0 ? rotulo.h : 6;
    const candidatos = itens
      .filter((it) => it !== rotulo && it.giro === rotulo.giro && revisaoDoValor(it.str) !== null)
      .map((it) => ({ it, dx: it.x - (rotulo.x + rotulo.w), dy: rotulo.y - it.y }))
      // à direita na mesma linha (até ~12 alturas), ou logo abaixo na mesma coluna
      .filter(({ dx, dy }) => (dx >= -h && dx <= h * 12 && Math.abs(dy) <= h * 1.5) || (dy > 0 && dy <= h * 4 && Math.abs(dx) <= h * 6))
      .sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy));
    if (candidatos.length > 0) return revisaoDoValor(candidatos[0].it.str);
  }
  return null;
}

export function lerCarimbo(itens: readonly ItemTextoPdf[]): LeituraCarimbo {
  const daPrimeira = itens.filter((it) => it.pagina === 1 && it.str.trim() !== "");
  if (daPrimeira.length === 0) return LEITURA_VAZIA;
  const brutos = new Set<string>();
  for (const it of daPrimeira) for (const m of it.str.matchAll(CODIGO)) brutos.add(m[0].toUpperCase());
  const codigos = [...new Set([...brutos].map(codigoBase))];
  let revisao = revisaoDoCampo(daPrimeira.map(paraEspacoDeLeitura));
  if (revisao === null) {
    const comRev = [...brutos].map((c) => c.replace(/\.(DWG|PDF|DXF|RVT|IFC|NWD)$/, "").match(REV_FINAL)).find(Boolean);
    if (comRev) revisao = Number(comRev[1]);
  }
  return { temTexto: true, codigos, revisao };
}

export type ConferenciaCarimbo = { problemas: string[]; leituraFalhou: boolean };

/**
 * Confere a leitura com o que o sistema espera. `nomeArquivo` = o PDF da revisão; `numero` = número
 * interno da revisão (1 = R00).
 */
export function conferirCarimbo(leitura: LeituraCarimbo, esperado: { nomeArquivo: string; numero: number }): ConferenciaCarimbo {
  const leituraFalhou = !leitura.temTexto || (leitura.codigos.length === 0 && leitura.revisao === null);
  const problemas: string[] = [];
  const base = codigoBase(esperado.nomeArquivo);
  if (leitura.codigos.length > 0 && !leitura.codigos.includes(base)) {
    problemas.push(`O carimbo indica o código ${leitura.codigos[0]}, mas o arquivo se chama ${base}.`);
  }
  if (leitura.revisao !== null && leitura.revisao !== esperado.numero - 1) {
    problemas.push(`O carimbo indica R${String(leitura.revisao).padStart(2, "0")}, mas o sistema espera ${rotuloRevisao(esperado.numero)}.`);
  }
  return { problemas, leituraFalhou };
}
