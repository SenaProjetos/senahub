import { describe, it, expect } from "vitest";
import { saudeProjeto } from "./health";
import type { NivelSaude } from "./health";
import type { StatusDisciplina } from "@/generated/prisma/client";

// `hoje` é um INSTANTE (o "agora" da função); os prazos são datas-calendário e
// chegam do banco em meia-noite UTC — daí a diferença de construção.
const hoje = new Date(2026, 5, 22, 9, 0);
const ontem = new Date("2026-06-21T00:00:00.000Z");
const amanha = new Date("2026-06-23T00:00:00.000Z");
const em14 = new Date("2026-07-06T00:00:00.000Z"); // 14 dias à frente (limite exato de atenção)
const em30 = new Date("2026-07-22T00:00:00.000Z"); // 30 dias à frente

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

describe("saudeProjeto — prazo em meia-noite UTC (regressão do dia a menos)", () => {
  // Prazo 02/09 às 00:00Z: em America/Sao_Paulo os getters locais davam 01/09 e o
  // projeto virava "atrasado" um dia antes do que o card de /projetos mostrava.
  const prazoUtc = new Date("2026-09-02T00:00:00.000Z");
  const noDiaDoPrazo = new Date(2026, 8, 2, 10, 0);
  const diaSeguinte = new Date(2026, 8, 3, 10, 0);

  it("não considera atrasado no próprio dia do prazo", () => {
    expect(saudeProjeto([disc("em_andamento")], prazoUtc, "em_andamento", noDiaDoPrazo)).toBe("atencao");
  });

  it("considera atrasado só no dia seguinte", () => {
    expect(saudeProjeto([disc("em_andamento")], prazoUtc, "em_andamento", diaSeguinte)).toBe("critico");
  });

  it("aplica a mesma regra ao prazo da disciplina", () => {
    expect(saudeProjeto([disc("em_andamento", prazoUtc)], null, "em_andamento", noDiaDoPrazo)).toBe("ok");
    expect(saudeProjeto([disc("em_andamento", prazoUtc)], null, "em_andamento", diaSeguinte)).toBe("critico");
  });
});
