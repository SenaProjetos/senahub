import { describe, expect, it } from "vitest";
import { destinatariosDaConclusao, textoConclusao } from "./conclusao-aviso";

describe("destinatariosDaConclusao", () => {
  it("vai para a coordenação do projeto, sem quem concluiu e sem repetir", () => {
    expect(destinatariosDaConclusao({ coordenadores: ["c1", "c2", "c1", "eu"], gestores: ["g1"], autorId: "eu" })).toEqual(["c1", "c2"]);
  });
  it("sem coordenador, cai nos gestores", () => {
    expect(destinatariosDaConclusao({ coordenadores: [], gestores: ["g1", "g2"], autorId: "x" })).toEqual(["g1", "g2"]);
  });
  it("quem concluiu sendo o único destinatário: ninguém a avisar", () => {
    expect(destinatariosDaConclusao({ coordenadores: ["eu"], gestores: ["g1"], autorId: "eu" })).toEqual([]);
  });
});

describe("textoConclusao", () => {
  it("diz a atividade, quem concluiu e o projeto", () => {
    const t = textoConclusao({ atividade: "Modelagem", autorNome: "Maria", projetoCodigo: "26.012" });
    expect(t.titulo).toBe("Atividade concluída: Modelagem");
    expect(t.corpo).toContain("Maria");
    expect(t.corpo).toContain("26.012");
  });
});
