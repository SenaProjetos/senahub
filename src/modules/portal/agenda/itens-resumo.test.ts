import { describe, expect, it } from "vitest";
import {
  decidirConferencia,
  itensDasReunioes,
  itensDosMarcos,
  type MarcoParaAviso,
  type ReuniaoParaAviso,
} from "./itens-resumo";

const marco = (extra: Partial<MarcoParaAviso> = {}): MarcoParaAviso => ({
  titulo: "Entrega do projeto básico",
  combinado: "2026-03-15",
  previsao: "2026-03-15",
  concluido: false,
  nota: null,
  previsaoAnterior: null,
  previsaoAlteradaEm: null,
  ...extra,
});

const reuniao = (extra: Partial<ReuniaoParaAviso> = {}): ReuniaoParaAviso => ({
  titulo: "Alinhamento",
  dia: "2026-12-12",
  horaInicio: "14:00",
  link: null,
  local: null,
  estado: "agendada",
  criadaDia: "2026-11-20",
  mudancaEm: null,
  mudancaTipo: null,
  diaAnterior: null,
  horaAnterior: null,
  motivoCancelamento: null,
  ...extra,
});

describe("agenda — itens dos marcos", () => {
  it("marco próximo sai 8 dias antes (manhã de previsão − 7) e não conta dias no texto", () => {
    const r = itensDosMarcos([marco()]);
    expect(r).toHaveLength(1);
    expect(r[0].dia).toBe("2026-03-07");
    expect(r[0].disciplina).toBe("Agenda");
    expect(r[0].texto).toBe("Entrega do projeto básico: entrega prevista para 15/03/2026.");
    expect(r[0].seguro).toBe(true);
  });

  it("marco entregue não gera nada", () => {
    expect(itensDosMarcos([marco({ concluido: true, previsaoAlteradaEm: "2026-03-01", previsaoAnterior: "2026-03-10" })])).toEqual([]);
  });

  it("previsão alterada: dia da mudança, de/para, combinado e a nota na linha seguinte", () => {
    const r = itensDosMarcos([
      marco({ previsao: "2026-04-20", previsaoAnterior: "2026-04-02", previsaoAlteradaEm: "2026-03-30", nota: "Aguardando a aprovação do cliente" }),
    ]);
    const alterada = r.find((i) => i.dia === "2026-03-30");
    expect(alterada?.texto).toBe(
      "Entrega do projeto básico: previsão alterada de 02/04 para 20/04 (combinado: 15/03)\n  Motivo: Aguardando a aprovação do cliente",
    );
  });

  it("marco fora da BL-00 sai sem o trecho do combinado", () => {
    const r = itensDosMarcos([marco({ combinado: null, previsao: "2026-04-20", previsaoAnterior: "2026-04-02", previsaoAlteradaEm: "2026-03-30" })]);
    expect(r.find((i) => i.dia === "2026-03-30")?.texto).toBe("Entrega do projeto básico: previsão alterada de 02/04 para 20/04");
  });

  it("previsão em outro ano mostra o ano", () => {
    const r = itensDosMarcos([marco({ combinado: null, previsao: "2027-01-10", previsaoAnterior: "2026-12-20", previsaoAlteradaEm: "2026-12-01" })]);
    expect(r.find((i) => i.dia === "2026-12-01")?.texto).toBe("Entrega do projeto básico: previsão alterada de 20/12/2026 para 10/01/2027");
  });

  it("texto da coordenação sai escapado para o Markdown do e-mail", () => {
    const [i] = itensDosMarcos([
      marco({
        titulo: "*Básico*",
        previsao: "2026-04-20",
        previsaoAnterior: "2026-04-02",
        previsaoAlteradaEm: "2026-03-30",
        nota: "*urgente* [x](http://a) <b>oi</b>",
      }),
    ]).filter((x) => x.dia === "2026-03-30");
    expect(i.texto).toContain("\\*Básico\\*");
    expect(i.texto).toContain("\\*urgente\\* \\[x\\](http://a) \\<b\\>oi\\</b\\>");
    expect(i.texto).not.toContain("<b>");
  });
});

