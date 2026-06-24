/**
 * Orquestra cálculos, snapshots e montagem de memória de cálculo.
 * Sem dependências de Next/HTTP — reutilizável por actions, jobs e rotas de export.
 */

import { converter, entradaSchema as unitConvertSchema, UNIDADES, type Dimensao } from "./calc/unit-convert";
import {
  calcular as calcularSecao,
  entradaSchema as secaoSchema,
  type EntradaSecao,
} from "./calc/section-properties";
import {
  calcular as calcularViga,
  entradaSchema as vigaSchema,
  type EntradaFlexao,
} from "./calc/concrete-beam-flexure";
import { getFerramenta } from "./registry";
import { montarMemoriaBase, fmtNum, type MemoriaDoc } from "./memoria";
import type { ResultadoBase, SnapshotCalculo } from "./types";

/** Calcula o resultado para a ferramenta informada e retorna ResultadoBase (painel). */
export function calcular(ferramenta: string, entradas: Record<string, unknown>): ResultadoBase {
  switch (ferramenta) {
    case "U01": {
      const r = converter(unitConvertSchema.parse(entradas));
      return { campos: { valor: r.valor, de: r.de, para: r.para, fator: r.fator } };
    }
    case "U02": {
      const r = calcularSecao(secaoSchema.parse(entradas));
      return {
        campos: {
          A: fmtNum(r.A, 2),
          Ix: fmtNum(r.Ix, 1),
          Iy: fmtNum(r.Iy, 1),
          Wx_sup: fmtNum(r.Wx_sup, 1),
          Wx_inf: fmtNum(r.Wx_inf, 1),
          ix: fmtNum(r.ix, 3),
          iy: fmtNum(r.iy, 3),
        },
      };
    }
    case "E01": {
      const r = calcularViga(vigaSchema.parse(entradas));
      return {
        campos: {
          As: fmtNum(r.As, 2),
          "As'": fmtNum(r.AsLinha, 2),
          "x/d": fmtNum(r.xd, 3),
          dominio: r.dominio,
          As_min: fmtNum(r.AsMin, 2),
          situacao: r.situacao,
        },
        alertas: r.alertas,
      };
    }
    default:
      throw new Error(`Ferramenta desconhecida: "${ferramenta}"`);
  }
}

/** Monta o snapshot pronto para persistir em CalculoFerramenta. */
export function snapshotParaSalvar(
  ferramenta: string,
  titulo: string,
  norma: string | undefined,
  versaoCalc: number,
  entradas: Record<string, unknown>,
  resultado: ResultadoBase,
): SnapshotCalculo {
  return {
    ferramenta,
    titulo,
    norma,
    versaoCalc,
    entradasJson: entradas,
    resultadoJson: resultado,
  };
}

type MemoriaOpts = { titulo: string; autor?: string; projeto?: string; geradoEm?: string };

/**
 * Monta a memória de cálculo (MemoriaDoc) re-rodando o engine a partir das entradas.
 * É a fonte única dos renderers PDF/Word/Excel.
 */
export function montarMemoria(
  ferramenta: string,
  entradas: Record<string, unknown>,
  opts: MemoriaOpts,
): MemoriaDoc {
  const meta = getFerramenta(ferramenta);
  const base = {
    ferramenta,
    titulo: opts.titulo,
    subtitulo: meta?.nome,
    norma: meta?.norma,
    autor: opts.autor,
    projeto: opts.projeto,
    geradoEm: opts.geradoEm,
  };

  switch (ferramenta) {
    case "U01":
      return memoriaU01(entradas, base);
    case "U02":
      return memoriaU02(entradas, base);
    case "E01":
      return memoriaE01(entradas, base);
    default:
      throw new Error(`Ferramenta sem memória: "${ferramenta}"`);
  }
}

type BaseArgs = Omit<Parameters<typeof montarMemoriaBase>[0], "secoes">;

function labelUnidade(dimensao: Dimensao, chave: string): string {
  return UNIDADES[dimensao]?.[chave]?.label ?? chave;
}

function memoriaU01(entradas: Record<string, unknown>, base: BaseArgs): MemoriaDoc {
  const e = unitConvertSchema.parse(entradas);
  const r = converter(e);
  const uDe = labelUnidade(e.dimensao, e.de);
  const uPara = labelUnidade(e.dimensao, e.para);
  return montarMemoriaBase({
    ...base,
    secoes: [
      {
        titulo: "Conversão",
        valores: [
          { descricao: "Grandeza", valor: e.dimensao },
          { descricao: "Valor de entrada", valor: fmtNum(e.valor, 6), unidade: uDe },
          { descricao: "Fator de conversão", simbolo: "k", valor: fmtNum(r.fator, 8), formula: `1 ${uDe} = k ${uPara}` },
          { descricao: "Resultado", valor: fmtNum(r.valor, 6), unidade: uPara, formula: `${fmtNum(e.valor, 6)} × ${fmtNum(r.fator, 8)}` },
        ],
      },
    ],
  });
}

function descricaoSecao(e: EntradaSecao): { colunas: string[]; linhas: (string | number)[][] } {
  switch (e.tipo) {
    case "retangular":
      return { colunas: ["Tipo", "b (cm)", "h (cm)"], linhas: [["Retangular", e.b, e.h]] };
    case "circular":
      return { colunas: ["Tipo", "d (cm)"], linhas: [["Circular", e.d]] };
    case "T":
      return {
        colunas: ["Tipo", "bf (cm)", "hf (cm)", "bw (cm)", "hw (cm)"],
        linhas: [["T", e.bf, e.hf, e.bw, e.hw]],
      };
    case "poligonal":
      return {
        colunas: ["Vértice", "x (cm)", "y (cm)"],
        linhas: e.pontos.map((p, i) => [i + 1, p.x, p.y]),
      };
  }
}

