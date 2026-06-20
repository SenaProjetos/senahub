import { describe, it, expect } from "vitest";
import { gerarIcs } from "@/modules/agenda/ics";

describe("agenda — gerarIcs", () => {
  it("produz um VCALENDAR/VEVENT válido", () => {
    const ics = gerarIcs([
      {
        uid: "abc-123",
        titulo: "Reunião de obra",
        inicio: new Date("2026-06-20T13:00:00Z"),
        fim: new Date("2026-06-20T14:00:00Z"),
      },
    ]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("UID:abc-123");
    expect(ics).toContain("SUMMARY:Reunião de obra");
    expect(ics).toContain("DTSTART:20260620T130000Z");
    expect(ics).toContain("DTEND:20260620T140000Z");
    // linhas terminam em CRLF
    expect(ics).toContain("\r\n");
  });

  it("usa o início como fim quando fim é omitido", () => {
    const ics = gerarIcs([
      { uid: "u1", titulo: "Sem fim", inicio: "2026-06-20T09:30:00Z" },
    ]);
    expect(ics).toContain("DTSTART:20260620T093000Z");
    expect(ics).toContain("DTEND:20260620T093000Z");
  });

  it("escapa vírgula, ponto-e-vírgula, barra e quebra de linha conforme RFC 5545", () => {
    const ics = gerarIcs([
      {
        uid: "u2",
        titulo: "Café, bolo; teste \\ fim",
        inicio: new Date("2026-06-20T10:00:00Z"),
        descricao: "linha 1\nlinha 2",
      },
    ]);
    expect(ics).toContain("SUMMARY:Café\\, bolo\\; teste \\\\ fim");
    expect(ics).toContain("DESCRIPTION:linha 1\\nlinha 2");
  });

  it("inclui DESCRIPTION e LOCATION quando fornecidos e os omite quando ausentes", () => {
    const comExtras = gerarIcs([
      {
        uid: "u3",
        titulo: "Com extras",
        inicio: new Date("2026-06-20T10:00:00Z"),
        descricao: "detalhes",
        local: "Sala 1",
      },
    ]);
    expect(comExtras).toContain("DESCRIPTION:detalhes");
    expect(comExtras).toContain("LOCATION:Sala 1");

    const semExtras = gerarIcs([
      { uid: "u4", titulo: "Sem extras", inicio: new Date("2026-06-20T10:00:00Z") },
    ]);
    expect(semExtras).not.toContain("DESCRIPTION:");
    expect(semExtras).not.toContain("LOCATION:");
  });

  it("gera um VEVENT por evento", () => {
    const ics = gerarIcs([
      { uid: "a", titulo: "Um", inicio: new Date("2026-06-20T10:00:00Z") },
      { uid: "b", titulo: "Dois", inicio: new Date("2026-06-21T10:00:00Z") },
    ]);
    const ocorrencias = ics.match(/BEGIN:VEVENT/g) ?? [];
    expect(ocorrencias).toHaveLength(2);
  });
});
