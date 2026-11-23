import { describe, expect, it } from "vitest";
import {
  diferencaEmDiasCorridos,
  itensFixos,
  marcosDaAgenda,
  motivoSemMarcos,
  rotuloDiferenca,
  situacaoDoMarco,
  type ContratoEntrada,
  type EntradaDaAgenda,
  type MarcoEntrada,
} from "./marcos";

const contrato = (extra: Partial<ContratoEntrada> = {}): ContratoEntrada => ({
  id: "k1",
  titulo: "Contrato Limão",
  tipo: "contrato",
  statusContrato: "assinado",
  formaCobranca: "por_entrega",
  clienteId: "c1",
  projetoId: "p1",
  vinculoId: null,
  assinadoEm: new Date("2026-01-10T15:00:00Z"),
  dataVencimento: null,
  parcelas: [{ id: "pa1", descricao: "Entrega do projeto básico", ordem: 1, naAssinatura: false, marcoId: "m1" }],
  ...extra,
});

const marco = (extra: Partial<MarcoEntrada> = {}): MarcoEntrada => ({
  id: "m1",
  projetoId: "p1",
  status: "and",
  fimPrevisto: "2026-04-02",
  fimReal: null,
  ...extra,
});

function entrada(extra: Partial<EntradaDaAgenda> = {}): EntradaDaAgenda {
  return {
    projetoId: "p1",
    clienteId: "c1",
    prazoContrato: null,
    cronograma: { aprovado: true, emRevisao: false },
    contratos: [contrato()],
    marcos: new Map([["m1", marco()]]),
    combinado: new Map([["m1", "2026-03-15"]]),
    ...extra,
  };
}

describe("agenda — quais marcos entram", () => {
  it("só contrato de cliente, assinado ou vencido, por entrega, sem vínculo, do cliente da conta", () => {
    for (const c of [
      contrato({ tipo: "aditivo" }),
      contrato({ tipo: "proposta" }),
      contrato({ statusContrato: "rascunho" }),
      contrato({ statusContrato: "rescindido" }),
      contrato({ statusContrato: null }),
      contrato({ formaCobranca: "por_data" }),
      contrato({ vinculoId: "v1" }),
      contrato({ clienteId: "outro" }),
      contrato({ projetoId: "p2" }),
    ]) {
      expect(marcosDaAgenda(entrada({ contratos: [c] }))).toEqual([]);
    }
    expect(marcosDaAgenda(entrada({ contratos: [contrato({ statusContrato: "vencido" })] }))).toHaveLength(1);
  });

  it("cronograma ausente ou em rascunho não mostra marco, mas os itens fixos continuam", () => {
    const e = entrada({ prazoContrato: new Date("2026-12-20T12:00:00Z") });
    for (const cronograma of [null, { aprovado: false, emRevisao: false }]) {
      expect(marcosDaAgenda({ ...e, cronograma })).toEqual([]);
      expect(itensFixos({ ...e, cronograma }).map((i) => i.tipo)).toContain("prazo");
    }
  });

  it("parcela na assinatura, parcela sem marco e marco de outro projeto ou inexistente ficam de fora", () => {
    const parcelas = [
      { id: "a", descricao: "Assinatura", ordem: 1, naAssinatura: true, marcoId: null },
      { id: "b", descricao: "Sem marco", ordem: 2, naAssinatura: false, marcoId: null },
      { id: "c", descricao: "Marco de outro projeto", ordem: 3, naAssinatura: false, marcoId: "m9" },
      { id: "d", descricao: "Marco apagado", ordem: 4, naAssinatura: false, marcoId: "m8" },
    ];
    const marcos = new Map([
      ["m1", marco()],
      ["m9", marco({ id: "m9", projetoId: "p2" })],
    ]);
    expect(marcosDaAgenda(entrada({ contratos: [contrato({ parcelas })], marcos }))).toEqual([]);
  });

  it("dois contratos apontando o mesmo marco dão uma linha só, com a descrição da menor ordem", () => {
    const outro = contrato({
      id: "k2",
      parcelas: [{ id: "pb1", descricao: "Segunda descrição", ordem: 2, naAssinatura: false, marcoId: "m1" }],
    });
    const r = marcosDaAgenda(entrada({ contratos: [outro, contrato()] }));
    expect(r).toHaveLength(1);
    expect(r[0].titulo).toBe("Entrega do projeto básico");
    expect(r[0].parcelaId).toBe("pa1");
  });
});

