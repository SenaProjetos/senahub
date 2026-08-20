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
  const vazio = {
    alvoRoles: [],
    alvoSetores: [],
    alvoContratacoes: [],
    alvoPerfis: [],
    userIds: [],
    incluirClientes: false,
  };

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

  it("setor filtra pelo eixo Setor", () => {
    expect(
      whereDoAlvo({ ...vazio, alvoTipo: "setor", alvoSetores: ["engenharia", "ti"] }),
    ).toEqual({ ativo: true, setor: { in: ["engenharia", "ti"] } });
  });

  it("contratacao filtra pelo eixo Contratacao", () => {
    expect(
      whereDoAlvo({ ...vazio, alvoTipo: "contratacao", alvoContratacoes: ["clt", "estagio"] }),
    ).toEqual({ ativo: true, contratacao: { in: ["clt", "estagio"] } });
  });

  it("perfil filtra pela CHAVE do perfil de acesso, não pelo id", () => {
    expect(
      whereDoAlvo({ ...vazio, alvoTipo: "perfil", alvoPerfis: ["coordenador", "clt"] }),
    ).toEqual({ ativo: true, perfil: { chave: { in: ["coordenador", "clt"] } } });
  });

  it("os eixos novos NÃO caem no ramo de todos — cada um filtra o seu", () => {
    // O bug que este switch fecha: antes, qualquer tipo não reconhecido caía no `return`
    // final, que é `todos`. Um aviso de setor viraria disparo para a empresa inteira.
    const todos = whereDoAlvo({ ...vazio, alvoTipo: "todos" });
    for (const w of [
      whereDoAlvo({ ...vazio, alvoTipo: "setor", alvoSetores: ["engenharia"] }),
      whereDoAlvo({ ...vazio, alvoTipo: "contratacao", alvoContratacoes: ["pj"] }),
      whereDoAlvo({ ...vazio, alvoTipo: "perfil", alvoPerfis: ["ti"] }),
    ]) {
      expect(w).not.toEqual(todos);
    }
  });

  it("tipo desconhecido não notifica NINGUÉM (fail-closed), nunca a base inteira", () => {
    // Simula dado gravado por uma versão mais nova do código após rollback — o único caminho
    // pelo qual isto chega em runtime. Em fan-out, "todo mundo" é o pior default possível.
    const w = whereDoAlvo({
      ...vazio,
      alvoTipo: "algo_que_ainda_nao_existe" as never,
    });
    expect(w).toEqual({ id: { in: [] } });
    expect(w).not.toEqual({ ativo: true });
    expect(w).not.toEqual({ ativo: true, role: { not: "cliente" } });
  });
});
