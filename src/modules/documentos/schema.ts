import { z } from "zod";

/**
 * Layout de documento em BANDAS (estilo report designer):
 * cabeçalho do relatório → cabeçalho de página/colunas → detalhe (repete
 * por linha da fonte de dados) → rodapé de página → rodapé do relatório.
 * Elementos têm posição absoluta (x/y/w/h) dentro da banda.
 * Página A4 @96dpi: 794×1123px.
 */

export const A4 = { width: 794, height: 1123 } as const;

/** Fator de conversão milímetros → pixels @96dpi (96 / 25.4 ≈ 3.7795). */
export const MM_TO_PX = 96 / 25.4;
export function mmToPx(mm: number): number {
  return Math.round(mm * MM_TO_PX);
}

/**
 * Formatos de folha (ABNT NBR + comuns). Dimensões em retrato (largura × altura mm).
 */
export const FORMATOS_FOLHA: Record<
  string,
  { label: string; larguraMm: number; alturaMm: number }
> = {
  A0: { label: "A0 (841 × 1189 mm)", larguraMm: 841, alturaMm: 1189 },
  A1: { label: "A1 (594 × 841 mm)", larguraMm: 594, alturaMm: 841 },
  A2: { label: "A2 (420 × 594 mm)", larguraMm: 420, alturaMm: 594 },
  A3: { label: "A3 (297 × 420 mm)", larguraMm: 297, alturaMm: 420 },
  A4: { label: "A4 (210 × 297 mm)", larguraMm: 210, alturaMm: 297 },
  A5: { label: "A5 (148 × 210 mm)", larguraMm: 148, alturaMm: 210 },
  Carta: { label: "Carta (216 × 279 mm)", larguraMm: 216, alturaMm: 279 },
};

export const ORIENTACOES = ["retrato", "paisagem"] as const;
export type Orientacao = (typeof ORIENTACOES)[number];

/** Dimensões em px de um formato/orientação (troca largura/altura no paisagem). */
export function dimensoesPx(
  formato: string,
  orientacao: Orientacao,
): { largura: number; altura: number } {
  const f = FORMATOS_FOLHA[formato] ?? FORMATOS_FOLHA.A4;
  const lMm = orientacao === "paisagem" ? f.alturaMm : f.larguraMm;
  const aMm = orientacao === "paisagem" ? f.larguraMm : f.alturaMm;
  return { largura: mmToPx(lMm), altura: mmToPx(aMm) };
}

/** Margens ABNT (NBR): esquerda 25mm p/ encadernação, demais 10mm — em px. */
export function margemAbntPx(): { topo: number; direita: number; baixo: number; esquerda: number } {
  return {
    topo: mmToPx(10),
    direita: mmToPx(10),
    baixo: mmToPx(10),
    esquerda: mmToPx(25),
  };
}

export const TIPOS_BANDA = [
  "cabecalho",
  "cabecalhoPagina",
  "grupoCabecalho",
  "detalhe",
  "grupoRodape",
  "rodapePagina",
  "rodape",
] as const;
export type TipoBanda = (typeof TIPOS_BANDA)[number];

export const BANDA_LABEL: Record<TipoBanda, string> = {
  cabecalho: "Cabeçalho do relatório",
  cabecalhoPagina: "Cabeçalho de colunas",
  grupoCabecalho: "Cabeçalho de grupo",
  detalhe: "Detalhe (repete por linha)",
  grupoRodape: "Rodapé de grupo (subtotal)",
  rodapePagina: "Rodapé de página",
  rodape: "Rodapé do relatório",
};

export const TIPOS_ELEMENTO = [
  "label",
  "campo",
  "paragrafo",
  "assinatura",
  "linha",
  "retangulo",
  "imagem",
  "tabela",
  "qrcode",
] as const;
export type TipoElemento = (typeof TIPOS_ELEMENTO)[number];

/** Coluna de um elemento "tabela". `campo` é um token (ex.: "[Disciplina]"). */
export const colunaTabelaSchema = z.object({
  campo: z.string().default(""),
  titulo: z.string().default(""),
  largura: z.number().min(1).default(1),
  align: z.enum(["left", "center", "right"]).default("left"),
});
export type ColunaTabela = z.infer<typeof colunaTabelaSchema>;

export const estiloSchema = z.object({
  fontSize: z.number().min(6).max(96).default(12),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
  align: z.enum(["left", "center", "right"]).default("left"),
  color: z.string().default(""),
  bg: z.string().default(""),
  borderW: z.number().min(0).max(12).default(0),
  borderColor: z.string().default("#1C2D58"),
  borderStyle: z.enum(["solida", "tracejada", "pontilhada"]).default("solida"),
  radius: z.number().min(0).max(40).default(0),
  /** Família tipográfica do elemento (id do registry); "" = herda do documento. */
  fontFamily: z.string().default(""),
});
export type Estilo = z.infer<typeof estiloSchema>;

export const elementoSchema = z.object({
  id: z.string(),
  tipo: z.enum(TIPOS_ELEMENTO),
  x: z.number(),
  y: z.number(),
  w: z.number().min(4),
  h: z.number().min(4),
  /** label: texto fixo (pode conter tokens inline). campo: token puro. imagem: URL/caminho. */
  texto: z.string().default(""),
  estilo: estiloSchema,
  visivel: z.boolean().default(true),
  travado: z.boolean().default(false),
  /** Colunas do elemento "tabela" (apenas tipo==="tabela"). Modelos antigos → undefined. */
  colunas: z.array(colunaTabelaSchema).optional(),
});
export type Elemento = z.infer<typeof elementoSchema>;

