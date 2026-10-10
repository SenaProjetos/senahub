import { describe, expect, it } from "vitest";
import { etapaAtrasada, etapaAtualDoCard } from "./etapas-card";

describe("etapaAtualDoCard", () => {
  it("é a primeira não aprovada, na ordem recebida", () => {
    const r = etapaAtualDoCard([{ status: "aprovado" }, { status: "entregue" }, { status: "aguardando" }]);
    expect(r?.status).toBe("entregue");
  });
  it("nenhuma quando todas aprovadas ou sem etapa", () => {
    expect(etapaAtualDoCard([{ status: "aprovado" }])).toBeNull();
    expect(etapaAtualDoCard([])).toBeNull();
  });
});

describe("etapaAtrasada", () => {
  const hoje = "2026-10-10";
  it("passou do fim e ainda em trabalho", () => {
    expect(etapaAtrasada({ status: "em_andamento", prazo: "2026-10-09" }, hoje)).toBe(true);
    expect(etapaAtrasada({ status: "aguardando", prazo: "2026-10-09" }, hoje)).toBe(true);
  });
  it("no dia do fim, sem prazo, entregue ou aprovada não é atraso", () => {
    expect(etapaAtrasada({ status: "em_andamento", prazo: hoje }, hoje)).toBe(false);
    expect(etapaAtrasada({ status: "em_andamento", prazo: null }, hoje)).toBe(false);
    expect(etapaAtrasada({ status: "entregue", prazo: "2026-10-01" }, hoje)).toBe(false);
    expect(etapaAtrasada({ status: "aprovado", prazo: "2026-10-01" }, hoje)).toBe(false);
  });
});
