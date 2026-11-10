/**
 * Casos de teste da planilha `docs/calculadora-eletrica/pacote-implementacao-calculadora/casos-de-teste-demanda-preliminar.xlsx`
 * (31 casos, calculados pelo engenheiro). TODO esperado vem da planilha (ou, no caso 29, do §5 da spec, por decisão
 * do dono); nada é derivado do código testado. Tolerância da planilha: ±0,01 (±1 em lm e lux).
 *
 * Mensagens: vale o texto da spec §6 (decisão do dono, Fase 0). Onde a planilha cita norma no texto (casos 13 e 18),
 * o teste usa o texto da spec e registra a diferença.
 */

import { describe, expect, it } from "vitest";

import { calcularLux } from "./lux";
import { correnteCorrigida, correnteDoCircuito, disjuntorSugerido } from "./corrente";
import { avaliarComodo, iluminacaoSugeridaVA, potenciaTomadasMinimaVA, tomadasMinimas } from "./habitacao";
import { validarApartamentos, validarArea, validarFp } from "./validacao";

/** ±0,01 da planilha. */
const perto = (recebido: number, esperado: number, tol = 0.01) => expect(Math.abs(recebido - esperado)).toBeLessThanOrEqual(tol + 1e-12);

const consultorio = {
  areaM2: 12,
  perimetroM: 14,
  peDireitoM: 2.9,
  alturaPlanoM: 0.8,
  emLux: 500,
  fu: 0.55,
  fm: 0.8,
  luminaria: { fluxoLm: 3600, potenciaW: 30, fp: 0.95 },
};

describe("caso 9 — FCT × FCA abaixo de 0,5 (chuveiro 5.500 W, 220 V, PVC 60 °C, 20 circuitos)", () => {
  it("Ib = 25 A; Ib′ = 131,58 A com FCT 0,50 e FCA 0,38; alerta", () => {
    const ib = correnteDoCircuito(5500, 220, 1, 1);
    perto(ib, 25);
    const r = correnteCorrigida(ib, 0.5, 0.38);
    perto(r.ibCorrigida, 131.58);
    expect(r.avisos.map((a) => a.texto)).toContain("Fator de correção combinado abaixo de 0,5. Verifique as condições de instalação.");
  });
});

describe("caso 11 — consultório por lux", () => {
  const r = calcularLux({ ...consultorio, quantidade: 4 });
  it("K = 0,82", () => perto(r.indiceK, 0.82));
  it("fluxo necessário = 13.636 lm (±1)", () => perto(r.fluxoNecessarioLm, 13636, 1));
  it("quantidade sugerida = 4", () => expect(r.quantidadeSugerida).toBe(4));
  it("iluminância final = 528 lux (±1)", () => perto(r.iluminanciaFinalLux, 528, 1));
  it("potência = 120 W", () => perto(r.potenciaW, 120));
  it("potência aparente = 126,31 VA", () => perto(r.potenciaVA, 126.31));
  it("sem alerta de iluminância", () => expect(r.avisos).toHaveLength(0));
});

describe("caso 12 — consultório com 3 luminárias", () => {
  const r = calcularLux({ ...consultorio, quantidade: 3 });
  it("iluminância final = 396 lux (±1)", () => perto(r.iluminanciaFinalLux, 396, 1));
  it("alerta de iluminância abaixo do mínimo", () =>
    expect(r.avisos.map((a) => a.texto)).toContain("Iluminância final inferior ao mínimo da atividade."));
});

describe("casos 16, 17 e 19 — entradas inválidas", () => {
  it("16: área zero", () => expect(validarArea(0)?.texto).toBe("Área inválida. Informe um valor maior que zero (m²)."));
  it("17: FP 1,2", () => expect(validarFp(1.2)?.texto).toBe("Fator de potência inválido. Informe um valor maior que 0 e até 1."));
  it("19: zero apartamentos", () =>
    expect(validarApartamentos(0)?.texto).toBe("Número de apartamentos inválido. Informe um número inteiro maior que zero."));
});

describe("caso 22 — habitação, três ambientes do 1º pavimento", () => {
  it("iluminação: Recepção 280; Copa 160; Sanitário 100 VA", () => {
    perto(iluminacaoSugeridaVA(18), 280);
    perto(iluminacaoSugeridaVA(9), 160);
    perto(iluminacaoSugeridaVA(4), 100);
  });
  it("nº de tomadas: Recepção 4; Copa 4; Sanitário 1", () => {
    expect(tomadasMinimas("sala", 18, 17)).toBe(4);
    expect(tomadasMinimas("cozinha", 9, 12)).toBe(4);
    expect(tomadasMinimas("banheiro", 4, 8)).toBe(1);
  });
  it("potência das tomadas: Recepção 400; Copa 1.900; Sanitário 600 VA", () => {
    perto(potenciaTomadasMinimaVA("sala", 4), 400);
    perto(potenciaTomadasMinimaVA("cozinha", 4), 1900);
    perto(potenciaTomadasMinimaVA("banheiro", 1), 600);
  });
});

describe("caso 23 — habitação, bordas de 4 m² e de 6 m²", () => {
  it("quarto de 9,99 m²: iluminação 160 VA", () => perto(iluminacaoSugeridaVA(9.99), 160));
  it("quarto de 10,00 m²: iluminação 160 VA", () => perto(iluminacaoSugeridaVA(10), 160));
  it("demais cômodos de 6,00 m², perímetro 11 m: 1 tomada", () => expect(tomadasMinimas("demais", 6, 11)).toBe(1));
  it("demais cômodos de 6,01 m², perímetro 11 m: 3 tomadas", () => expect(tomadasMinimas("demais", 6.01, 11)).toBe(3));
});

describe("caso 24 — disjuntor na borda da série", () => {
  it("Ib 25 A → 25 A", () => expect(disjuntorSugerido(25).sugeridoA).toBe(25));
  it("Ib 25,01 A → 32 A", () => expect(disjuntorSugerido(25.01).sugeridoA).toBe(32));
});

describe("caso 25 — corrente acima da série", () => {
  it("Ib 1.700 A → alerta", () =>
    expect(disjuntorSugerido(1700).avisos.map((a) => a.texto)).toContain(
      "Corrente acima da série cadastrada (1.600 A). Informe o disjuntor adotado.",
    ));
});

// Não é caso da planilha: confere que os alertas da habitação usam o MÍNIMO da norma, não o sugerido (spec §5 passo 7).
describe("habitação — alerta compara com o mínimo da norma", () => {
  it("quarto de 9,99 m² com 100 VA não alerta (mínimo da norma = 100 VA)", () => {
    const r = avaliarComodo({ tipo: "dormitorio", areaM2: 9.99, perimetroM: 13, iluminacaoVA: 100, tomadas: 3, tomadasVA: 300 });
    expect(r.avisos.some((a) => a.id === "iluminacao_abaixo_minimo")).toBe(false);
  });
});
