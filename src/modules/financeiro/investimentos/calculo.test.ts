import { describe, expect, it } from "vitest";
import {
  aliquotaIR,
  entraNoPlanejador,
  MOTIVO_ARQUIVAR_COM_SALDO,
  MOTIVO_BRUTO_MENOR,
  MOTIVO_EXCLUIR_COM_MOVIMENTO,
  MOTIVO_RESGATE_MAIOR,
  MOTIVO_SEM_APORTE,
  motivoParaNaoArquivar,
  motivoParaNaoExcluir,
  planejarResgate,
  posicaoDoAtivo,
  sugerirRendimento,
  tipoDoMovimento,
  type LancamentoDoAtivo,
} from "@/modules/financeiro/investimentos/calculo";

const l = (id: string, tipo: "receita" | "despesa", valor: number, data: string, transf = false): LancamentoDoAtivo => ({
  id,
  tipo,
  valor,
  data,
  transferenciaId: transf ? `t-${id}` : null,
  descricao: id,
});

// O CDB do mock: aporte de 80.000 em 12/01, rendimento bruto de 3.920 em 31/07, IR provisionado de 784.
const cdb = [l("aporte", "receita", 80_000_00, "2026-01-12", true), l("rend", "receita", 3_920_00, "2026-07-31"), l("ir", "despesa", 784_00, "2026-07-31")];

describe("tipo do movimento é lido do lançamento", () => {
  it("perna que entra = aporte, que sai = resgate, receita = rendimento, despesa = imposto", () => {
    expect(tipoDoMovimento({ tipo: "receita", transferenciaId: "t" })).toBe("aporte");
    expect(tipoDoMovimento({ tipo: "despesa", transferenciaId: "t" })).toBe("resgate");
    expect(tipoDoMovimento({ tipo: "receita", transferenciaId: null })).toBe("rendimento");
    expect(tipoDoMovimento({ tipo: "despesa", transferenciaId: null })).toBe("imposto");
  });
});

describe("posição (números do mock)", () => {
  it("80.000 aplicado + 3.920 − 784 = 83.136", () => {
    const p = posicaoDoAtivo(cdb);
    expect(p).toEqual({ aplicado: 80_000_00, rendimentoBruto: 3_920_00, impostos: 784_00, valorAtual: 83_136_00, rendimentoLiquido: 3_136_00, primeiroAporte: "2026-01-12" });
  });
  it("resgate parcial reduz o aplicado e o valor atual", () => {
    const p = posicaoDoAtivo([...cdb, l("resg", "despesa", 10_000_00, "2026-08-10", true)]);
    expect(p.aplicado).toBe(70_000_00);
    expect(p.valorAtual).toBe(73_136_00);
  });
});

describe("IR regressivo", () => {
  it("22,5 / 20 / 17,5 / 15%", () => {
    expect(aliquotaIR(180)).toBe(2250);
    expect(aliquotaIR(181)).toBe(2000);
    expect(aliquotaIR(360)).toBe(2000);
    expect(aliquotaIR(361)).toBe(1750);
    expect(aliquotaIR(721)).toBe(1500);
  });
});

describe("registrar rendimento pelo bruto do banco", () => {
  it("rendimento = bruto informado − bruto do sistema; IR = devido sobre tudo − já provisionado", () => {
    const so = posicaoDoAtivo([cdb[0]]);
    const s = sugerirRendimento(so, { brutoInformado: 83_920_00, data: "2026-07-31", isentoIR: false });
    // 200 dias desde 12/01 → 20%: 3.920 × 20% = 784 (o IR do mock).
    expect(s).toEqual({ rendimento: 3_920_00, ir: 784_00, aliquotaBp: 2000, dias: 200 });
  });
  it("o segundo registro só provisiona a diferença do IR", () => {
    const p = posicaoDoAtivo(cdb);
    const s = sugerirRendimento(p, { brutoInformado: 84_920_00, data: "2026-08-31", isentoIR: false });
    expect(s).toMatchObject({ rendimento: 1_000_00, ir: 200_00 });
  });
  it("isento (LCI/LCA) sugere IR zero", () => {
    expect(sugerirRendimento(posicaoDoAtivo([cdb[0]]), { brutoInformado: 81_000_00, data: "2026-07-31", isentoIR: true })).toMatchObject({ rendimento: 1_000_00, ir: 0 });
  });
  it("bruto menor que o do sistema é recusado; sem aporte também", () => {
    expect(sugerirRendimento(posicaoDoAtivo(cdb), { brutoInformado: 80_000_00, data: "2026-08-01", isentoIR: false })).toEqual({ erro: MOTIVO_BRUTO_MENOR });
    expect(sugerirRendimento(posicaoDoAtivo([]), { brutoInformado: 1, data: "2026-08-01", isentoIR: false })).toEqual({ erro: MOTIVO_SEM_APORTE });
  });
});

describe("resgate", () => {
  const p = posicaoDoAtivo(cdb);
  it("total: o que caiu manda; a diferença vira rendimento (a mais) ou imposto (a menos)", () => {
    expect(planejarResgate(p, { valorRecebido: 83_500_00, total: true })).toEqual({ ajuste: { tipo: "rendimento", valor: 364_00 }, transferencia: 83_500_00, total: true });
    expect(planejarResgate(p, { valorRecebido: 83_000_00, total: true })).toEqual({ ajuste: { tipo: "imposto", valor: 136_00 }, transferencia: 83_000_00, total: true });
    expect(planejarResgate(p, { valorRecebido: 83_136_00, total: true })).toEqual({ ajuste: null, transferencia: 83_136_00, total: true });
  });
  it("parcial: só a transferência, nunca acima do valor atual", () => {
    expect(planejarResgate(p, { valorRecebido: 10_000_00, total: false })).toEqual({ ajuste: null, transferencia: 10_000_00, total: false });
    expect(planejarResgate(p, { valorRecebido: 90_000_00, total: false })).toEqual({ erro: MOTIVO_RESGATE_MAIOR });
  });
});

describe("excluir, arquivar e planejador", () => {
  it("excluir só sem movimento; arquivar só zerado", () => {
    expect(motivoParaNaoExcluir(0)).toBeNull();
    expect(motivoParaNaoExcluir(3)).toBe(MOTIVO_EXCLUIR_COM_MOVIMENTO);
    expect(motivoParaNaoArquivar({ valorAtual: 0 })).toBeNull();
    expect(motivoParaNaoArquivar({ valorAtual: 1 })).toBe(MOTIVO_ARQUIVAR_COM_SALDO);
  });
  it("vencimento entra no planejador só com liquidez no vencimento, dentro do horizonte e com valor", () => {
    const a = { liquidez: "vencimento" as const, vencimento: "2026-11-10", arquivado: false };
    expect(entraNoPlanejador(a, 100, "2026-10-02", "2026-12-31")).toBe(true);
    expect(entraNoPlanejador({ ...a, liquidez: "diaria" }, 100, "2026-10-02", "2026-12-31")).toBe(false);
    expect(entraNoPlanejador({ ...a, vencimento: "2027-06-01" }, 100, "2026-10-02", "2026-12-31")).toBe(false);
    expect(entraNoPlanejador(a, 0, "2026-10-02", "2026-12-31")).toBe(false);
    expect(entraNoPlanejador({ ...a, arquivado: true }, 100, "2026-10-02", "2026-12-31")).toBe(false);
  });
});
