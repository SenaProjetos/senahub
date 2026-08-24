import { describe, expect, it } from "vitest";
import { podeResponderTicket } from "./acesso";

describe("podeResponderTicket", () => {
  it("permite que o autor responda ao próprio ticket", () => {
    expect(podeResponderTicket("autor", { id: "autor", role: "cliente" })).toBe(true);
  });

  it("impede usuário sem gestão de responder ticket alheio", () => {
    expect(podeResponderTicket("autor", { id: "outro", role: "clt" })).toBe(false);
  });

  it("permite gestor responder ticket de outro usuário", () => {
    expect(podeResponderTicket("autor", { id: "gestor", role: "administrativo" })).toBe(true);
  });
});
