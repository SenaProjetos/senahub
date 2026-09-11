import { describe, it, expect } from "vitest";
import {
  temValorPagavel,
  separarPagaveis,
  lerFiltrosFolha,
  whereDoStatus,
  temFiltroAlemDoStatus,
  diasPendenteParado,
} from "@/modules/financeiro/folha/service";

describe("lerFiltrosFolha", () => {
  it("URL vazia cai no padrão: status null (esconde cancelados), sem filtros", () => {
    expect(lerFiltrosFolha({})).toEqual({ status: null, projetistaId: "", projetoId: "", de: "", ate: "", q: "" });
  });
  it("aceita os quatro status válidos", () => {
    for (const s of ["pendente", "pago", "cancelado", "todos"]) {
      expect(lerFiltrosFolha({ status: s }).status).toBe(s);
    }
  });
  it("status inválido cai no padrão em vez de quebrar", () => {
    expect(lerFiltrosFolha({ status: "hackeado" }).status).toBeNull();
  });
  it("data fora de yyyy-mm-dd é descartada", () => {
    const f = lerFiltrosFolha({ de: "01/04/2026", ate: "2026-04-30" });
    expect(f.de).toBe("");
    expect(f.ate).toBe("2026-04-30");
  });
  it("parâmetro repetido na URL usa o primeiro e apara espaços", () => {
    expect(lerFiltrosFolha({ q: ["  Ana ", "Bruno"] }).q).toBe("Ana");
  });
});

describe("whereDoStatus", () => {
  it("padrão esconde cancelados", () => {
    expect(whereDoStatus(null)).toEqual({ status: { not: "cancelado" } });
  });
  it("todos não filtra", () => {
    expect(whereDoStatus("todos")).toEqual({});
  });
  it("status específico filtra por igualdade", () => {
    expect(whereDoStatus("cancelado")).toEqual({ status: "cancelado" });
  });
});

describe("temFiltroAlemDoStatus", () => {
  const base = lerFiltrosFolha({});
  it("status sozinho não conta", () => {
    expect(temFiltroAlemDoStatus({ ...base, status: "pago" })).toBe(false);
  });
  it("qualquer outro filtro conta", () => {
    expect(temFiltroAlemDoStatus({ ...base, q: "ana" })).toBe(true);
    expect(temFiltroAlemDoStatus({ ...base, de: "2026-04-01" })).toBe(true);
  });
});

describe("diasPendenteParado", () => {
  const agora = new Date(2026, 8, 10, 15, 0); // 10/09/2026, 15h local
  it("abaixo do limite de 30 dias não marca", () => {
    expect(diasPendenteParado(new Date(2026, 7, 20, 10, 0), agora)).toBeNull();
  });
  it("no limite exato marca", () => {
    expect(diasPendenteParado(new Date(2026, 7, 11, 23, 0), agora)).toBe(30);
  });
  it("bem acima do limite devolve os dias", () => {
    expect(diasPendenteParado(new Date(2026, 3, 10, 9, 0), agora)).toBe(153);
  });
});

/** Imita o Decimal do Prisma: objeto cujo `toString()` devolve o valor. */
const dec = (s: string) => ({ toString: () => s });

describe("temValorPagavel", () => {
  it("recusa zero", () => {
    expect(temValorPagavel(0)).toBe(false);
  });
  it("recusa Decimal zerado vindo do banco", () => {
    expect(temValorPagavel(dec("0.00"))).toBe(false);
  });
  it("recusa valor negativo", () => {
    expect(temValorPagavel(-10)).toBe(false);
  });
  it("aceita o menor valor positivo", () => {
    expect(temValorPagavel(0.01)).toBe(true);
  });
  it("aceita Decimal positivo vindo do banco", () => {
    expect(temValorPagavel(dec("1800.00"))).toBe(true);
  });
});

describe("separarPagaveis", () => {
  it("separa as linhas zeradas das pagáveis, preservando a ordem", () => {
    const r = separarPagaveis([
      { id: "a", valor: 100 },
      { id: "b", valor: 0 },
      { id: "c", valor: dec("250.50") },
      { id: "d", valor: dec("0.00") },
    ]);
    expect(r.pagaveis.map((p) => p.id)).toEqual(["a", "c"]);
    expect(r.semValor.map((p) => p.id)).toEqual(["b", "d"]);
  });
  it("lote todo zerado não tem nada pagável", () => {
    const r = separarPagaveis([{ id: "a", valor: 0 }]);
    expect(r.pagaveis).toEqual([]);
    expect(r.semValor).toHaveLength(1);
  });
  it("lote vazio devolve as duas listas vazias", () => {
    expect(separarPagaveis([])).toEqual({ pagaveis: [], semValor: [] });
  });
});
