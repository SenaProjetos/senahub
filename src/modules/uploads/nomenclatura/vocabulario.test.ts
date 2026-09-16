import { describe, expect, it } from "vitest";
import { CATALOGO_SENA } from "@/test/catalogo-nomenclatura";
import { montarVocabulario } from "./vocabulario";

const vocabulario = montarVocabulario(CATALOGO_SENA, null);

describe("montarVocabulario", () => {
  it("acha sigla e sinônimo, dizendo por qual caminho veio", () => {
    expect(vocabulario.buscar("DET")).toEqual([
      { categoria: "tipo", id: "t-det", sigla: "DET", via: "sigla", escopo: "global" },
    ]);
    expect(vocabulario.buscar("DTC")).toEqual([
      { categoria: "tipo", id: "t-det", sigla: "DET", via: "sinonimo", escopo: "global" },
    ]);
    expect(vocabulario.buscar("HDR")[0]).toMatchObject({ categoria: "disciplina", id: "d-hid" });
  });

  it("ignora acento e caixa", () => {
    expect(vocabulario.buscar("ESTR")[0]).toMatchObject({ id: "d-est" });
  });

  it("devolve todas as categorias quando a sigla é ambígua", () => {
    const comAmbiguidade = montarVocabulario(
      { ...CATALOGO_SENA, tipos: [...CATALOGO_SENA.tipos, { id: "t-pl", sigla: "PL" }] },
      null,
    );
    expect(comAmbiguidade.buscar("PL").map((e) => e.categoria).sort()).toEqual(["fase", "tipo"]);
  });

  it("item do projeto vence o global na mesma categoria", () => {
    const vocab = montarVocabulario(
      {
        ...CATALOGO_SENA,
        fases: [...CATALOGO_SENA.fases, { id: "f-ex-proj", sigla: "EX", projetoId: "p1" }],
      },
      "p1",
    );
    expect(vocab.buscar("EX")).toEqual([
      { categoria: "fase", id: "f-ex-proj", sigla: "EX", via: "sigla", escopo: "projeto" },
    ]);
  });

  it("item de OUTRO projeto não classifica nada", () => {
    const vocab = montarVocabulario(
      { ...CATALOGO_SENA, tipos: [...CATALOGO_SENA.tipos, { id: "t-xyz", sigla: "XYZ", projetoId: "p2" }] },
      "p1",
    );
    expect(vocab.buscar("XYZ")).toEqual([]);
  });

  it("sigla vence sinônimo dentro do mesmo escopo", () => {
    const vocab = montarVocabulario(
      { ...CATALOGO_SENA, tipos: [...CATALOGO_SENA.tipos, { id: "t-outro", sigla: "XX", sinonimos: ["DET"] }] },
      null,
    );
    expect(vocab.buscar("DET")).toEqual([
      { categoria: "tipo", id: "t-det", sigla: "DET", via: "sigla", escopo: "global" },
    ]);
  });

  it("faixa de numeração segue o catálogo à risca", () => {
    expect(vocabulario.faixaDe(4026)).toMatchObject({ codigo: "EST" });
    expect(vocabulario.faixaDe(5104)).toMatchObject({ codigo: "LOG" });
    expect(vocabulario.faixaDe(5003)).toMatchObject({ codigo: "ELE" });
    expect(vocabulario.faixaDe(6105)).toMatchObject({ codigo: "DRE" });
    expect(vocabulario.faixaDe(10)).toBeNull();
  });

  it("não deixa uma faixa larga engolir a sub-faixa que vem logo depois (bug real corrigido em 2026-09-16)", () => {
    // Arquitetura=3000 e Acústica=3100 só têm 100 números de intervalo — parar no primeiro
    // "base <= número" (sem checar o fim) fazia TODO número >= 3000 cair como Arquitetura,
    // inclusive os que já eram de Acústica (3100-3199) ou nem pertenciam a faixa nenhuma.
    expect(vocabulario.faixaDe(3050)).toMatchObject({ codigo: "ARQ" });
    expect(vocabulario.faixaDe(3150)).toMatchObject({ codigo: "ACU" });
  });

  it("disciplina com início mas sem fim de faixa não entra no reconhecimento por número", () => {
    // TOP tem numeracao=0 mas nenhum numeracaoFim no catálogo real ainda — número 500
    // não pode virar Topografia por engano só porque 0 <= 500.
    expect(vocabulario.faixaDe(500)).toBeNull();
  });
});
