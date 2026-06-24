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
import { calcularCisalhamento } from "./calc/concrete-beam-shear";
import { calcularFlecha } from "./calc/concrete-beam-deflection";
import { selecionarBarras } from "./calc/bitolas";
import { calcular as calcularAncoragem, entradaSchema as ancoragemSchema } from "./calc/rebar-anchorage";
import { calcular as calcularResumoAco, entradaSchema as resumoAcoSchema } from "./calc/steel-summary";
import { calcular as calcularEstaca, entradaSchema as estacaSchema, SOLOS as SOLOS_ESTACA, ESTACAS } from "./calc/pile-spt";
import { getFerramenta } from "./registry";

/** Largura da alma (bw) usada no cisalhamento: b (retangular) ou bw (T). */
function larguraAlma(secao: EntradaFlexao["secao"]): number {
  return secao.forma === "retangular" ? secao.b : secao.bw;
}

/** Flecha do E01 (quando vão e momento de serviço informados). Usa As efetiva (barras ø16). */
function flechaE01(e: EntradaFlexao, As: number, AsLinha: number) {
  if (e.vao == null || e.mServ == null) return null;
  const asEf = selecionarBarras(As, 16).asEf;
  const asLinhaEf = AsLinha > 0 ? selecionarBarras(AsLinha, 16).asEf : 0;
  return calcularFlecha({
    secao: e.secao,
    d: e.d,
    dLinha: e.dLinha,
    fck: e.fck,
    As: asEf,
    AsLinha: asLinhaEf,
    vao: e.vao * 100, // m → cm
    mServ: e.mServ,
  });
}
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
      const e = vigaSchema.parse(entradas);
      const r = calcularViga(e);
      const campos: Record<string, string | number> = {
        As: fmtNum(r.As, 2),
        "As'": fmtNum(r.AsLinha, 2),
        "x/d": fmtNum(r.xd, 3),
        dominio: r.dominio,
        As_min: fmtNum(r.AsMin, 2),
        situacao: r.situacao,
      };
      const alertas = [...r.alertas];
      if (e.Vk != null) {
        const c = calcularCisalhamento({ bw: larguraAlma(e.secao), d: e.d, fck: e.fck, Vk: e.Vk, gamaF: e.gamaF });
        campos["Asw/s"] = fmtNum(c.aswSadotar, 2);
        campos["s_max"] = fmtNum(c.sMax, 1);
        alertas.push(...c.alertas);
      }
      const f = flechaE01(e, r.As, r.AsLinha);
      if (f) {
        campos["flecha"] = fmtNum(f.flechaTotal, 2);
        campos["L/250"] = fmtNum(f.limite, 2);
        alertas.push(...f.alertas);
      }
      return { campos, alertas };
    }
    case "E10": {
      const r = calcularAncoragem(ancoragemSchema.parse(entradas));
      return {
        campos: {
          fbd: fmtNum(r.fbd, 3),
          lb: fmtNum(r.lb, 1),
          "lb,nec": fmtNum(r.lbNec, 1),
          "lb,mín": fmtNum(r.lbMin, 1),
          l0t: fmtNum(r.l0t, 1),
        },
      };
    }
    case "E11": {
      const r = calcularResumoAco(resumoAcoSchema.parse(entradas));
      return {
        campos: {
          peso_total: fmtNum(r.pesoTotalKg, 1),
          com_perda: fmtNum(r.pesoComPerdaKg, 1),
          bitolas: r.porBitola.length,
        },
      };
    }
    case "E23": {
      const r = calcularEstaca(estacaSchema.parse(entradas));
      return {
        campos: {
          "Radm (Aoki)": fmtNum(r.aoki.radm, 0),
          "Radm (Décourt)": fmtNum(r.decourt.radm, 0),
          L: fmtNum(r.comprimento, 1),
        },
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
    case "E10":
      return memoriaE10(entradas, base);
    case "E11":
      return memoriaE11(entradas, base);
    case "E23":
      return memoriaE23(entradas, base);
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
  if (e.Vk != null) linhas.push(["Vk (kN)", e.Vk]);
  if (e.vao != null) linhas.push(["Vão (m)", e.vao]);
  if (e.mServ != null) linhas.push(["M serviço (kN·m)", e.mServ]);
  return { colunas: ["Parâmetro", "Valor"], linhas };
}

function memoriaE01(entradas: Record<string, unknown>, base: BaseArgs): MemoriaDoc {
  const e = vigaSchema.parse(entradas);
  const r = calcularViga(e);
  const desc = descricaoViga(e);

  const secoes: MemoriaDoc["secoes"] = [
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
  ];

  // Seção de cisalhamento (quando Vk informado).
  if (e.Vk != null) {
    const c = calcularCisalhamento({ bw: larguraAlma(e.secao), d: e.d, fck: e.fck, Vk: e.Vk, gamaF: e.gamaF });
    secoes.push({
      titulo: "Cisalhamento (NBR 6118, Modelo I)",
      valores: [
        { simbolo: "VSd", descricao: "Cortante de cálculo", valor: fmtNum(c.vsd, 1), unidade: "kN", formula: "γf · Vk" },
        { simbolo: "VRd2", descricao: "Resistência da biela comprimida", valor: fmtNum(c.vRd2, 1), unidade: "kN" },
        { simbolo: "Vc", descricao: "Parcela do concreto", valor: fmtNum(c.vc, 1), unidade: "kN" },
        { simbolo: "Vsw", descricao: "Parcela dos estribos", valor: fmtNum(c.vsw, 1), unidade: "kN", formula: "VSd − Vc" },
        { simbolo: "Asw/s", descricao: "Armadura transversal", valor: fmtNum(c.aswSadotar, 2), unidade: "cm²/m" },
        { simbolo: "Asw/s,mín", descricao: "Armadura transversal mínima", valor: fmtNum(c.aswSmin, 2), unidade: "cm²/m" },
        { simbolo: "s,máx", descricao: "Espaçamento longitudinal máximo", valor: fmtNum(c.sMax, 1), unidade: "cm" },
      ],
      notas: c.alertas.length > 0 ? c.alertas : ["Verificação ao cisalhamento atendida."],
    });
  }

  // Seção de flecha (quando vão e momento de serviço informados).
  const f = flechaE01(e, r.As, r.AsLinha);
  if (f) {
    secoes.push({
      titulo: "Flecha (ELS — inércia de Branson)",
      paragrafos: ["Hipótese: viga biapoiada com carga uniformemente distribuída."],
      valores: [
        { simbolo: "Ecs", descricao: "Módulo de elasticidade secante", valor: fmtNum(f.ecs, 0), unidade: "MPa" },
        { simbolo: "Mr", descricao: "Momento de fissuração", valor: fmtNum(f.mr, 2), unidade: "kN·m" },
        { simbolo: "Ma", descricao: "Momento de serviço (quase permanente)", valor: fmtNum(f.ma, 2), unidade: "kN·m" },
        { simbolo: "I_eq", descricao: "Inércia equivalente (Branson)", valor: fmtNum(f.ieq, 0), unidade: "cm⁴" },
        { simbolo: "δ_i", descricao: "Flecha imediata", valor: fmtNum(f.flechaImediata, 3), unidade: "cm" },
        { simbolo: "αf", descricao: "Fator de fluência", valor: fmtNum(f.alphaF, 3) },
        { simbolo: "δ_∞", descricao: "Flecha total (diferida)", valor: fmtNum(f.flechaTotal, 3), unidade: "cm", formula: "δ_i·(1+αf)" },
        { simbolo: "δ_lim", descricao: "Limite L/250", valor: fmtNum(f.limite, 3), unidade: "cm" },
      ],
      notas: f.alertas.length > 0 ? f.alertas : ["Flecha dentro do limite L/250."],
    });
  }

  return montarMemoriaBase({ ...base, secoes });
}

function memoriaE10(entradas: Record<string, unknown>, base: BaseArgs): MemoriaDoc {
  const e = ancoragemSchema.parse(entradas);
  const r = calcularAncoragem(e);
  return montarMemoriaBase({
    ...base,
    secoes: [
      {
        titulo: "Dados de entrada",
        tabelas: [
          {
            colunas: ["Parâmetro", "Valor"],
            linhas: [
              ["Bitola (mm)", e.phiMm],
              ["Aço", e.aco],
              ["fck (MPa)", e.fck],
              ["Aderência", e.aderencia === "boa" ? "Boa" : "Má"],
              ["Gancho", e.gancho ? "Sim" : "Não"],
              ["As,calc/As,ef", e.razaoAs],
              ["% emendadas", e.pctEmendadas],
            ],
          },
        ],
      },
      {
        titulo: "Ancoragem (NBR 6118, 9.4)",
        valores: [
          { simbolo: "fbd", descricao: "Tensão de aderência de cálculo", valor: fmtNum(r.fbd, 3), unidade: "MPa", formula: "η1·η2·η3·fctd" },
          { simbolo: "lb", descricao: "Comprimento de ancoragem básico", valor: fmtNum(r.lb, 1), unidade: "cm", formula: "(φ/4)·(fyd/fbd)" },
          { simbolo: "lb,nec", descricao: "Comprimento de ancoragem necessário", valor: fmtNum(r.lbNec, 1), unidade: "cm" },
          { simbolo: "lb,mín", descricao: "Comprimento mínimo", valor: fmtNum(r.lbMin, 1), unidade: "cm" },
        ],
      },
      {
        titulo: "Traspasse (NBR 6118, 9.5)",
        valores: [
          { simbolo: "α0t", descricao: "Coeficiente de traspasse", valor: fmtNum(r.alpha0t, 2) },
          { simbolo: "l0t", descricao: "Comprimento de traspasse", valor: fmtNum(r.l0t, 1), unidade: "cm" },
          { simbolo: "l0t,mín", descricao: "Traspasse mínimo", valor: fmtNum(r.l0tMin, 1), unidade: "cm" },
        ],
      },
    ],
  });
}

function memoriaE11(entradas: Record<string, unknown>, base: BaseArgs): MemoriaDoc {
  const e = resumoAcoSchema.parse(entradas);
  const r = calcularResumoAco(e);
  return montarMemoriaBase({
    ...base,
    secoes: [
      {
        titulo: "Resumo de aço por bitola (NBR 7480)",
        tabelas: [
          {
            colunas: ["Bitola (mm)", "Qtde", "Comp. total (m)", "Peso (kg)"],
            linhas: r.porBitola.map((l) => [l.bitolaMm, l.quantidade, fmtNum(l.comprimentoTotalM, 2), fmtNum(l.pesoKg, 2)]),
          },
        ],
        valores: [
          { simbolo: "Peso total", descricao: "Peso de aço (sem perda)", valor: fmtNum(r.pesoTotalKg, 2), unidade: "kg" },
          { simbolo: "Perda", descricao: "Acréscimo de perda/ponta", valor: fmtNum(r.perdaPct, 0), unidade: "%" },
          { simbolo: "Peso c/ perda", descricao: "Peso total considerando perda", valor: fmtNum(r.pesoComPerdaKg, 2), unidade: "kg" },
        ],
      },
    ],
  });
}

function memoriaE23(entradas: Record<string, unknown>, base: BaseArgs): MemoriaDoc {
  const e = estacaSchema.parse(entradas);
  const r = calcularEstaca(e);
  return montarMemoriaBase({
    ...base,
    secoes: [
      {
        titulo: "Dados de entrada",
        tabelas: [
          { colunas: ["Estaca", "Diâmetro (cm)"], linhas: [[ESTACAS[e.estaca].label, e.diametroCm]] },
          {
            titulo: "Perfil de sondagem (SPT)",
            colunas: ["Camada", "Solo", "NSPT", "Espessura (m)"],
            linhas: e.camadas.map((c, i) => [i + 1, SOLOS_ESTACA[c.solo].label, c.nspt, c.espessuraM]),
          },
        ],
      },
      {
        titulo: "Aoki-Velloso (1975)",
        valores: [
          { simbolo: "Rp", descricao: "Resistência de ponta", valor: fmtNum(r.aoki.rp, 1), unidade: "kN" },
          { simbolo: "Rl", descricao: "Resistência por atrito lateral", valor: fmtNum(r.aoki.rl, 1), unidade: "kN" },
          { simbolo: "Rult", descricao: "Carga última", valor: fmtNum(r.aoki.rult, 1), unidade: "kN" },
          { simbolo: "Radm", descricao: "Carga admissível (FS=2)", valor: fmtNum(r.aoki.radm, 1), unidade: "kN" },
        ],
      },
      {
        titulo: "Décourt-Quaresma",
        valores: [
          { simbolo: "Rp", descricao: "Resistência de ponta", valor: fmtNum(r.decourt.rp, 1), unidade: "kN" },
          { simbolo: "Rl", descricao: "Resistência por atrito lateral", valor: fmtNum(r.decourt.rl, 1), unidade: "kN" },
          { simbolo: "Radm", descricao: "Carga admissível (Rp/4 + Rl/1,3)", valor: fmtNum(r.decourt.radm, 1), unidade: "kN" },
        ],
        notas: ["Coeficientes empíricos — conferir contra o relatório de sondagem e a prática local."],
      },
    ],
  });
}
