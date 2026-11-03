import { describe, it, expect } from "vitest";
import { calcular, montarMemoria } from "./service";
import { parse, serializar } from "./savefile";
import type { MemoriaDoc } from "./memoria";

const reservatorio = { ocupacao: "residencia_media", unidades: 20, diasReserva: 2, sistema: "inferior_superior", fracaoInferior: 0.6 };
const demanda = {
  cargas: [
    { descricao: "Chuveiro", quantidade: 1, potenciaW: 5500, fp: 1, rendimento: 1, fd: 1, tensaoV: 220, ligacao: "mono" },
    { descricao: "Iluminação", quantidade: 10, potenciaW: 100, fp: 0.92, rendimento: 1, fd: 0.8, tensaoV: 127, ligacao: "mono" },
  ],
  isolacao: "PVC",
  temperaturaC: 30,
  circuitosAgrupados: 1,
  alimentacaoTensaoV: 220,
  alimentacaoLigacao: "tri",
};

function textoDe(doc: MemoriaDoc): string {
  return JSON.stringify(doc);
}

describe("reservatorios no service", () => {
  it("painel traz consumo, reserva, inferior, superior e total", () => {
    const r = calcular("reservatorios", reservatorio);
    expect(r.campos["Consumo diário (L)"]).toBe("3000");
    expect(r.campos["Inferior (L)"]).toBe("3600");
    expect(r.campos["Superior (L)"]).toBe("2400");
    expect(r.campos["Total (L)"]).toBe("6000");
  });

  it("memória sai com o selo de validação e as hipóteses", () => {
    const doc = montarMemoria("reservatorios", reservatorio, { titulo: "Teste" });
    expect(doc.subtitulo).toContain("EM VALIDAÇÃO");
    expect(textoDe(doc)).toContain("NBR 5626 não os fixa");
    expect(doc.secoes.length).toBeGreaterThanOrEqual(3);
  });

  it("arquivo .shcalc faz o ciclo e recusa entrada inválida", () => {
    const json = serializar({ ferramenta: "reservatorios", versaoCalc: 1, titulo: "R", entradas: reservatorio });
    expect(parse(json, "reservatorios").ok).toBe(true);
    const ruim = serializar({ ferramenta: "reservatorios", versaoCalc: 1, titulo: "R", entradas: { unidades: -1 } });
    expect(parse(ruim, "reservatorios").ok).toBe(false);
  });
});

describe("corrente-demanda no service", () => {
  it("painel traz demanda e corrente total", () => {
    const r = calcular("corrente-demanda", demanda);
    // demanda = 5500 + 1000/0,92·0,92... P_abs 1000 W × 0,8 = 800 W → 6,3 kW
    expect(r.campos["Instalada (kW)"]).toBe("6,5");
    expect(r.campos["Demandada (kW)"]).toBe("6,3");
    expect(r.campos.FCT).toBe("1");
  });

  it("memória lista as cargas, os fatores e a demanda", () => {
    const doc = montarMemoria("corrente-demanda", demanda, { titulo: "Teste" });
    expect(doc.subtitulo).toContain("EM VALIDAÇÃO");
    const texto = textoDe(doc);
    expect(texto).toContain("Chuveiro");
    expect(texto).toContain("Tab. 40");
    expect(texto).toContain("Carga demandada");
  });

  it("arquivo .shcalc faz o ciclo e recusa temperatura fora da tabela", () => {
    const json = serializar({ ferramenta: "corrente-demanda", versaoCalc: 1, titulo: "D", entradas: demanda });
    expect(parse(json, "corrente-demanda").ok).toBe(true);
    const ruim = serializar({ ferramenta: "corrente-demanda", versaoCalc: 1, titulo: "D", entradas: { ...demanda, temperaturaC: 33 } });
    expect(parse(ruim, "corrente-demanda").ok).toBe(false);
  });
});

const recalque = {
  origem: "consumo_diario",
  consumoDiarioL: 30000,
  alturaSuccaoM: 2,
  alturaRecalqueM: 18,
  comprimentoSuccaoM: 3,
  comprimentoRecalqueM: 25,
  leqSuccaoM: 5,
  leqRecalqueM: 15,
};

describe("bomba-recalque no service", () => {
  it("painel traz vazão, diâmetros, Hm e motor", () => {
    const r = calcular("bomba-recalque", recalque);
    expect(r.campos["Vazão (m³/h)"]).toBe("5");
    expect(r.campos.Recalque).toBe("DN40");
    expect(r.campos.Sucção).toBe("DN50");
    expect(r.campos["Hm (mca)"]).toBe("23,02");
    expect(r.campos["Motor (cv)"]).toBe("1,5");
  });

  it("memória sai com o selo, as hipóteses e a nota do NPSH", () => {
    const doc = montarMemoria("bomba-recalque", recalque, { titulo: "Teste" });
    expect(doc.subtitulo).toContain("EM VALIDAÇÃO");
    const texto = textoDe(doc);
    expect(texto).toContain("Forchheimer");
    expect(texto).toContain("NPSH");
    expect(texto).toContain("adotado pelo cálculo");
  });

  it("arquivo .shcalc faz o ciclo e recusa entrada incompleta", () => {
    const json = serializar({ ferramenta: "bomba-recalque", versaoCalc: 1, titulo: "B", entradas: recalque });
    expect(parse(json, "bomba-recalque").ok).toBe(true);
    const ruim = serializar({ ferramenta: "bomba-recalque", versaoCalc: 1, titulo: "B", entradas: { ...recalque, consumoDiarioL: undefined } });
    expect(parse(ruim, "bomba-recalque").ok).toBe(false);
  });
});

