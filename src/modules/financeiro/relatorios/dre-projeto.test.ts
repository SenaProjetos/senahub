import { describe, it, expect } from "vitest";
import { calcularRentabilidade, rentabilidadePorCliente, agruparPorCoordenador, type ProjetoEntrada } from "./dre-projeto";

const projetos: ProjetoEntrada[] = [
  { projetoId: "a", codigo: "260001", nome: "A", cliente: "Cliente X", receita: 8000, diretos: 3000 },
  { projetoId: "b", codigo: "260002", nome: "B", cliente: "Cliente Y", receita: 2000, diretos: 1500 },
];

describe("calcularRentabilidade", () => {
  it("rateia indiretos na proporção da receita", () => {
    const r = calcularRentabilidade(projetos, 1000); // receita total 10000
    const a = r.projetos.find((p) => p.projetoId === "a")!;
    const b = r.projetos.find((p) => p.projetoId === "b")!;
    expect(a.indiretoRateado).toBe(800); // 1000 * 8000/10000
    expect(b.indiretoRateado).toBe(200);
    expect(a.lucroBruto).toBe(5000); // 8000-3000
    expect(a.lucroLiquido).toBe(4200); // 5000-800
    expect(b.lucroLiquido).toBe(300); // 500-200
  });

  it("calcula margens e ROI", () => {
    const r = calcularRentabilidade(projetos, 1000);
    const a = r.projetos.find((p) => p.projetoId === "a")!;
    expect(a.margemBruta).toBeCloseTo(62.5); // 5000/8000
    expect(a.margemLiquida).toBeCloseTo(52.5); // 4200/8000
    expect(a.roi).toBeCloseTo(110.5); // 4200/(3000+800)=1.105
  });

  it("ordena por lucro líquido e agrega totais", () => {
    const r = calcularRentabilidade(projetos, 1000);
    expect(r.projetos[0].projetoId).toBe("a");
    expect(r.totais.receita).toBe(10000);
    expect(r.totais.lucroLiquido).toBe(4500); // 6500 bruto - 1000 indireto
  });

  it("alerta projetos abaixo da margem mínima", () => {
    const r = calcularRentabilidade(projetos, 1000, 20); // margem mínima 20%
    // B: margem líquida 300/2000 = 15% < 20 -> alerta
    expect(r.alertas.map((p) => p.projetoId)).toEqual(["b"]);
  });

  it("sem receita total não rateia (evita divisão por zero)", () => {
    const r = calcularRentabilidade([{ projetoId: "z", codigo: "1", nome: "Z", cliente: null, receita: 0, diretos: 500 }], 1000);
    expect(r.projetos[0].indiretoRateado).toBe(0);
    expect(r.projetos[0].margemBruta).toBeNull();
  });
});

describe("rentabilidadePorCliente", () => {
  it("agrupa por cliente e ordena por lucro", () => {
    const r = calcularRentabilidade(projetos, 0);
    const clientes = rentabilidadePorCliente(r.projetos);
    expect(clientes[0].cliente).toBe("Cliente X");
    expect(clientes[0].lucroLiquido).toBe(5000);
    expect(clientes).toHaveLength(2);
  });
});

describe("agruparPorCoordenador", () => {
  it("agrupa por coordenador; sem mapeamento vira 'Sem coordenador'", () => {
    const r = calcularRentabilidade(projetos, 0);
    const porCoord = agruparPorCoordenador(r.projetos, { a: "Ana" });
    expect(porCoord.find((c) => c.coordenador === "Ana")?.lucroLiquido).toBe(5000);
    expect(porCoord.find((c) => c.coordenador === "Sem coordenador")?.projetos).toBe(1);
  });
});
