import { describe, expect, it } from "vitest";
import { candidatosDuplicata, relevanciaNome, tokensDeBusca } from "./dedupe";
import { criarProspeccaoRapidaSchema } from "./schemas";

const entradaBase = {
  urlAlvo: "contato" as const,
  empresa: { nome: "Construtora Exemplo" },
  contato: { nome: "Ana" },
  canalId: "canal-indicacao",
  abordagem: { tipo: "NOTA" as const, nota: "Demanda recebida por indicação." },
};

describe("schema da entrada comercial", () => {
  it("mantém acompanhamento como destino padrão para chamadas antigas", () => {
    const parsed = criarProspeccaoRapidaSchema.parse(entradaBase);
    expect(parsed.destino).toBe("ACOMPANHAR");
  });

  it("exige o nome da demanda ao abrir uma negociação imediatamente", () => {
    const parsed = criarProspeccaoRapidaSchema.safeParse({
      ...entradaBase,
      destino: "ABRIR_NEGOCIACAO",
      tituloDemanda: "   ",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path[0] === "tituloDemanda")).toBe(true);
    }
  });

  it("aceita uma nova demanda que abre negociação", () => {
    const parsed = criarProspeccaoRapidaSchema.safeParse({
      ...entradaBase,
      criarNovaDemanda: true,
      destino: "ABRIR_NEGOCIACAO",
      tituloDemanda: "Projeto estrutural do Edifício Aurora",
    });
    expect(parsed.success).toBe(true);
  });

  it("usa o nome de uma demanda existente ao abri-la como negociação", () => {
    const parsed = criarProspeccaoRapidaSchema.safeParse({
      ...entradaBase,
      leadExistenteId: "lead-existente",
      destino: "ABRIR_NEGOCIACAO",
    });
    expect(parsed.success).toBe(true);
  });

  it("não permite escolher uma demanda existente e criar outra ao mesmo tempo", () => {
    const parsed = criarProspeccaoRapidaSchema.safeParse({
      ...entradaBase,
      leadExistenteId: "lead-existente",
      criarNovaDemanda: true,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("cliente pessoa física na entrada comercial", () => {
  it("aceita a entrada sem contato separado quando o cliente é PF", () => {
    const parsed = criarProspeccaoRapidaSchema.safeParse({
      ...entradaBase,
      empresa: { nome: "Maria Sá", tipo: "PF" },
      contato: { email: "maria@exemplo.com" },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.empresa.tipo).toBe("PF");
  });

  it("não exige o tipo — chamadas antigas continuam válidas", () => {
    const parsed = criarProspeccaoRapidaSchema.safeParse(entradaBase);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.empresa.tipo).toBeUndefined();
  });

  it("encontra a PF já cadastrada cujo nome termina em sufixo societário", () => {
    // Buscar como PJ cortaria o "Sá" (tratado como sufixo) e o cadastro não casaria — é o que
    // acontecia enquanto a busca da entrada comercial fixava `tipo: "PJ"`.
    const existentes = [
      { id: "c1", nome: "Maria Sá", tipo: "PF" as const, documento: null, email: null },
    ];
    expect(candidatosDuplicata(existentes, { nome: "Maria Sá", tipo: "PF" })[0]?.motivo).toBe(
      "nome_exato",
    );
    expect(candidatosDuplicata(existentes, { nome: "Maria Sá", tipo: "PJ" })).toHaveLength(0);
  });
});

describe("busca por texto na entrada comercial", () => {
  const cadastrados = [
    "Construtora Alfa Ltda",
    "Construtora Beta",
    "Alfa Engenharia",
    "Incorporadora Delta",
  ];
  const acha = (termo: string) => {
    const tokens = tokensDeBusca(termo);
    return cadastrados
      .filter((n) => relevanciaNome(n, tokens) < 3)
      .sort((a, b) => relevanciaNome(a, tokens) - relevanciaNome(b, tokens) || a.localeCompare(b));
  };

  it("mostra TODOS os compatíveis com um pedaço do começo, não só quando sobra um", () => {
    // Era o defeito relatado: com o motor de dedupe, "constr" não devolvia nada até o texto
    // digitado ficar quase idêntico a um único cadastro.
    expect(acha("constr")).toEqual(["Construtora Alfa Ltda", "Construtora Beta"]);
  });

  it("acha pelo miolo do nome", () => {
    expect(acha("alfa")).toEqual(["Alfa Engenharia", "Construtora Alfa Ltda"]);
  });

  it("aceita as palavras em qualquer ordem", () => {
    expect(acha("alfa constr")).toEqual(["Construtora Alfa Ltda"]);
  });

  it("ignora acento e caixa", () => {
    expect(acha("INCORPORADORA")).toEqual(["Incorporadora Delta"]);
    expect(tokensDeBusca("  Construtora   ALFA ")).toEqual(["construtora", "alfa"]);
  });

  it("classifica quem começa com o termo à frente de quem só o contém", () => {
    expect(relevanciaNome("Construtora Alfa Ltda", tokensDeBusca("constr"))).toBe(0);
    expect(relevanciaNome("Construtora Alfa Ltda", tokensDeBusca("alfa"))).toBe(1);
    expect(relevanciaNome("Incorporadora Delta", tokensDeBusca("corpora"))).toBe(2);
    expect(relevanciaNome("Incorporadora Delta", tokensDeBusca("zzz"))).toBe(3);
  });
});
