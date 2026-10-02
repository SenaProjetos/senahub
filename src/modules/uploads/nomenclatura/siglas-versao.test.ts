import { describe, expect, it } from "vitest";
import { CATALOGO_SENA } from "@/test/catalogo-nomenclatura";
import {
  catalogosDaVersao,
  decidirSiglasAoSalvar,
  faixaDoEspelho,
  intersecaoFaixas,
  linhasParaChecarColisao,
  siglasDasColunas,
  siglasEfetivas,
  siglasNaVersao,
  siglasSaoEspelho,
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

  it("as linhas levam a faixa do item (card novo só a partir da v2)", () => {
    expect(siglasDasColunas("ENE", ["ENT"], { versaoDesde: 2, versaoAte: null })).toEqual([
      linha("ENE", true, 2),
      linha("ENT", false, 2),
    ]);
  });
});

describe("siglasSaoEspelho", () => {
  const faixa = { versaoDesde: 1, versaoAte: null };

  it("item que nunca passou por 'Siglas por versão' é espelho, em qualquer ordem e caixa", () => {
    const linhas = [linha("HDR", false), linha("HID", true)];
    expect(siglasSaoEspelho(linhas, { oficial: "hid", sinonimos: ["hdr"] }, faixa)).toBe(true);
  });

  it("sem sigla nenhuma também é espelho (nada a preservar)", () => {
    expect(siglasSaoEspelho([], { oficial: null, sinonimos: [] }, faixa)).toBe(true);
  });

  it("sigla trocada por versão deixa de ser espelho", () => {
    const spda = [linha("SPD", true, 1, 1), linha("PDA", true, 2)];
    expect(siglasSaoEspelho(spda, { oficial: "SPD", sinonimos: [] }, faixa)).toBe(false);
  });

  it("card criado sem sigla e com SEG pelo diálogo não é espelho das colunas vazias", () => {
    const seg = [linha("SEG", true, 2)];
    expect(siglasSaoEspelho(seg, { oficial: null, sinonimos: [] }, { versaoDesde: 2, versaoAte: null })).toBe(false);
  });
});

describe("decidirSiglasAoSalvar", () => {
  const sempre = { versaoDesde: 1, versaoAte: null };
  // HID com ESG encerrado na v1 (ESG vira a sub Esgoto na v2): as colunas ainda dizem "ESG".
  const hidVersionado = [linha("HID", true), linha("HDR", false), linha("ESG", false, 1, 1)];
  const colunasHid = { oficial: "HID", sinonimos: ["HDR", "ESG"] };

  it("salvar o lápis sem mexer na sigla não regrava as siglas por versão (o bug)", () => {
    expect(
      decidirSiglasAoSalvar({
        linhas: hidVersionado,
        colunasAntes: colunasHid,
        faixaAntes: sempre,
        colunasDepois: { oficial: "hid", sinonimos: ["esg", "hdr"] },
        faixaDepois: sempre,
      }),
    ).toBe("manter");
  });

  it("mudar sigla ou sinônimo pelas colunas de item versionado é bloqueado", () => {
    expect(
      decidirSiglasAoSalvar({
        linhas: hidVersionado,
        colunasAntes: colunasHid,
        faixaAntes: sempre,
        colunasDepois: { oficial: "HID", sinonimos: ["HDR"] },
        faixaDepois: sempre,
      }),
    ).toBe("bloquear");
  });

  it("mudar só a validade de item versionado mantém as linhas", () => {
    expect(
      decidirSiglasAoSalvar({
        linhas: hidVersionado,
        colunasAntes: colunasHid,
        faixaAntes: sempre,
        colunasDepois: colunasHid,
        faixaDepois: { versaoDesde: 1, versaoAte: 3 },
      }),
    ).toBe("manter");
  });

  it("item espelho: mudar sigla regrava; mudar só a validade mantém as linhas (E3)", () => {
    const log = [linha("LOG", true)];
    const colunas = { oficial: "LOG", sinonimos: [] };
    const base = { linhas: log, colunasAntes: colunas, faixaAntes: sempre };
    expect(decidirSiglasAoSalvar({ ...base, colunasDepois: colunas, faixaDepois: sempre })).toBe("manter");
    expect(decidirSiglasAoSalvar({ ...base, colunasDepois: { oficial: "CAB", sinonimos: [] }, faixaDepois: sempre })).toBe(
      "espelhar",
    );
    expect(decidirSiglasAoSalvar({ ...base, colunasDepois: colunas, faixaDepois: { versaoDesde: 1, versaoAte: 1 } })).toBe(
      "manter",
    );
  });

  it("o incidente de 2026-09-30: Até a v1 e depois Sem fim deixam as siglas como estavam", () => {
    const hid = [linha("HID", true), linha("HDR", false), linha("ESG", false)];
    const colunas = { oficial: "HID", sinonimos: ["HDR", "ESG"] };
    const ate1 = decidirSiglasAoSalvar({
      linhas: hid,
      colunasAntes: colunas,
      faixaAntes: sempre,
      colunasDepois: colunas,
      faixaDepois: { versaoDesde: 1, versaoAte: 1 },
    });
    expect(ate1).toBe("manter");
    const v1 = { versaoDesde: 1, versaoAte: 1 };
    const semFim = decidirSiglasAoSalvar({ linhas: hid, colunasAntes: colunas, faixaAntes: v1, colunasDepois: colunas, faixaDepois: sempre });
    // Ampliar um item espelho regrava o espelho na faixa ampliada — dá as mesmas linhas de antes.
    expect(semFim).toBe("espelhar");
    expect(faixaDoEspelho(v1, sempre)).toEqual(sempre);
    expect(siglasDasColunas(colunas.oficial, colunas.sinonimos, faixaDoEspelho(v1, sempre))).toEqual(hid);
  });

  it("dado legado: linhas cortadas pelo espelho antigo junto com o item voltam ao ampliar pelo formulário", () => {
    const v1 = { versaoDesde: 1, versaoAte: 1 };
    const cortadas = [linha("HID", true, 1, 1), linha("HDR", false, 1, 1)];
    const colunas = { oficial: "HID", sinonimos: ["HDR"] };
    expect(decidirSiglasAoSalvar({ linhas: cortadas, colunasAntes: colunas, faixaAntes: v1, colunasDepois: colunas, faixaDepois: sempre })).toBe(
      "espelhar",
    );
  });

  it("edição combinada (tira sinônimo e estreita a validade): o espelho não corta as linhas", () => {
    const hid = [linha("HID", true), linha("HDR", false), linha("ESG", false)];
    const decisao = decidirSiglasAoSalvar({
      linhas: hid,
      colunasAntes: { oficial: "HID", sinonimos: ["HDR", "ESG"] },
      faixaAntes: sempre,
      colunasDepois: { oficial: "HID", sinonimos: ["HDR"] },
      faixaDepois: { versaoDesde: 1, versaoAte: 1 },
    });
    expect(decisao).toBe("espelhar");
    expect(faixaDoEspelho(sempre, { versaoDesde: 1, versaoAte: 1 })).toEqual(sempre);
  });
});

