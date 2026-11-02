import { describe, expect, it } from "vitest";
import {
  assuntoDoAcompanhamento,
  cabecalhosDeConversa,
  destinatariosValidos,
  escaparMarkdown,
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
  const item = (id: string): ItemEnviado => ({ revisaoId: id, rotulo: id, enviadoEm: new Date("2026-10-01T12:00:00Z") });
  const itens = [item("a"), item("b"), item("c")];

  it("sem nenhum envio anterior, tudo é novo", () => {
    expect(separarItens(itens, new Set())).toEqual({ novos: itens, anteriores: [] });
  });

  it("novo é o que nenhum e-mail anterior listou — mesmo que o envio anterior tenha levado só parte dos novos", () => {
    const r = separarItens(itens, new Set(["a"]));
    expect(r.novos.map((i) => i.revisaoId)).toEqual(["b", "c"]);
    expect(r.anteriores.map((i) => i.revisaoId)).toEqual(["a"]);
  });
});

describe("escaparMarkdown", () => {
  it("neutraliza HTML, links e formatação vindos de texto livre", () => {
    expect(escaparMarkdown("<a href=x>clique</a>")).toBe("\\<a href=x\\>clique\\</a\\>");
    expect(escaparMarkdown("[ver](http://x.com) **forte** _it_")).toBe("\\[ver\\]\\(http://x.com\\) \\*\\*forte\\*\\* \\_it\\_");
  });

  it("texto comum fica como está", () => {
    expect(escaparMarkdown("Planta de forma do pavimento tipo")).toBe("Planta de forma do pavimento tipo");
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
