import { describe, expect, it } from "vitest";
import { catalogoDev } from "@/test/catalogo-nomenclatura-snap";
import {
  catalogoNaVersao,
  colisoes,
  linhasDoItemNaVersao,
  mensagemConflito,
  operacoesComId,
  opsDasSiglas,
  planejarTransferencia,
  resolverLeva,
  siglasDoItemNaVersao,
  siglasParaVoltar,
  simular,
  type OperacaoComId,
} from "./versao";

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

describe("planejarTransferencia", () => {
  const versoes = [1, 2];

  it("o caso do ESG: o sinônimo do card vira sigla da sub, a partir da v2", () => {
    const ops = operacoesComId([{ tipo: "sub-nova", cardId: "hid", nome: "Esgoto", sigla: "ESG" }]);
    const p = planejarTransferencia(catalogoDev(), 2, ops, versoes);
    expect(p.recusa).toBeNull();
    expect(p.conflitos).toEqual([{ sigla: "ESG", versao: 2, dono: "Hidrossanitário", papel: "sinônimo" }]);
    expect(mensagemConflito(p.conflitos[0])).toBe("ESG é sinônimo de “Hidrossanitário” na v2.");
    const s = simular(catalogoDev(), 2, [...p.encerrar, ...ops]);
    expect(colisoes(s, versoes)).toEqual([]);
    expect(siglasDoItemNaVersao(s, D("hid"), 1).sinonimos).toContain("ESG");
    expect(siglasDoItemNaVersao(s, D("hid"), 2).sinonimos).not.toContain("ESG");
  });

  it("sigla oficial de outro item: conflito com papel oficial, o outro fica sem sigla", () => {
    const ops = operacoesComId([{ tipo: "sub-nova", cardId: "est", nome: "Estrutura metálica", sigla: "EST" }]);
    const p = planejarTransferencia(catalogoDev(), 2, ops, versoes);
    expect(p.conflitos).toEqual([{ sigla: "EST", versao: 2, dono: "Estrutural", papel: "oficial" }]);
    const s = simular(catalogoDev(), 2, [...p.encerrar, ...ops]);
    expect(siglasDoItemNaVersao(s, D("est"), 2).oficial).toBeNull();
    expect(siglasDoItemNaVersao(s, D("est"), 1).oficial).toBe("EST");
  });

  it("sem conflito: nada a encerrar", () => {
    const ops = operacoesComId([{ tipo: "sinonimo-novo", alvo: D("ele"), sigla: "ELT" }]);
    expect(planejarTransferencia(catalogoDev(), 2, ops, versoes)).toEqual({ conflitos: [], encerrar: [], recusa: null });
  });

  it("mesma sigla em dois itens da mesma leva: recusa", () => {
    const ops = operacoesComId([
      { tipo: "sinonimo-novo", alvo: D("ele"), sigla: "XYZ" },
      { tipo: "sinonimo-novo", alvo: D("gas"), sigla: "XYZ" },
    ]);
    expect(planejarTransferencia(catalogoDev(), 2, ops, versoes).recusa).toBe(
      "A sigla XYZ apareceria duas vezes: “Elétrico” e “Gás”.",
    );
  });

  it("dono só numa versão posterior: recusa dizendo a versão", () => {
    const snap = catalogoDev();
    snap.cards.find((c) => c.id === "gas")!.siglas.push({ id: "gas-v3", sigla: "XYZ", oficial: false, versaoDesde: 3, versaoAte: null });
    const ops = operacoesComId([{ tipo: "sinonimo-novo", alvo: D("ele"), sigla: "XYZ" }]);
    expect(planejarTransferencia(snap, 2, ops, [1, 2, 3]).recusa).toBe(
      "Na v3, a sigla XYZ já é de “Gás”. Troque a sigla de lá nessa versão antes.",
    );
  });

  it("voltar um card com uma sigla que hoje é de outro: conflito na volta", () => {
    const snap = catalogoDev();
    snap.cards.find((c) => c.id === "acu")!.versaoAte = 1;
    snap.subs.push({
      id: "s-acu",
      cardId: "arq",
      nome: "Acústica",
      ativo: true,
      ordem: 0,
      versaoDesde: 2,
      versaoAte: null,
      siglas: [{ id: "s-acu-s0", sigla: "ACU", oficial: true, versaoDesde: 2, versaoAte: null }],
    });
    const ops = operacoesComId([{ tipo: "entra", alvo: D("acu"), siglas: siglasParaVoltar(snap, D("acu"), 2) }]);
    expect(planejarTransferencia(snap, 2, ops, versoes).conflitos).toEqual([
      { sigla: "ACU", versao: 2, dono: "Acústica (sub de Arquitetura)", papel: "oficial" },
    ]);
  });
});

