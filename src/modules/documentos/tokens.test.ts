import { describe, it, expect } from "vitest";
import { resolverTexto, formatar, type ContextoDados } from "@/modules/documentos/tokens";

/** Normaliza o NBSP que o toLocaleString pt-BR usa em moeda. */
const n = (s: string) => s.replace(/ /g, " ");

const ctx: ContextoDados = {
  escalar: { ClienteNome: "Alfreds Futterkiste", ProjetoCodigo: "26-0142", Total: 5000 },
  linhas: [
    { Descricao: "Estrutural", Valor: 1200.5, Qtd: 1 },
    { Descricao: "Hidráulica", Valor: 800, Qtd: 2 },
  ],
  pagina: 1,
  paginas: 3,
};

describe("motor de tokens dos documentos", () => {
  it("resolve campo escalar", () => {
    expect(resolverTexto("Cliente: [ClienteNome]", ctx)).toBe("Cliente: Alfreds Futterkiste");
  });

  it("resolve campo com prefixo de fonte (usa o final)", () => {
    expect(resolverTexto("[Clientes.ClienteNome]", ctx)).toBe("Alfreds Futterkiste");
  });

  it("linha atual tem precedência no detalhe", () => {
    const c = { ...ctx, linha: ctx.linhas[0] };
    expect(n(resolverTexto("[Descricao] — [Valor:c2]", c))).toBe("Estrutural — R$ 1.200,50");
  });

  it("agregados Sum/Count/Avg sobre as linhas", () => {
    expect(n(resolverTexto("[Sum(Valor):c2]", ctx))).toBe("R$ 2.000,50");
    expect(resolverTexto("[Count()]", ctx)).toBe("2");
    expect(resolverTexto("[Avg(Qtd):n1]", ctx)).toBe("1,5");
  });

  it("formatos: moeda, número, percentual, data", () => {
    expect(n(formatar(1234.5, "c2"))).toBe("R$ 1.234,50");
    expect(formatar(1234.5, "n0")).toBe("1.235");
    expect(formatar(12.345, "p1")).toBe("12,3%");
    expect(formatar(new Date(2026, 5, 9), "d")).toBe("09/06/2026");
  });

  it("Pagina/Paginas/Hoje", () => {
    expect(resolverTexto("Página [Pagina] de [Paginas]", ctx)).toBe("Página 1 de 3");
    expect(resolverTexto("[Hoje]", ctx)).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it("token desconhecido vira vazio; texto sem token intacto", () => {
    expect(resolverTexto("[NaoExiste]!", ctx)).toBe("!");
    expect(resolverTexto("Sem tokens", ctx)).toBe("Sem tokens");
  });

  it("dois-pontos no texto não vira formato (Net 30: obrigado)", () => {
    expect(resolverTexto("[ClienteNome]: obrigado", ctx)).toBe("Alfreds Futterkiste: obrigado");
  });
});
