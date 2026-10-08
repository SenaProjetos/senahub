import { describe, expect, it } from "vitest";
import { itensDoPedidoDados, MOTIVO_SO_ABERTO_CANCELA, MOTIVO_SO_ABERTO_LEMBRA } from "./acoes-pedido";

describe("itensDoPedidoDados", () => {
  it("na lista: ficha, lembrete e cancelar", () => {
    const itens = itensDoPedidoDados({ status: "aberto", userId: "ana" }, { hrefFicha: true });
    expect(itens.map((i) => i.id)).toEqual(["ficha", "s1", "lembrar", "cancelar"]);
    expect(itens[0]).toMatchObject({ tipo: "link", href: "/rh/pessoas/ana" });
  });
  it("na ficha não há link para a própria ficha", () => {
    expect(itensDoPedidoDados({ status: "aberto", userId: "ana" }, { hrefFicha: false }).map((i) => i.id)).toEqual(["lembrar", "cancelar"]);
  });
  it("pedido fechado: ações desabilitadas com o motivo", () => {
    const [lembrar, cancelar] = itensDoPedidoDados({ status: "atendido", userId: "ana" }, { hrefFicha: false });
    expect(lembrar).toMatchObject({ desabilitado: MOTIVO_SO_ABERTO_LEMBRA });
    expect(cancelar).toMatchObject({ desabilitado: MOTIVO_SO_ABERTO_CANCELA, variant: "destructive" });
  });
});
