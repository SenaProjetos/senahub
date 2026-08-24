import { describe, expect, it } from "vitest";
import { responsavelOuVeTodas } from "./acesso";

describe("responsavelOuVeTodas", () => {
  const responsaveis = [{ userId: "ana" }, { userId: "bruno" }];

  it("permite quem pode ver todas as disciplinas", () => {
    expect(responsavelOuVeTodas("carla", true, responsaveis)).toBe(true);
  });

  it("permite responsável da disciplina sem visão ampla", () => {
    expect(responsavelOuVeTodas("ana", false, responsaveis)).toBe(true);
  });

  it("nega quem não é responsável sem visão ampla", () => {
    expect(responsavelOuVeTodas("carla", false, responsaveis)).toBe(false);
  });
});
