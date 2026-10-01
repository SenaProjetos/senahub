import { describe, expect, it } from "vitest";
import {
  BP_TOTAL,
  bpDoTexto,
  bpParaTexto,
  elegivelParaDistribuir,
  motivoDaDivisao,
  partesDeCaixinha,
  ratear,
  regraSugerida,
  somaBp,
  type ItemDeRegra,
  type RecebimentoParaDistribuir,
} from "@/modules/financeiro/distribuicao/calculo";

// Regra do mock: Operacional 35, Salários 25, Encargos 10, Férias 5, 13º 5, Impostos 10, Emergência 10.
const MOCK: ItemDeRegra[] = [
  { caixinhaId: null, bp: 3500 },
  { caixinhaId: "sal", bp: 2500 },
  { caixinhaId: "enc", bp: 1000 },
  { caixinhaId: "fer", bp: 500 },
  { caixinhaId: "d13", bp: 500 },
  { caixinhaId: "imp", bp: 1000 },
  { caixinhaId: "eme", bp: 1000 },
];

describe("percentual em basis points", () => {
  it("lê o texto digitado, com vírgula ou ponto e até 2 casas", () => {
    expect(bpDoTexto("35")).toBe(3500);
    expect(bpDoTexto("12,5")).toBe(1250);
    expect(bpDoTexto("12.55%")).toBe(1255);
    expect(bpDoTexto(" 100 ")).toBe(10_000);
    expect(bpDoTexto("100,01")).toBeNull();
    expect(bpDoTexto("abc")).toBeNull();
    expect(bpDoTexto("")).toBeNull();
    expect(bpDoTexto("-5")).toBeNull();
    expect(bpDoTexto("1,234")).toBeNull();
  });
  it("escreve sem casas quando é inteiro", () => {
    expect(bpParaTexto(3500)).toBe("35%");
    expect(bpParaTexto(1250)).toBe("12,5%");
    expect(bpParaTexto(1255)).toBe("12,55%");
  });
});

describe("motivoDaDivisao (a regra fecha 100%)", () => {
  it("o exemplo do mock fecha", () => {
    expect(somaBp(MOCK)).toBe(BP_TOTAL);
    expect(motivoDaDivisao(MOCK)).toBeNull();
  });
  it("95% pede os 5% que faltam; 105% diz quanto passou", () => {
    expect(motivoDaDivisao(MOCK.map((i) => (i.caixinhaId === "sal" ? { ...i, bp: 2000 } : i)))).toBe("Faltam 5% para fechar 100%.");
    expect(motivoDaDivisao(MOCK.map((i) => (i.caixinhaId === "sal" ? { ...i, bp: 3000 } : i)))).toBe("Passou 5% de 100%.");
  });
  it("destino repetido, parte zerada e lista vazia", () => {
    expect(motivoDaDivisao([{ caixinhaId: "a", bp: 5000 }, { caixinhaId: "a", bp: 5000 }])).toBe("Uma caixinha aparece mais de uma vez.");
    expect(motivoDaDivisao([{ caixinhaId: null, bp: 5000 }, { caixinhaId: null, bp: 5000 }])).toBe("“Operacional (livre)” aparece mais de uma vez.");
    expect(motivoDaDivisao([{ caixinhaId: "a", bp: 10_000 }, { caixinhaId: "b", bp: 0 }])).toBe("Cada destino precisa de um percentual maior que zero.");
    expect(motivoDaDivisao([])).toBe("Adicione ao menos um destino.");
  });
});