describe("siglasSaoEspelho pela faixa efetiva", () => {
  it("item que saiu (linhas em aberto, item até a v1) continua espelho — o formulário não trava a sigla", () => {
    expect(siglasSaoEspelho([linha("LOG", true)], { oficial: "LOG", sinonimos: [] }, { versaoDesde: 1, versaoAte: 1 })).toBe(true);
  });

  it("item com sigla encerrada por versão continua 'por versão'", () => {
    const hid = [linha("HID", true), linha("ESG", false, 1, 1)];
    expect(siglasSaoEspelho(hid, { oficial: "HID", sinonimos: ["ESG"] }, { versaoDesde: 1, versaoAte: null })).toBe(false);
  });
});

describe("linhasParaChecarColisao", () => {
  const sempre = { versaoDesde: 1, versaoAte: null };
  const hid = [linha("HID", true), linha("ESG", false, 1, 1)];
  const colunas = { oficial: "HID", sinonimos: ["ESG"] };

  it("espelhar: confere o espelho novo, na faixa nova", () => {
    expect(
      linhasParaChecarColisao({ decisao: "espelhar", linhas: hid, colunasDepois: { oficial: "HDS", sinonimos: [] }, faixaAntes: sempre, faixaDepois: sempre }),
    ).toEqual([linha("HDS", true)]);
  });

  it("manter com a validade ampliada: confere as linhas atuais (podem passar a valer onde outro item já usa)", () => {
    expect(
      linhasParaChecarColisao({ decisao: "manter", linhas: hid, colunasDepois: colunas, faixaAntes: { versaoDesde: 1, versaoAte: 1 }, faixaDepois: sempre }),
    ).toEqual(hid);
  });

  it("manter sem mudar a validade: nada a conferir", () => {
    expect(linhasParaChecarColisao({ decisao: "manter", linhas: hid, colunasDepois: colunas, faixaAntes: sempre, faixaDepois: sempre })).toEqual([]);
  });

  it("bloquear: nada a conferir (o salvar é recusado antes)", () => {
    expect(linhasParaChecarColisao({ decisao: "bloquear", linhas: hid, colunasDepois: colunas, faixaAntes: sempre, faixaDepois: { versaoDesde: 2, versaoAte: null } })).toEqual([]);
  });
});

describe("faixas efetivas", () => {
  it("intersecaoFaixas trata fim nulo como sem fim e devolve null sem versão em comum", () => {
    expect(intersecaoFaixas({ versaoDesde: 1, versaoAte: null }, { versaoDesde: 2, versaoAte: null })).toEqual({
      versaoDesde: 2,
      versaoAte: null,
    });
    expect(intersecaoFaixas({ versaoDesde: 1, versaoAte: null }, { versaoDesde: 1, versaoAte: 1 })).toEqual({
      versaoDesde: 1,
      versaoAte: 1,
    });
    expect(intersecaoFaixas({ versaoDesde: 2, versaoAte: null }, { versaoDesde: 1, versaoAte: 1 })).toBeNull();
  });

  it("card CFTV encerrado na v1 não ocupa o SEG da v2, mesmo com a sigla em aberto", () => {
    const efetivas = siglasEfetivas([linha("SEG", true)], { versaoDesde: 1, versaoAte: 1 });
    expect(efetivas).toEqual([linha("SEG", true, 1, 1)]);
  });

  it("sub recortada pela própria validade e pela do card; linha fora de tudo some", () => {
    const efetivas = siglasEfetivas(
      [linha("AGF", true), linha("XXX", false, 5)],
      { versaoDesde: 2, versaoAte: null },
      { versaoDesde: 1, versaoAte: 3 },
    );
    expect(efetivas).toEqual([linha("AGF", true, 2, 3)]);
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
