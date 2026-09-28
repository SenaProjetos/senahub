import { describe, expect, it } from "vitest";
import { PLANILHA_GESTAO } from "@/test/catalogo-nomenclatura-snap";
import { lerPlanilhaCatalogo, normalizarSigla } from "./planilha";

describe("normalizarSigla", () => {
  it("maiúscula, sem acento, 2 a 6 letras/números", () => {
    expect(normalizarSigla("orç")).toBe("ORC");
    expect(normalizarSigla("A1")).toBe("A1");
    expect(normalizarSigla("TELECOMUNICAÇÕES")).toBeNull();
    expect(normalizarSigla("SEGURANÇA E ALARME")).toBeNull();
    expect(normalizarSigla("X")).toBeNull();
  });
});

describe("lerPlanilhaCatalogo — planilha da gestão", () => {
  const lida = lerPlanilhaCatalogo(PLANILHA_GESTAO);
  const porNome = (nome: string, sigla?: string) =>
    lida.linhas.find((l) => l.nome === nome && (sigla === undefined || l.sigla === sigla));

  it("lê 20 cards e 29 subs, sem erro", () => {
    expect(lida.erros).toEqual([]);
    expect(lida.linhas.filter((l) => l.tipo === "card")).toHaveLength(20);
    expect(lida.linhas.filter((l) => l.tipo === "sub")).toHaveLength(29);
  });

  it("título de grupo mesclado não vira card (nem o SPDA, que parece sigla)", () => {
    expect(lida.linhas.some((l) => l.nome === "SPDA")).toBe(false);
    expect(lida.linhas.some((l) => l.nome === "ELÉTRICA")).toBe(false);
  });

  it("card com subs vem sem sigla; a sub fica ligada ao card acima", () => {
    const tel = porNome("TELECOMUNICAÇÕES")!;
    expect(tel).toMatchObject({ tipo: "card", sigla: null });
    expect(porNome("DADOS")).toMatchObject({ tipo: "sub", sigla: "DAD", paiLinha: tel.linha });
  });

  it("nome igual à sigla numa linha com SUB é sigla de verdade (VOZ, GLP)", () => {
    expect(porNome("VOZ")).toMatchObject({ tipo: "sub", sigla: "VOZ" });
    expect(porNome("GLP")).toMatchObject({ tipo: "sub", sigla: "GLP" });
  });

  it("SUB na coluna de sigla + CARD: é o card Subestação com sigla SUB", () => {
    expect(porNome("SUBESTAÇÃO ÁREA OU ABRIGADO")).toMatchObject({ tipo: "card", sigla: "SUB" });
  });

  it("sub que vem depois de um card com sigla pertence a ele (Drenagem → TRE)", () => {
    const dre = porNome("DRENAGEM GERAL")!;
    expect(porNome("SITEMA DE TANQUE RETARDO/ACUMULO")).toMatchObject({ tipo: "sub", sigla: "TRE", paiLinha: dre.linha });
  });

  it("ORÇ vira ORC com aviso; nome repetido com sigla diferente só avisa", () => {
    expect(porNome("ORÇAMENTO GERAL")).toMatchObject({ sigla: "ORC", siglaLida: "ORÇ" });
    expect(lida.avisos.some((a) => a.includes("ORÇ") && a.includes("ORC"))).toBe(true);
    expect(porNome("TERRAPLANAGEM GERAL", "TER")).toBeDefined();
    expect(porNome("TERRAPLANAGEM GERAL", "TOP")).toBeDefined();
    expect(lida.avisos.some((a) => a.includes("TERRAPLANAGEM GERAL"))).toBe(true);
  });
});

describe("lerPlanilhaCatalogo — outros formatos", () => {
  it("SUB sem card acima é erro", () => {
    const r = lerPlanilhaCatalogo([["GRUPO"], ["DADOS", "DAD", "SUB"]]);
    expect(r.erros[0]).toContain("SUB sem um CARD");
  });

  it("planilha simples nome;sigla lê como card e avisa", () => {
    const r = lerPlanilhaCatalogo([["Nome", "Sigla"], ["Elétrica", "ELE"]]);
    expect(r.linhas).toEqual([expect.objectContaining({ tipo: "card", nome: "Elétrica", sigla: "ELE" })]);
    expect(r.avisos[0]).toContain("sem CARD ou SUB");
  });

  it("linha repetida (mesmo nome e sigla) é erro", () => {
    const r = lerPlanilhaCatalogo([["X GERAL", "XXX", "CARD"], ["X GERAL", "XXX", "CARD"]]);
    expect(r.erros[0]).toContain("repete a linha");
  });

  it("planilha sem nenhum CARD/SUB é erro", () => {
    expect(lerPlanilhaCatalogo([["qualquer coisa"]]).erros[0]).toContain("Nenhuma linha");
  });
});