describe("ratear: a soma fecha o valor, o resto vai para o último", () => {
  it("R$ 12.000 do mock: 35% livre, 25% salários…", () => {
    const partes = ratear(1_200_000, MOCK);
    expect(partes.map((p) => p.valor)).toEqual([420_000, 300_000, 120_000, 60_000, 60_000, 120_000, 120_000]);
    expect(partes.reduce((s, p) => s + p.valor, 0)).toBe(1_200_000);
  });

  it("centavos que não dividem: o último absorve a diferença, nada some nem sobra", () => {
    const itens: ItemDeRegra[] = [
      { caixinhaId: "a", bp: 3333 },
      { caixinhaId: "b", bp: 3333 },
      { caixinhaId: "c", bp: 3334 },
    ];
    const partes = ratear(10_001, itens);
    expect(partes.reduce((s, p) => s + p.valor, 0)).toBe(10_001);
    expect(partes.slice(0, 2).every((p) => p.valor === Math.floor((10_001 * 3333) / 10_000))).toBe(true);
    for (const v of [0, 1, 2, 3, 99, 100, 12_345_678]) expect(ratear(v, itens).reduce((s, p) => s + p.valor, 0)).toBe(v);
  });

  it("divisão inválida ou valor inválido não rateia", () => {
    expect(ratear(1000, [{ caixinhaId: "a", bp: 5000 }])).toEqual([]);
    expect(ratear(-1, MOCK)).toEqual([]);
    expect(ratear(10.5, MOCK)).toEqual([]);
  });

  it("só as partes de caixinha viram reservado: a livre fica no caixa", () => {
    const so = partesDeCaixinha(ratear(1_200_000, MOCK));
    expect(so.map((p) => p.caixinhaId)).toEqual(["sal", "enc", "fer", "d13", "imp", "eme"]);
    expect(so.reduce((s, p) => s + p.valor, 0)).toBe(1_200_000 - 420_000);
    expect(partesDeCaixinha(ratear(0, MOCK))).toEqual([]);
  });
});

describe("regraSugerida", () => {
  const regras = [
    { id: "cliente", ativa: true, padrao: true, categoriasIds: ["c-proj"] },
    { id: "licit", ativa: true, padrao: false, categoriasIds: ["c-lic"] },
    { id: "velha", ativa: false, padrao: false, categoriasIds: ["c-out"] },
  ];
  it("a que cita a categoria; senão a padrão; inativa nunca", () => {
    expect(regraSugerida(regras, "c-lic")?.id).toBe("licit");
    expect(regraSugerida(regras, "c-xyz")?.id).toBe("cliente");
    expect(regraSugerida(regras, "c-out")?.id).toBe("cliente");
    expect(regraSugerida(regras, null)?.id).toBe("cliente");
  });
  it("sem padrão e sem categoria que case: nenhuma", () => {
    expect(regraSugerida(regras.map((r) => ({ ...r, padrao: false })), "c-xyz")).toBeNull();
    expect(regraSugerida([], "c-lic")).toBeNull();
  });
});

describe("elegivelParaDistribuir (I9: desde, sem transferência e sem reembolso)", () => {
  const r: RecebimentoParaDistribuir = { tipo: "receita", status: "confirmado", natureza: "resultado", dataConfirmacao: "2026-09-29", tags: [], tratado: false };
  const desde = "2026-09-20";

  it("receita realizada do resultado, depois da data inicial", () => {
    expect(elegivelParaDistribuir(r, desde)).toBe(true);
    expect(elegivelParaDistribuir({ ...r, dataConfirmacao: desde }, desde)).toBe(true);
  });
  it("antes da data inicial, sem data inicial ou sem data de recebimento: fora", () => {
    expect(elegivelParaDistribuir({ ...r, dataConfirmacao: "2026-09-19" }, desde)).toBe(false);
    expect(elegivelParaDistribuir(r, null)).toBe(false);
    expect(elegivelParaDistribuir({ ...r, dataConfirmacao: null }, desde)).toBe(false);
  });
  it("transferência, reembolso de ART, despesa, em aberto e já tratado: fora", () => {
    expect(elegivelParaDistribuir({ ...r, natureza: "transferencia" }, desde)).toBe(false);
    expect(elegivelParaDistribuir({ ...r, tags: ["reembolso-art"] }, desde)).toBe(false);
    expect(elegivelParaDistribuir({ ...r, tipo: "despesa" }, desde)).toBe(false);
    expect(elegivelParaDistribuir({ ...r, status: "previsto" }, desde)).toBe(false);
    expect(elegivelParaDistribuir({ ...r, tratado: true }, desde)).toBe(false);
  });
});
