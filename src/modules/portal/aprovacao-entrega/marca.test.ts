import { describe, expect, it } from "vitest";
import { marcaDaParcela } from "./marca";

const d = (s: string) => new Date(s);

describe("aprovação da entrega — marca da parcela", () => {
  it("aceito mais recente vence um aguardando mais novo", () => {
    const m = marcaDaParcela([
      {
        titulo: "A",
        status: "respondido",
        enviadoEm: d("2026-12-01T12:00:00Z"),
        resposta: { resposta: "aprovado", respondidoEm: d("2026-12-02T12:00:00Z") },
      },
      { titulo: "B", status: "aguardando", enviadoEm: d("2026-12-05T12:00:00Z"), resposta: null },
    ]);
    expect(m).toEqual({ tipo: "aceita", ressalvas: false, em: "2026-12-02", titulo: "A" });
  });

  it("ressalvas marca aceita com ressalvas (dia de São Paulo)", () => {
    const m = marcaDaParcela([
      {
        titulo: "A",
        status: "respondido",
        enviadoEm: d("2026-12-01T12:00:00Z"),
        resposta: { resposta: "aprovado_com_ressalvas", respondidoEm: d("2026-12-03T02:00:00Z") },
      },
    ]);
    expect(m).toEqual({ tipo: "aceita", ressalvas: true, em: "2026-12-02", titulo: "A" });
  });

  it("sem aceito, não aprovado mais recente", () => {
    const m = marcaDaParcela([
      { titulo: "A", status: "aguardando", enviadoEm: d("2026-12-01T12:00:00Z"), resposta: null },
      {
        titulo: "B",
        status: "respondido",
        enviadoEm: d("2026-12-04T12:00:00Z"),
        resposta: { resposta: "nao_aprovado", respondidoEm: d("2026-12-06T12:00:00Z") },
      },
      { titulo: "C", status: "cancelado", enviadoEm: d("2026-12-08T12:00:00Z"), resposta: null },
    ]);
    expect(m).toEqual({ tipo: "nao_aprovada", ressalvas: false, em: "2026-12-06", titulo: "B" });
  });

  it("aguardando mais recente sem aceito", () => {
    const m = marcaDaParcela([
      {
        titulo: "B",
        status: "respondido",
        enviadoEm: d("2026-12-04T12:00:00Z"),
        resposta: { resposta: "nao_aprovado", respondidoEm: d("2026-12-06T12:00:00Z") },
      },
      { titulo: "D", status: "aguardando", enviadoEm: d("2026-12-07T12:00:00Z"), resposta: null },
    ]);
    expect(m).toEqual({ tipo: "aguardando", ressalvas: false, em: null, titulo: "D" });
  });

  it("só cancelados = sem marca", () => {
    expect(marcaDaParcela([{ titulo: "C", status: "cancelado", enviadoEm: d("2026-12-08T12:00:00Z"), resposta: null }])).toBeNull();
    expect(marcaDaParcela([])).toBeNull();
  });
});
