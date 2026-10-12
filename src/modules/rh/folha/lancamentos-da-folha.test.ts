import { describe, expect, it } from "vitest";
import { planoDaFolha } from "./lancamentos-da-folha";

const base = {
  tipo: "mensal" as const, rotuloFolha: "10/2026", liquidoCltCent: 1000000, liquidoEstagioCent: 300000,
  inssRetidoCent: 110000, irrfRetidoCent: 40000, fgtsCent: 96000,
  beneficios: [{ nome: "Vale-transporte", valorCent: 60000 }, { nome: "Vale-refeição", valorCent: 165000 }],
};
const resumo = (r: ReturnType<typeof planoDaFolha>) => r.lancamentos.map((l) => `${l.parte}:${l.rotulo}:${l.chaveCategoria}:${l.valorCent}:${l.vence}`);

describe("planoDaFolha (decisões 21 e 22)", () => {
  it("folha mensal completa", () => {
    expect(resumo(planoDaFolha(base))).toEqual([
      "liquido_clt::despesa_folha_salarios:1000000:salario",
      "bolsa::despesa_estagio_bolsa:300000:salario",
      "inss_retido::despesa_folha_salarios:110000:dia20",
      "irrf_retido::despesa_folha_salarios:40000:dia20",
      "fgts::despesa_folha_fgts:96000:dia20",
      "beneficio:Vale-transporte:despesa_folha_vale_transporte:60000:salario",
      "beneficio:Vale-refeição:despesa_folha_vale_refeicao:165000:salario",
    ]);
  });
  it("só estagiários: sem líquido CLT", () => {
    const r = planoDaFolha({ ...base, liquidoCltCent: 0, inssRetidoCent: null, irrfRetidoCent: null, fgtsCent: null, beneficios: [] });
    expect(resumo(r)).toEqual(["bolsa::despesa_estagio_bolsa:300000:salario"]);
  });
  it("totais retidos não informados: avisa e não lança", () => {
    const r = planoDaFolha({ ...base, inssRetidoCent: null, irrfRetidoCent: null, fgtsCent: null });
    expect(r.lancamentos.some((l) => l.vence === "dia20")).toBe(false);
    expect(r.avisos).toEqual(["INSS, IRRF e FGTS não informados — nada lançado para as guias."]);
  });
  it("valor zero não vira conta", () => {
    const r = planoDaFolha({ ...base, irrfRetidoCent: 0 });
    expect(r.lancamentos.some((l) => l.parte === "irrf_retido")).toBe(false);
  });
  it("benefício com nome fora do padrão vai para a mãe da folha", () => {
    const r = planoDaFolha({ ...base, beneficios: [{ nome: "Plano odontológico", valorCent: 5000 }] });
    expect(resumo(r).at(-1)).toBe("beneficio:Plano odontológico:despesa_folha_clt:5000:salario");
  });
  it("13º: líquido na subcategoria do 13º, sem bolsa nem benefícios; INSS e IRRF vencem dia 20 do próprio mês", () => {
    const r = planoDaFolha({ ...base, tipo: "decimo_terceiro", rotuloFolha: "13º 2026" });
    expect(resumo(r)).toEqual([
      "liquido_clt::despesa_folha_decimo_terceiro:1000000:salario",
      "inss_retido::despesa_folha_decimo_terceiro:110000:dia20_mesmo_mes",
      "irrf_retido::despesa_folha_decimo_terceiro:40000:dia20_mesmo_mes",
      "fgts::despesa_folha_fgts:96000:dia20",
    ]);
  });
  it("benefício com acento e caixa diferentes ainda é reconhecido", () => {
    const r = planoDaFolha({ ...base, beneficios: [{ nome: "VALE ALIMENTAÇÃO", valorCent: 100 }] });
    expect(r.lancamentos.at(-1)?.chaveCategoria).toBe("despesa_folha_vale_refeicao");
  });
  it("a descrição leva a folha de origem", () => {
    expect(planoDaFolha(base).lancamentos[0].descricao).toBe("Folha CLT (líquido) — folha 10/2026");
  });
});

describe("ehItemDeBeneficio", () => {
  it("reconhece a chave do benefício, com ou sem a contratação na frente", async () => {
    const { ehItemDeBeneficio } = await import("./lancamentos-da-folha");
    expect(ehItemDeBeneficio("beneficio_0")).toBe(true);
    expect(ehItemDeBeneficio("clt:beneficio_12")).toBe(true);
    expect(ehItemDeBeneficio("fgts")).toBe(false);
    expect(ehItemDeBeneficio("estagio:recesso")).toBe(false);
  });
});
