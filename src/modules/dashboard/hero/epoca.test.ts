import { describe, expect, it } from "vitest";
import {
  campanhaDoMes,
  domingoDePascoa,
  rotuloDoTema,
  temFogos,
  temaDaEpoca,
  tercaDeCarnaval,
} from "@/modules/dashboard/hero/epoca";

describe("Páscoa e Carnaval", () => {
  it("Domingo de Páscoa de anos conhecidos", () => {
    expect(domingoDePascoa(2008)).toBe("2008-03-23");
    expect(domingoDePascoa(2024)).toBe("2024-03-31");
    expect(domingoDePascoa(2025)).toBe("2025-04-20");
    expect(domingoDePascoa(2026)).toBe("2026-04-05");
    expect(domingoDePascoa(2027)).toBe("2027-03-28");
    expect(domingoDePascoa(2038)).toBe("2038-04-25");
  });

  it("terça de Carnaval 47 dias antes da Páscoa", () => {
    expect(tercaDeCarnaval(2025)).toBe("2025-03-04");
    expect(tercaDeCarnaval(2026)).toBe("2026-02-17");
    expect(tercaDeCarnaval(2027)).toBe("2027-02-09");
  });
});

describe("temaDaEpoca", () => {
  it("junho é São João; 1º/12 a 6/01 é Natal", () => {
    expect(temaDaEpoca("2026-06-01")).toBe("junino");
    expect(temaDaEpoca("2026-06-30")).toBe("junino");
    expect(temaDaEpoca("2026-12-01")).toBe("natal");
    expect(temaDaEpoca("2027-01-06")).toBe("natal");
    expect(temaDaEpoca("2027-01-07")).toBeNull();
    expect(temaDaEpoca("2026-11-30")).toBeNull();
  });

  it("Carnaval do sábado da semana anterior até a Quarta de Cinzas", () => {
    expect(temaDaEpoca("2026-02-06")).toBeNull();
    expect(temaDaEpoca("2026-02-07")).toBe("carnaval");
    expect(temaDaEpoca("2026-02-17")).toBe("carnaval");
    expect(temaDaEpoca("2026-02-18")).toBe("carnaval");
    expect(temaDaEpoca("2026-02-19")).toBeNull();
  });

  it("Páscoa do Domingo de Ramos ao Domingo de Páscoa", () => {
    expect(temaDaEpoca("2026-03-28")).toBeNull();
    expect(temaDaEpoca("2026-03-29")).toBe("pascoa");
    expect(temaDaEpoca("2026-04-05")).toBe("pascoa");
    expect(temaDaEpoca("2026-04-06")).toBeNull();
  });

  it("8 de março é Dia da Mulher, mesmo dentro do Carnaval", () => {
    expect(temaDaEpoca("2026-03-08")).toBe("mulher");
    expect(temaDaEpoca("2038-03-07")).toBe("carnaval");
    expect(temaDaEpoca("2038-03-08")).toBe("mulher");
    expect(rotuloDoTema("mulher")).toBe("Dia Internacional da Mulher");
    expect(rotuloDoTema("carnaval")).toBeNull();
  });
});

describe("fogos e campanhas", () => {
  it("fogos de 26/12 a 1º/01", () => {
    expect(temFogos("2026-12-25")).toBe(false);
    expect(temFogos("2026-12-26")).toBe(true);
    expect(temFogos("2027-01-01")).toBe(true);
    expect(temFogos("2027-01-02")).toBe(false);
  });

  it("setembro, outubro e novembro têm campanha; os outros meses, não", () => {
    expect(campanhaDoMes("2026-09-10")?.nome).toBe("Setembro Amarelo");
    expect(campanhaDoMes("2026-10-01")?.nome).toBe("Outubro Rosa");
    expect(campanhaDoMes("2026-11-30")?.nome).toBe("Novembro Azul");
    expect(campanhaDoMes("2026-12-01")).toBeNull();
    expect(campanhaDoMes("2026-08-31")).toBeNull();
  });
});
