import { describe, expect, it } from "vitest";

import {
  agruparPorDisciplina,
  ancoraNaLista,
  escopoEtapaDisponivel,
  filtrarPranchas,
  ordenarPranchas,
  pranchasDoEscopo,
  rotuloPrancha,
  vizinhas,
  type PranchaNavegavel,
} from "./pranchas-navegacao";

function prancha(uploadId: string, extra: Partial<PranchaNavegavel> = {}): PranchaNavegavel {
  return {
    uploadId,
    documentoId: `doc-${uploadId}`,
    nomeArquivo: `${uploadId}.pdf`,
    revisao: 1,
    titulo: null,
    numeroPrancha: null,
    disciplinaId: "est",
    disciplinaNome: "Estrutural",
    disciplinaOrdem: 1,
    faseId: "ex",
    faseSigla: "EX",
    faseNome: "Executivo",
    ...extra,
  };
}

const arq = { disciplinaId: "arq", disciplinaNome: "Arquitetura", disciplinaOrdem: 0 };
const lista = [
  prancha("est-4010", { numeroPrancha: 4010, titulo: "Detalhe de vigas" }),
  prancha("est-4001", { numeroPrancha: 4001, titulo: "Fundação" }),
  prancha("est-sem-numero"),
  prancha("arq-1001", { ...arq, numeroPrancha: 1001, titulo: "Planta do térreo" }),
  prancha("est-bas", { numeroPrancha: 4001, faseId: "ba", faseSigla: "BA", faseNome: "Básico" }),
];

describe("ordenarPranchas", () => {
  it("disciplina na ordem do projeto, depois número (sem número por último)", () => {
    expect(ordenarPranchas(lista).map((p) => p.uploadId)).toEqual([
      "arq-1001",
      "est-4001",
      "est-bas",
      "est-4010",
      "est-sem-numero",
    ]);
  });
});

describe("pranchasDoEscopo", () => {
  it("etapa = mesma fase da prancha aberta, em todas as disciplinas", () => {
    expect(pranchasDoEscopo(lista, "est-4001", "etapa").map((p) => p.uploadId)).toEqual([
      "arq-1001",
      "est-4001",
      "est-4010",
      "est-sem-numero",
    ]);
  });

  it("projeto = tudo; prancha sem etapa também cai no projeto inteiro", () => {
    expect(pranchasDoEscopo(lista, "est-4001", "projeto")).toHaveLength(5);
    const semFase = [...lista, prancha("solta", { faseId: null, faseSigla: null, faseNome: null })];
    expect(pranchasDoEscopo(semFase, "solta", "etapa")).toHaveLength(6);
  });
});

describe("escopoEtapaDisponivel", () => {
  it("só com etapa na prancha aberta e outra etapa na lista", () => {
    expect(escopoEtapaDisponivel(lista, "est-4001")).toBe(true);
    expect(escopoEtapaDisponivel(lista.filter((p) => p.faseId === "ex"), "est-4001")).toBe(false);
  });
});

describe("filtrarPranchas", () => {
  it("acha por número, por título sem acento e por disciplina", () => {
    expect(filtrarPranchas(lista, "4010").map((p) => p.uploadId)).toEqual(["est-4010"]);
    expect(filtrarPranchas(lista, "terreo").map((p) => p.uploadId)).toEqual(["arq-1001"]);
    expect(filtrarPranchas(lista, "ARQUITETURA")).toHaveLength(1);
    expect(filtrarPranchas(lista, "  ")).toHaveLength(5);
  });
});

describe("vizinhas", () => {
  it("anterior e seguinte na lista recortada, com a posição", () => {
    const etapa = pranchasDoEscopo(lista, "est-4001", "etapa");
    const v = vizinhas(etapa, "est-4001");
    expect(v.anterior?.uploadId).toBe("arq-1001");
    expect(v.proxima?.uploadId).toBe("est-4010");
    expect(v.posicao).toBe(2);
    expect(vizinhas(etapa, "fora")).toEqual({ anterior: null, proxima: null, posicao: 0 });
  });
});

describe("rotuloPrancha e agruparPorDisciplina", () => {
  it("número · título, com o nome do arquivo quando falta título", () => {
    expect(rotuloPrancha(lista[1])).toBe("4001 · Fundação");
    expect(rotuloPrancha(lista[2])).toBe("est-sem-numero.pdf");
  });

  it("agrupa por disciplina mantendo a ordem", () => {
    const g = agruparPorDisciplina(ordenarPranchas(lista));
    expect(g.map((x) => [x.disciplinaNome, x.pranchas.length])).toEqual([
      ["Arquitetura", 1],
      ["Estrutural", 4],
    ]);
  });
});

describe("ancoraNaLista", () => {
  it("a própria prancha quando ela é a vigente", () => {
    expect(ancoraNaLista(lista, "est-4001", [])).toBe("est-4001");
  });

  it("revisão anterior (fora da lista) ancora na vigente do mesmo documento", () => {
    expect(ancoraNaLista(lista, "est-4001-r0", ["doc-est-4001"])).toBe("est-4001");
    // Depois de um merge, o documento canônico também casa.
    expect(ancoraNaLista(lista, "antigo", ["alias", "doc-est-4010"])).toBe("est-4010");
  });

  it("sem documento que case, devolve o próprio id (nada ancorado)", () => {
    expect(ancoraNaLista(lista, "solta", ["doc-inexistente"])).toBe("solta");
    expect(vizinhas(lista, ancoraNaLista(lista, "solta", [])).posicao).toBe(0);
  });
});
