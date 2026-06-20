/**
 * Carimbos (selos de prancha) padrão por formato ABNT.
 *
 * Gera um DocSchema com uma prancha em PAISAGEM no formato escolhido,
 * margens ABNT NBR 10068 (esquerda 25 mm p/ encadernação, demais 10 mm)
 * e um CARIMBO/SELO no canto inferior direito da área útil.
 *
 * Módulo PURO (sem "use server", sem Prisma): só monta o schema.
 */

import {
  dimensoesPx,
  margemAbntPx,
  novoElemento,
  novoId,
  type DocSchema,
  type Elemento,
  type Estilo,
  type TipoElemento,
} from "./schema";

/** Formatos suportados pelo gerador de carimbos. */
export type FormatoCarimbo = "A4" | "A3" | "A2" | "A1" | "A0";

/** Lista (na ordem de exibição) dos formatos suportados, com rótulo. */
export const FORMATOS_CARIMBO: { formato: FormatoCarimbo; label: string }[] = [
  { formato: "A4", label: "A4 (297 × 210 mm)" },
  { formato: "A3", label: "A3 (420 × 297 mm)" },
  { formato: "A2", label: "A2 (594 × 420 mm)" },
  { formato: "A1", label: "A1 (841 × 594 mm)" },
  { formato: "A0", label: "A0 (1189 × 841 mm)" },
];

/**
 * Escala visual do carimbo por formato. Quanto maior a folha, maior o selo
 * e a tipografia. Largura/altura do selo em px; fatores de fonte em px.
 */
const ESCALA: Record<
  FormatoCarimbo,
  { largura: number; altura: number; fsTitulo: number; fsRotulo: number; fsCampo: number }
> = {
  A4: { largura: 470, altura: 150, fsTitulo: 12, fsRotulo: 6.5, fsCampo: 9 },
  A3: { largura: 560, altura: 175, fsTitulo: 14, fsRotulo: 7, fsCampo: 10 },
  A2: { largura: 660, altura: 205, fsTitulo: 17, fsRotulo: 8, fsCampo: 12 },
  A1: { largura: 780, altura: 240, fsTitulo: 21, fsRotulo: 9.5, fsCampo: 14 },
  A0: { largura: 920, altura: 285, fsTitulo: 26, fsRotulo: 11, fsCampo: 17 },
};

const COR_TRACO = "#1C2D58";
const COR_ROTULO = "#64748b";

/** Cria um Estilo a partir do default + overrides. */
function estilo(over: Partial<Estilo>): Estilo {
  return { ...novoElemento("label").estilo, ...over };
}

/** Helper p/ montar um elemento posicionado com estilo pronto. */
function el(
  tipo: TipoElemento,
  x: number,
  y: number,
  w: number,
  h: number,
  texto: string,
  est: Partial<Estilo> = {},
): Elemento {
  return {
    id: novoId(),
    tipo,
    x: Math.round(x),
    y: Math.round(y),
    w: Math.max(4, Math.round(w)),
    h: Math.max(4, Math.round(h)),
    texto,
    estilo: estilo(est),
    visivel: true,
    travado: false,
  };
}

/**
 * Monta uma célula do carimbo: moldura (retângulo), rótulo pequeno no topo
 * e o valor (label/campo) embaixo. Retorna a lista de elementos da célula.
 */
function celula(
  bx: number,
  by: number,
  bw: number,
  bh: number,
  rotulo: string,
  valor: string,
  opts: { tipoValor?: "label" | "campo"; fsRotulo: number; fsCampo: number; alignValor?: "left" | "center" | "right"; boldValor?: boolean },
): Elemento[] {
  const pad = 5;
  const out: Elemento[] = [
    // Moldura da célula
    el("retangulo", bx, by, bw, bh, "", { borderW: 0.75, borderColor: COR_TRACO }),
  ];
  if (rotulo) {
    out.push(
      el("label", bx + pad, by + 3, bw - pad * 2, opts.fsRotulo + 4, rotulo, {
        fontSize: opts.fsRotulo,
        color: COR_ROTULO,
        bold: false,
        align: "left",
      }),
    );
  }
  out.push(
    el(
      opts.tipoValor === "campo" ? "campo" : "label",
      bx + pad,
      by + (rotulo ? opts.fsRotulo + 6 : Math.max(4, (bh - opts.fsCampo) / 2)),
      bw - pad * 2,
      Math.max(opts.fsCampo + 4, bh - (rotulo ? opts.fsRotulo + 10 : 8)),
      valor,
      {
        fontSize: opts.fsCampo,
        color: COR_TRACO,
        bold: opts.boldValor ?? false,
        align: opts.alignValor ?? "left",
      },
    ),
  );
  return out;
}

/**
 * Gera o carimbo padrão no `formato` escolhido (sempre PAISAGEM).
 *
 * Estrutura do selo (canto inferior direito), em 4 linhas:
 *  - Linha 1 (faixa-título): logo/empresa | Título do projeto
 *  - Linha 2: Cliente | Endereço
 *  - Linha 3: Código | Escala | Data | Prancha nº
 *  - Linha 4: Revisão | Responsável técnico
 *
 * Todas as posições ficam DENTRO da área útil (margens ABNT respeitadas).
 */
