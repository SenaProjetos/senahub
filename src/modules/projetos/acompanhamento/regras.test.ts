import { describe, expect, it } from "vitest";
import {
  assuntoDoAcompanhamento,
  cabecalhosDeConversa,
  destinatariosValidos,
  listaEmMarkdown,
  novoMessageId,
  separarItens,
  type ItemEnviado,
} from "./regras";

describe("destinatariosValidos", () => {
  it("tira optOut, sem e-mail e formato inválido", () => {
    const r = destinatariosValidos(
      [
        { email: "a@x.com", optOut: false },
        { email: "b@x.com", optOut: true },
        { email: null, optOut: false },
        { email: "nao-e-email", optOut: false },
      ],
      [],
    );
    expect(r).toEqual(["a@x.com"]);
  });

  it("junta os extras, aparando e sem repetir com caixa diferente", () => {
    const r = destinatariosValidos([{ email: "Ana@X.com", optOut: false }], [" ana@x.COM ", "outro@y.com", ""]);
    expect(r).toEqual(["ana@x.com", "outro@y.com"]);
  });
});

describe("separarItens", () => {
  const item = (id: string, dia: string): ItemEnviado => ({ revisaoId: id, rotulo: id, enviadoEm: new Date(`${dia}T12:00:00Z`) });
  const itens = [item("a", "2026-10-01"), item("b", "2026-10-20")];

  it("sem último envio, tudo é novo", () => {
    expect(separarItens(itens, null)).toEqual({ novos: itens, anteriores: [] });
  });

  it("novo é o marcado depois do último envio", () => {
    const r = separarItens(itens, new Date("2026-10-10T00:00:00Z"));
    expect(r.novos.map((i) => i.revisaoId)).toEqual(["b"]);
    expect(r.anteriores.map((i) => i.revisaoId)).toEqual(["a"]);
  });
});

describe("listaEmMarkdown, assunto e message-id", () => {
  it("uma linha por item", () => {
    expect(listaEmMarkdown([{ rotulo: "R01 · Planta" }, { rotulo: "R02 · Corte" }])).toBe("- R01 · Planta\n- R02 · Corte");
  });

  it("assunto fixo por projeto", () => {
    expect(assuntoDoAcompanhamento("260142", "Residencial Villa Verde")).toBe("Acompanhamento — 260142 Residencial Villa Verde");
  });

  it("message-id no formato <...@domínio>", () => {
    expect(novoMessageId("p1", "abc", "senahub.local")).toBe("<acomp.p1.abc@senahub.local>");
  });
});

describe("cabecalhosDeConversa", () => {
  it("primeiro envio não tem cabeçalhos de resposta", () => {
    expect(cabecalhosDeConversa([])).toEqual({});
  });

  it("do segundo em diante responde ao último e referencia todos, do mais antigo ao mais novo", () => {
    expect(cabecalhosDeConversa(["<1@x>"])).toEqual({ inReplyTo: "<1@x>", references: "<1@x>" });
    expect(cabecalhosDeConversa(["<1@x>", "<2@x>", "<3@x>"])).toEqual({
      inReplyTo: "<3@x>",
      references: "<1@x> <2@x> <3@x>",
    });
  });
});
