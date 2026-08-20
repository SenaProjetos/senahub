import { describe, expect, it } from "vitest";
import {
  inicioDoPeriodo,
  lerFiltros,
  temFiltroAtivo,
  whereNegociacao,
  whereProspeccao,
} from "./filtros";

const VAZIO = {
  responsavelId: null,
  campanhaId: null,
  canalId: null,
  clienteId: null,
  temperatura: null,
  periodo: null,
  disciplinaId: null,
};

describe("lerFiltros", () => {
  it("URL sem nada devolve tudo nulo", () => {
    expect(lerFiltros({})).toEqual(VAZIO);
  });

  it("lê cada chave da URL", () => {
    expect(
      lerFiltros({
        resp: "u1",
        camp: "k1",
        canal: "c1",
        empresa: "e1",
        temp: "QUENTE",
        periodo: "30d",
        disc: "d1",
      }),
    ).toEqual({
      responsavelId: "u1",
      campanhaId: "k1",
      canalId: "c1",
      clienteId: "e1",
      temperatura: "QUENTE",
      periodo: "30d",
      disciplinaId: "d1",
    });
  });

  it("valor inválido é tratado como AUSENTE, não como erro", () => {
    // A URL é editável por qualquer um. `?temp=BANANA` colado errado deve mostrar a lista
    // completa, não derrubar a página.
    expect(lerFiltros({ temp: "BANANA" }).temperatura).toBeNull();
    expect(lerFiltros({ periodo: "300anos" }).periodo).toBeNull();
  });

  it("string vazia e espaços não contam como filtro", () => {
    expect(lerFiltros({ resp: "", camp: "   " })).toEqual(VAZIO);
  });

  it("chave repetida na URL usa o primeiro valor", () => {
    // `?resp=a&resp=b` chega como array no Next.
    expect(lerFiltros({ resp: ["a", "b"] }).responsavelId).toBe("a");
  });
});

describe("temFiltroAtivo", () => {
  it("falso sem nenhum filtro", () => {
    expect(temFiltroAtivo(VAZIO)).toBe(false);
  });

  it("verdadeiro com qualquer um preenchido", () => {
    expect(temFiltroAtivo({ ...VAZIO, canalId: "c1" })).toBe(true);
    expect(temFiltroAtivo({ ...VAZIO, temperatura: "FRIO" })).toBe(true);
  });
});

describe("inicioDoPeriodo — relógio injetado", () => {
  const agora = new Date("2026-08-20T12:00:00Z");

  it("sem período não há recorte", () => {
    expect(inicioDoPeriodo(null, agora)).toBeNull();
  });

  it("cada período recua a distância certa", () => {
    expect(inicioDoPeriodo("7d", agora)?.toISOString()).toBe("2026-08-13T12:00:00.000Z");
    expect(inicioDoPeriodo("30d", agora)?.toISOString()).toBe("2026-07-21T12:00:00.000Z");
    expect(inicioDoPeriodo("90d", agora)?.toISOString()).toBe("2026-05-22T12:00:00.000Z");
    expect(inicioDoPeriodo("12m", agora)?.toISOString()).toBe("2025-08-20T12:00:00.000Z");
  });
});

describe("whereProspeccao / whereNegociacao", () => {
  const agora = new Date("2026-08-20T12:00:00Z");

  it("sem filtro, todo campo é undefined — o Prisma ignora e não filtra nada", () => {
    const w = whereProspeccao(VAZIO, agora);
    for (const v of Object.values(w)) expect(v).toBeUndefined();
  });

  it("repassa os ids escolhidos", () => {
    const w = whereProspeccao({ ...VAZIO, responsavelId: "u1", clienteId: "e1" }, agora);
    expect(w.responsavelId).toBe("u1");
    expect(w.clienteId).toBe("e1");
    expect(w.canalId).toBeUndefined();
  });

  it("período vira recorte de createdAt", () => {
    const w = whereProspeccao({ ...VAZIO, periodo: "30d" }, agora);
    expect(w.createdAt).toEqual({ gte: new Date("2026-07-21T12:00:00.000Z") });
  });

  it("disciplina NÃO entra na prospecção — ela não tem disciplinas", () => {
    // Se entrasse, o filtro devolveria vazio sempre e pareceria bug.
    const w = whereProspeccao({ ...VAZIO, disciplinaId: "d1" }, agora) as Record<string, unknown>;
    expect(w.disciplinas).toBeUndefined();
  });

  it("disciplina entra na negociação como `some`", () => {
    const w = whereNegociacao({ ...VAZIO, disciplinaId: "d1" }, agora);
    expect(w.disciplinas).toEqual({ some: { disciplinaId: "d1" } });
  });

  it("negociação sem filtro de disciplina não restringe", () => {
    expect(whereNegociacao(VAZIO, agora).disciplinas).toBeUndefined();
  });
});
