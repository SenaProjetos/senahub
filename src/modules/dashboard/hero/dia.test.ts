import { describe, expect, it } from "vitest";
import {
  anosDeCasaHoje,
  avisoDeFeriado,
  avisoDeFerias,
  diaCurto,
  ehAniversarioHoje,
  ehDiaUtil,
  inicioNaCasa,
  linkDoLocal,
  proximaCoisa,
  rotuloDoLink,
  type AtividadeHero,
  type ReuniaoHero,
} from "@/modules/dashboard/hero/dia";

describe("avisoDeFeriado", () => {
  const feriados = [
    { data: "2026-11-20", nome: "Consciência Negra" },
    { data: "2026-12-25", nome: "Natal" },
  ];
  it("hoje, amanhã e até 7 dias", () => {
    expect(avisoDeFeriado(feriados, "2026-11-20")?.texto).toBe("Hoje é feriado: Consciência Negra");
    expect(avisoDeFeriado(feriados, "2026-11-19")?.texto).toBe("Amanhã é feriado: Consciência Negra");
    expect(avisoDeFeriado(feriados, "2026-11-13")?.texto).toBe("Feriado sex., 20/11: Consciência Negra");
    expect(avisoDeFeriado(feriados, "2026-11-12")).toBeNull();
    expect(avisoDeFeriado(feriados, "2026-11-21")).toBeNull();
  });
});

describe("diaCurto", () => {
  it("dia da semana abreviado e dd/mm", () => {
    expect(diaCurto("2026-06-24")).toBe("qua., 24/06");
  });
});

describe("avisoDeFerias", () => {
  it("de 30 dias antes até a véspera", () => {
    expect(avisoDeFerias("2026-12-05", "2026-11-23")).toBe("Suas férias começam em 12 dias");
    expect(avisoDeFerias("2026-11-24", "2026-11-23")).toBe("Suas férias começam amanhã");
  });

  it("mais de 30 dias ou no próprio dia não avisa", () => {
    expect(avisoDeFerias("2026-12-24", "2026-11-23")).toBeNull();
    expect(avisoDeFerias("2026-12-23", "2026-11-23")).toBe("Suas férias começam em 30 dias");
    expect(avisoDeFerias("2026-11-23", "2026-11-23")).toBeNull();
    expect(avisoDeFerias(null, "2026-11-23")).toBeNull();
  });
});

describe("tempo de casa", () => {
  it("emenda estágio → CLT; recontratação depois de mais de um mês recomeça", () => {
    expect(
      inicioNaCasa([
        { inicio: "2021-03-01", fim: "2022-02-28" },
        { inicio: "2022-03-01", fim: null },
      ]),
    ).toBe("2021-03-01");
    expect(
      inicioNaCasa([
        { inicio: "2019-01-10", fim: "2020-05-01" },
        { inicio: "2023-11-23", fim: null },
      ]),
    ).toBe("2023-11-23");
    expect(inicioNaCasa([])).toBeNull();
  });

  it("anos que completa hoje; menos de um ano não conta; 29/02 cai em 28/02", () => {
    expect(anosDeCasaHoje("2023-11-23", "2026-11-23")).toBe(3);
    expect(anosDeCasaHoje("2026-11-23", "2026-11-23")).toBeNull();
    expect(anosDeCasaHoje("2023-11-22", "2026-11-23")).toBeNull();
    expect(anosDeCasaHoje("2024-02-29", "2027-02-28")).toBe(3);
    expect(anosDeCasaHoje("2024-02-29", "2028-02-29")).toBe(4);
  });

  it("aniversário: mesmo dia e mês; 29/02 cai em 28/02 nos anos comuns", () => {
    expect(ehAniversarioHoje("1990-11-24", "2026-11-24")).toBe(true);
    expect(ehAniversarioHoje("1990-11-23", "2026-11-24")).toBe(false);
    expect(ehAniversarioHoje("1992-02-29", "2027-02-28")).toBe(true);
    expect(ehAniversarioHoje("1992-02-29", "2028-02-28")).toBe(false);
    expect(ehAniversarioHoje("1992-02-29", "2028-02-29")).toBe(true);
  });
});

describe("links de reunião", () => {
  it("acha o https no local e dá nome ao botão", () => {
    expect(linkDoLocal("Teams: https://teams.microsoft.com/l/meetup-join/abc ok")).toBe("https://teams.microsoft.com/l/meetup-join/abc");
    expect(linkDoLocal("Sala 2")).toBeNull();
    expect(linkDoLocal("http://inseguro.com")).toBeNull();
    expect(rotuloDoLink("https://teams.microsoft.com/l/x")).toBe("Entrar no Teams");
    expect(rotuloDoLink("https://meet.google.com/abc")).toBe("Entrar no Meet");
    expect(rotuloDoLink("https://exemplo.com/x")).toBe("Entrar na reunião");
  });
});

describe("proximaCoisa", () => {
  const reuniao: ReuniaoHero = { id: "r", titulo: "Compatibilização", inicio: 14 * 60, fim: 15 * 60, link: "https://teams.microsoft.com/x" };
  const atividade: AtividadeHero = { titulo: "Hidrossanitário (EX)", projeto: "Residencial", termino: "2026-11-27", atrasada: false };

  it("reunião a partir de 2 h antes vence a atividade", () => {
    expect(proximaCoisa([reuniao], atividade, 11 * 60 + 59, true)?.tipo).toBe("atividade");
    const p = proximaCoisa([reuniao], atividade, 12 * 60 + 24, true);
    expect(p).toMatchObject({ tipo: "reuniao", quando: "Reunião em 1h36, 14:00 às 15:00", rotuloLink: "Entrar no Teams" });
  });

  it("durante a reunião e depois dela", () => {
    expect(proximaCoisa([reuniao], null, 14 * 60 + 20, true)).toMatchObject({ quando: "Reunião agora, até 15:00" });
    expect(proximaCoisa([reuniao], null, 15 * 60, true)).toBeNull();
  });

  it("reunião sem término dura uma hora; sem link vai para a agenda", () => {
    const p = proximaCoisa([{ ...reuniao, fim: null, link: null }], null, 14 * 60 + 59, true);
    expect(p).toMatchObject({ quando: "Reunião agora, até 15:00", link: null, rotuloLink: "Ver agenda" });
  });

  it("atividade só em dia útil, das 6h às 20h; atrasada diz desde quando", () => {
    expect(proximaCoisa([], atividade, 5 * 60 + 59, true)).toBeNull();
    expect(proximaCoisa([], atividade, 20 * 60, true)).toBeNull();
    expect(proximaCoisa([], atividade, 10 * 60, false)).toBeNull();
    expect(proximaCoisa([], atividade, 10 * 60, true)).toMatchObject({ prazo: "Prazo sex., 27/11", atrasada: false });
    expect(proximaCoisa([], { ...atividade, termino: "2026-11-20", atrasada: true }, 10 * 60, true)).toMatchObject({
      prazo: "Atrasada desde sex., 20/11",
    });
  });
});

describe("ehDiaUtil", () => {
  it("fim de semana e feriado não são", () => {
    expect(ehDiaUtil("2026-11-23", [])).toBe(true);
    expect(ehDiaUtil("2026-11-22", [])).toBe(false);
    expect(ehDiaUtil("2026-11-20", [{ data: "2026-11-20", nome: "Consciência Negra" }])).toBe(false);
  });
});