describe("agenda — datas e situação do marco", () => {
  it("marco fora da BL-00 mostra só a previsão (sem combinado, sem diferença)", () => {
    const [m] = marcosDaAgenda(entrada({ combinado: new Map() }));
    expect(m.combinado).toBeNull();
    expect(m.diferencaDias).toBeNull();
    expect(m.situacao).toBe("sem_combinado");
    expect(m.previsao).toBe("2026-04-02");
  });

  it("previsão depois do combinado = alterada, com os dias de diferença", () => {
    const [m] = marcosDaAgenda(entrada({ marcos: new Map([["m1", marco({ fimPrevisto: "2026-04-02" })]]) }));
    expect(m.situacao).toBe("alterada");
    expect(m.diferencaDias).toBe(18);
  });

  it("previsão igual ou antes do combinado = no prazo", () => {
    for (const fim of ["2026-03-15", "2026-03-13"]) {
      const [m] = marcosDaAgenda(entrada({ marcos: new Map([["m1", marco({ fimPrevisto: fim })]]) }));
      expect(m.situacao).toBe("no_prazo");
    }
  });

  it("marco concluído = entregue, com a data real e o combinado à vista", () => {
    const [m] = marcosDaAgenda(entrada({ marcos: new Map([["m1", marco({ status: "con", fimReal: "2026-03-20" })]]) }));
    expect(m.situacao).toBe("entregue");
    expect(m.entregueEm).toBe("2026-03-20");
    expect(m.combinado).toBe("2026-03-15");
    expect(m.diferencaDias).toBe(5);
  });

  it("marco concluído sem data real usa a previsão como entrega", () => {
    const [m] = marcosDaAgenda(entrada({ marcos: new Map([["m1", marco({ status: "con", fimReal: null })]]) }));
    expect(m.entregueEm).toBe("2026-04-02");
  });

  it("ordena por data", () => {
    const parcelas = [
      { id: "x", descricao: "Segunda", ordem: 1, naAssinatura: false, marcoId: "m2" },
      { id: "y", descricao: "Primeira", ordem: 2, naAssinatura: false, marcoId: "m1" },
    ];
    const marcos = new Map([
      ["m1", marco({ fimPrevisto: "2026-03-01" })],
      ["m2", marco({ id: "m2", fimPrevisto: "2026-06-01" })],
    ]);
    const r = marcosDaAgenda(entrada({ contratos: [contrato({ parcelas })], marcos }));
    expect(r.map((m) => m.titulo)).toEqual(["Primeira", "Segunda"]);
  });

  it("situacaoDoMarco", () => {
    expect(situacaoDoMarco({ concluido: true, combinado: null, previsao: "2026-01-01" })).toBe("entregue");
    expect(situacaoDoMarco({ concluido: false, combinado: null, previsao: "2026-01-01" })).toBe("sem_combinado");
    expect(situacaoDoMarco({ concluido: false, combinado: "2026-01-01", previsao: "2026-01-02" })).toBe("alterada");
    expect(situacaoDoMarco({ concluido: false, combinado: "2026-01-02", previsao: "2026-01-02" })).toBe("no_prazo");
  });
});

