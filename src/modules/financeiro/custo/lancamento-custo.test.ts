import { describe, it, expect } from "vitest";
import {
  statusLancamentoServico,
  CATEGORIA_POR_TIPO,
  CATEGORIA_TERCEIRIZADO,
  MOTIVO_SERVICO_PAGO,
  planoDaDespesaServico,
} from "@/modules/financeiro/custo/lancamento-custo";

describe("statusLancamentoServico", () => {
  it("contratado vira despesa prevista", () => {
    expect(statusLancamentoServico("contratado")).toBe("previsto");
  });
  it("concluido vira despesa confirmada", () => {
    expect(statusLancamentoServico("concluido")).toBe("confirmado");
  });
  it("cancelado não gera lançamento", () => {
    expect(statusLancamentoServico("cancelado")).toBeNull();
  });
  it("status desconhecido não gera lançamento", () => {
    expect(statusLancamentoServico("rascunho")).toBeNull();
  });
});

describe("categorias do plano de contas", () => {
  it("mapeia cada tipo de profissional para uma conta de despesa", () => {
    expect(CATEGORIA_POR_TIPO.projetista_pj).toBe("2.01");
    expect(CATEGORIA_POR_TIPO.freelancer).toBe("2.02");
    expect(CATEGORIA_POR_TIPO.clt).toBe("2.03");
    expect(CATEGORIA_POR_TIPO.estagiario).toBe("2.04");
  });
  it("serviço terceirizado usa a conta de fornecedores externos", () => {
    expect(CATEGORIA_TERCEIRIZADO).toBe("2.05");
  });
});

describe("planoDaDespesaServico (A7: serviço não mexe em despesa paga)", () => {
  const pago = { status: "confirmado", valorCentavos: 50_000 };
  const aberto = { status: "previsto", valorCentavos: 50_000 };

  it("sem lançamento: cria conforme a situação, ou nada sem valor", () => {
    expect(planoDaDespesaServico(null, "previsto", 50_000)).toEqual({ tipo: "criar", status: "previsto" });
    expect(planoDaDespesaServico(null, "confirmado", 50_000)).toEqual({ tipo: "criar", status: "confirmado" });
    expect(planoDaDespesaServico(null, "previsto", null)).toEqual({ tipo: "nada" });
    expect(planoDaDespesaServico(null, null, 50_000)).toEqual({ tipo: "nada" });
  });

  it("em aberto: acompanha valor e situação; concluir confirma agora", () => {
    expect(planoDaDespesaServico(aberto, "previsto", 60_000)).toEqual({ tipo: "atualizar", status: "previsto", confirmarAgora: false });
    expect(planoDaDespesaServico(aberto, "confirmado", 50_000)).toEqual({ tipo: "atualizar", status: "confirmado", confirmarAgora: true });
    expect(planoDaDespesaServico(aberto, null, 50_000)).toEqual({ tipo: "cancelar" });
  });

  it("cancelada: reabre a mesma; cancelar de novo não faz nada", () => {
    const cancelada = { status: "cancelado", valorCentavos: 50_000 };
    expect(planoDaDespesaServico(cancelada, "previsto", 50_000)).toEqual({ tipo: "atualizar", status: "previsto", confirmarAgora: false });
    expect(planoDaDespesaServico(cancelada, null, 50_000)).toEqual({ tipo: "nada" });
  });

  it("paga e editada sem mudar valor nem situação: só o texto acompanha (a data de pagamento fica)", () => {
    expect(planoDaDespesaServico(pago, "confirmado", 50_000)).toEqual({ tipo: "so_texto" });
  });

  it("paga: voltar para contratado, cancelar ou tirar o valor é recusado", () => {
    expect(planoDaDespesaServico(pago, "previsto", 50_000)).toEqual({ tipo: "recusar", motivo: MOTIVO_SERVICO_PAGO });
    expect(planoDaDespesaServico(pago, null, 50_000)).toEqual({ tipo: "recusar", motivo: MOTIVO_SERVICO_PAGO });
    expect(planoDaDespesaServico(pago, "confirmado", null)).toEqual({ tipo: "recusar", motivo: MOTIVO_SERVICO_PAGO });
  });

  it("paga: mudar o valor é recusado com o valor pago na frase", () => {
    const r = planoDaDespesaServico(pago, "confirmado", 55_000);
    expect(r.tipo).toBe("recusar");
    expect(r.tipo === "recusar" && r.motivo.replace(/\s/g, " ")).toContain("R$ 500,00");
  });
});
