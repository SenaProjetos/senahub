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
    expect(r.campos["Instalada (kW)"]).toBe("6.5");
    expect(r.campos["Demandada (kW)"]).toBe("6.3");
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
