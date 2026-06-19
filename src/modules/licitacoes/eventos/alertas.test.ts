import { describe, it, expect } from "vitest";
import { diasRestantes, eventosParaNotificar, type EventoParaAlerta } from "./alertas";

const HOJE = "2026-06-19";

describe("diasRestantes", () => {
  it("retorna 7 quando data é 7 dias à frente", () => {
    expect(diasRestantes(HOJE, "2026-06-26")).toBe(7);
  });

  it("retorna 0 quando data é hoje", () => {
    expect(diasRestantes(HOJE, HOJE)).toBe(0);
  });

  it("retorna -1 quando data é ontem", () => {
    expect(diasRestantes(HOJE, "2026-06-18")).toBe(-1);
  });
});

describe("eventosParaNotificar", () => {
  const padrao = [15, 7, 1];

  // caso 2: evento a 7 dias, alertaDias vazio → usa padraoDias [15,7,1] → casa
  it("retorna evento quando dias (7) está em padraoDias e alertaDias é vazio", () => {
    const eventos: EventoParaAlerta[] = [
      { id: "ev1", tipo: "abertura", dataISO: "2026-06-26", alertaDias: [], concluido: false },
    ];
    const result = eventosParaNotificar(eventos, HOJE, padrao);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "ev1", tipo: "abertura", dias: 7 });
  });

  // caso 3: evento a 5 dias, alertaDias vazio, 5 não está em padraoDias → vazio
  it("retorna vazio quando dias (5) não está em padraoDias e alertaDias é vazio", () => {
    const eventos: EventoParaAlerta[] = [
      { id: "ev2", tipo: "sessao", dataISO: "2026-06-24", alertaDias: [], concluido: false },
    ];
    const result = eventosParaNotificar(eventos, HOJE, padrao);
    expect(result).toHaveLength(0);
  });

  // caso 4: evento a 5 dias, alertaDias [5] → override, casa
  it("usa alertaDias override quando preenchido (dias 5 em [5])", () => {
    const eventos: EventoParaAlerta[] = [
      { id: "ev3", tipo: "resultado", dataISO: "2026-06-24", alertaDias: [5], concluido: false },
    ];
    const result = eventosParaNotificar(eventos, HOJE, padrao);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "ev3", tipo: "resultado", dias: 5 });
  });

  // caso 5: evento concluído não é notificado mesmo casando
  it("ignora evento concluído que casaria pelos dias", () => {
    const eventos: EventoParaAlerta[] = [
      { id: "ev4", tipo: "assinatura", dataISO: "2026-06-26", alertaDias: [], concluido: true },
    ];
    const result = eventosParaNotificar(eventos, HOJE, padrao);
    expect(result).toHaveLength(0);
  });

  // caso 6: evento no passado (dias -1) → ignora
  it("ignora evento no passado (dias negativos)", () => {
    const eventos: EventoParaAlerta[] = [
      { id: "ev5", tipo: "recurso", dataISO: "2026-06-18", alertaDias: [1], concluido: false },
    ];
    const result = eventosParaNotificar(eventos, HOJE, padrao);
    expect(result).toHaveLength(0);
  });

  // caso 7a: dias 0 com padraoDias sem 0 → vazio
  it("não retorna evento com dias 0 quando padraoDias não inclui 0", () => {
    const eventos: EventoParaAlerta[] = [
      { id: "ev6", tipo: "vigencia_inicio", dataISO: HOJE, alertaDias: [], concluido: false },
    ];
    const result = eventosParaNotificar(eventos, HOJE, padrao);
    expect(result).toHaveLength(0);
  });

  // caso 7b: dias 0 com alertaDias [0] → retorna
  it("retorna evento com dias 0 quando alertaDias inclui 0", () => {
    const eventos: EventoParaAlerta[] = [
      { id: "ev7", tipo: "vigencia_fim", dataISO: HOJE, alertaDias: [0], concluido: false },
    ];
    const result = eventosParaNotificar(eventos, HOJE, padrao);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "ev7", dias: 0 });
  });

  // caso 8: lista com vários eventos → retorna só os que casam
  it("com lista mista retorna somente os eventos que casam", () => {
    const eventos: EventoParaAlerta[] = [
      { id: "a", tipo: "abertura", dataISO: "2026-06-26", alertaDias: [], concluido: false },   // 7 dias → casa
      { id: "b", tipo: "sessao",   dataISO: "2026-06-24", alertaDias: [], concluido: false },   // 5 dias → não casa
      { id: "c", tipo: "resultado", dataISO: "2026-07-04", alertaDias: [], concluido: false },  // 15 dias → casa
      { id: "d", tipo: "assinatura", dataISO: "2026-06-20", alertaDias: [], concluido: false }, // 1 dia → casa
      { id: "e", tipo: "recurso",  dataISO: "2026-06-18", alertaDias: [], concluido: false },   // -1 dias → ignora
    ];
    const result = eventosParaNotificar(eventos, HOJE, padrao);
    const ids = result.map((r) => r.id);
    expect(ids).toContain("a");
    expect(ids).toContain("c");
    expect(ids).toContain("d");
    expect(ids).not.toContain("b");
    expect(ids).not.toContain("e");
    expect(result).toHaveLength(3);
  });
});
