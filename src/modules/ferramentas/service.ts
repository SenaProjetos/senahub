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
import { calcular as calcularDescida, entradaSchema as descidaSchema } from "./calc/load-descent";
import { calcular as calcularVento, entradaSchema as ventoSchema, GRUPOS_S3, CATEGORIAS, CLASSES } from "./calc/wind-force";
import { calcular as calcularCombos, entradaSchema as combosSchema, TIPOS_VARIAVEL } from "./calc/action-combos";
import { calcular as calcularPilar, entradaSchema as pilarSchema } from "./calc/concrete-column";
import { calcular as calcularLaje, entradaSchema as lajeSchema, CASOS as CASOS_LAJE } from "./calc/slab-bares";
import { calcular as calcularEscada, entradaSchema as escadaSchema, VINCULACOES } from "./calc/stair";
import { calcular as calcularPuncao, entradaSchema as puncaoSchema, POSICOES } from "./calc/punching";
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
    case "E12": {
      const r = calcularDescida(descidaSchema.parse(entradas));
      return {
        campos: {
          "N base": fmtNum(r.nTotal, 1),
          Permanente: fmtNum(r.ngTotal, 1),
          Acidental: fmtNum(r.nqReduzido, 1),
          pavimentos: r.niveis.length,
        },
      };
    }
    case "E13": {
      const r = calcularVento(ventoSchema.parse(entradas));
      const campos: Record<string, string | number> = {
        Vk: fmtNum(r.vk, 1),
        q: fmtNum(r.qkN, 3),
        S2: fmtNum(r.s2, 3),
      };
      if (r.forca) campos["F arrasto"] = fmtNum(r.forca.f, 1);
      return { campos };
    }
    case "E14": {
      const r = calcularCombos(combosSchema.parse(entradas));
      return {
        campos: {
          "Fd,ELU normal": fmtNum(r.elu.normal.governante.fd, 1),
          "Fd,ELS rara": fmtNum(r.els.rara.governante.fd, 1),
          "Fd,ELS q.perm.": fmtNum(r.els.quasePermanente.fd, 1),
        },
      };
    }
    case "E04": {
      const r = calcularPilar(pilarSchema.parse(entradas));
      return {
        campos: {
          As: fmtNum(r.As, 2),
          "taxa (%)": fmtNum(r.taxaGeom, 2),
          arranjo: `${r.nBarras}ø${r.phi}`,
          interação: fmtNum(r.interacao, 2),
          situação: r.situacao,
        },
        alertas: r.alertas,
      };
    }
    case "E05": {
      const r = calcularLaje(lajeSchema.parse(entradas));
      const campos: Record<string, string | number> = { λ: fmtNum(r.lambda, 2) };
      for (const m of r.momentos) campos[`As ${m.simbolo}`] = fmtNum(m.as, 2);
      campos["flecha"] = fmtNum(r.flechaTotal, 2);
      campos["L/250"] = fmtNum(r.flechaLimite, 2);
      return { campos, alertas: r.alertas };
    }
    case "E08": {
      const r = calcularEscada(escadaSchema.parse(entradas));
      return {
        campos: {
          "M vão": fmtNum(r.mVaoMax, 2),
          "M apoio": fmtNum(r.mApoioMax, 2),
          "As vão": fmtNum(r.asVao, 2),
          "As apoio": fmtNum(r.asApoio, 2),
          flecha: fmtNum(r.flechaTotal, 2),
        },
        alertas: r.alertas,
      };
    }
    case "E07": {
      const r = calcularPuncao(puncaoSchema.parse(entradas));
      const campos: Record<string, string | number> = {
        β: fmtNum(r.beta, 3),
        "τSd,C": fmtNum(r.tauSd0, 2),
        "τRd2": fmtNum(r.tauRd2, 2),
        "τSd,C'": fmtNum(r.tauSd1, 2),
        "τRd1": fmtNum(r.tauRd1, 2),
        situação: r.situacao,
      };
      if (r.precisaArmadura) campos["Asw/perím."] = fmtNum(r.asw, 2);
      return { campos, alertas: r.alertas };
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
    case "E12":
      return memoriaE12(entradas, base);
    case "E13":
      return memoriaE13(entradas, base);
    case "E14":
      return memoriaE14(entradas, base);
    case "E04":
      return memoriaE04(entradas, base);
    case "E05":
      return memoriaE05(entradas, base);
    case "E08":
      return memoriaE08(entradas, base);
    case "E07":
      return memoriaE07(entradas, base);
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

function memoriaE12(entradas: Record<string, unknown>, base: BaseArgs): MemoriaDoc {
  const e = descidaSchema.parse(entradas);
  const r = calcularDescida(e);
  return montarMemoriaBase({
    ...base,
    secoes: [
      {
        titulo: "Pavimentos (do topo à base)",
        tabelas: [
          {
            colunas: ["Pavimento", "Área (m²)", "g (kN/m²)", "q (kN/m²)", "Extra (kN)"],
            linhas: e.pavimentos.map((p) => [p.nome, p.area, p.g, p.q, p.extra ?? 0]),
          },
        ],
      },
      {
        titulo: "Acúmulo de cargas (NBR 6120:2019)",
        tabelas: [
          {
            titulo: "Carga acumulada por nível",
            colunas: ["Nível", "N perm. acum. (kN)", "N acid. acum. (kN)", "N total acum. (kN)"],
            linhas: r.niveis.map((n) => [
              n.nome,
              fmtNum(n.ngAcum, 1),
              fmtNum(n.nqAcum, 1),
              fmtNum(n.nAcum, 1),
            ]),
          },
        ],
        valores: [
          { simbolo: "Ng", descricao: "Carga permanente acumulada (base)", valor: fmtNum(r.ngTotal, 1), unidade: "kN" },
          { simbolo: "Nq", descricao: "Carga acidental acumulada (base)", valor: fmtNum(r.nqTotal, 1), unidade: "kN" },
          { simbolo: "ξ", descricao: "Fator de redução da acidental", valor: fmtNum(r.fator, 2) },
          { simbolo: "Nq,red", descricao: "Acidental reduzida", valor: fmtNum(r.nqReduzido, 1), unidade: "kN", formula: "ξ · Nq" },
          { simbolo: "N", descricao: "Carga vertical de projeto (base)", valor: fmtNum(r.nTotal, 1), unidade: "kN", formula: "Ng + Nq,red" },
        ],
        notas: [
          "Sobrecargas de uso (q) conforme Tabela 10 da NBR 6120:2019.",
          r.fator < 1
            ? `Redução da acidental aplicada (ξ = ${fmtNum(r.fator, 2)}), conforme NBR 6120:2019 (6.2.2).`
            : "Sem redução da carga acidental (ξ = 1,00). Verificar a aplicabilidade da redução por nº de pavimentos (NBR 6120:2019, 6.2.2).",
        ],
      },
    ],
  });
}

function memoriaE13(entradas: Record<string, unknown>, base: BaseArgs): MemoriaDoc {
  const e = ventoSchema.parse(entradas);
  const r = calcularVento(e);

  const secoes: MemoriaDoc["secoes"] = [
    {
      titulo: "Dados de entrada",
      tabelas: [
        {
          colunas: ["Parâmetro", "Valor"],
          linhas: [
            ["V0 (m/s)", e.v0],
            ["S1 (topográfico)", e.s1],
            ["Categoria", CATEGORIAS[e.categoria]],
            ["Classe", CLASSES[e.classe]],
            ["Cota z (m)", e.z],
            ["S3", GRUPOS_S3[e.grupoS3].label],
          ],
        },
      ],
    },
    {
      titulo: "Fatores e velocidade característica (NBR 6123:1988)",
      valores: [
        { simbolo: "S1", descricao: "Fator topográfico", valor: fmtNum(r.s1, 3) },
        { simbolo: "b", descricao: "Parâmetro de rugosidade (Tab. 1)", valor: fmtNum(r.b, 3) },
        { simbolo: "Fr", descricao: "Fator de rajada (cat. II)", valor: fmtNum(r.fr, 3) },
        { simbolo: "p", descricao: "Expoente do perfil (Tab. 1)", valor: fmtNum(r.p, 3) },
        { simbolo: "S2", descricao: "Fator de rugosidade/altura", valor: fmtNum(r.s2, 3), formula: "b·Fr·(z/10)^p" },
        { simbolo: "S3", descricao: "Fator estatístico", valor: fmtNum(r.s3, 3) },
        { simbolo: "Vk", descricao: "Velocidade característica", valor: fmtNum(r.vk, 2), unidade: "m/s", formula: "V0·S1·S2·S3" },
        { simbolo: "q", descricao: "Pressão dinâmica", valor: fmtNum(r.q, 1), unidade: "N/m²", formula: "0,613·Vk²" },
        { simbolo: "q", descricao: "Pressão dinâmica", valor: fmtNum(r.qkN, 3), unidade: "kN/m²" },
      ],
    },
  ];

  if (r.forca) {
    secoes.push({
      titulo: "Força de arrasto global",
      valores: [
        { simbolo: "Ae", descricao: "Área frontal efetiva", valor: fmtNum(r.forca.ae, 2), unidade: "m²", formula: "l1·h" },
        { simbolo: "h/l1", descricao: "Razão para o ábaco de Ca", valor: fmtNum(r.forca.razaoHL1, 3) },
        ...(r.forca.razaoL1L2 != null
          ? [{ simbolo: "l1/l2", descricao: "Razão para o ábaco de Ca", valor: fmtNum(r.forca.razaoL1L2, 3) }]
          : []),
        { simbolo: "Ca", descricao: "Coeficiente de arrasto (Fig. 4/5)", valor: fmtNum(r.forca.ca, 3) },
        { simbolo: "Fa", descricao: "Força de arrasto", valor: fmtNum(r.forca.f, 1), unidade: "kN", formula: "Ca·q·Ae" },
      ],
      notas: [
        "Ca lido das Figuras 4 (baixa turbulência) ou 5 (alta turbulência) da NBR 6123:1988, em função de h/l1 e l1/l2.",
        "q avaliado na cota z informada — para a força global, usar z no topo da edificação (a favor da segurança).",
      ],
    });
  }

  return montarMemoriaBase({ ...base, secoes });
}

const ROTULO_ELU: Record<string, string> = {
  normal: "Última normal",
  especial: "Última especial / de construção",
  excepcional: "Última excepcional",
};

function memoriaE14(entradas: Record<string, unknown>, base: BaseArgs): MemoriaDoc {
  const e = combosSchema.parse(entradas);
  const r = calcularCombos(e);

  const linhasELU = (Object.keys(r.elu) as (keyof typeof r.elu)[]).flatMap((tipo) =>
    r.elu[tipo].combinacoes.map((c) => [
      ROTULO_ELU[tipo],
      c.principal ?? "—",
      fmtNum(c.fd, 1),
      c === r.elu[tipo].governante ? "★" : "",
    ]),
  );

  const linhasELS = [
    ["Quase-permanente", r.els.quasePermanente.principal ?? "—", fmtNum(r.els.quasePermanente.fd, 1), "★"],
    ...r.els.frequente.combinacoes.map((c) => [
      "Frequente",
      c.principal ?? "—",
      fmtNum(c.fd, 1),
      c === r.els.frequente.governante ? "★" : "",
    ]),
    ...r.els.rara.combinacoes.map((c) => [
      "Rara",
      c.principal ?? "—",
      fmtNum(c.fd, 1),
      c === r.els.rara.governante ? "★" : "",
    ]),
  ];

  return montarMemoriaBase({
    ...base,
    secoes: [
      {
        titulo: "Ações",
        tabelas: [
          {
            titulo: "Permanentes (Gk)",
            colunas: ["Ação", "Gk", "Situação"],
            linhas: e.permanentes.map((p) => [p.nome, p.gk, p.favoravel ? "Favorável" : "Desfavorável"]),
          },
          ...(e.variaveis.length > 0
            ? [
                {
                  titulo: "Variáveis (Qk)",
                  colunas: ["Ação", "Qk", "Tipo (ψ0 / ψ1 / ψ2)"],
                  linhas: e.variaveis.map((q) => {
                    const t = TIPOS_VARIAVEL[q.tipo];
                    return [q.nome, q.qk, `${t.label} (${t.psi0} / ${t.psi1} / ${t.psi2})`];
                  }),
                },
              ]
            : []),
        ],
      },
      {
        titulo: "Combinações últimas — ELU (NBR 8681:2003)",
        tabelas: [
          {
            colunas: ["Combinação", "Ação principal", "Fd", "Gov."],
            linhas: linhasELU,
          },
        ],
        valores: [
          { simbolo: "Fd,ELU", descricao: "Governante (última normal)", valor: fmtNum(r.elu.normal.governante.fd, 1) },
        ],
        notas: [
          "γ por tipo: normal 1,4/1,0 (perm.) e 1,4 (var.); especial 1,3/1,0 e 1,2; excepcional 1,2/1,0 e 1,0 (NBR 6118:2014 Tab. 11.1).",
          "A combinação excepcional usa aqui a estrutura da normal (ψ0 nas secundárias); a NBR 8681 (5.1.5) admite ψ0,ef e o valor próprio da ação excepcional.",
        ],
      },
      {
        titulo: "Combinações de serviço — ELS",
        tabelas: [
          {
            colunas: ["Combinação", "Ação principal", "Fd", "Gov."],
            linhas: linhasELS,
          },
        ],
        notas: [
          "Quase-permanente: ΣGk + Σψ2·Qk. Frequente: ΣGk + ψ1·Q1 + Σψ2·Qj. Rara: ΣGk + Q1 + Σψ1·Qj.",
        ],
      },
    ],
  });
}

function memoriaE04(entradas: Record<string, unknown>, base: BaseArgs): MemoriaDoc {
  const e = pilarSchema.parse(entradas);
  const r = calcularPilar(e);
  const kNm = (kNcm: number) => fmtNum(kNcm / 100, 2);

  return montarMemoriaBase({
    ...base,
    secoes: [
      {
        titulo: "Dados de entrada",
        tabelas: [
          {
            colunas: ["Parâmetro", "Valor"],
            linhas: [
              ["Seção b × h (cm)", `${e.b} × ${e.h}`],
              ["fck (MPa)", e.fck],
              ["Aço", e.aco],
              ["d' (cm)", e.dLinha ?? 4],
              ["Nd (kN)", e.Nd],
              ["Mdx, Mdy (kN·m)", `${e.Mdx ?? 0} ; ${e.Mdy ?? 0}`],
              ["le,x / le,y (cm)", `${e.lex} / ${e.ley}`],
              ["αb / α (interação)", `${e.alphaB ?? 1} / ${e.alphaInteracao ?? 1}`],
            ],
          },
        ],
      },
      {
        titulo: "Esbeltez e 2ª ordem (NBR 6118:2023)",
        tabelas: [
          {
            colunas: ["Direção", "λ", "λ1", "Esbelto?", "M1d,mín (kN·m)", "M2d (kN·m)", "Md,tot (kN·m)"],
            linhas: [
              ["x (prof. h)", fmtNum(r.dirX.lambda, 1), fmtNum(r.dirX.lambda1, 1), r.dirX.esbelto ? "sim" : "não", kNm(r.dirX.m1dMin), kNm(r.dirX.m2d), kNm(r.dirX.mdTot)],
              ["y (prof. b)", fmtNum(r.dirY.lambda, 1), fmtNum(r.dirY.lambda1, 1), r.dirY.esbelto ? "sim" : "não", kNm(r.dirY.m1dMin), kNm(r.dirY.m2d), kNm(r.dirY.mdTot)],
            ],
          },
        ],
        valores: [
          { simbolo: "ν", descricao: "Força normal adimensional", valor: fmtNum(r.nu, 3), formula: "Nd/(Ac·fcd)" },
        ],
        notas: [
          "2ª ordem pelo método do pilar-padrão com curvatura aproximada (1/r = 0,005/[h(ν+0,5)] ≤ 0,005/h), válido para λ ≤ 90.",
        ],
      },
      {
        titulo: "Dimensionamento à flexo-compressão oblíqua",
        valores: [
          { simbolo: "As,nec", descricao: "Armadura necessária", valor: fmtNum(r.AsNec, 2), unidade: "cm²" },
          { simbolo: "As,mín", descricao: "Armadura mínima", valor: fmtNum(r.AsMin, 2), unidade: "cm²", formula: "máx(0,4%·Ac ; 0,15·Nd/fyd)" },
          { simbolo: "As", descricao: "Armadura adotada", valor: fmtNum(r.As, 2), unidade: "cm²" },
          { simbolo: "ρ", descricao: "Taxa geométrica", valor: fmtNum(r.taxaGeom, 2), unidade: "%" },
          { simbolo: "Σ", descricao: "Interação biaxial no As adotado", valor: fmtNum(r.interacao, 3), formula: "(Mdx/Mxr)^α + (Mdy/Myr)^α ≤ 1" },
          { simbolo: "Arranjo", descricao: "Sugestão de barras", valor: `${r.nBarras} ø${r.phi} mm` },
        ],
        notas:
          r.alertas.length > 0
            ? r.alertas
            : ["Verificação à flexo-compressão oblíqua atendida (interação ≤ 1)."],
      },
    ],
  });
}

function memoriaE05(entradas: Record<string, unknown>, base: BaseArgs): MemoriaDoc {
  const e = lajeSchema.parse(entradas);
  const r = calcularLaje(e);

  return montarMemoriaBase({
    ...base,
    secoes: [
      {
        titulo: "Dados de entrada",
        tabelas: [
          {
            colunas: ["Parâmetro", "Valor"],
            linhas: [
              ["Vinculação", CASOS_LAJE[e.caso]],
              ["lx × ly (cm)", `${Math.min(e.lx, e.ly)} × ${Math.max(e.lx, e.ly)}`],
              ["λ = ly/lx", fmtNum(r.lambda, 3)],
              ["Espessura h (cm)", e.h],
              ["Carga p (kN/m²)", e.p],
              ["fck (MPa) / Aço", `${e.fck} / ${e.aco}`],
            ],
          },
        ],
      },
      {
        titulo: "Momentos e armaduras por direção (tabelas de Bares)",
        tabelas: [
          {
            colunas: ["Esforço", "M (kN·m/m)", "As (cm²/m)"],
            linhas: r.momentos.map((m) => [m.simbolo, fmtNum(m.m, 2), fmtNum(m.as, 2)]),
          },
        ],
        valores: [
          { simbolo: "As,mín", descricao: "Armadura mínima de laje (0,67·ρmín)", valor: fmtNum(r.asMin, 2), unidade: "cm²/m" },
        ],
        notas: [
          "M = μ · p · lx² / 100 (μ das tabelas de Bares–Pinheiro, carga uniforme, laje armada em cruz).",
          "As por flexão simples de faixa de 1 m; adota-se o maior entre o calculado e As,mín.",
        ],
      },
      {
        titulo: "Flecha (ELS, Tabela de Bares + fissuração de Branson)",
        valores: [
          { simbolo: "Ecs", descricao: "Módulo de elasticidade secante", valor: fmtNum(r.ecs, 0), unidade: "MPa" },
          { simbolo: "Mr", descricao: "Momento de fissuração (dir. lx)", valor: fmtNum(r.mr, 2), unidade: "kN·m/m", formula: "1,5·fctm·Ic/yt" },
          { simbolo: "Ma", descricao: "Momento de serviço (dir. lx)", valor: fmtNum(r.maServ, 2), unidade: "kN·m/m" },
          { simbolo: "Ic", descricao: "Inércia bruta (faixa 1 m)", valor: fmtNum(r.ic, 0), unidade: "cm⁴" },
          { simbolo: "I_II", descricao: "Inércia no estádio II", valor: fmtNum(r.iII, 0), unidade: "cm⁴" },
          { simbolo: "I_eq", descricao: "Inércia equivalente (Branson)", valor: fmtNum(r.ieq, 0), unidade: "cm⁴" },
          { simbolo: "a_i,br", descricao: "Flecha imediata (seção bruta)", valor: fmtNum(r.flechaImediataBruta, 3), unidade: "cm", formula: "(α/100)·p·lx⁴/(Ecs·h³)" },
          { simbolo: "a_i", descricao: "Flecha imediata (fissurada)", valor: fmtNum(r.flechaImediata, 3), unidade: "cm", formula: "a_i,br·Ic/Ieq" },
          { simbolo: "a_∞", descricao: "Flecha total (diferida)", valor: fmtNum(r.flechaTotal, 3), unidade: "cm", formula: "a_i·(1+αf)" },
          { simbolo: "a_lim", descricao: "Limite L/250", valor: fmtNum(r.flechaLimite, 3), unidade: "cm" },
        ],
        notas:
          r.alertas.length > 0
            ? r.alertas
            : [`Seção não fissurada (Ma ≤ Mr): flecha pela seção bruta. Fluência por αf = ${fmtNum(e.alphaF ?? 1.32, 2)}.`],
      },
    ],
  });
}

function memoriaE08(entradas: Record<string, unknown>, base: BaseArgs): MemoriaDoc {
  const e = escadaSchema.parse(entradas);
  const r = calcularEscada(e);
  return montarMemoriaBase({
    ...base,
    secoes: [
      {
        titulo: "Dados e cargas",
        tabelas: [
          {
            colunas: ["Parâmetro", "Valor"],
            linhas: [
              ["Degrau (piso × espelho)", `${e.piso} × ${e.espelho} cm`],
              ["Inclinação α", `${fmtNum(r.alphaGraus, 1)}°`],
              ["Lance + patamar", `${e.aLance} + ${e.aPatamar ?? 0} cm (L = ${fmtNum(r.L, 2)} m)`],
              ["Espessura hl", `${e.hLaje} cm`],
              ["Vinculação", VINCULACOES[e.vinculacao ?? "biapoiado"]],
              ["Sobrecarga q", `${e.q ?? 3} kN/m²`],
            ],
          },
        ],
        valores: [
          { simbolo: "g_lance", descricao: "Permanente do lance", valor: fmtNum(r.gLance, 2), unidade: "kN/m²" },
          { simbolo: "g_patamar", descricao: "Permanente do patamar", valor: fmtNum(r.gPatamar, 2), unidade: "kN/m²" },
          { simbolo: "w_lance", descricao: "Carga total do lance", valor: fmtNum(r.wLance, 2), unidade: "kN/m" },
        ],
      },
      {
        titulo: "Esforços e armadura (faixa de 1 m)",
        valores: [
          { simbolo: "RA / RB", descricao: "Reações de apoio", valor: `${fmtNum(r.ra, 1)} / ${fmtNum(r.rb, 1)}`, unidade: "kN/m" },
          { simbolo: "M_vão", descricao: "Momento positivo máximo", valor: fmtNum(r.mVaoMax, 2), unidade: "kN·m/m" },
          { simbolo: "M_apoio", descricao: "Momento negativo de apoio", valor: fmtNum(r.mApoioMax, 2), unidade: "kN·m/m" },
          { simbolo: "As_vão", descricao: "Armadura positiva", valor: fmtNum(r.asVao, 2), unidade: "cm²/m" },
          { simbolo: "As_apoio", descricao: "Armadura negativa", valor: fmtNum(r.asApoio, 2), unidade: "cm²/m" },
          { simbolo: "As,mín", descricao: "Armadura mínima", valor: fmtNum(r.asMin, 2), unidade: "cm²/m" },
        ],
        notas: ["Momentos pela vinculação escolhida (método das forças, EI constante). As por flexão simples."],
      },
      {
        titulo: "Flecha (ELS, com fissuração de Branson)",
        valores: [
          { simbolo: "a_i", descricao: "Flecha imediata", valor: fmtNum(r.flechaImediata, 3), unidade: "cm" },
          { simbolo: "a_∞", descricao: "Flecha total (diferida)", valor: fmtNum(r.flechaTotal, 3), unidade: "cm" },
          { simbolo: "a_lim", descricao: "Limite L/250", valor: fmtNum(r.flechaLimite, 3), unidade: "cm" },
        ],
        notas: ["Flecha por carga uniforme equivalente, coeficiente da vinculação, com Ieq de Branson na seção de vão."],
      },
    ],
  });
}

function memoriaE07(entradas: Record<string, unknown>, base: BaseArgs): MemoriaDoc {
  const e = puncaoSchema.parse(entradas);
  const r = calcularPuncao(e);
  const secoes: MemoriaDoc["secoes"] = [
    {
      titulo: "Dados de entrada",
      tabelas: [
        {
          colunas: ["Parâmetro", "Valor"],
          linhas: [
            ["Posição do pilar", POSICOES[e.posicao]],
            ["Seção do pilar c1 × c2", `${e.c1} × ${e.c2} cm`],
            ["Altura útil d", `${e.d} cm`],
            ["fck", `${e.fck} MPa`],
            ["FSd", `${e.fSd} kN`],
            ["MSd", `${e.mSd ?? 0} kN·m`],
            ["ρx / ρy (flexão)", `${e.rhoX ?? 0.5}% / ${e.rhoY ?? 0.5}%`],
          ],
        },
      ],
    },
    {
      titulo: "Perímetros e coeficiente β (NBR 6118 19.5.2.2)",
      valores: [
        { simbolo: "u0", descricao: "Perímetro do contorno C (pilar)", valor: fmtNum(r.u0, 1), unidade: "cm" },
        { simbolo: "u1", descricao: "Perímetro do contorno C' (2d)", valor: fmtNum(r.u1, 1), unidade: "cm" },
        { simbolo: "Wp", descricao: "Módulo plástico do perímetro", valor: fmtNum(r.wp, 0), unidade: "cm²" },
        { simbolo: "K", descricao: "Coeficiente (Tabela 19.2, c1/c2)", valor: fmtNum(r.k, 2) },
        { simbolo: "β", descricao: "Amplificação por excentricidade", valor: fmtNum(r.beta, 3), formula: "1 + K·MSd·u1/(Wp·FSd)" },
      ],
    },
    {
      titulo: "Verificações de tensão (NBR 6118 19.5.3)",
      valores: [
        { simbolo: "τSd,C", descricao: "Tensão no contorno C", valor: fmtNum(r.tauSd0, 3), unidade: "MPa", formula: "β·FSd/(u0·d)" },
        { simbolo: "τRd2", descricao: "Resistência da biela", valor: fmtNum(r.tauRd2, 3), unidade: "MPa", formula: "0,27·αv·fcd" },
        { simbolo: "τSd,C'", descricao: "Tensão no contorno C'", valor: fmtNum(r.tauSd1, 3), unidade: "MPa", formula: "β·FSd/(u1·d)" },
        { simbolo: "τRd1", descricao: "Resistência sem armadura", valor: fmtNum(r.tauRd1, 3), unidade: "MPa", formula: "0,13·(1+√(20/d))·(100ρfck)^⅓" },
      ],
      notas: [
        r.okBiela ? "Biela comprimida OK (τSd,C ≤ τRd2)." : "Biela comprimida NÃO atende — aumentar pilar/altura/fck.",
        r.precisaArmadura ? "τSd,C' > τRd1: necessária armadura de punção." : "τSd,C' ≤ τRd1: dispensa armadura de punção.",
      ],
    },
  ];
  if (r.precisaArmadura) {
    secoes.push({
      titulo: "Armadura de punção (NBR 6118 19.5.3.3)",
      valores: [
        { simbolo: "Asw", descricao: "Armadura por perímetro", valor: fmtNum(r.asw, 2), unidade: "cm²" },
        { simbolo: "sr", descricao: "Espaçamento radial adotado", valor: fmtNum(r.sr, 1), unidade: "cm" },
        { simbolo: "uout", descricao: "Perímetro onde dispensa armadura (C'')", valor: fmtNum(r.uout, 1), unidade: "cm" },
        { simbolo: "dist C''", descricao: "Distância do pilar até C''", valor: fmtNum(r.distC2, 1), unidade: "cm" },
      ],
      notas: ["Estender a armadura de punção até o contorno C'' (≥ 2d além da última linha de conectores)."],
    });
  }
  return montarMemoriaBase({ ...base, secoes });
}
