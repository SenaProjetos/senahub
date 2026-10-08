import { describe, expect, it } from "vitest";
import { itensDoEncontro, itensDoObjetivo } from "./acoes";

const ids = (x: { id: string }[]) => x.map((i) => i.id);

describe("ações de desenvolvimento", () => {
  it("objetivo aberto conclui ou cancela; fechado reabre", () => {
    expect(ids(itensDoObjetivo({ status: "aberto" }, true))).toEqual(["editar", "concluir", "cancelar"]);
    expect(ids(itensDoObjetivo({ status: "concluido" }, true))).toEqual(["editar", "reabrir"]);
  });
  it("quem só lê (a própria pessoa) não vê ação", () => {
    expect(itensDoObjetivo({ status: "aberto" }, false)).toEqual([]);
    expect(itensDoEncontro(false)).toEqual([]);
  });
  it("excluir 1:1 pede confirmação", () => {
    const excluir = itensDoEncontro(true).find((i) => i.id === "excluir");
    expect(excluir?.tipo === "acao" && excluir.variant === "destructive" && !!excluir.confirmar).toBe(true);
  });
});
