import { describe, expect, it, vi } from "vitest";

const pares = new Set<string>();
vi.mock("@/lib/permissions", () => ({
  can: async (s: { id: string }, r: string, a: string) => pares.has(`${s.id}:${r}:${a}`),
}));

import { podeVerCusto } from "./custo-visivel";

const pessoa = (id: string, extra: Partial<{ superUsuario: boolean; ehSocio: boolean }> = {}) => ({
  id, ativo: true, perfilId: "p", superUsuario: false, ehSocio: false, ...extra,
});

describe("podeVerCusto (decisão 26: admin e sócios)", () => {
  it("superusuário e sócio veem; os outros só com o par ponto:custo", async () => {
    pares.add("c:ponto:custo");
    expect(await podeVerCusto(pessoa("a", { superUsuario: true }))).toBe(true);
    expect(await podeVerCusto(pessoa("b", { ehSocio: true }))).toBe(true);
    expect(await podeVerCusto(pessoa("c"))).toBe(true);
    expect(await podeVerCusto(pessoa("d"))).toBe(false);
  });
});