export function carimboPadrao(formato: FormatoCarimbo): DocSchema {
  const dim = dimensoesPx(formato, "paisagem");
  const margem = margemAbntPx();
  const esc = ESCALA[formato];

  // Área útil (origem = top-left do conteúdo da banda, após margens).
  const larguraUtil = dim.largura - margem.esquerda - margem.direita;
  const alturaUtil = dim.altura - margem.topo - margem.baixo;

  // Selo ancorado no canto inferior direito da área útil.
  const selW = Math.min(esc.largura, larguraUtil);
  const selH = Math.min(esc.altura, alturaUtil);
  const ox = larguraUtil - selW; // origem x do selo
  const oy = alturaUtil - selH; // origem y do selo

  // Distribuição vertical em 4 linhas (faixa-título mais alta).
  const hTitulo = Math.round(selH * 0.3);
  const hLinha = Math.round((selH - hTitulo) / 3);
  const y0 = oy;
  const y1 = oy + hTitulo;
  const y2 = y1 + hLinha;
  const y3 = y2 + hLinha;
  const hUltima = selH - (y3 - oy); // absorve arredondamento

  const elementos: Elemento[] = [];

  // Moldura externa do selo (traço mais grosso).
  elementos.push(el("retangulo", ox, oy, selW, selH, "", { borderW: 1.5, borderColor: COR_TRACO }));

  // ---- Linha 1: faixa-título (logo | título) ----
  const logoW = Math.round(selW * 0.32);
  elementos.push(el("retangulo", ox, y0, logoW, hTitulo, "", { borderW: 0.75, borderColor: COR_TRACO }));
  // Logo (imagem) dentro da célula da empresa.
  elementos.push(
    el("imagem", ox + 6, y0 + 6, logoW - 12, hTitulo - 24, "/MARCA/logo_completa_light.svg"),
  );
  // Separador (linha) acima do nome da empresa.
  elementos.push(
    el("linha", ox + 8, y0 + hTitulo - 18, logoW - 16, 2, "", { borderW: 0.75, borderColor: COR_TRACO }),
  );
  // Nome da empresa abaixo do logo (texto fixo).
  elementos.push(
    el("label", ox + 6, y0 + hTitulo - 16, logoW - 12, 14, "SENA PROJETOS", {
      fontSize: esc.fsRotulo + 1,
      color: COR_ROTULO,
      bold: true,
      align: "center",
    }),
  );
  // Título do projeto (faixa à direita do logo).
  elementos.push(el("retangulo", ox + logoW, y0, selW - logoW, hTitulo, "", { borderW: 0.75, borderColor: COR_TRACO }));
  elementos.push(
    el("label", ox + logoW + 8, y0 + 5, selW - logoW - 16, 12, "TÍTULO DO PROJETO", {
      fontSize: esc.fsRotulo,
      color: COR_ROTULO,
      align: "left",
    }),
  );
  elementos.push(
    el("campo", ox + logoW + 8, y0 + esc.fsRotulo + 8, selW - logoW - 16, hTitulo - esc.fsRotulo - 14, "[Nome]", {
      fontSize: esc.fsTitulo,
      color: COR_TRACO,
      bold: true,
      align: "left",
    }),
  );

  // ---- Linha 2: Cliente | Endereço ----
  const wCliente = Math.round(selW * 0.4);
  elementos.push(
    ...celula(ox, y1, wCliente, hLinha, "CLIENTE", "[ClienteNome]", {
      tipoValor: "campo",
      fsRotulo: esc.fsRotulo,
      fsCampo: esc.fsCampo,
    }),
  );
  elementos.push(
    ...celula(ox + wCliente, y1, selW - wCliente, hLinha, "ENDEREÇO", "[Endereco]", {
      tipoValor: "campo",
      fsRotulo: esc.fsRotulo,
      fsCampo: esc.fsCampo,
    }),
  );

  // ---- Linha 3: Código | Escala | Data | Prancha nº ----
  const wCol3 = Math.round(selW / 4);
  const cols3 = [
    { rotulo: "CÓDIGO", valor: "[Codigo]", tipo: "campo" as const },
    { rotulo: "ESCALA", valor: "INDICADA", tipo: "label" as const },
    { rotulo: "DATA", valor: "[Hoje]", tipo: "campo" as const },
    { rotulo: "PRANCHA Nº", valor: "01/01", tipo: "label" as const },
  ];
  cols3.forEach((c, i) => {
    const cw = i === cols3.length - 1 ? selW - wCol3 * (cols3.length - 1) : wCol3;
    elementos.push(
      ...celula(ox + wCol3 * i, y2, cw, hLinha, c.rotulo, c.valor, {
        tipoValor: c.tipo,
        fsRotulo: esc.fsRotulo,
        fsCampo: esc.fsCampo,
      }),
    );
  });

  // ---- Linha 4: Revisão | Responsável técnico ----
  const wRev = Math.round(selW * 0.28);
  elementos.push(
    ...celula(ox, y3, wRev, hUltima, "REVISÃO", "00", {
      tipoValor: "label",
      fsRotulo: esc.fsRotulo,
      fsCampo: esc.fsCampo,
      alignValor: "center",
      boldValor: true,
    }),
  );
  elementos.push(
    ...celula(ox + wRev, y3, selW - wRev, hUltima, "RESPONSÁVEL TÉCNICO", "[Nome] — CREA/CAU nº", {
      tipoValor: "label",
      fsRotulo: esc.fsRotulo,
      fsCampo: esc.fsCampo,
    }),
  );

  return {
    versao: 1,
    pagina: {
      formato,
      orientacao: "paisagem",
      largura: dim.largura,
      altura: dim.altura,
      margem,
    },
    bandas: [
      {
        id: novoId(),
        tipo: "cabecalho",
        altura: alturaUtil,
        elementos,
      },
    ],
  };
}