describe("agenda — itens das reuniões", () => {
  it("marcada: dia da criação, data completa e link ou local", () => {
    const [i] = itensDasReunioes([reuniao({ link: "https://meet.google.com/abc", local: "Sala 2" })]).filter((x) => x.dia === "2026-11-20");
    expect(i.texto).toBe("Reunião agendada: Alinhamento, 12/12/2026 às 14:00. Link: https://meet.google.com/abc. Local: Sala 2.");
    expect(i.disciplina).toBe("Agenda");
  });

  it("criada e cancelada no mesmo dia não gera aviso nenhum", () => {
    expect(itensDasReunioes([reuniao({ estado: "cancelada", mudancaEm: "2026-11-20", mudancaTipo: "cancelada" })])).toEqual([]);
  });

  it("remarcada no mesmo dia da criação só tem o aviso de marcada, com os valores atuais", () => {
    const r = itensDasReunioes([reuniao({ dia: "2026-12-13", horaInicio: "15:00", mudancaEm: "2026-11-20", mudancaTipo: "remarcada", diaAnterior: "2026-12-12", horaAnterior: "14:00" })]);
    expect(r.filter((i) => i.dia === "2026-11-20").map((i) => i.texto)).toEqual(["Reunião agendada: Alinhamento, 13/12/2026 às 15:00."]);
    expect(r.some((i) => i.texto.includes("remarcada"))).toBe(false);
  });

  it("remarcada em outro dia: aviso no dia da mudança, de/para sem ano", () => {
    const r = itensDasReunioes([reuniao({ dia: "2026-12-12", horaInicio: "15:00", mudancaEm: "2026-11-25", mudancaTipo: "remarcada", diaAnterior: "2026-12-10", horaAnterior: "14:00" })]);
    expect(r.find((i) => i.dia === "2026-11-25")?.texto).toBe("Reunião remarcada: Alinhamento, de 10/12 às 14:00 para 12/12 às 15:00.");
  });

  it("cancelada em outro dia: aviso com o motivo e sem o aviso de marcada nem lembrete", () => {
    const r = itensDasReunioes([reuniao({ estado: "cancelada", mudancaEm: "2026-11-25", mudancaTipo: "cancelada", motivoCancelamento: "Cliente viajou" })]);
    expect(r).toHaveLength(1);
    expect(r[0].dia).toBe("2026-11-25");
    expect(r[0].texto).toBe("Reunião cancelada: Alinhamento (12/12/2026).\n  Motivo: Cliente viajou");
  });

  it("lembrete: dia da reunião − 2, sem a palavra amanhã", () => {
    const r = itensDasReunioes([reuniao()]);
    const l = r.find((i) => i.dia === "2026-12-10");
    expect(l?.texto).toBe("Lembrete: Alinhamento, 12/12/2026 às 14:00.");
    expect(l?.texto.toLowerCase()).not.toContain("amanhã");
  });

  it("sem lembrete quando a reunião foi marcada ou remarcada com menos de 2 dias de antecedência", () => {
    expect(itensDasReunioes([reuniao({ criadaDia: "2026-12-10" })]).some((i) => i.texto.startsWith("Lembrete"))).toBe(false);
    expect(itensDasReunioes([reuniao({ mudancaEm: "2026-12-11", mudancaTipo: "remarcada", diaAnterior: "2026-12-20", horaAnterior: "14:00" })]).some((i) => i.texto.startsWith("Lembrete"))).toBe(false);
  });

  it("título, link, local e motivo vindos do banco saem escapados", () => {
    const r = itensDasReunioes([reuniao({ titulo: "*Kick-off*", local: "[Sala](x) <i>" })]);
    const m = r.find((i) => i.dia === "2026-11-20");
    expect(m?.texto).toContain("\\*Kick-off\\*");
    expect(m?.texto).toContain("\\[Sala\\](x) \\<i\\>");
  });
});

describe("agenda — decisão da conferência de previsão", () => {
  const base = { vista: "2026-03-15", atual: "2026-03-15", concluido: false, emRevisao: false };
  it("em revisão ou entregue: nada", () => {
    expect(decidirConferencia({ ...base, atual: "2026-04-01", emRevisao: true })).toEqual({ acao: "nada" });
    expect(decidirConferencia({ ...base, atual: "2026-04-01", concluido: true })).toEqual({ acao: "nada" });
  });
  it("primeira vez só grava", () => {
    expect(decidirConferencia({ ...base, vista: null })).toEqual({ acao: "gravar_vista" });
  });
  it("igual: nada; diferente: alterou com o valor anterior, nos dois sentidos", () => {
    expect(decidirConferencia(base)).toEqual({ acao: "nada" });
    expect(decidirConferencia({ ...base, atual: "2026-04-01" })).toEqual({ acao: "alterou", anterior: "2026-03-15" });
    expect(decidirConferencia({ ...base, atual: "2026-03-01" })).toEqual({ acao: "alterou", anterior: "2026-03-15" });
  });
});
