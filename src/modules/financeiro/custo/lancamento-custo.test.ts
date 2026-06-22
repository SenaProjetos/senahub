import { describe, it, expect } from "vitest";
import {
  statusLancamentoServico,
  CATEGORIA_POR_TIPO,
  CATEGORIA_TERCEIRIZADO,
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
