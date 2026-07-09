import { describe, it, expect } from "vitest";
import { whereDoAlvo, rolesValidas } from "./service";

describe("rolesValidas", () => {
  it("mantém só roles válidas", () => {
    expect(rolesValidas(["clt", "xyz", "projetista_pj"])).toEqual(["clt", "projetista_pj"]);
  });
  it("vazio quando nada válido", () => {
    expect(rolesValidas(["foo", "bar"])).toEqual([]);
  });
});

describe("whereDoAlvo", () => {
  const vazio = { alvoRoles: [], userIds: [], incluirClientes: false };

  it("todos sem clientes exclui a role cliente", () => {
    expect(whereDoAlvo({ ...vazio, alvoTipo: "todos" })).toEqual({
      ativo: true,
      role: { not: "cliente" },
    });
  });

  it("todos com clientes não filtra por role", () => {
    expect(whereDoAlvo({ ...vazio, alvoTipo: "todos", incluirClientes: true })).toEqual({
      ativo: true,
    });
  });

  it("categoria filtra por roles válidas", () => {
    expect(
      whereDoAlvo({ ...vazio, alvoTipo: "categoria", alvoRoles: ["clt", "invalida", "ti"] }),
    ).toEqual({ ativo: true, role: { in: ["clt", "ti"] } });
  });

  it("usuarios filtra por ids", () => {
    expect(whereDoAlvo({ ...vazio, alvoTipo: "usuarios", userIds: ["a", "b"] })).toEqual({
      ativo: true,
      id: { in: ["a", "b"] },
    });
  });
});
