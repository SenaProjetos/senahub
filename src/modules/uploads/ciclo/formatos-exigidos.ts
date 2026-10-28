/**
 * Arquivos que a publicação exige por TIPO de documento (`PranchaCatalogo.formatosExigidos`, Configurações →
 * Nomenclatura → Tipos; decisão do dono, 2026-10-28). PURO e client-safe: a tela monta as caixinhas e o
 * serviço decide a publicação com a MESMA lista.
 *
 * Cada exigência é satisfeita por pelo menos UM arquivo da revisão com uma das extensões dela; "Word ou
 * Excel" é uma exigência só, que qualquer um dos dois cumpre.
 */

/** Fonte única dos valores: a tela, a action (Zod) e a regra leem daqui. */
export const VALORES_FORMATOS_EXIGIDOS = ["dwg", "pdf", "excel", "word", "word_ou_excel"] as const;
export type FormatoExigido = (typeof VALORES_FORMATOS_EXIGIDOS)[number];

export const FORMATOS_EXIGIDOS: readonly { valor: FormatoExigido; rotulo: string; extensoes: readonly string[] }[] = [
  { valor: "dwg", rotulo: "DWG", extensoes: ["dwg"] },
  { valor: "pdf", rotulo: "PDF", extensoes: ["pdf"] },
  { valor: "excel", rotulo: "Excel", extensoes: ["xls", "xlsx", "xlsm"] },
  { valor: "word", rotulo: "Word", extensoes: ["doc", "docx"] },
  { valor: "word_ou_excel", rotulo: "Word ou Excel", extensoes: ["doc", "docx", "xls", "xlsx", "xlsm"] },
];

const ORDEM: readonly FormatoExigido[] = VALORES_FORMATOS_EXIGIDOS;

export function ehFormatoExigido(v: unknown): v is FormatoExigido {
  return typeof v === "string" && (ORDEM as readonly string[]).includes(v);
}

/** O que o banco guarda (texto livre): só valores conhecidos, sem repetir, na ordem do catálogo. */
export function normalizarFormatosExigidos(valores: readonly unknown[] | null | undefined): FormatoExigido[] {
  const dentro = new Set((valores ?? []).filter(ehFormatoExigido));
  return ORDEM.filter((v) => dentro.has(v));
}

export function rotuloDoFormato(v: FormatoExigido): string {
  return FORMATOS_EXIGIDOS.find((f) => f.valor === v)?.rotulo ?? v;
}

/** "DWG + PDF"; lista vazia = "Sem exigência". */
export function resumoDosFormatos(valores: readonly FormatoExigido[]): string {
  const lista = normalizarFormatosExigidos(valores);
  return lista.length === 0 ? "Sem exigência" : lista.map(rotuloDoFormato).join(" + ");
}

/** As exigências que as extensões enviadas NÃO cumprem (vazio = pode publicar). */
export function formatosQueFaltam(exigidos: readonly FormatoExigido[], extensoes: readonly string[]): FormatoExigido[] {
  const exts = new Set(extensoes.map((e) => e.toLowerCase()));
  return normalizarFormatosExigidos(exigidos).filter((v) => {
    const f = FORMATOS_EXIGIDOS.find((x) => x.valor === v);
    return !f || !f.extensoes.some((e) => exts.has(e));
  });
}
