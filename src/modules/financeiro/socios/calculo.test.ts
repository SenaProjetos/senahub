import { describe, expect, it } from "vitest";
import {
  BP_TOTAL,
  bpParaTexto,
  descricaoDaRetirada,
  motivoDoRateio,
  percentualParaBp,
  ratearEntreSocios,
  somaBp,
  type SocioParaRateio,
} from "@/modules/financeiro/socios/calculo";
import { reais } from "@/modules/financeiro/liquidez/fixtures";

const quatro: SocioParaRateio[] = [
  { id: "a", nome: "Ana", percentualBp: 2500 },
  { id: "b", nome: "Bruno", percentualBp: 2500 },
  { id: "c", nome: "Carla", percentualBp: 2500 },
  { id: "d", nome: "Davi", percentualBp: 2500 },
];

describe("percentual do sócio em basis points", () => {
  it("Decimal(5,2) em pontos percentuais vira bp", () => {
    expect(percentualParaBp(33.33)).toBe(3333);
    expect(percentualParaBp(25)).toBe(2500);
    expect(somaBp(quatro)).toBe(BP_TOTAL);
    expect(bpParaTexto(3333)).toBe("33,33%");
    expect(bpParaTexto(2500)).toBe("25%");
  });
});

describe("motivoDoRateio: os sócios ativos precisam fechar 100%", () => {
  it("fechando 100%, pode", () => {
    expect(motivoDoRateio(quatro)).toBeNull();
  });
  it("somando menos ou mais, recusa dizendo a soma", () => {
    expect(motivoDoRateio(quatro.slice(0, 3))).toBe("Os percentuais dos sócios ativos somam 75%: ajuste para 100% em Cadastros → Sócios.");
    expect(motivoDoRateio([...quatro, { id: "e", nome: "Eva", percentualBp: 1000 }])).toContain("somam 110%");
  });
  it("sem sócio ativo ou com percentual zerado, recusa", () => {
    expect(motivoDoRateio([])).toBe("Nenhum sócio ativo cadastrado.");
    expect(motivoDoRateio([{ id: "a", nome: "Ana", percentualBp: 0 }, { id: "b", nome: "B", percentualBp: 10_000 }])).toContain("maior que zero");
  });
});

describe("ratearEntreSocios: a soma fecha o total, o resto vai para o último", () => {
  it("R$ 20.000 entre 4 sócios de 25%", () => {
    const partes = ratearEntreSocios(reais(20_000), quatro);
    expect(partes.map((p) => p.valor)).toEqual([reais(5_000), reais(5_000), reais(5_000), reais(5_000)]);
    expect(partes[0]).toMatchObject({ socioId: "a", nome: "Ana", percentualBp: 2500 });
  });

  it("percentuais que não dividem: nada some nem sobra", () => {
    const tres: SocioParaRateio[] = [
      { id: "a", nome: "Ana", percentualBp: 3333 },
      { id: "b", nome: "Bruno", percentualBp: 3333 },
      { id: "c", nome: "Carla", percentualBp: 3334 },
    ];
    for (const v of [1, 2, 3, 100, 10_001, reais(12_345.67)]) {
      expect(ratearEntreSocios(v, tres).reduce((s, p) => s + p.valor, 0)).toBe(v);
    }
    const p = ratearEntreSocios(10_001, tres);
    expect(p[0].valor).toBe(Math.floor((10_001 * 3333) / 10_000));
  });

  it("divisão inválida, total zero ou negativo não rateia", () => {
    expect(ratearEntreSocios(reais(100), quatro.slice(0, 2))).toEqual([]);
    expect(ratearEntreSocios(0, quatro)).toEqual([]);
    expect(ratearEntreSocios(-1, quatro)).toEqual([]);
    expect(ratearEntreSocios(10.5, quatro)).toEqual([]);
  });
});

describe("descrição da retirada", () => {
  it("diz o tipo e o sócio", () => {
    expect(descricaoDaRetirada("distribuicao", "Ana")).toBe("Distribuição de lucros · Ana");
    expect(descricaoDaRetirada("adiantamento", "Bruno")).toBe("Adiantamento de lucros · Bruno");
  });
});
