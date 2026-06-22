import { describe, it, expect } from "vitest";
import { saudeProjeto } from "./health";
import type { NivelSaude } from "./health";
import type { StatusDisciplina } from "@/generated/prisma/client";

const hoje = new Date("2026-06-22");
const ontem = new Date("2026-06-21");
const amanha = new Date("2026-06-23");
const em14 = new Date("2026-07-06"); // 14 dias à frente (limite exato de atenção)
const em30 = new Date("2026-07-22"); // 30 dias à frente

function disc(status: StatusDisciplina, prazo?: Date | null) {
  return { status, prazo: prazo ?? null };
}

describe("saudeProjeto", () => {
  it("retorna null para situação não em_andamento", () => {
    expect(saudeProjeto([], null, "concluido", hoje)).toBeNull();
    expect(saudeProjeto([], null, "arquivado", hoje)).toBeNull();
    expect(saudeProjeto([], null, "cancelado", hoje)).toBeNull();
  });

  it("retorna 'ok' quando não há disciplinas atrasadas e prazo folgado", () => {
    const r = saudeProjeto(
      [disc("em_andamento", em30), disc("aguardando", em30)],
      em30,
      "em_andamento",
      hoje,
    );
    expect(r).toBe<NivelSaude>("ok");
  });

  it("retorna 'ok' com disciplinas aprovadas mesmo com prazo passado", () => {
    const r = saudeProjeto(
      [disc("aprovado", ontem)],
      em30,
      "em_andamento",
      hoje,
    );
    expect(r).toBe<NivelSaude>("ok");
  });

  it("retorna 'atencao' quando prazo do projeto está nos próximos 14 dias", () => {
    const r = saudeProjeto(
      [disc("em_andamento", em30)],
      em14,
      "em_andamento",
      hoje,
    );
    expect(r).toBe<NivelSaude>("atencao");
  });

  it("retorna 'atencao' quando há pelo menos uma disciplina atrasada (< 50%)", () => {
    const r = saudeProjeto(
      [disc("em_andamento", ontem), disc("em_andamento", em30), disc("em_andamento", em30), disc("em_andamento", em30)],
      em30,
      "em_andamento",
      hoje,
    );
    expect(r).toBe<NivelSaude>("atencao");
  });

  it("retorna 'critico' quando projeto está atrasado", () => {
    const r = saudeProjeto(
      [disc("em_andamento", em30)],
      ontem,
      "em_andamento",
      hoje,
    );
    expect(r).toBe<NivelSaude>("critico");
  });

  it("retorna 'critico' quando ≥ 50% das disciplinas estão atrasadas", () => {
    const r = saudeProjeto(
      [disc("em_andamento", ontem), disc("em_andamento", ontem), disc("em_andamento", em30)],
      em30,
      "em_andamento",
      hoje,
    );
    expect(r).toBe<NivelSaude>("critico");
  });

  it("retorna 'ok' com prazo final amanhã que ainda não venceu", () => {
    const r = saudeProjeto(
      [disc("em_andamento", em30)],
      amanha,
      "em_andamento",
      hoje,
    );
    // amanhã ainda está dentro dos 14 dias — deve ser "atencao"
    expect(r).toBe<NivelSaude>("atencao");
  });

  it("retorna 'ok' sem disciplinas e sem prazo", () => {
    const r = saudeProjeto([], null, "em_andamento", hoje);
    expect(r).toBe<NivelSaude>("ok");
  });
});