export const bandaSchema = z.object({
  id: z.string(),
  tipo: z.enum(TIPOS_BANDA),
  altura: z.number().min(8).max(1123),
  elementos: z.array(elementoSchema),
});
export type Banda = z.infer<typeof bandaSchema>;

export const docSchemaZ = z.object({
  versao: z.literal(1),
  pagina: z.object({
    /** Formato da folha (chave de FORMATOS_FOLHA). Modelos antigos → "A4". */
    formato: z.string().default("A4"),
    /** Orientação. Modelos antigos → "retrato". */
    orientacao: z.enum(ORIENTACOES).default("retrato"),
    /** Dimensões em px (derivadas de formato/orientação; mantidas no schema). */
    largura: z.number().default(A4.width),
    altura: z.number().default(A4.height),
    margem: z.object({
      topo: z.number().default(48),
      direita: z.number().default(48),
      baixo: z.number().default(48),
      esquerda: z.number().default(48),
    }),
    /** Marca d'água da página (texto translúcido rotacionado ao fundo). Opcional/retrocompat. */
    marcaDagua: z
      .object({
        texto: z.string().default(""),
        opacidade: z.number().min(0).max(1).optional(),
      })
      .optional(),
  }),
  bandas: z.array(bandaSchema),
  /**
   * Agrupamento da coleção (linhas) por uma chave (ex.: "Disciplina"/"Categoria").
   * Quando definido E houver banda "detalhe", as linhas são agrupadas e cada grupo
   * renderiza: grupoCabecalho → linhas (detalhe) → grupoRodape (subtotais).
   * Modelos antigos (sem o campo) ou "" = sem agrupamento (comportamento original).
   * Opcional p/ retrocompat: literais/JSON antigos sem a chave continuam válidos.
   */
  agruparPor: z.string().optional(),
});
export type DocSchema = z.infer<typeof docSchemaZ>;

export function novoId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function docVazio(): DocSchema {
  const dim = dimensoesPx("A4", "retrato");
  return {
    versao: 1,
    pagina: {
      formato: "A4",
      orientacao: "retrato",
      largura: dim.largura,
      altura: dim.altura,
      margem: { topo: 48, direita: 48, baixo: 48, esquerda: 48 },
    },
    bandas: [
      { id: novoId(), tipo: "cabecalho", altura: 140, elementos: [] },
      { id: novoId(), tipo: "cabecalhoPagina", altura: 32, elementos: [] },
      { id: novoId(), tipo: "detalhe", altura: 28, elementos: [] },
      { id: novoId(), tipo: "rodape", altura: 120, elementos: [] },
    ],
  };
}

export function novoElemento(tipo: TipoElemento, x = 0, y = 0): Elemento {
  const base: Elemento = {
    id: novoId(),
    tipo,
    x,
    y,
    w: 200,
    h: 24,
    texto: "",
    estilo: estiloSchema.parse({}),
    visivel: true,
    travado: false,
  };
  switch (tipo) {
    case "label":
      return { ...base, texto: "Texto" };
    case "campo":
      return { ...base, texto: "[Campo]" };
    case "paragrafo":
      return {
        ...base,
        w: 300,
        h: 80,
        texto: "Parágrafo de texto com quebra automática de linha. Pode conter [Campo] inline.",
      };
    case "assinatura":
      return {
        ...base,
        w: 220,
        h: 56,
        texto: "Assinatura — [Nome]",
        estilo: { ...base.estilo, align: "center", fontSize: 10 },
      };
    case "linha":
      return { ...base, h: 2, estilo: { ...base.estilo, bg: "#1C2D58" } };
    case "retangulo":
      return { ...base, w: 160, h: 60, estilo: { ...base.estilo, borderW: 1 } };
    case "imagem":
      return { ...base, w: 140, h: 60, texto: "/MARCA/logo_completa_light.svg" };
    case "tabela":
      return {
        ...base,
        w: 400,
        h: 120,
        estilo: { ...base.estilo, fontSize: 10 },
        colunas: [
          { campo: "[Disciplina]", titulo: "Disciplina", largura: 2, align: "left" },
          { campo: "[Valor]", titulo: "Valor", largura: 1, align: "right" },
        ],
      };
    case "qrcode":
      // Conteúdo do QR (pode conter tokens — ex.: URL de verificação ou nº do documento).
      return { ...base, w: 96, h: 96, texto: "[NumeroDocumento]" };
  }
}

/** Schemas dos actions */
export const criarModeloSchema = z.object({
  nome: z.string().min(1, "Informe o nome."),
  tipo: z.enum(["relatorio", "proposta", "contrato", "recibo", "holerite", "outro"]),
  fonte: z.string().optional().or(z.literal("")),
});

export const salvarModeloSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  tipo: z.enum(["relatorio", "proposta", "contrato", "recibo", "holerite", "outro"]),
  fonte: z.string().optional().or(z.literal("")),
  schemaJson: docSchemaZ,
});

export const idModeloSchema = z.object({ id: z.string().min(1) });
export const restaurarVersaoSchema = z.object({
  modeloId: z.string().min(1),
  versaoId: z.string().min(1),
});
