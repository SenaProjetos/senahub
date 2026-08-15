import { describe, it, expect } from "vitest";
import {
  normalizarDocumento,
  normalizarNomeEmpresa,
  dominioCorporativo,
  dominioDoSite,
  normalizarTelefone,
  similaridade,
  candidatosDuplicata,
  type ClienteResumoDedupe,
} from "./dedupe";

describe("normalizarDocumento", () => {
  it("só dígitos", () => {
    expect(normalizarDocumento("12.345.678/0001-90")).toBe("12345678000190");
    expect(normalizarDocumento("123.456.789-00")).toBe("12345678900");
  });

  it("null/vazio → null", () => {
    expect(normalizarDocumento(null)).toBeNull();
    expect(normalizarDocumento("")).toBeNull();
    expect(normalizarDocumento("...")).toBeNull();
  });
});

describe("normalizarNomeEmpresa", () => {
  it("casa NOMINAL ENGENHARIA com Nominal Engenharia LTDA — o caso real que motivou a fusão do grupo (03-migracao.md §4)", () => {
    expect(normalizarNomeEmpresa("NOMINAL ENGENHARIA", "PJ")).toBe(
      normalizarNomeEmpresa("Nominal Engenharia LTDA", "PJ"),
    );
  });

  it("reproduz os 3 grupos reais de duplicata de produção", () => {
    // MADANO — grafia idêntica, só case.
    expect(normalizarNomeEmpresa("MADANO", "PJ")).toBe(normalizarNomeEmpresa("Madano", "PJ"));
    // Záphis Incorporadora — 3 registros, mesma grafia.
    const zaphis = normalizarNomeEmpresa("Záphis Incorporadora", "PJ");
    expect(normalizarNomeEmpresa("Záphis Incorporadora", "PJ")).toBe(zaphis);
    expect(normalizarNomeEmpresa("ZÁPHIS INCORPORADORA", "PJ")).toBe(zaphis);
    // Nominal Engenharia — sufixo + case, já coberto acima.
    expect(normalizarNomeEmpresa("NOMINAL ENGENHARIA", "PJ")).toBe(
      normalizarNomeEmpresa("Nominal Engenharia LTDA", "PJ"),
    );
  });

  it("remove acento, pontuação e colapsa espaços", () => {
    expect(normalizarNomeEmpresa("Záphis  Incorporadora.", "PJ")).toBe("zaphis incorporadora");
  });

  it("remove sufixo societário só em PJ", () => {
    expect(normalizarNomeEmpresa("Construtora Alfa Ltda", "PJ")).toBe("construtora alfa");
    expect(normalizarNomeEmpresa("Beta Engenharia EPP", "PJ")).toBe("beta engenharia");
  });

  it("NÃO come 'Sá' nem 'Me' em nome de pessoa física", () => {
    expect(normalizarNomeEmpresa("Sá", "PF")).toBe("sa");
    expect(normalizarNomeEmpresa("Me Chame de Ana", "PF")).toBe("me chame de ana");
  });

  it("default é PJ quando o tipo não é informado", () => {
    expect(normalizarNomeEmpresa("Construtora Alfa Ltda")).toBe("construtora alfa");
  });
});

describe("dominioCorporativo", () => {
  it("extrai o domínio do e-mail", () => {
    expect(dominioCorporativo("contato@construtoraalfa.com.br")).toBe("construtoraalfa.com.br");
  });

  it("ignora provedor público — não identifica empresa", () => {
    expect(dominioCorporativo("joao@gmail.com")).toBeNull();
    expect(dominioCorporativo("maria@hotmail.com")).toBeNull();
  });

  it("null/sem @ → null", () => {
    expect(dominioCorporativo(null)).toBeNull();
    expect(dominioCorporativo("nao-e-email")).toBeNull();
  });
});

describe("dominioDoSite", () => {
  it("extrai domínio com ou sem protocolo, removendo www", () => {
    expect(dominioDoSite("https://www.construtoraalfa.com.br/sobre")).toBe(
      "construtoraalfa.com.br",
    );
    expect(dominioDoSite("construtoraalfa.com.br")).toBe("construtoraalfa.com.br");
    expect(dominioDoSite("www.construtoraalfa.com.br")).toBe("construtoraalfa.com.br");
  });

  it("null/vazio/inválido → null", () => {
    expect(dominioDoSite(null)).toBeNull();
    expect(dominioDoSite("")).toBeNull();
    expect(dominioDoSite("http://")).toBeNull();
  });
});

