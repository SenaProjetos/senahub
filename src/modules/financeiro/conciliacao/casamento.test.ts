import { describe, expect, it } from "vitest";
import {
  casamentoAutomatico,
  planoDesconciliar,
  sugestoesDaTransacao,
  type CandidatoConciliacao,
  type EstadoAntesDaConciliacao,
} from "@/modules/financeiro/conciliacao/casamento";

const t = { valorCentavos: -45_050, contaId: "itau", dia: "2026-03-10" };
function c(p: Partial<CandidatoConciliacao> & { id: string }): CandidatoConciliacao {
  return { tipo: "despesa", valorCentavos: 45_050, status: "previsto", contaId: null, transferenciaId: null, dia: "2026-03-10", ...p };
}

describe("casamentoAutomatico (A4)", () => {
  it("um candidato previsto, mesmo valor, conta compatível, dentro de 5 dias", () => {
    expect(casamentoAutomatico(t, [c({ id: "a", dia: "2026-03-14" })])).toBe("a");
    expect(casamentoAutomatico(t, [c({ id: "a", contaId: "itau" })])).toBe("a");
  });
  it("outra conta nunca casa", () => {
    expect(casamentoAutomatico(t, [c({ id: "a", contaId: "nubank" })])).toBeNull();
  });
  it("empate nunca é automático", () => {
    expect(casamentoAutomatico(t, [c({ id: "a" }), c({ id: "b", dia: "2026-03-11" })])).toBeNull();
  });
  it("perna de transferência, pago, fora da janela, outro sinal ou centavo diferente: não", () => {
    expect(casamentoAutomatico(t, [c({ id: "a", transferenciaId: "x" })])).toBeNull();
    expect(casamentoAutomatico(t, [c({ id: "a", status: "confirmado" })])).toBeNull();
    expect(casamentoAutomatico(t, [c({ id: "a", dia: "2026-03-16" })])).toBeNull();
    expect(casamentoAutomatico(t, [c({ id: "a", tipo: "receita" })])).toBeNull();
    expect(casamentoAutomatico(t, [c({ id: "a", valorCentavos: 45_051 })])).toBeNull();
  });
  it("aguardando aprovação nunca é confirmado pelo extrato", () => {
    expect(casamentoAutomatico(t, [c({ id: "a", status: "aguardando_aprovacao" })])).toBeNull();
  });
});

describe("sugestoesDaTransacao", () => {
  it("mais perto da data primeiro; previsto antes de pago no empate; outra conta e longe ficam fora", () => {
    const s = sugestoesDaTransacao(t, [
      c({ id: "longe", dia: "2026-05-30" }),
      c({ id: "pago", status: "confirmado", dia: "2026-03-12" }),
      c({ id: "aberto", dia: "2026-03-12" }),
      c({ id: "perto", dia: "2026-03-10" }),
      c({ id: "outra", contaId: "nubank" }),
    ]);
    expect(s.map((x) => x.id)).toEqual(["perto", "aberto", "pago"]);
  });
});

describe("planoDesconciliar", () => {
  const antes: EstadoAntesDaConciliacao = { criadoPelaConciliacao: false, status: "previsto", dataConfirmacao: null, contaId: null, pagamento: null };
  const atual = { status: "confirmado", dataConfirmacao: "2026-03-10", distribuido: false };
  it("a conciliação pagou: volta ao que era", () => {
    expect(planoDesconciliar({ antes, atual, diaDaTransacao: "2026-03-10" })).toEqual({ tipo: "restaurar", estado: antes });
  });
  it("a conciliação criou o lançamento: ele sai", () => {
    expect(planoDesconciliar({ antes: { ...antes, criadoPelaConciliacao: true }, atual, diaDaTransacao: "2026-03-10" }).tipo).toBe("excluir");
  });
  it("já estava pago antes (produção paga e depois conciliada): só desliga", () => {
    expect(planoDesconciliar({ antes: { ...antes, status: "confirmado" }, atual, diaDaTransacao: "2026-03-10" })).toEqual({ tipo: "so_desligar", aviso: null });
  });
  it("conciliação antiga, sem foto: só desliga (como sempre)", () => {
    expect(planoDesconciliar({ antes: null, atual, diaDaTransacao: "2026-03-10" })).toEqual({ tipo: "so_desligar", aviso: null });
  });
  it("mexido depois ou receita distribuída: só desliga, com aviso", () => {
    expect(planoDesconciliar({ antes, atual: { ...atual, dataConfirmacao: "2026-03-11" }, diaDaTransacao: "2026-03-10" }).tipo).toBe("so_desligar");
    const d = planoDesconciliar({ antes, atual: { ...atual, distribuido: true }, diaDaTransacao: "2026-03-10" });
    expect(d.tipo === "so_desligar" && d.aviso).toContain("estorne");
  });
});
