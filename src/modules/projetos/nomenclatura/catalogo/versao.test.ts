import { describe, expect, it } from "vitest";
import { catalogoDev } from "@/test/catalogo-nomenclatura-snap";
import { catalogoNaVersao, colisoes, simular, siglasDoItemNaVersao, type OperacaoComId } from "./versao";

const D = (id: string) => ({ tipo: "disciplina" as const, id });

describe("catalogoNaVersao", () => {
  it("sem mudança nenhuma, a v2 é igual à v1", () => {
    const v2 = catalogoNaVersao(catalogoDev(), 2);
    expect(v2.cards).toHaveLength(18);
    expect(v2.cards.every((c) => c.situacao === "igual")).toBe(true);
    expect(v2.saem).toEqual([]);
    expect(v2.fases.map((f) => f.sigla)).toEqual(["PL", "BS", "EX"]);
  });

  it("mostra o que entra, o que sai e a sigla que muda em relação à anterior", () => {
    const ops: OperacaoComId[] = [
      { id: "a", tipo: "sai", alvo: D("log") },
      { id: "b", tipo: "sigla-nova", alvo: D("spd"), sigla: "PDA" },
      { id: "c", tipo: "card-novo", chave: "ene", nome: "Entrada de Energia", sigla: "ENE", categoria: null },
      { id: "d", tipo: "sub-nova", card: { id: "hid" }, nome: "Água Fria", sigla: "AGF" },
    ];
    const s = simular(catalogoDev(), 2, ops);
    const v2 = catalogoNaVersao(s, 2);
    expect(v2.saem.map((x) => x.nome)).toEqual(["Cabeamento"]);
    expect(v2.cards.find((c) => c.nome === "SPDA")).toMatchObject({ sigla: "PDA", situacao: "sigla-nova", siglaAnterior: "SPD" });
    expect(v2.cards.find((c) => c.nome === "Entrada de Energia")).toMatchObject({ situacao: "entra", sigla: "ENE" });
    expect(v2.cards.find((c) => c.nome === "Hidrossanitário")?.subs).toEqual([
      expect.objectContaining({ nome: "Água Fria", sigla: "AGF", situacao: "entra" }),
    ]);
    expect(v2.resumo).toEqual({ entram: 2, saem: 1, siglasNovas: 1 });

    // A v1 não muda: Cabeamento continua, SPDA segue SPD, os novos não aparecem.
    const v1 = catalogoNaVersao(s, 1);
    expect(v1.cards).toHaveLength(18);
    expect(v1.cards.find((c) => c.nome === "SPDA")?.sigla).toBe("SPD");
  });
});

describe("simular", () => {
  it("sai de item espelho: as siglas acompanham a faixa (lápis segue livre)", () => {
    const s = simular(catalogoDev(), 2, [{ id: "x", tipo: "sai", alvo: D("log") }]);
    const log = s.cards.find((c) => c.id === "log")!;
    expect(log.versaoAte).toBe(1);
    expect(log.siglas.every((l) => l.versaoAte === 1)).toBe(true);
  });

  it("sai de item criado na própria versão = excluído, com as subs", () => {
    const s = simular(catalogoDev(), 2, [
      { id: "c", tipo: "card-novo", chave: "tel", nome: "Telecomunicações", sigla: null, categoria: null },
      { id: "d", tipo: "sub-nova", card: { chave: "tel" }, nome: "Dados", sigla: "DAD" },
      { id: "e", tipo: "sai", alvo: D("novo-card:tel") },
    ]);
    expect(s.cards.some((c) => c.nome === "Telecomunicações")).toBe(false);
    expect(s.subs).toEqual([]);
  });

  it("entra devolve o item à versão", () => {
    const fora = simular(catalogoDev(), 2, [{ id: "x", tipo: "sai", alvo: D("acu") }]);
    const volta = simular(fora, 2, [{ id: "y", tipo: "entra", alvo: D("acu") }]);
    expect(siglasDoItemNaVersao(volta, D("acu"), 2).oficial).toBe("ACU");
  });

  it("encerrar-sigla tira a sigla só a partir da versão", () => {
    const hid = catalogoDev().cards.find((c) => c.id === "hid")!;
    const esg = hid.siglas.find((l) => l.sigla === "ESG")!;
    const s = simular(catalogoDev(), 2, [{ id: "x", tipo: "encerrar-sigla", alvo: D("hid"), linhaId: esg.id, sigla: "ESG" }]);
    expect(siglasDoItemNaVersao(s, D("hid"), 1).sinonimos).toContain("ESG");
    expect(siglasDoItemNaVersao(s, D("hid"), 2).sinonimos).not.toContain("ESG");
  });
});

describe("colisoes", () => {
  it("sub com a sigla de um sinônimo do card, na mesma versão", () => {
    const s = simular(catalogoDev(), 2, [{ id: "d", tipo: "sub-nova", card: { id: "hid" }, nome: "Esgoto", sigla: "ESG" }]);
    const [c] = colisoes(s, [2]);
    expect(c).toMatchObject({ versao: 2, sigla: "ESG" });
    expect(c.donos.map((d) => d.rotulo).sort()).toEqual(["Esgoto (sub de Hidrossanitário)", "Hidrossanitário"]);
    expect(colisoes(s, [1])).toEqual([]);
  });

  it("card que saiu não ocupa mais a sigla na versão", () => {
    const s = simular(catalogoDev(), 2, [
      { id: "a", tipo: "sai", alvo: D("cftv") },
      { id: "b", tipo: "card-novo", chave: "seg", nome: "Segurança e Alarme", sigla: "SEG", categoria: null },
    ]);
    expect(colisoes(s, [1, 2])).toEqual([]);
  });
});