describe("resolverLeva", () => {
  const ops = operacoesComId([{ tipo: "sub-nova", cardId: "hid", nome: "Esgoto", sigla: "ESG" }]);
  const plano = () => planejarTransferencia(catalogoDev(), 2, ops, [1, 2]);

  it("conflito sem transferir (tela velha): recusa e pede para recarregar", () => {
    expect(resolverLeva(plano(), ops, false)).toEqual({
      ok: false,
      erro: "ESG é sinônimo de “Hidrossanitário” na v2. A tela pode estar desatualizada: recarregue e confirme a transferência.",
    });
  });

  it("com transferir: tira do outro dono antes de gravar", () => {
    const r = resolverLeva(plano(), ops, true);
    expect(r.ok && r.ops.map((o) => o.tipo)).toEqual(["encerrar-sigla", "sub-nova"]);
  });

  it("recusa do plano passa adiante", () => {
    expect(resolverLeva({ conflitos: [], encerrar: [], recusa: "Não dá." }, ops, true)).toEqual({ ok: false, erro: "Não dá." });
  });

  it("mais de uma oficial voltando com o item: recusa", () => {
    const volta = operacoesComId([
      { tipo: "entra", alvo: D("hid"), siglas: [{ sigla: "HID", oficial: true }, { sigla: "HDR", oficial: true }] },
    ]);
    expect(resolverLeva({ conflitos: [], encerrar: [], recusa: null }, volta, false)).toEqual({
      ok: false,
      erro: "Só uma sigla oficial pode voltar com o item.",
    });
  });
});

describe("siglasParaVoltar", () => {
  it("oferece as siglas da última versão em que o item existiu", () => {
    const fora = simular(catalogoDev(), 2, operacoesComId([{ tipo: "sai", alvo: D("hid") }]));
    expect(siglasParaVoltar(fora, D("hid"), 2)).toEqual([
      { sigla: "HID", oficial: true },
      { sigla: "HDR", oficial: false },
      { sigla: "ESG", oficial: false },
    ]);
  });
});

describe("opsDasSiglas", () => {
  const hid = () => linhasDoItemNaVersao(catalogoDev(), D("hid"), 2);

  it("lê oficial e sinônimos da versão com os ids das linhas", () => {
    expect(hid()).toMatchObject({
      oficial: { id: "hid-s0", sigla: "HID" },
      sinonimos: [{ id: "hid-s1", sigla: "HDR" }, { id: "hid-s2", sigla: "ESG" }],
    });
  });

  it("sem mudança: nenhuma operação", () => {
    expect(opsDasSiglas(D("hid"), hid(), { oficial: "HID", sinonimos: ["HDR", "ESG"] })).toEqual([]);
  });

  it("tirar um sinônimo = encerrar a linha dele", () => {
    expect(opsDasSiglas(D("hid"), hid(), { oficial: "HID", sinonimos: ["HDR"] })).toEqual([
      { tipo: "encerrar-sigla", alvo: D("hid"), linhaId: "hid-s2", sigla: "ESG" },
    ]);
  });

  it("sinônimo novo", () => {
    expect(opsDasSiglas(D("hid"), hid(), { oficial: "HID", sinonimos: ["HDR", "ESG", "HSN"] })).toEqual([
      { tipo: "sinonimo-novo", alvo: D("hid"), sigla: "HSN" },
    ]);
  });

  it("promover um sinônimo e rebaixar a oficial no mesmo salvar", () => {
    const ops = opsDasSiglas(D("hid"), hid(), { oficial: "HDR", sinonimos: ["ESG", "HID"] });
    expect(ops).toEqual([
      { tipo: "sigla-nova", alvo: D("hid"), sigla: "HDR" },
      { tipo: "sinonimo-novo", alvo: D("hid"), sigla: "HID" },
    ]);
    const s = simular(catalogoDev(), 2, operacoesComId(ops));
    expect(siglasDoItemNaVersao(s, D("hid"), 2)).toEqual({ oficial: "HDR", sinonimos: ["ESG", "HID"] });
  });

  it("oficial vazia: o item fica sem sigla na versão", () => {
    expect(opsDasSiglas(D("hid"), hid(), { oficial: null, sinonimos: ["HDR", "ESG"] })).toEqual([
      { tipo: "encerrar-sigla", alvo: D("hid"), linhaId: "hid-s0", sigla: "HID" },
    ]);
  });
});
