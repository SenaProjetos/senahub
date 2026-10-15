import { describe, expect, it } from "vitest";
import { candidatosSchema, linkarSchema } from "./schemas";

describe("schemas do link — mensagens em pt-BR", () => {
  it("id vazio", () => {
    expect(candidatosSchema.safeParse({ modo: "ficha", id: "" }).error?.issues[0]?.message).toBe("Registro não informado.");
  });
  it("modo inválido", () => {
    expect(candidatosSchema.safeParse({ modo: "x", id: "a" }).error?.issues[0]?.message).toBe("Origem do link inválida.");
  });
  it("mais de 100 arquivos", () => {
    const arquivos = Array.from({ length: 101 }, (_, i) => ({ chave: `lead:${i}`, exibirEmRecebidos: false }));
    const r = linkarSchema.safeParse({ projetoId: "p", negociacaoId: "n", arquivos, incluirResumo: false });
    expect(r.error?.issues[0]?.message).toBe("Escolha no máximo 100 arquivos por vez.");
  });
  it("booleano ausente", () => {
    const r = linkarSchema.safeParse({ projetoId: "p", negociacaoId: "n", arquivos: [] });
    expect(r.error?.issues[0]?.message).toBe("Valor inválido.");
  });
});
