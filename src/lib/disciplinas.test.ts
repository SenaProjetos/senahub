import { describe, it, expect } from "vitest";
import { keyDisciplina } from "./disciplinas-core";

describe("keyDisciplina", () => {
  it.each([
    ["Arquitetura", "arquitetura"],
    ["Arquitetônico", "arquitetura"],
    ["Estrutural", "estrutural"],
    ["Fundações", "fundacoes"],
    ["Hidrossanitário", "hidrossanitario"],
    ["Hidráulica", "hidrossanitario"],
    ["Elétrico", "eletrico"],
    ["Incêndio (PPCI)", "incendio"],
    ["Climatização (AVAC)", "climatizacao"],
    ["Terraplenagem", "terraplenagem"],
    ["Lógica", "telecom"],
    ["Drenagem", "hidrossanitario"],
    ["CFTV", "seguranca"],
  ])("mapeia %s (tolerante a acento/caixa)", (nome, key) => {
    expect(keyDisciplina(nome)).toBe(key);
    expect(keyDisciplina(nome.toUpperCase())).toBe(key);
  });

  it("cai em 'outra' para disciplina desconhecida", () => {
    expect(keyDisciplina("Paisagismo")).toBe("outra");
  });
});
