import { z } from "zod";

/**
 * Layout de documento em BANDAS (estilo report designer):
 * cabeçalho do relatório → cabeçalho de página/colunas → detalhe (repete
 * por linha da fonte de dados) → rodapé de página → rodapé do relatório.
 * Elementos têm posição absoluta (x/y/w/h) dentro da banda.
 * Página A4 @96dpi: 794×1123px.
 */

export const A4 = { width: 794, height: 1123 } as const;

export const TIPOS_BANDA = [
  "cabecalho",
  "cabecalhoPagina",
  "detalhe",
  "rodapePagina",
  "rodape",
] as const;
export type TipoBanda = (typeof TIPOS_BANDA)[number];

export const BANDA_LABEL: Record<TipoBanda, string> = {
  cabecalho: "Cabeçalho do relatório",
  cabecalhoPagina: "Cabeçalho de colunas",
  detalhe: "Detalhe (repete por linha)",
  rodapePagina: "Rodapé de página",
  rodape: "Rodapé do relatório",
};

export const TIPOS_ELEMENTO = ["label", "campo", "linha", "retangulo", "imagem"] as const;
export type TipoElemento = (typeof TIPOS_ELEMENTO)[number];

export const estiloSchema = z.object({
  fontSize: z.number().min(6).max(96).default(12),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
  align: z.enum(["left", "center", "right"]).default("left"),
  color: z.string().default(""),
  bg: z.string().default(""),
  borderW: z.number().min(0).max(12).default(0),
  borderColor: z.string().default("#1C2D58"),
  radius: z.number().min(0).max(40).default(0),
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
    largura: z.number().default(A4.width),
    altura: z.number().default(A4.height),
    margem: z.object({
      topo: z.number().default(48),
      direita: z.number().default(48),
      baixo: z.number().default(48),
      esquerda: z.number().default(48),
    }),
  }),
  bandas: z.array(bandaSchema),
});
export type DocSchema = z.infer<typeof docSchemaZ>;

export function novoId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function docVazio(): DocSchema {
  return {
    versao: 1,
    pagina: {
      largura: A4.width,
      altura: A4.height,
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
    case "linha":
      return { ...base, h: 2, estilo: { ...base.estilo, bg: "#1C2D58" } };
    case "retangulo":
      return { ...base, w: 160, h: 60, estilo: { ...base.estilo, borderW: 1 } };
    case "imagem":
      return { ...base, w: 140, h: 60, texto: "/MARCA/logo_completa_light.svg" };
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