describe("normalizarTelefone", () => {
  it("celular com DDD e máscara → E.164", () => {
    expect(normalizarTelefone("(81) 99999-9999")).toBe("+5581999999999");
  });

  it("fixo com DDD (10 dígitos) → E.164", () => {
    expect(normalizarTelefone("81 3333-4444")).toBe("+558133334444");
  });

  it("já com código do país → só adiciona o +", () => {
    expect(normalizarTelefone("+55 81 99999-9999")).toBe("+5581999999999");
    expect(normalizarTelefone("5581999999999")).toBe("+5581999999999");
  });

  it("mesmo número em formatos diferentes normaliza igual — é o objetivo do dedupe", () => {
    const a = normalizarTelefone("(81) 99999-9999");
    const b = normalizarTelefone("81999999999");
    const c = normalizarTelefone("+55 81 9 9999-9999");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("comprimento não reconhecível → null, nunca um número errado", () => {
    expect(normalizarTelefone("123")).toBeNull();
    expect(normalizarTelefone("99999")).toBeNull();
  });

  it("null/vazio → null", () => {
    expect(normalizarTelefone(null)).toBeNull();
    expect(normalizarTelefone("")).toBeNull();
  });
});

describe("similaridade", () => {
  it("strings idênticas → 1", () => {
    expect(similaridade("nominal engenharia", "nominal engenharia")).toBe(1);
  });

  it("strings totalmente diferentes → próximo de 0", () => {
    expect(similaridade("abc", "xyz")).toBe(0);
  });

  it("quase igual (erro de digitação) → score alto, mas não 1", () => {
    const s = similaridade("construtora alfa", "construtora alfaa");
    expect(s).toBeGreaterThan(0.9);
    expect(s).toBeLessThan(1);
  });

  it("duas strings vazias são consideradas idênticas", () => {
    expect(similaridade("", "")).toBe(1);
  });

  it("é simétrica", () => {
    expect(similaridade("madano", "madano ltda")).toBe(similaridade("madano ltda", "madano"));
  });
});

describe("candidatosDuplicata", () => {
  const madano: ClienteResumoDedupe = {
    id: "c1",
    nome: "MADANO",
    tipo: "PJ",
    documento: null,
    email: null,
  };
  const zaphis: ClienteResumoDedupe = {
    id: "c2",
    nome: "Záphis Incorporadora",
    tipo: "PJ",
    documento: "11222333000144",
    email: "contato@zaphis.com.br",
  };
  const existentes = [madano, zaphis];

  it('digitar "Madano" na criação acha o candidato existente por nome exato — caso do aceite (F1.13)', () => {
    const r = candidatosDuplicata(existentes, { nome: "Madano", tipo: "PJ" });
    expect(r).toHaveLength(1);
    expect(r[0].cliente.id).toBe("c1");
    expect(r[0].motivo).toBe("nome_exato");
  });

  it("acha por documento normalizado, mesmo com máscara diferente", () => {
    const r = candidatosDuplicata(existentes, { documento: "11.222.333/0001-44" });
    expect(r).toHaveLength(1);
    expect(r[0].cliente.id).toBe("c2");
    expect(r[0].motivo).toBe("documento");
  });

  it("acha por domínio de e-mail corporativo igual", () => {
    const r = candidatosDuplicata(existentes, { email: "financeiro@zaphis.com.br" });
    expect(r[0].cliente.id).toBe("c2");
    expect(r[0].motivo).toBe("email");
  });

  it("e-mail de provedor público nunca vira candidato — não identifica empresa", () => {
    const r = candidatosDuplicata(
      [{ ...zaphis, email: "zaphis@gmail.com" }],
      { email: "outraempresa@gmail.com" },
    );
    expect(r).toHaveLength(0);
  });

  it("nome parecido (erro de digitação) entra como nome_similar, abaixo do limiar de nome_exato", () => {
    const r = candidatosDuplicata(existentes, { nome: "Madanoo", tipo: "PJ" });
    expect(r).toHaveLength(1);
    expect(r[0].motivo).toBe("nome_similar");
    expect(r[0].score).toBeGreaterThanOrEqual(0.85);
  });

  it("nome muito diferente não gera candidato nenhum", () => {
    const r = candidatosDuplicata(existentes, { nome: "Construtora Beta", tipo: "PJ" });
    expect(r).toHaveLength(0);
  });

  it("documento é o sinal mais forte: quando bate, some com o candidato mesmo se o nome também batesse por outro motivo", () => {
    const r = candidatosDuplicata(existentes, {
      nome: "Záphis Incorporadora",
      tipo: "PJ",
      documento: "11.222.333/0001-44",
    });
    expect(r).toHaveLength(1);
    expect(r[0].motivo).toBe("documento"); // não "nome_exato", mesmo o nome também batendo
  });

  it("mesmo cliente batendo por dois motivos aparece uma vez só, com o motivo mais forte", () => {
    const r = candidatosDuplicata(existentes, {
      nome: "Záphis Incorporadora",
      tipo: "PJ",
      email: "outro@zaphis.com.br",
    });
    expect(r).toHaveLength(1);
    expect(r[0].motivo).toBe("nome_exato"); // nome_exato (3) > email (2)
  });

  it("entrada vazia não gera candidato nenhum", () => {
    expect(candidatosDuplicata(existentes, {})).toHaveLength(0);
  });

  it("reproduz o grupo Záphis (3 registros reais em produção) — todos batem entre si", () => {
    const grupo: ClienteResumoDedupe[] = [
      { id: "z1", nome: "Záphis Incorporadora", tipo: "PJ", documento: null, email: null },
      { id: "z2", nome: "Záphis Incorporadora", tipo: "PJ", documento: null, email: null },
    ];
    const r = candidatosDuplicata(grupo, { nome: "Záphis Incorporadora", tipo: "PJ" });
    expect(r).toHaveLength(2);
    expect(r.every((c) => c.motivo === "nome_exato")).toBe(true);
  });
});