const piscina = {
  forma: "retangular",
  comprimentoM: 8,
  larguraM: 4,
  profundidadeMediaM: 1.5,
  comprimentoSuccaoM: 4,
  leqSuccaoM: 6,
  comprimentoRetornoM: 10,
  leqRetornoM: 8,
  perdaEquipamentosMca: 4,
  pressaoRetornoMca: 2,
};

describe("bomba-piscina no service", () => {
  it("painel traz volume, vazão, diâmetros, Hm e motor", () => {
    const r = calcular("bomba-piscina", piscina);
    expect(r.campos["Volume (m³)"]).toBe("48");
    expect(r.campos["Vazão (m³/h)"]).toBe("8");
    expect(r.campos.Sucção).toBe("DN50");
    expect(r.campos.Retorno).toBe("DN40");
    expect(r.campos["Motor (cv)"]).toBe("1");
  });

  it("memória sai com o selo e a nota do circuito fechado", () => {
    const doc = montarMemoria("bomba-piscina", piscina, { titulo: "Teste" });
    expect(doc.subtitulo).toContain("EM VALIDAÇÃO");
    expect(textoDe(doc)).toContain("Circuito fechado");
  });

  it("arquivo .shcalc faz o ciclo e recusa forma sem medidas", () => {
    const json = serializar({ ferramenta: "bomba-piscina", versaoCalc: 1, titulo: "P", entradas: piscina });
    expect(parse(json, "bomba-piscina").ok).toBe(true);
    const ruim = serializar({ ferramenta: "bomba-piscina", versaoCalc: 1, titulo: "P", entradas: { ...piscina, larguraM: undefined } });
    expect(parse(ruim, "bomba-piscina").ok).toBe(false);
  });
});

const esgoto = {
  contribuicao: "pessoas",
  pessoas: 5,
  contribuicaoLPessoaDia: 150,
  furos: [
    { tempoMin: 10, rebaixamentoCm: 1 },
    { tempoMin: 40, rebaixamentoCm: 2 },
    { tempoMin: 30, rebaixamentoCm: 3 },
  ],
  diametroM: 1.2,
  unidades: 2,
  profundidadeTopoM: 0.5,
  nivelAguaM: 6,
};

describe("esgoto-infiltracao no service", () => {
  it("painel traz Ci, área, profundidade e a situação do lençol", () => {
    const r = calcular("esgoto-infiltracao", esgoto);
    expect(r.campos["Volume (L/dia)"]).toBe("750");
    expect(r.campos["Ci adotado (L/m²·dia)"]).toBe("21,8");
    expect(r.campos["Área necessária (m²)"]).toBe("34,4");
    expect(r.campos["Profundidade útil (m)"]).toBe("4,57");
    expect(r.campos["Lençol"]).toBe("não respeitado");
  });

  it("memória traz o selo, a tabela de furos, a nota da NBR 17076 e a seção da sondagem", () => {
    const doc = montarMemoria("esgoto-infiltracao", esgoto, { titulo: "Teste" });
    expect(doc.subtitulo).toContain("EM VALIDAÇÃO");
    const texto = textoDe(doc);
    expect(texto).toContain("Teste de percolação");
    expect(texto).toContain("NBR 17076:2024");
    expect(texto).toContain("Sondagem");
  });

  it("memória sem sondagem não tem a seção do lençol", () => {
    const doc = montarMemoria("esgoto-infiltracao", { ...esgoto, nivelAguaM: undefined }, { titulo: "Teste" });
    expect(textoDe(doc)).not.toContain("Sondagem: nível");
  });

  it("arquivo .shcalc faz o ciclo e recusa entrada incompleta", () => {
    const json = serializar({ ferramenta: "esgoto-infiltracao", versaoCalc: 1, titulo: "E", entradas: esgoto });
    expect(parse(json, "esgoto-infiltracao").ok).toBe(true);
    const ruim = serializar({ ferramenta: "esgoto-infiltracao", versaoCalc: 1, titulo: "E", entradas: { ...esgoto, furos: [] } });
    expect(parse(ruim, "esgoto-infiltracao").ok).toBe(false);
  });
});

describe("memória de cálculo salvo em versão anterior do motor", () => {
  it("avisa no cabeçalho que a conta foi refeita na versão atual", () => {
    const doc = montarMemoria("reservatorios", reservatorio, { titulo: "Teste", versaoCalcSalva: 0 });
    expect(doc.subtitulo).toContain("calculado na versão 0, refeito na versão");
    expect(montarMemoria("reservatorios", reservatorio, { titulo: "Teste" }).subtitulo).not.toContain("refeito");
  });
});
