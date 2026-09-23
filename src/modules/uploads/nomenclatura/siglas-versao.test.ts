import { describe, expect, it } from "vitest";
import { CATALOGO_SENA } from "@/test/catalogo-nomenclatura";
import {
  catalogosDaVersao,
  siglasDasColunas,
  siglasNaVersao,
  valeNaVersao,
  type DisciplinaComSiglas,
  type PranchaComSiglas,
  type SiglaLinha,
} from "./siglas-versao";
import { montarVocabulario } from "./vocabulario";

const linha = (sigla: string, oficial: boolean, versaoDesde = 1, versaoAte: number | null = null): SiglaLinha => ({
  sigla,
  oficial,
  versaoDesde,
  versaoAte,
});

describe("valeNaVersao", () => {
  it("inclui as duas pontas e trata fim nulo como sem fim", () => {
    expect(valeNaVersao({ versaoDesde: 1, versaoAte: null }, 7)).toBe(true);
    expect(valeNaVersao({ versaoDesde: 2, versaoAte: null }, 1)).toBe(false);
    expect(valeNaVersao({ versaoDesde: 1, versaoAte: 1 }, 1)).toBe(true);
    expect(valeNaVersao({ versaoDesde: 1, versaoAte: 1 }, 2)).toBe(false);
  });
});

describe("siglasDasColunas", () => {
  it("normaliza como a migration: maiúscula, sem vazio, sem repetir a oficial nem duplicata", () => {
    expect(siglasDasColunas(" hid ", ["hdr", "ESG", "", "HID", "esg "])).toEqual([
      linha("HID", true),
      linha("HDR", false),
      linha("ESG", false),
    ]);
  });

  it("item sem sigla oficial só leva os sinônimos", () => {
    expect(siglasDasColunas(null, ["X"])).toEqual([linha("X", false)]);
    expect(siglasDasColunas("  ", [])).toEqual([]);
  });
});

describe("siglasNaVersao", () => {
  // ESG: sinônimo de HID só na v1; na v2 vira sub Esgoto (outro alvo, D4 da spec).
  const hid = [linha("HID", true), linha("HDR", false), linha("ESG", false, 1, 1)];

  it("sinônimo com fim de validade some nas versões seguintes", () => {
    expect(siglasNaVersao(hid, 1)).toEqual({ oficial: "HID", sinonimos: ["HDR", "ESG"] });
    expect(siglasNaVersao(hid, 2)).toEqual({ oficial: "HID", sinonimos: ["HDR"] });
  });

  it("sigla renomeada: a antiga vale até a vN, a nova a partir da vN+1", () => {
    const spda = [linha("SPD", true, 1, 1), linha("PDA", true, 2)];
    expect(siglasNaVersao(spda, 1).oficial).toBe("SPD");
    expect(siglasNaVersao(spda, 2).oficial).toBe("PDA");
  });

  it("duas oficiais na mesma versão: vence a mais recente e a outra não vira sinônimo", () => {
    const inconsistente = [linha("AAA", true, 1), linha("BBB", true, 2)];
    expect(siglasNaVersao(inconsistente, 2)).toEqual({ oficial: "BBB", sinonimos: [] });
  });
});

/** O catálogo de hoje (colunas) reescrito como linhas da v1 — é o que a migration faz. */
function catalogoComoLinhas(): { disciplinas: DisciplinaComSiglas[]; pranchas: PranchaComSiglas[] } {
  return {
    disciplinas: CATALOGO_SENA.disciplinas.map((d) => ({
      id: d.id,
      numeracao: d.numeracao ?? null,
      numeracaoFim: d.numeracaoFim ?? null,
      versaoDesde: 1,
      versaoAte: null,
      siglas: siglasDasColunas(d.codigo, d.sinonimos ?? []),
    })),
    pranchas: [
      ...CATALOGO_SENA.fases.map((f) => ({ ...f, categoria: "fase" as const })),
      ...CATALOGO_SENA.tipos.map((t) => ({ ...t, categoria: "tipo" as const })),
    ].map((p) => ({
      id: p.id,
      categoria: p.categoria,
      projetoId: p.projetoId ?? null,
      versaoDesde: 1,
      versaoAte: null,
      siglas: siglasDasColunas(p.sigla, p.sinonimos ?? []),
    })),
  };
}

describe("catalogosDaVersao", () => {
  it("a v1 montada das linhas reconhece EXATAMENTE o mesmo que o catálogo de colunas", () => {
    const antes = montarVocabulario(CATALOGO_SENA, null);
    const depois = montarVocabulario(catalogosDaVersao(catalogoComoLinhas(), 1), null);
    const partes = [
      ...CATALOGO_SENA.disciplinas.flatMap((d) => [d.codigo ?? "", ...(d.sinonimos ?? [])]),
      ...CATALOGO_SENA.fases.flatMap((f) => [f.sigla, ...(f.sinonimos ?? [])]),
      ...CATALOGO_SENA.tipos.flatMap((t) => [t.sigla, ...(t.sinonimos ?? [])]),
      "XYZ",
    ].filter(Boolean);
    for (const parte of partes) expect(depois.buscar(parte), parte).toEqual(antes.buscar(parte));
    for (const numero of [0, 1500, 3050, 3150, 4001, 5250, 6101, 9999, 12000]) {
      expect(depois.faixaDe(numero), String(numero)).toEqual(antes.faixaDe(numero));
    }
  });

  it("item fora da versão não entra no vocabulário (card Acústica só na v1)", () => {
    const entrada = catalogoComoLinhas();
    const acu = entrada.disciplinas.find((d) => d.id === "d-acu")!;
    acu.versaoAte = 1;
    expect(catalogosDaVersao(entrada, 1).disciplinas.some((d) => d.id === "d-acu")).toBe(true);
    expect(catalogosDaVersao(entrada, 2).disciplinas.some((d) => d.id === "d-acu")).toBe(false);
  });

  it("item sem sigla oficial na versão fica de fora", () => {
    const entrada = catalogoComoLinhas();
    const fase = entrada.pranchas[0];
    fase.siglas = [linha(fase.siglas[0].sigla, true, 1, 1)];
    const idFase = fase.id;
    expect(catalogosDaVersao(entrada, 2).fases.some((f) => f.id === idFase)).toBe(false);
  });

  it("folha não entra (o motor não lê tamanho de papel pelo nome)", () => {
    const entrada = catalogoComoLinhas();
    entrada.pranchas.push({
      id: "fl-a1",
      categoria: "folha",
      projetoId: null,
      versaoDesde: 1,
      versaoAte: null,
      siglas: [linha("A1", true)],
    });
    const cat = catalogosDaVersao(entrada, 1);
    expect([...cat.fases, ...cat.tipos].some((i) => i.id === "fl-a1")).toBe(false);
  });
});