describe("agenda — por que a equipe não vê marcos", () => {
  it("com marcos, nada a explicar; sem contrato por entrega, também nada", () => {
    expect(motivoSemMarcos(entrada())).toBeNull();
    expect(motivoSemMarcos(entrada({ contratos: [contrato({ formaCobranca: "por_data" })] }))).toBeNull();
    expect(motivoSemMarcos(entrada({ contratos: [] }))).toBeNull();
  });
  it("contrato ainda não assinado", () => {
    expect(motivoSemMarcos(entrada({ contratos: [contrato({ statusContrato: "aguardando_assinatura" })] }))).toBe("O contrato ainda não foi assinado.");
  });
  it("cronograma em rascunho", () => {
    expect(motivoSemMarcos(entrada({ cronograma: { aprovado: false, emRevisao: false } }))).toBe(
      "O cronograma do projeto ainda está em rascunho — os marcos aparecem para o cliente quando ele for aprovado.",
    );
    expect(motivoSemMarcos(entrada({ cronograma: null }))).toContain("rascunho");
  });
  it("cronograma aprovado mas parcelas sem marco", () => {
    const parcelas = [{ id: "a", descricao: "Sem marco", ordem: 1, naAssinatura: false, marcoId: null }];
    expect(motivoSemMarcos(entrada({ contratos: [contrato({ parcelas })] }))).toBe("As parcelas do contrato não têm marco do cronograma.");
  });
});

describe("agenda — itens fixos", () => {
  it("assinatura, prazo e vigência, cada um só se existir", () => {
    expect(itensFixos(entrada({ contratos: [contrato({ assinadoEm: null })] }))).toEqual([]);
    const r = itensFixos(
      entrada({
        prazoContrato: new Date("2026-12-20T12:00:00Z"),
        contratos: [contrato({ dataVencimento: new Date("2027-01-31T00:00:00Z") })],
      }),
    );
    expect(r.map((i) => [i.tipo, i.dia])).toEqual([
      ["assinatura", "2026-01-10"],
      ["prazo", "2026-12-20"],
      ["vigencia", "2027-01-31"],
    ]);
  });

  it("data perto da meia-noite cai no dia de São Paulo, não no UTC", () => {
    const r = itensFixos(
      entrada({
        prazoContrato: new Date("2026-12-01T02:30:00Z"),
        contratos: [contrato({ assinadoEm: new Date("2026-12-01T02:30:00Z") })],
      }),
    );
    expect(r.find((i) => i.tipo === "assinatura")?.dia).toBe("2026-11-30");
    expect(r.find((i) => i.tipo === "prazo")?.dia).toBe("2026-11-30");
  });

  it("prazo do projeto gravado como data (meia-noite UTC) mostra o mesmo dia, não o anterior", () => {
    const r = itensFixos(entrada({ prazoContrato: new Date("2026-12-01T00:00:00.000Z"), contratos: [] }));
    expect(r.find((i) => i.tipo === "prazo")?.dia).toBe("2026-12-01");
  });

  it("só contratos válidos entram nos itens fixos", () => {
    expect(itensFixos(entrada({ contratos: [contrato({ tipo: "aditivo" }), contrato({ statusContrato: "rascunho" })] }))).toEqual([]);
  });
});

describe("agenda — diferença em dias", () => {
  it("dias corridos com sinal", () => {
    expect(diferencaEmDiasCorridos("2026-03-15", "2026-04-02")).toBe(18);
    expect(diferencaEmDiasCorridos("2026-03-15", "2026-03-13")).toBe(-2);
    expect(diferencaEmDiasCorridos("2026-02-27", "2026-03-02")).toBe(3);
  });

  it("rótulo", () => {
    expect(rotuloDiferenca(18)).toBe("+18 dias");
    expect(rotuloDiferenca(1)).toBe("+1 dia");
    expect(rotuloDiferenca(-2)).toBe("2 dias antes");
    expect(rotuloDiferenca(-1)).toBe("1 dia antes");
    expect(rotuloDiferenca(0)).toBe("no dia");
  });
});
