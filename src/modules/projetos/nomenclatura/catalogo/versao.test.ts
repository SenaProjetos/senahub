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
  it("sai muda só a faixa do item; as linhas de sigla ficam (a faixa efetiva recorta)", () => {
    const s = simular(catalogoDev(), 2, [{ id: "x", tipo: "sai", alvo: D("log") }]);
    const log = s.cards.find((c) => c.id === "log")!;
    expect(log.versaoAte).toBe(1);
    expect(log.siglas.every((l) => l.versaoAte === null)).toBe(true);
    expect(siglasDoItemNaVersao(s, D("log"), 2).oficial).toBeNull();
    expect(siglasDoItemNaVersao(s, D("log"), 1).oficial).toBe("LOG");
  });

  it("entra com siglas: só as escolhidas valem na versão", () => {
    const fora = simular(catalogoDev(), 2, [{ id: "x", tipo: "sai", alvo: D("hid") }]);
    const volta = simular(fora, 2, [
      { id: "y", tipo: "entra", alvo: D("hid"), siglas: [{ sigla: "HID", oficial: true }, { sigla: "HDR", oficial: false }] },
    ]);
    expect(siglasDoItemNaVersao(volta, D("hid"), 2)).toEqual({ oficial: "HID", sinonimos: ["HDR"] });
    expect(siglasDoItemNaVersao(volta, D("hid"), 1)).toEqual({ oficial: "HID", sinonimos: ["HDR", "ESG"] });
  });

  it("entra com siglas reabre linha que o espelho antigo truncou (dado legado)", () => {
    const snap = catalogoDev();
    const log = snap.cards.find((c) => c.id === "log")!;
    log.versaoAte = 1;
    log.siglas = log.siglas.map((l) => ({ ...l, versaoAte: 1 }));
    const volta = simular(snap, 2, [{ id: "y", tipo: "entra", alvo: D("log"), siglas: [{ sigla: "LOG", oficial: true }] }]);
    expect(siglasDoItemNaVersao(volta, D("log"), 2).oficial).toBe("LOG");
    expect(volta.cards.find((c) => c.id === "log")!.siglas.find((l) => l.id.startsWith("nova:y"))).toMatchObject({
      sigla: "LOG",
      oficial: true,
      versaoDesde: 2,
      versaoAte: null,
    });
  });

  it("sinonimo-novo vale a partir da versão; repetido não duplica", () => {
    const s = simular(catalogoDev(), 2, [
      { id: "a", tipo: "sinonimo-novo", alvo: D("ele"), sigla: "ELT" },
      { id: "b", tipo: "sinonimo-novo", alvo: D("ele"), sigla: "ELT" },
    ]);
    expect(siglasDoItemNaVersao(s, D("ele"), 2)).toEqual({ oficial: "ELE", sinonimos: ["ELT"] });
    expect(siglasDoItemNaVersao(s, D("ele"), 1).sinonimos).toEqual([]);
    expect(s.cards.find((c) => c.id === "ele")!.siglas.filter((l) => l.sigla === "ELT")).toHaveLength(1);
  });

  it("sigla-nova com um sinônimo do próprio item: promove (o sinônimo sai na versão)", () => {
    const s = simular(catalogoDev(), 2, [{ id: "a", tipo: "sigla-nova", alvo: D("hid"), sigla: "HDR" }]);
    expect(siglasDoItemNaVersao(s, D("hid"), 2)).toEqual({ oficial: "HDR", sinonimos: ["ESG"] });
    expect(siglasDoItemNaVersao(s, D("hid"), 1)).toEqual({ oficial: "HID", sinonimos: ["HDR", "ESG"] });
    // A linha do sinônimo encerra de fato (a leitura acima esconderia uma linha duplicada em aberto).
    expect(s.cards.find((c) => c.id === "hid")!.siglas.find((l) => l.id === "hid-s1")).toMatchObject({ sigla: "HDR", versaoAte: 1 });
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
