import { describe, expect, it } from "vitest";
import { ROOM_INTERNOS, aceitaEvento, contaNaPresenca, roomsIniciais } from "./socket-regras";

const EVENTOS = ["entrar-canal", "entrar-documento", "sair-documento", "solicitar-presenca", "digitando"];

describe("socket-regras", () => {
  it("externo só entra no próprio room", () => {
    expect(roomsIniciais({ userId: "u1", externo: true })).toEqual(["user:u1"]);
  });

  it("interno entra no próprio room e em internos", () => {
    expect(roomsIniciais({ userId: "u1", externo: false })).toEqual(["user:u1", ROOM_INTERNOS]);
  });

  it("externo recusa entrar-canal, entrar-documento, sair-documento, solicitar-presenca e digitando", () => {
    for (const e of EVENTOS) expect(aceitaEvento(true, e)).toBe(false);
    expect(aceitaEvento(true, "evento-desconhecido")).toBe(false);
  });

  it("interno aceita os mesmos eventos", () => {
    for (const e of EVENTOS) expect(aceitaEvento(false, e)).toBe(true);
    expect(aceitaEvento(false, "evento-desconhecido")).toBe(true);
  });

  it("externo não conta na presença", () => {
    expect(contaNaPresenca(true)).toBe(false);
    expect(contaNaPresenca(false)).toBe(true);
  });
});