function memoriaU02(entradas: Record<string, unknown>, base: BaseArgs): MemoriaDoc {
  const e = secaoSchema.parse(entradas);
  const r = calcularSecao(e);
  const desc = descricaoSecao(e);

  return montarMemoriaBase({
    ...base,
    secoes: [
      {
        titulo: "Dados de entrada",
        tabelas: [{ titulo: "Geometria da seção", colunas: desc.colunas, linhas: desc.linhas }],
      },
      {
        titulo: "Propriedades geométricas",
        valores: [
          { simbolo: "A", descricao: "Área", valor: fmtNum(r.A, 2), unidade: "cm²" },
          { simbolo: "y_cg", descricao: "Centroide (y)", valor: fmtNum(r.centroide.y, 3), unidade: "cm" },
          { simbolo: "I_x", descricao: "Momento de inércia (x)", valor: fmtNum(r.Ix, 1), unidade: "cm⁴" },
          { simbolo: "I_y", descricao: "Momento de inércia (y)", valor: fmtNum(r.Iy, 1), unidade: "cm⁴" },
          { simbolo: "W_x,sup", descricao: "Módulo resistente (fibra superior)", valor: fmtNum(r.Wx_sup, 1), unidade: "cm³", formula: "I_x / y_sup" },
          { simbolo: "W_x,inf", descricao: "Módulo resistente (fibra inferior)", valor: fmtNum(r.Wx_inf, 1), unidade: "cm³", formula: "I_x / y_inf" },
          { simbolo: "i_x", descricao: "Raio de giração (x)", valor: fmtNum(r.ix, 3), unidade: "cm", formula: "√(I_x / A)" },
          { simbolo: "i_y", descricao: "Raio de giração (y)", valor: fmtNum(r.iy, 3), unidade: "cm", formula: "√(I_y / A)" },
        ],
        notas: [
          `Fibras extremas em relação ao centroide: superior = ${fmtNum(r.fibras.ySup, 3)} cm; inferior = ${fmtNum(r.fibras.yInf, 3)} cm.`,
        ],
      },
    ],
  });
}

function descricaoViga(e: EntradaFlexao): { colunas: string[]; linhas: (string | number)[][] } {
  const sec =
    e.secao.forma === "retangular"
      ? [["Seção", "Retangular"], ["b (cm)", e.secao.b], ["h (cm)", e.secao.h]]
      : [["Seção", "T"], ["bf (cm)", e.secao.bf], ["hf (cm)", e.secao.hf], ["bw (cm)", e.secao.bw], ["h (cm)", e.secao.h]];
  const linhas: (string | number)[][] = [
    ...sec,
    ["d (cm)", e.d],
    ["fck (MPa)", e.fck],
    ["Aço", e.aco],
    ["Mk (kN·m)", e.Mk],
    ["γf", e.gamaF],
  ];
  return { colunas: ["Parâmetro", "Valor"], linhas };
}

function memoriaE01(entradas: Record<string, unknown>, base: BaseArgs): MemoriaDoc {
  const e = vigaSchema.parse(entradas);
  const r = calcularViga(e);
  const desc = descricaoViga(e);

  return montarMemoriaBase({
    ...base,
    secoes: [
      {
        titulo: "Dados de entrada",
        tabelas: [{ titulo: "Geometria e materiais", colunas: desc.colunas, linhas: desc.linhas }],
      },
      {
        titulo: "Parâmetros de cálculo (NBR 6118:2023)",
        valores: [
          { simbolo: "λ", descricao: "Coeficiente do bloco retangular", valor: fmtNum(r.params.lambda, 3) },
          { simbolo: "αc", descricao: "Coeficiente de redução do concreto", valor: fmtNum(r.params.alphaC, 4) },
          { simbolo: "fcd", descricao: "Resistência de cálculo do concreto", valor: fmtNum(r.params.fcd * 10, 2), unidade: "MPa", formula: "fck / γc" },
          { simbolo: "fyd", descricao: "Resistência de cálculo do aço", valor: fmtNum(r.params.fyd * 10, 1), unidade: "MPa", formula: "fyk / γs" },
          { simbolo: "Md", descricao: "Momento de cálculo", valor: fmtNum(r.md / 100, 2), unidade: "kN·m", formula: "γf · Mk" },
          { simbolo: "(x/d)lim", descricao: "Limite de ductilidade", valor: fmtNum(r.xLimRatio, 2) },
        ],
      },
      {
        titulo: "Dimensionamento à flexão (ELU)",
        valores: [
          { simbolo: "x", descricao: "Profundidade da linha neutra", valor: fmtNum(r.x, 2), unidade: "cm" },
          { simbolo: "x/d", descricao: "Posição relativa da LN", valor: fmtNum(r.xd, 3) },
          { simbolo: "Domínio", descricao: "Domínio de deformação", valor: r.dominio },
          { simbolo: "As", descricao: "Armadura de tração", valor: fmtNum(r.As, 2), unidade: "cm²" },
          { simbolo: "As'", descricao: "Armadura de compressão", valor: fmtNum(r.AsLinha, 2), unidade: "cm²" },
          { simbolo: "As,mín", descricao: "Armadura mínima", valor: fmtNum(r.AsMin, 2), unidade: "cm²" },
          { simbolo: "As,máx", descricao: "Armadura máxima (4% Ac)", valor: fmtNum(r.AsMax, 2), unidade: "cm²" },
        ],
        notas: r.alertas.length > 0 ? r.alertas : ["Verificação de flexão simples atendida."],
      },
    ],
  });
}
