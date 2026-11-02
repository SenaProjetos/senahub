import { describe, expect, it } from "vitest";
import { BRIEFING_SCHEMA, filtrarSecoes, type SecaoBriefing } from "./briefing-schema";
import { grupoDoTipo, novaChave, novoIdSecao, problemasDeEvolucao, validarEsquema } from "./modelo-schema";

const secao = (campos: SecaoBriefing["campos"], extra: Partial<SecaoBriefing> = {}): SecaoBriefing => ({
  id: "s1",
  titulo: "Geral",
  campos,
  ...extra,
});

describe("validarEsquema", () => {
  it("aceita o modelo padrão embutido", () => {
    const r = validarEsquema(BRIEFING_SCHEMA);
    expect(r.ok).toBe(true);
  });

  it("sim/não ganha as opções fixas e texto perde opções e formato inútil", () => {
    const r = validarEsquema([
      secao([
        { chave: "a", label: "Tem?", tipo: "sim-nao", obrigatorio: false, opcoes: ["x"] },
        { chave: "b", label: "Nome", tipo: "textarea", obrigatorio: false, opcoes: ["x"], formato: "email" },
      ]),
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.esquema[0].campos[0].opcoes).toEqual(["Sim", "Não"]);
    expect(r.esquema[0].campos[1].opcoes).toBeUndefined();
    expect(r.esquema[0].campos[1].formato).toBeUndefined();
  });

  it("escolha única/múltipla/lista pede ao menos duas opções, sem repetição", () => {
    const um = validarEsquema([secao([{ chave: "a", label: "Cor", tipo: "radio", obrigatorio: false, opcoes: ["Azul"] }])]);
    expect(um.ok).toBe(false);
    const rep = validarEsquema([secao([{ chave: "a", label: "Cor", tipo: "select", obrigatorio: false, opcoes: ["Azul", "Azul"] }])]);
    expect(rep.ok).toBe(false);
  });

  it("caixa de ciência tem exatamente um texto", () => {
    const dois = validarEsquema([secao([{ chave: "a", label: "Ciente", tipo: "checkbox-single", obrigatorio: true, opcoes: ["a", "b"] }])]);
    expect(dois.ok).toBe(false);
    const um = validarEsquema([secao([{ chave: "a", label: "Ciente", tipo: "checkbox-single", obrigatorio: true, opcoes: ["Li"] }])]);
    expect(um.ok).toBe(true);
  });

  it("recusa chave repetida, id de seção repetido, pergunta em branco e chave inválida", () => {
    const c = { label: "P", tipo: "text" as const, obrigatorio: false };
    expect(validarEsquema([secao([{ chave: "a", ...c }, { chave: "a", ...c }])]).ok).toBe(false);
    expect(validarEsquema([secao([]), secao([])]).ok).toBe(false);
    expect(validarEsquema([secao([{ chave: "a", ...c, label: "  " }])]).ok).toBe(false);
    expect(validarEsquema([secao([{ chave: "1a b", ...c }])]).ok).toBe(false);
    expect(validarEsquema([]).ok).toBe(false);
  });

  it("formato só vale em texto curto e dentro do catálogo permitido", () => {
    const ok = validarEsquema([secao([{ chave: "a", label: "Mail", tipo: "text", obrigatorio: false, formato: "email" }])]);
    expect(ok.ok && ok.esquema[0].campos[0].formato).toBe("email");
    const ruim = validarEsquema([secao([{ chave: "a", label: "Mail", tipo: "text", obrigatorio: false, formato: "rg" }])]);
    expect(ruim.ok).toBe(false);
  });

  it("termos de disciplina: remove repetidos e vazio vira ausente", () => {
    const r = validarEsquema([secao([], { disciplinas: ["elétric", "elétric"] }), secao([], { id: "s2", disciplinas: [] })]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.esquema[0].disciplinas).toEqual(["elétric"]);
    expect(r.esquema[1].disciplinas).toBeUndefined();
  });
});

describe("problemasDeEvolucao", () => {
  const antes = [
    secao([
      { chave: "a", label: "Texto", tipo: "text", obrigatorio: false },
      { chave: "b", label: "Escolha", tipo: "radio", obrigatorio: false, opcoes: ["x", "y"] },
      { chave: "c", label: "Várias", tipo: "checkbox", obrigatorio: false, opcoes: ["x", "y"] },
    ]),
  ];

  it("permite trocar dentro do grupo (texto↔parágrafo, escolha↔lista↔sim/não)", () => {
    const depois = [
      secao([
        { chave: "a", label: "Texto", tipo: "textarea", obrigatorio: false },
        { chave: "b", label: "Escolha", tipo: "select", obrigatorio: false, opcoes: ["x", "y"] },
        { chave: "c", label: "Várias", tipo: "checkbox", obrigatorio: false, opcoes: ["x", "y"] },
      ]),
    ];
    expect(problemasDeEvolucao(antes, depois)).toEqual([]);
  });

  it("recusa mudar de grupo numa pergunta que já existe", () => {
    const depois = [
      secao([
        { chave: "a", label: "Texto", tipo: "checkbox", obrigatorio: false, opcoes: ["x", "y"] },
        { chave: "b", label: "Escolha", tipo: "checkbox", obrigatorio: false, opcoes: ["x", "y"] },
        { chave: "c", label: "Várias", tipo: "radio", obrigatorio: false, opcoes: ["x", "y"] },
      ]),
    ];
    expect(problemasDeEvolucao(antes, depois)).toHaveLength(3);
  });

  it("pergunta nova (chave nova) e primeiro salvamento não têm restrição", () => {
    const depois = [secao([{ chave: "z", label: "Nova", tipo: "checkbox", obrigatorio: false, opcoes: ["x", "y"] }])];
    expect(problemasDeEvolucao(antes, depois)).toEqual([]);
    expect(problemasDeEvolucao(null, depois)).toEqual([]);
  });

  it("grupos dos tipos", () => {
    expect(grupoDoTipo("sim-nao")).toBe(grupoDoTipo("select"));
    expect(grupoDoTipo("checkbox")).not.toBe(grupoDoTipo("checkbox-single"));
  });
});

describe("geradores de chave", () => {
  it("chave e id são válidos no esquema e determinísticos com sorteio fixo", () => {
    expect(novaChave(() => 0)).toBe("caaaaaaaa");
    expect(novoIdSecao(() => 0.999)).toBe("s99999999");
    expect(novaChave()).toMatch(/^c[a-z0-9]{8}$/);
  });
});

describe("filtrarSecoes por termos (modelo editável)", () => {
  it("ignora acento e caixa; seção sem termo sempre entra", () => {
    const secoes = [
      secao([], { id: "a" }),
      secao([], { id: "b", disciplinas: ["eletric"] }),
      secao([], { id: "c", disciplinas: ["Hidráulica"] }),
    ];
    expect(filtrarSecoes(["PROJETO ELÉTRICO"], secoes).map((s) => s.id)).toEqual(["a", "b"]);
    expect(filtrarSecoes(["hidraulica"], secoes).map((s) => s.id)).toEqual(["a", "c"]);
    expect(filtrarSecoes([], secoes)).toHaveLength(3);
  });

  it("o padrão embutido filtra como os regex antigos", () => {
    const ids = (d: string[]) => filtrarSecoes(d).map((s) => s.id);
    expect(ids(["Prevenção e Combate a Incêndio"])).toContain("incendio");
    expect(ids(["Ar-condicionado"])).toContain("climatizacao");
    expect(ids(["Hidrossanitário"])).toContain("hidrossanitario");
    expect(ids(["Arquitetura"])).toEqual(["dados-gerais", "declaracao"]);
  });
});
